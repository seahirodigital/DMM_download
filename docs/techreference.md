# DMM / FANZA プレビュー再生 技術メモ

## 現在の成功パターン

Vercel 版の女優検索結果は FANZA Affiliate ItemList を優先し、`sampleMovieURL` がある項目だけを再生候補にする。`detailUrl` だけの商品は、Vercel 上で詳細ページ解析に落ちると黒画面や読み込み失敗になりやすいため、複数再生の候補に含めない。

FANZA の `www.dmm.co.jp/litevideo/...` は、外側ページや detail page を Vercel でスクレイピングしない。代わりに `cid` / `mode` / `affi_id` から DMM 内側プレイヤーの `html5_player` URLを組み立てる。

```text
https://www.dmm.co.jp/service/digitalapi/-/html5_player/=/
  cid=...
  /mtype=AhRVShI_
  /service=litevideo
  /mode=part
  /width=1920
  /height=1080
  /forceAutoPlay=1
  /affi_id=.../
```

ただし、この `html5_player` を iframe のまま表示すると、プレイヤー設定の初期 `src` が `...mhb.mp4`、つまり 576p になる。FullHD をデフォルトにするには、`html5_player` HTML内の `bitrates` から `FullHD (1080p)` の `...hhb.mp4` を抽出し、`type: "direct"` として `<video>` に直接渡す。

現在の hosted FANZA `litevideo` の成功レスポンスは次の形。

```json
{
  "type": "direct",
  "playbackUrl": "https://cc3001.dmm.co.jp/pv/.../...hhb.mp4"
}
```

`/api/preview/info` はこの direct FullHD mp4 を返し、`/api/preview/play` も同じ FullHD mp4 へ 302 する。抽出に失敗した場合だけ、再生不能を避けるため `html5_player` iframe にフォールバックする。

## 映像まわりの仕様

- 女優検索後の複数再生は FANZA 結果を使う。
- `sampleMovieURL` のある項目だけを再生可能にする。
- hosted FANZA `litevideo` は `html5_player` を取得し、`FullHD (1080p)` の `hhb.mp4` を選ぶ。
- DMM iframe は初期画質が 576p になるため、通常経路では使わない。
- `width=1920` / `height=1080` / `forceAutoPlay=1` は、iframe フォールバック時の表示サイズと自動再生補助として残す。
- ランキング系 HLS は、Vercel サーバーで manifest を取りに行くと 403 になりやすいため、hosted mode では DMM の HLS URL をブラウザへ直接返す。
- direct mp4 は、FullHD を維持するためブラウザへ直接返す。必要な場合のみ `/api/preview/play` でプロキシする。

## 音声まわりの仕様

複数選択後の同時再生では、再生中のカードが複数あっても音声を出す動画は1つだけにする。基準は `activeInlinePreviewAudioKey`。

- アクティブなプレビューカード1枚だけ `muted=false`。
- それ以外のカードは常に `muted=true`。
- カードをクリック、タップ、または動画が `play` した時点で、そのカードを音声対象にする。
- `playing` / `loadeddata` / `canplay` のタイミングで音声フォーカスを再同期する。
- 非アクティブカードで `volumechange` が起きて `muted=false` になっても、即座に `muted=true` へ戻す。

この仕様は、ダウンロード候補画面の複数再生をベンチマークにしている。女優検索側も同じルールに揃え、選択されているカードレイヤーの動画1つだけが音声出力される。

## 失敗パターン

1. Vercel で HLS manifest / segment をサーバープロキシした。
   - `/api/preview/play` が `cc3001.dmm.co.jp/.../playlist.m3u8` を取得しようとして 403。
   - ランキング側の複数再生まで壊れた。

2. 女優検索を DMM TV GraphQL 優先にした。
   - ランキングと同じ `seasonId` 付き結果にはなるが、ユーザー要件の FANZA 結果ではなくなる。

3. FANZA の `litevideo` 外側ページや detail page を Vercel で解析した。
   - ローカルでは成功しても、Vercel では detail page 抽出へ落ちて失敗しやすい。
   - エラー例: `「the detail page」の再生用動画URLを見つけられませんでした。`

4. 外側の `www.dmm.co.jp/litevideo/...` を iframe にした。
   - 再生はできるが、内側 iframe が `476x306` 固定で黒い余白が大きくなる。
   - 画質も粗く見えやすい。

