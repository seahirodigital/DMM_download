# DMM Download Tool Implementation Plan

## Goal

n8n + Spreadsheet 中心だった既存フローを、ローカルで動く Web ダッシュボード付きのダウンロードツールへ置き換える。

要求された動作は以下の 7 点に分解して実装する。

1. DMM のランキングを HTTP Request で取得する
2. ランキングと URL を抽出し、CSV として蓄積する
3. ランキング上位から指定件数の URL を使って動画ダウンロードを実行する
4. 動画を指定ルールのファイル名で `%USERPROFILE%\\Downloads\\DMM` に保存する
5. 一度ダウンロードした作品は再ダウンロードしない
6. ダウンロード指示用の Web ダッシュボードを用意する
7. ダウンロード済み動画を一覧・視聴できる動画ビューアーを用意する

## 調査結果

### 使える既存情報

- `reference/DMM動画ダウンロードワークフロー.json`
  - DMM TV ランキング取得の GraphQL リクエストが残っている
  - レスポンス整形ロジックが残っている
  - DMM Affiliate API を使った検索 URL 補助ロジックが残っている

### 現時点で欠けている情報

- `reference/auto_movie.js` は現状 0 バイト
- `reference/starbucks_design.md` も現状 0 バイト

そのため、動画取得ロジックとデザイン参照はそのまま流用できない。今回は以下の方針で補う。

- 動画取得:
  - n8n の ranking URL をベースに再構成
  - DMM 詳細ページから再生 URL を抽出するデフォルト実装を用意
  - 将来 Tampermonkey 実装を差し替えやすいように、抽出処理を単独モジュール化
- デザイン:
  - 参照ファイルが空のため、YouTube 的な操作性を優先したローカル向け UI を新規設計

## 実装方針

## 1. 実行形態

- Node.js 単体で動くローカルサーバーを新設する
- 外部依存を極力増やさず、標準モジュール中心で構成する
- フロントエンドは静的 HTML/CSS/JavaScript で提供する

この構成にする理由:

- ローカルファイルの読み書きが必要
- ダウンロード状態をメモリと JSON で扱いたい
- Web ダッシュボードと動画ビューアーを同一プロセスで持ちたい
- 現在のリポジトリに既存アプリ基盤が存在しない

## 2. データの置き場所

- `config/`
  - API / Cookie / 保存先 / 命名規則などを置く
- `data/runtime/`
  - 現在ランキング
  - ダウンロードキュー状態
  - UI 設定
- `data/history/`
  - `ranking-history.csv`
  - `download-history.json`

## 3. ランキング取得

n8n ワークフローに残っていた GraphQL を再利用する。

- endpoint: `https://api.tv.dmm.com/graphql`
- operation: `FetchSearchVideos`
- sort: `RANK`
- categories: `23`
- first: 初期値 15

取得結果は以下を保持する。

- 取得日時
- 順位
- season id
- タイトル
- 女優名の推定値
- 詳細 URL
- サムネイル URL
- 検索 URL

## 4. CSV 保存

ランキング取得のたびに `data/history/ranking-history.csv` に append する。

保存カラム:

- fetchedAt
- rank
- seasonId
- title
- actress
- detailUrl
- thumbnailUrl
- searchUrl

## 5. ダウンロード処理

ダウンロード処理は 3 層に分ける。

1. **Queue 管理**
   - 上位 N 件をキュー化
   - 実行 / 停止 / スキップを制御
2. **再生 URL 抽出**
   - DMM 詳細ページから動画 URL を抽出
   - 将来 Tampermonkey ロジックへ差し替え可能な構造にする
3. **保存**
   - 直接 mp4 ならそのまま保存
   - HLS の場合はプレイリストを解決し、可能な範囲で保存
   - 将来的に ffmpeg 連携を追加しやすい設計にする

## 6. 重複防止

作品の一意キーは原則 `seasonId` とする。

- `download-history.json` に保存済み作品を記録
- `completed` の履歴がある作品は再キューしない
- 既存ファイルの存在確認も行う

## 7. ファイル名ルール

初期テンプレート:

`{{title}}_{{actress}}_{{seasonId}}`

Windows で使えない文字はサニタイズする。

保存先の初期値は以下。

- docs 表記: `%USERPROFILE%\\Downloads\\DMM`
- runtime 既定値: `process.env.USERPROFILE` から展開

## 8. Web ダッシュボード

タブ構成:

- Dashboard
  - ランキング取得
  - 上位何件までダウンロードするか
  - ダウンロード開始
  - 停止
  - 最新ランキング表
- History
  - 過去のダウンロード履歴
  - スキップ理由
  - 保存先
- Viewer
  - ダウンロード済み動画一覧
  - 個別再生
  - 次動画の自動再生

UI の方向性:

- ダークテーマ主体
- YouTube 的な左右レイアウト
- 操作ボタンと状態表示を上段に集約
- 大画面プレイヤー + 右側プレイリスト

## 9. 動画ビューアー

必要機能:

- ダウンロード済み動画の一覧
- クリック選択で再生
- 倍速変更
- 次動画自動再生
- キーボードショートカット

ショートカット仕様:

- `ArrowLeft`: 5 秒戻る
- `ArrowRight`: 5 秒進む
- `ArrowDown`: 次の動画
- `ArrowUp`: 前の動画
- `D`: 倍速 +0.1
- `S`: 倍速 -0.1

追加仕様:

- 既定では `%USERPROFILE%\\Downloads\\DMM` をライブラリとして表示
- 任意フォルダはブラウザ側のフォルダ選択でも視聴できるようにする

## 10. リスクと対処

### 動画取得ロジックの不確実性

`reference/auto_movie.js` が空のため、完全流用は不可。

対処:

- デフォルトの URL 抽出器を実装
- 抽出器を分離し、後から Tampermonkey ロジックを移植しやすくする

### 外部ツール依存

環境上 `ffmpeg` は未導入だった。

対処:

- まずは外部依存なしで動く構成を優先
- `ffmpeg` が存在する場合は将来優先利用できる余地を残す

### Windows 固定パス

対処:

- docs では `%USERPROFILE%` 表記を使う
- code では
  - 明示設定
  - `%USERPROFILE%` 展開
  - 必要時のみ既定値
  の順で扱う

## 実装順

1. 設定 / 状態保存 / HTTP サーバーの土台
2. ランキング取得 API と CSV 保存
3. ダウンロードキューと重複防止
4. ダッシュボード UI
5. 動画ビューアー UI
6. 動作確認と最終調整
