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