5. 内側の `html5_player` を iframe のまま使った。
   - `FullHD (1080p)` 候補は存在するが、初期 `src` は 576p の `...mhb.mp4` になる。
   - `size=1920_1080` / `quality=1080p` / `bitrate=FullHD` / `defaultQuality=1080p` / `src=hhb` では初期 `src` は変わらなかった。

6. 複数 direct mp4 の autoplay 後に音声フォーカスを再同期しなかった。
   - 読み込み完了やユーザー操作のタイミングで、非アクティブ動画の `muted` が崩れる余地があった。

## 現在の実装ポイント

- `server.js`
  - `buildHostedLitevideoPlayerUrl()` で `litevideo` から内側 `html5_player` URLを組み立てる。
  - `resolveHostedLitevideoSource()` で `html5_player` を取得し、FullHD mp4 を抽出する。
  - `/api/preview/info` と `/api/preview/play` の hosted FANZA `litevideo` 分岐は、抽出成功時に direct FullHD mp4 を返す。

- `lib/dmm-downloader.js`
  - `extractBestPlayableSourceFromHtml()` で `html5_player` HTML内の候補を品質順に選ぶ。
  - `FullHD (1080p)` の `hhb.mp4` が最優先になる。

- `public/app.js`
  - `applyInlinePreviewAudioFocus()` でカード単位の音声フォーカスを適用する。
  - `play` / `playing` / `loadeddata` / `canplay` / `volumechange` で再同期する。
  - 非アクティブカードは強制ミュートに戻す。

- `public/styles.css`
  - iframe フォールバック時は、親を `position: relative`、iframe を `position: absolute; inset: 0; width: 100%; height: 100%` にして枠いっぱいに表示する。

## 確認コマンド

本番エラー確認:

```powershell
npx.cmd vercel logs --environment production --since 30m --level error --expand --no-branch
```

最新デプロイ確認:

```powershell
npx.cmd vercel ls dmm-download
```

hosted FANZA `litevideo` が FullHD mp4 を返すことの確認:

```powershell
$env:APP_MODE='hosted'
node -e "/* /api/preview/info が type=direct かつ ...hhb.mp4 を返すことを確認 */"
```

## Vercel 版スマホレイアウトの成功パターン

Vercel 版のスマホ表示では、タブを女優検索へ切り替えるとモバイルメニューが閉じる。検索フォームをヘッダーアクションだけに置くと、スマホではフォームがサイドメニュー側へ退避され、画面本体から女優名を入力できない状態になる。

成功パターンは、検索フォームを共通コンポーネント化し、ヘッダー用と検索画面本体用の両方に描画すること。入力イベントでは `data-actress-search-input` を持つ全フォームの値を同期し、送信時は押されたフォームの入力値を `searchActress()` に渡す。空欄送信時に前回検索語へフォールバックしないよう、明示的に渡された空文字は空文字として扱う。

検索結果のカード配置は、ダウンロード候補・お気に入りと同じ `ranking-grid` を使い、スマホ幅では `grid-auto-flow: column` と `overflow-x: auto` にする。これにより縦に詰まったカード一覧ではなく、横スワイプでサムネイルを確認できる UI になる。

今回の実装ポイント:

- `public/app.js` の `renderActressSearchForm()` で女優検索フォームを共通化する。
- `renderSearchResults()` の `beforeHtml` にスマホ用検索フォームを差し込む。
- `rankingSectionSignature()` に `beforeHtmlSignature` を含め、検索語や loading 状態の変化でフォームも再描画されるようにする。
- `public/styles.css` で `#search-results.section-block` をダウンロード候補と同じ透明セクション扱いにする。
- `@media (max-width: 820px)` では `.ranking-grid` を横スワイプ表示に統一する。

## 2026-04-27 現行成功仕様: DMM / FANZA 検索と複数プレビュー

この章は、DMM / FANZA トグル、女優名検索、作品名検索、検索結果の複数再生がローカルと Vercel 相当の hosted mode で成功している最新版の仕様をまとめたもの。既存章の内容は履歴として残し、ここを現行実装の判断基準にする。

### 共通検索フォーム

- UI の検索フォームは「女優名専用」ではなく、女優名と作品名の両方を受ける `keyword` 入力として扱う。
- フロントは `/api/search/actress?keyword=...&provider=dmm|fanza&pageSize=100` を呼ぶ。
- サーバー側は互換性維持のため `keyword` と旧 `actress` の両方を読むが、内部的には同じ検索語として扱う。
- D / F トグルは検索先の切り替えだけを担当する。DMM トグルなら DMM の検索経路、FANZA トグルなら FANZA の検索経路を使う。
- 検索完了後の結果表示、フィルター、複数選択、複数再生は同じカード UI を使うが、再生候補にできる条件は検索元ごとに違う。

