# DMM動画再生まわりの技術メモ

## 現象

Vercel上で女優検索結果を複数選択して再生すると、カードが黒画面になり「読み込み失敗」と表示される。
直近では、ダウンロード候補側の複数再生にも影響が出たため、フロント側の再生変更を戻す方針にした。

## 確認したこと

- `DMM_COOKIE_HEADER` は Vercel の Production / Preview に設定済みだった。
- 最新Productionデプロイは Ready だった。
- Vercelログでは `/api/preview/info` が 500 になっていた。
- 代表的なエラーは「再生用動画URLを見つけられませんでした」だった。
- `/api/preview/play` や `/api/preview/asset` に到達する前に、サーバー側の動画URL解決で失敗していた。

## これまで入れた変更

- Hosted mode でもDMM実URLをブラウザへ直接返さず、`/api/preview/play` を返すようにした。
- HLSマニフェスト内のセグメントURLを `/api/preview/asset` に書き換えるようにした。
- Cookie未設定時に `age_check_done=1` だけで「Cookieあり」と誤判定しないようにした。
- `vercel.json` を追加し、API Function の `maxDuration` を60秒にした。

## 戻した変更

以下はダウンロード候補側の再生まで壊す可能性があるため戻した。

- `<video>` への `crossOrigin = 'use-credentials'`
- hls.js の `xhr.withCredentials = true`
- 複数プレビュー初期化の独自キュー化

同一オリジンの `/api/preview/*` を使う設計では、ブラウザ側でDMM Cookieを送らせる必要はない。
Cookieはサーバー側の upstream fetch だけに付与する。

## 現時点の原因整理

女優検索はAffiliate APIの結果を使うことがある。
Affiliate APIの商品には、`sampleMovieURL` があるものと無いものが混在する。

以前は `detailUrl` があるだけで「プレビュー可能」と判定していたため、サンプル動画URLが無い商品でも再生対象になっていた。
その場合 `/api/preview/info` は詳細ページHTMLから動画URLを探しに行くが、Vercel上では抽出できず失敗する。

つまり、黒画面の主因は「再生可能でない検索結果を再生対象として扱っていたこと」。

ランキング側では別の原因も確認した。
Vercelログ上で `/api/preview/play` が `cc3001.dmm.co.jp/.../playlist.m3u8` を取得しようとして 403 になっていた。
これはVercelサーバーからDMM CDNのHLSマニフェストを取りに行くプロキシ方式が拒否されている状態。
以前うまく動いていたHosted再生は、サーバーでHLSを中継せず、解決したDMMの再生URLをブラウザへ直接返す方式だった。

## 今回の対策

女優検索結果の再生可能判定を以下に絞る。

- `seasonId` があるDMM TV GraphQL由来の項目
- `playbackUrl` があるAffiliateサンプル動画付きの項目

`detailUrl` だけの項目は再生対象にしない。
これにより、再生不能な商品を複数再生に含めて `/api/preview/info` で失敗する流れを止める。

ランキング側はHosted modeで以下の挙動へ戻す。

- `/api/preview/info` は `source.url` をそのまま返す
- `/api/preview/play` は `source.url` へ302リダイレクトする
- HLSマニフェスト/セグメントのサーバープロキシはHostedでは使わない

ローカル/desktop modeでは従来どおり `/api/preview/play` と `/api/preview/asset` のプロキシを使える。

## 次に見るべきログ

まだ失敗する場合は、Vercelログで以下を確認する。

- `/api/preview/info` が失敗しているか
- `/api/preview/play` が失敗しているか
- `/api/preview/asset` が失敗しているか

`/api/preview/info` の失敗なら動画URL解決の問題。
`/api/preview/play` / `/api/preview/asset` の失敗ならHLSまたはメディアプロキシの問題。
## 2026-04-26 attempt log - actress search / multi-select

- User report: Vercel ranking/download multi-select opens a new tab when a thumbnail is clicked. Desired behavior is that thumbnail clicks toggle the checkbox while selection mode is active.
- Evidence in code: `bindRankingCardActions` only intercepted thumbnail links for `favorite` and `search`; `download` selection links fell through to the anchor.
- Fix attempt: include `download` in the intercepted selection kinds and explicitly update the matching checkbox/label state after toggling `selectedDownloadKeys`.
- User report: DMM/ranking side is OK, but actress search must return FANZA results and allow multi-select playback.
- Previous attempt `71efdb0`: TV GraphQL was made first priority to avoid detail-page-only affiliate failures. This conflicts with the new requirement because it suppresses FANZA/affiliate results.
- New direction: restore affiliate/FANZA-first actress search, prioritize FANZA ItemList targets, and keep only items with usable `sampleMovieURL`/`playbackUrl` so selected search results can be previewed.
