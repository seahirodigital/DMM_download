# DMM / FANZA プレビュー再生 技術メモ

## 成功パターン

Vercel 版で女優検索後の FANZA サンプル動画を再生する場合は、ローカル版と同じ「サーバーで動画URLを抽出して `<video>` に流す」方式に寄せすぎない。

ローカルでは `www.dmm.co.jp/litevideo/...` をサーバーで取得し、内部の `html5_player` から `cc3001.dmm.co.jp/...mp4` を抽出して再生できる。一方、Vercel の Serverless Function から同じ解析を行うと、DMM 側の応答差分や CDN 403 により失敗しやすく、最終的に detail page 抽出へ落ちて黒画面になる。

Vercel hosted mode の成功パターンは次の通り。

- 女優検索は FANZA Affiliate ItemList を優先する。
- `sampleMovieURL` がある項目だけを再生候補に残す。
- FANZA の `www.dmm.co.jp/litevideo/...` は、Vercel サーバーで最終メディアURLへ解析しない。
- hosted mode では `litevideo` を DMM の内側プレイヤー `https://www.dmm.co.jp/service/digitalapi/-/html5_player/...` に変換し、`iframe` として表示する。
- `html5_player` には `width=1920` / `height=1080` / `forceAutoPlay=1` を付ける。
- HLS のランキング系プレビューは、Vercel サーバーで manifest を取りに行くと 403 になるため、hosted mode では DMM の HLS URL をブラウザへ直接返す。
- direct mp4 など HLS 以外のメディアは、必要に応じて `/api/preview/play` でプロキシする。

## 重要な実装ポイント

`/api/preview/info` の hosted mode 分岐で、`seasonId` がなく `playbackUrl` が `litevideo` の場合は `resolvePlayableSource()` に進ませない。ここで進ませると Vercel 側で litevideo 解析に失敗し、detail page スクレイピングへ落ちる。

代わりに次のようなレスポンスを返す。

```json
{
  "type": "iframe",
  "playbackUrl": "https://www.dmm.co.jp/service/digitalapi/-/html5_player/=/cid=.../mtype=AhRVShI_/service=litevideo/mode=part/width=1920/height=1080/forceAutoPlay=1/affi_id=.../"
}
```

フロント側は `type: "iframe"` を受けたら `<video>` を隠し、同じプレイヤー枠内に `<iframe allow="autoplay; fullscreen; picture-in-picture">` を追加する。

## これまでの失敗パターン

1. Vercel で HLS manifest / segment をサーバープロキシした。
   - `/api/preview/play` が `cc3001.dmm.co.jp/.../playlist.m3u8` を取得しようとして 403。
   - ランキング側の複数再生まで壊れた。

2. 女優検索を DMM TV GraphQL 優先にした。
   - ランキングと同じ `seasonId` 付き結果にはなるが、ユーザー要件の FANZA 結果ではなくなる。
   - FANZA の検索結果を見たい用途に合わない。

3. FANZA の `litevideo` を Vercel サーバーで解析しようとした。
   - ローカルでは成功するが、Vercel では `/api/preview/info` が detail page 抽出へ落ちて失敗。
   - エラー例: `「the detail page」の再生用動画URLを見つけられませんでした。`

4. 外側の `www.dmm.co.jp/litevideo/...` ページをそのまま iframe にした。
   - 再生はできるが、内部 iframe が `width=476 height=306` 固定で生成される。
   - 黒い枠の中でプレイヤーが小さく表示される。
   - 画質も低く見えやすく、自動再生も安定しない。

## 現在の対策

- `buildHostedLitevideoPlayerUrl()` で `litevideo` URL から `cid` / `mode` / `affi_id` を取り出し、直接 `html5_player` URLを組み立てる。
- `width=1920` / `height=1080` を指定し、プレイヤー初期表示を大きくする。
- `forceAutoPlay=1` を指定し、複数選択後の一括再生で iframe 側も再生開始しやすくする。
- プレイヤー枠の CSS は `position: relative`、iframe は `position: absolute; inset: 0; width: 100%; height: 100%` にして、枠いっぱいに表示する。

## 2026-04-26 追加試行ログ

- 外側の `litevideo` ページを iframe にすると、再生はできても内側プレイヤーが `476x306` 固定で生成されるため、黒い余白が大きく残った。
- `html5_player` へ直接変換し、`width=1920` / `height=1080` を付けた場合、プレイヤー設定上の `height` は `1080px` になり、ビットレート候補にも `FullHD (1080p)` が先頭で含まれる。
- `forceAutoPlay=1` を付けると、プレイヤー設定の `autoPlay` が `true` になる。
- `muted=1` / `mute=1` / `volume=0` / `forceMuted=1` / `playMuted=1` も試したが、プレイヤー設定の `muted` は `false` のままで変わらなかった。そのためミュート指定は採用せず、`iframe allow="autoplay; fullscreen; picture-in-picture"` と `forceAutoPlay=1` の組み合わせで一括再生を成立させる。
- hosted mode の `/api/preview/info` と `/api/preview/play` は、どちらも `html5_player` URL に `width=1920` / `height=1080` / `forceAutoPlay=1` / `affi_id` が含まれることをローカルで確認済み。

## 調査コマンド

直近の本番エラー確認:

```powershell
npx.cmd vercel logs --environment production --since 30m --level error --expand --no-branch
```

最新デプロイ確認:

```powershell
npx.cmd vercel ls dmm-download
```

ローカルで FANZA 検索結果の `playbackUrl` を確認:

```powershell
node -e "/* fetchActressSearch で result.items[].playbackUrl を確認 */"
```