### DMM 検索の成功仕様

- DMM トグル検索は DMM Affiliate ItemList ではなく、ランキングと同じ DMM TV GraphQL 検索を使う。
- `fetchActressSearch()` で `provider === 'dmm'` の場合は必ず `fetchTvActressSearch()` に分岐する。
- DMM では女優名も作品名も GraphQL の `keyword` 検索として扱う。つまり「女優検索」と「作品検索」で別 API に分けない。
- GraphQL の `VideoSearchResult.id` を `seasonId` として保持する。
- 各検索結果は `playbackUrl = https://tv.dmm.com/vod/playback/on-demand/?season=<seasonId>&content=<seasonId>&mode=sample` を持つ。
- `detailUrl` は補助情報として `https://tv.dmm.com/vod/detail/?season=<seasonId>` を持つが、`detailUrl` だけの結果を再生可能とは扱わない。
- `/api/preview/info?season=<seasonId>&content=<contentId>` は `resolvePlayableSource()` を通して HLS を解決する。
- hosted mode では HLS manifest / segment をサーバーでプロキシしない。`/api/preview/info` は DMM の HLS URL をブラウザへ直接返す。
- ローカル通常モードでは `/api/preview/play` 経由で再生できる。Vercel hosted mode では `type: "hls"` かつ `playbackUrl` 直返しが成功パターン。
- ランキングの複数再生と同じ条件、つまり `seasonId` と HLS 解決を使うことが DMM 検索結果の複数再生の成功条件。

成功確認例:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4312/api/search/actress?keyword=%E6%88%91%E6%85%A2%E3%81%97%E3%81%AA%E3%81%84%E3%81%A7&provider=dmm&pageSize=5'
```

期待値:

- `search.searchProvider` は `dmm`
- `search.provider` は `tv-graphql`
- `search.searchType` は `keyword`
- 各再生対象 item は `seasonId` と `playbackUrl` を持つ
- `/api/preview/info?season=...&content=...` が `type: "hls"` と `playbackUrl` を返す

### FANZA 検索の成功仕様

- FANZA トグル検索は DMM TV GraphQL ではなく DMM Affiliate API を使う。
- まず `ActressSearch` で女優候補を探す。
- `pickBestActress()` は検索語と女優名の一致性を重視する。曖昧な先頭候補へ勝手に寄せすぎない。
- 女優 ID が取れた場合は `ItemList` の `article=actress&article_id=<id>` を優先する。
- 女優 ID が取れない場合、または女優 ID 検索で商品が取れない場合は、作品名検索として `ItemList` の `keyword=<検索語>` へフォールバックする。
- FANZA の作品名検索成功時は `provider: "affiliate-keyword-search"`、`searchType: "keyword"` になる。
- FANZA の女優検索成功時は `provider: "affiliate-actress-search"`、`searchType: "actress"` になる。
- FANZA の再生候補は Affiliate ItemList の `sampleMovieURL` から得た `playbackUrl` を持つ item のみ。
- `sampleMovieURL` が `www.dmm.co.jp/litevideo/...` の場合、hosted mode では detail page をスクレイピングしない。`cid` / `mode` / `affi_id` から DMM 内部の `html5_player` URL を組み立て、HTML 内の `bitrates` から FullHD の `...hhb.mp4` を抽出する。
- hosted FANZA `litevideo` の成功レスポンスは `type: "direct"` と FullHD mp4 の `playbackUrl`。
- FullHD mp4 抽出に失敗した場合だけ iframe fallback を使う。ただし通常成功経路は `<video>` への direct mp4。
- FANZA でも `detailUrl` だけの商品は複数再生候補に含めない。

成功確認例:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4312/api/search/actress?keyword=<女優名または作品名>&provider=fanza&pageSize=5'
```

期待値:

- `search.searchProvider` は `fanza`
- 女優一致時は `affiliate-actress-search`
- 作品名フォールバック時は `affiliate-keyword-search`
- 再生対象 item は `playbackUrl` を持つ
- hosted FANZA litevideo は `/api/preview/info` で `type: "direct"` と FullHD mp4 を返す

### 検索結果の複数選択・複数再生

- 検索結果カードの複数選択ボタンは `isSearchPreviewable()` が true の item だけを選択・再生対象にする。
- 現行条件は `Boolean(item?.seasonId || item?.playbackUrl)`。
- `detailUrl` は再生候補判定に使わない。これを入れると Vercel hosted mode で detail-only 商品が混ざり、黒画面や読み込み失敗の原因になる。
- 複数再生ボタンは `openSearchInlinePreviews([...state.selectedSearchKeys])` を呼び、表示中の検索結果から key を引き直して再生対象を作る。
- DMM 検索結果は `seasonId` があるのでランキング複数再生と同じ HLS 経路に乗る。
- FANZA 検索結果は `playbackUrl` があるので litevideo / direct mp4 経路に乗る。
- 複数再生では音声は1つだけを有効にする。`activeInlinePreviewAudioKey` が現在の音声対象で、非アクティブカードは強制的に `muted=true` に戻す。

### 品番表示

- すべてのコンテンツカードは title と actress の間に品番を表示する。
- `getProductCode()` は `productCode || contentId || seasonId` を取り、`formatProductCode()` で `OFJE-614` のように英字と数字の間へ `-` を入れる。
- FANZA Affiliate item は API 由来の `productCode` / `contentId` を優先する。
- DMM GraphQL item は `seasonId` から表示可能な品番を作る。ただし DMM TV の `seasonId` は内部 ID のため、すべてが一般的なメーカー品番と完全一致するとは限らない。

## 2026-04-27 追記: 失敗ノウハウ

過去の失敗パターンは上の章にも残している。ここには今回の DMM/FANZA トグル、女優/作品検索、検索結果複数再生で追加で分かった注意点を追記する。

1. DMM トグル検索に Affiliate ItemList を使うと、検索成功メッセージは出ても複数再生できない結果が混ざる。
   - DMM Affiliate ItemList には `detailUrl` だけの商品が多く、ランキングと同じ `seasonId` / HLS 再生経路に乗らない。
   - DMM 検索結果の複数再生は、ランキングと同じ DMM TV GraphQL + `seasonId` + HLS 解決に揃える。

2. `detailUrl` を再生可能条件に含めると失敗する。
   - `isSearchPreviewable()` に `detailUrl` を入れると、サンプル動画 URL がない商品までチェック可能になり、複数再生で黒画面や 500 になりやすい。
   - 再生候補は `seasonId` または `playbackUrl` を持つ item だけにする。

3. hosted mode で HLS をサーバー経由にすると壊れる。
   - DMM の HLS manifest / segment を Vercel サーバーから取りに行くと 403 になりやすい。
   - hosted mode の DMM HLS はブラウザへ直接 URL を返す。

4. FANZA の detail page スクレイピングを hosted mode の通常経路にしてはいけない。
   - ローカルで通っても Vercel で落ちることがある。
   - FANZA は Affiliate ItemList の `sampleMovieURL` を成功条件にする。
   - `litevideo` は detail page ではなく `html5_player` URL を組み立て、FullHD mp4 を抽出する。

5. 女優検索と作品検索を別フォーム・別状態に分けすぎない。
   - 現行 UI は `keyword` 一本で、女優名でも作品名でも検索できる。
   - サーバーは旧 `actress` も読むが、最新版の主入力は `keyword`。
   - 検索語、provider、loading、選択状態、プレビュー状態を検索開始時に必ずリセットする。

6. FANZA の女優候補を雑に先頭採用すると作品名検索が壊れる。
   - 作品名を入力した時に ActressSearch の曖昧な先頭候補へ寄せると、無関係な女優検索になる。
   - 女優一致が弱い場合は keyword ItemList へフォールバックする。

7. DMM で一部の GraphQL 結果が個別にプレビュー解決失敗することはある。
   - これはランキング側でも起こり得る個別作品のサンプル有無・権限・ページ構造の問題。
   - 検索経路全体を Affiliate/detail-only に戻して解決しようとしない。
   - 複数再生の基準は「再生可能な `seasonId` / `playbackUrl` を持つ item を対象にする」こと。

8. DMM と FANZA の成功条件を混ぜない。
   - DMM: GraphQL `seasonId` + DMM TV HLS。
   - FANZA: Affiliate `sampleMovieURL` + litevideo FullHD direct mp4。
   - DMM のために FANZA を GraphQL に寄せる、または FANZA のために DMM を Affiliate detail-only に寄せると、どちらかの要件が壊れる。

## iPadレイアウト

この章は、iPad の複数選択再生レイアウトで成功している仕様と、そこに至るまでの失敗パターンを追記する。既存章の内容は変更せず、iPad レイアウトの判断基準だけをここに追加する。

### 成功仕様

- iPad 判定は `public/app.js` の `TABLET_LAYOUT_MEDIA_QUERY` と `ipad-inline-layout` body class で扱う。
- iPad では `canUseInlinePreviewExperience()` が true になり、ダウンロード候補、検索結果、お気に入りの複数選択再生を同じインラインプレビュー経路で使う。
- iPhone 判定は `iphone-inline-layout` に分ける。iPad 横向きと iPhone 横向きが混ざらないよう、iPad 判定には `min-height: 600px` を含める。
- iPad 横向きの複数再生は `favorite-preview-grid-multi` を 2 カラムにし、1 画面で 4 動画を見られる状態を基準にする。
- iPhone の複数再生は 2 画面表示を基準にする。
- 動画下の省スペースメタ情報は、iPad/iPhone ともに `商品ID -> 女優名 -> タイトル名` の順で 1 行表示する。
- 1 行に入り切らない文字は省略する。商品IDは省略しない。iPad では女優名を最大 10 文字相当まで表示し、1 人分の短い女優名は必ず入るようにする。女優名が長い、または複数名で長くなる場合は 10 文字相当で省略し、残り幅をタイトル名に使う。
- お気に入りボタンは既存位置を維持する。メタ情報の順番変更や省スペース化でボタン位置を動かさない。
- 4 件を超える iPad 複数再生では、動画グリッド自体ではなくページ側を縦スクロールさせる。`inline-preview-active` body class を使い、`.content` をスクロール可能にする。
- 動画以外の UI は固定しない。複数再生ヘッダーや選択操作 UI は、下スクロール時に動画と一緒に流れる。
- ダッシュボード複数再生中は、`activeDashboardPreviewItems` と `cachedRankingItems` で再生開始時の候補を保持する。`/api/state` の更新タイミングでランキングが一時的に空になっても、プレビューカードと video 要素を消さない。

### 試行錯誤で分かったこと

1. iPad の 5 件目以降を表示するために、`favorite-preview-grid-multi` だけに `max-height` と `overflow-y: auto` を付けると、動画グリッド内だけがスクロールする。
   - この方法だと「同時再生」「閉じる」「複数選択」などのヘッダー UI が固定されたように残り、実際に視聴できる動画領域が狭くなる。
   - 成功パターンは、グリッド内スクロールではなくページスクロールにすること。

2. iPad 横向き用の既存 CSS には `.content { height: 100vh; overflow: hidden; }` と、各 section の `overflow: hidden` がある。
   - これを解除しないと、4 画面を超えた動画カードが親要素で切られ、下スクロールしても 5 件目以降が見えない。
   - 複数再生中だけ `body.ipad-inline-layout.inline-preview-active .content` を `overflow: auto` にし、表示中 section は `overflow: visible` にする。

3. ランキング更新や自動更新のタイミングで `state.snapshot.ranking.items` が空になることがある。
   - 再生中の候補を毎回ランキング一覧から引き直すだけだと、複数再生中に「ランキング取得を実行するとここに表示されます。」「ランキングデータがまだありません」に落ち、video 要素が破棄される。
   - 成功パターンは、再生開始時の item を `activeDashboardPreviewItems` に保持し、ランキング一覧が一時的に空でも `cachedRankingItems` を使って表示を維持すること。

4. iPad/iPhone のメタ情報を複数行にすると、動画カード下の余白が増え、1 画面内に表示できる動画数が減る。
   - 成功パターンは `商品ID -> 女優名 -> タイトル名` を 1 行に並べ、商品IDは省略せず、iPad の女優名は最大 10 文字相当で省略し、その後ろをタイトル名の表示領域にすること。
   - `favorite-preview-code` と `favorite-preview-subtitle` の下段表示は iPad/iPhone では隠し、同じ情報を 1 行メタに集約する。

## 2026-05-16 再整理: DMM ItemList検索とプレビュー再生

今回の障害は、DMMの検索結果表示とプレビュー再生の成功条件を混ぜたことが原因だった。検索結果をDMM TV GraphQL寄せにすると `seasonId` が取れるためランキングと同じHLS再生に乗りやすいが、検索結果件数が極端に減る。一方、DMM Affiliate ItemListへ戻すと検索結果件数は戻るが、`detailUrl` だけの商品を再生可能扱いにすると、`C:\Users\mahha\OneDrive\開発\DMM_download\lib\dmm-downloader.js` の詳細ページ解析へ落ちて「再生用動画URLを見つけられませんでした」という失敗になる。

成功している経路:

- DMMランキング: `seasonId` を持つDMM TV GraphQL結果を使い、`C:\Users\mahha\OneDrive\開発\DMM_download\lib\dmm-downloader.js` のGraphQLサンプル動画解決でHLSを再生する。
- FANZA女優名検索・商品名検索: DMM Affiliate ItemListの `sampleMovieURL` を使い、`https://www.dmm.co.jp/litevideo/` から `html5_player` を経由してFullHD mp4を抽出する。
- DMM検索結果表示: DMM Affiliate ItemListを使うと複数件の検索結果を維持できる。

失敗した経路:

- DMM検索をDMM TV GraphQL一本に寄せると、再生はランキングに近くなるが、DMM Affiliate ItemListより検索結果が大幅に細る。
- DMM Affiliate ItemListの `detailUrl` だけを再生候補に入れると、Vercel hosted modeや詳細ページ構造差分で黒画面、500、または「再生用動画URLを見つけられませんでした」になる。
- `content_id` を単純に `litevideo` の `cid` に合成するだけでは不十分。例として `15dss00145` は `15dss145` のようにゼロ詰めを外した候補が必要になる。
- DMM TVのタイトル検索で後から `seasonId` を探す方法は、作品名がシリーズ名や汎用語の場合に誤照合または未照合になりやすい。

2026-05-16時点の修正方針:

- DMMの検索結果表示はDMM Affiliate ItemListのまま維持する。検索結果をランキング検索やDMM TV GraphQL検索へ置き換えない。
- プレビュー再生可能判定は `seasonId` または `playbackUrl` を持つ商品のみにする。`detailUrl` だけの商品は再生ボタンを有効にしない。
- DMM Affiliate ItemListの商品は、まず `sampleMovieURL` を使う。無い場合は `content_id`、`product_id`、`cid`、`itemCode`、`URL`、`affiliateURL` から `litevideo` の `cid` 候補を作る。
- DMMの `cid` 候補では、`dl` suffix除去とゼロ詰め除去を行う。例: `15dss00145` から `15dss145` を優先候補にする。
- `C:\Users\mahha\OneDrive\開発\DMM_download\server.js` の hosted modeでは、DMM検索由来の `litevideo` もFANZAと同じ `html5_player` 抽出経路へ通す。
- `C:\Users\mahha\OneDrive\開発\DMM_download\lib\dmm-downloader.js` では、DMM Affiliate ItemList由来の商品を最初からDMM TVタイトル照合へ寄せない。まず `playbackUrl` の `litevideo` を解き、失敗時だけDMM TV照合を補助として使う。
- `detailUrl` は外部リンクや補助情報として残してよいが、DMM検索結果のプレビュー再生の主経路には使わない。

修正対象ファイル:

- `C:\Users\mahha\OneDrive\開発\DMM_download\lib\ranking-service.js`: DMM Affiliate ItemList結果に `sampleMovieURL` 優先、無ければ `litevideo` 候補URLを付与する。
- `C:\Users\mahha\OneDrive\開発\DMM_download\public\app.js`: 検索結果の再生可能判定から `detailUrl` を外す。
- `C:\Users\mahha\OneDrive\開発\DMM_download\server.js`: hosted modeでDMM検索由来の `litevideo` をFANZAと同じ抽出経路に通し、`playbackUrl` が無い検索結果は400にする。
- `C:\Users\mahha\OneDrive\開発\DMM_download\lib\dmm-downloader.js`: DMM Affiliate ItemList由来の再生解決順を `playbackUrl` 優先へ戻し、詳細ページ解析への落下を止める。

検証観点:

- DMM作品名検索で複数の検索結果が表示されること。
- DMM検索結果の再生ボタンが、`detailUrl` だけの商品では有効にならないこと。
- DMM検索結果で `playbackUrl` が付いた商品は、`C:\Users\mahha\OneDrive\開発\DMM_download\server.js` の `/api/preview/info` から `direct` または `iframe` を返すこと。
- FANZA女優名検索・商品名検索は、従来通り `sampleMovieURL` と `litevideo` 経由で再生されること。
