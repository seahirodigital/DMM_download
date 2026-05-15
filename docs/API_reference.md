DMM.com、FANZAの商品の情報を取得することが可能なAPI です。

リクエストURL

https://api.dmm.com/affiliate/v3/ItemList?api_id=[APIID]&affiliate_id=[アフィリエイトID]&site=FANZA&service=digital&floor=videoa&hits=10&sort=date&keyword=%e4%b8%8a%e5%8e%9f%e4%ba%9c%e8%a1%a3&output=json
※APIID・アフィリエイトIDを入力する際には、前後の[ ]は不要です。
DMM TVおよびプレミアムについて

リクエストパラメータ

論理名	物理名	必須	値のサンプル	概要
APIID	api_id	○		登録時に割り振られたID
アフィリエイトID	affiliate_id	○	affiliate-990	登録時に割り振られた990～999までのアフィリエイトID
サイト	site	○	FANZA	一般（DMM.com）かアダルト（FANZA）か
サービス	service		digital	フロアAPIから取得できるサービスコードを指定
フロア	floor		videoa	フロアAPIから取得できるフロアコードを指定
取得件数	hits		20	初期値：20　最大：100
検索開始位置	offset		1	初期値：1　最大：50000
ソート順	sort		rank	初期値：rank
人気：rank
価格が高い順：price
価格が安い順：-price
発売日：date
評価：review
マッチング順：match
キーワード	keyword		松本いちか	UTF-8で指定
キーワード検索のヒント
商品ID	cid		mizd00320	商品に振られているcontent_id
絞りこみ項目	article		actress	女優：actress
作者：author
ジャンル：genre
シリーズ：series
メーカー：maker
絞り込み項目を複数設定する場合、パラメータ名を配列化します。
例：&article[0]=genre&article[1]=actress
絞り込みID	article_id		1011199	上記絞り込み項目のID(各検索APIから取得可能)
絞り込み項目を複数設定する場合、パラメータ名を配列化します。
例：&article_id[0]=111111&article_id[1]=222222
発売日絞り込み	gte_date		2016-04-01T00:00:00	このパラメータで指定した日付以降に発売された商品を絞り込むことができます。
ISO8601形式でフォーマットした日付を指定してください。(ただし、タイムゾーンは指定できません)
発売日絞り込み	lte_date		2016-04-30T23:59:59	このパラメータで指定した日付以前に発売された商品を絞り込むことができます。
フォーマットはgte_dateと同じです。
在庫絞り込み	mono_stock		mono	初期値：絞り込みなし
在庫あり：stock
予約商品（在庫あり）：reserve
予約商品（キャンセル待ち）：reserve_empty
DMM通販のみ：mono
※通販サービスのみ指定可能
出力形式	output		json	json / xml
コールバック	callback		callback	出力形式jsonで指定した場合に、このパラメータでコールバック関数名を指定すると、JSONP形式で出力されます
レスポンスフィールド

フィールド	説明	例
request		
parameters		
└ parameter	リクエストパラメータ	
　　├ name	パラメータ名	site
　　└ value	値	FANZA
result		
├ status	ステータスコード	200
├ result_count	取得件数	20
├ total_count	全体件数	50000
├ first_position	検索開始位置	1
├ items	商品情報	
　├ service_code	サービスコード	digital
　├ service_name	サービス名	動画
　├ floor_code	フロアコード	videoa
　├ floor_name	フロア名	ビデオ
　├ category_name	カテゴリ名	ビデオ (動画)
　├ content_id	商品ID	15dss00145
　├ product_id	品番	15dss00145dl
　├ title	タイトル	GET！！ 素人ナンパ Best100！！ 街角女子ベスト100人 8時間
　├ volume	収録時間 or ページ数	350
　├ number	巻数	3
　├ review	レビュー平均点	
　　├ count	レビュー数	8
　　└ average	レビュー平均点	3.13
　├ URL	商品ページURL	http://video.dmm.co.jp/av/content/?id=15dss00145
　├ affiliateURL	アフィリエイトリンクURL	https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2Fav%2Fcontent%2F%3Fid%3D15dss00145&af_id=affiliate-990&ch=api
　├ imageURL	画像URL	
　　├ list	リストページ用	http://pics.dmm.co.jp/digital/video/15dss00145/15dss00145pt.jpg
　　├ small	末端用（小）	http://pics.dmm.co.jp/digital/video/15dss00145/15dss00145ps.jpg
　　└ large	末端用（大）	http://pics.dmm.co.jp/digital/video/15dss00145/15dss00145pl.jpg
　├ tachiyomi		
　　├ URL	立ち読みページURL	http://book.dmm.co.jp/tachiyomi/?product_id=b468acown00017&item_id=b468acown00017&shop=digital_book
　　└ affilaiteURL	立ち読みアフィリエイトリンクURL	https://al.fanza.co.jp/?lurl=http%3A%2F%2Fbook.dmm.co.jp%2Ftachiyomi%2F%3Fproduct_id%3Db468acown00017%26item_id%3Db468acown00017%26shop%3Ddigital_book&af_id=affiliate-990&ch=api
　├ sampleImageURL	サンプル画像URL	
　　├ sample_s	サンプル（小）リスト	
　　　 └ image	サンプル画像（小）	http://pics.dmm.co.jp/digital/video/15dss00145/15dss00145-1.jpg
　　├ sample_l	サンプル（大）リスト	
　　　 └ image	サンプル画像（大）	http://pics.dmm.co.jp/digital/video/15dss00145/15dss00145jp-1.jpg
　├ sampleMovieURL	サンプル動画URL	
　　├ size_476_306	476×306	http://www.dmm.co.jp/litevideo/-/part/=/cid=15dss145/size=476_306/affi_id=affiliate-990/
　　├ size_560_360	560×360	http://www.dmm.co.jp/litevideo/-/part/=/cid=15dss145/size=560_360/affi_id=affiliate-990/
　　├ size_644_414	644×414	http://www.dmm.co.jp/litevideo/-/part/=/cid=15dss145/size=644_414/affi_id=affiliate-990/
　　├ size_720_480	720×480	http://www.dmm.co.jp/litevideo/-/part/=/cid=15dss145/size=720_480/affi_id=affiliate-990/
　　├ pc_flag	PC対応しているか	1
　　└ sp_flag	スマホ対応しているか	1
　├ prices	価格	
　　├ price	金額	300～
　　├ list_price	定価	
　　└ deliveries	配信リスト	
　　　└ delivery	配信	
　　　　├ type	配信タイプ	stream
　　　　└ price	配信価格	300
　├ date	発売日、配信開始日、貸出開始日	2012/8/3 10:00
　├ iteminfo	商品詳細	
　　├ genre	ジャンル	
　　　├ name	ジャンル名	ベスト・総集編
　　　└ id	ジャンルID	6003
　　├ series	シリーズ	
　　　├ name	シリーズ名	GETシリーズ
　　　└ id	シリーズID	1006
　　├ maker	メーカー	
　　　├ name	メーカー名	桃太郎映像出版
　　　└ id	メーカーID	40016
　　├ actor	出演者（一般作品のみ）	
　　　├ name	出演者名	
　　　└ id	出演者ID	
　　├ actress	女優（アダルト作品のみ）	
　　　├ name	女優名	小澤マリア
　　　└ id	女優ID	15187
　　├ director	監督	
　　　├ name	監督名	
　　　└ id	監督ID	
　　├ author	作家、原作者、著者	
　　　├ name	作家、原作者、著者名	
　　　└ id	作家、原作者、著者ID	
　　├ label	レーベル	
　　　├ name	レーベル名	LADY HUNTERS
　　　└ id	レーベルID	76
　　├ type	タイプ	
　　　├ name	タイプ名	
　　　└ id	タイプID	
　　├ color	カラー	
　　　├ name	カラー名	
　　　└ id	カラーID	
　　└ size	サイズ	
　　　├ name	サイズ名	
　　　└ id	サイズID	
　├ cdinfo	CD情報	
　　└ kind	アルバム、シングル	
　├ jancode	JANコード	4988135965905
　├ maker_product	メーカー品番	10003-54653
　├ isbn	ISBN	
　├ stock	在庫状況	reserve
　└ directory	パンくずリスト	
　　　├ id	パンくずID	783
　　　└ name	パンくず名	J-POP等
　└ campaign	キャンペーン情報	
　　　├ date_begin	キャンペーン開始日時	2023-05-01 10:00:00
　　　├ date_end	キャンペーン終了日時	2023-05-31 23:59:59
　　　└ title	キャンペーンタイトル	
サンプルレスポンス

{
    "request": {
        "parameters": {
            "api_id": "example",
            "affiliate_id": "affiliate-990",
            "site": "FANZA",
            "service": "digital",
            "floor": "videoa",
            "keyword": "松本いちか"
        }
    },
    "result": {
　　　　"status": 200,
　　　　"result_count": 5,
　　　　"total_count": 1450,
　　　　"first_position": 1,
　　　　"items": [
　　　　　　{
　　　　　　　　"service_code": "digital",
　　　　　　　　"service_name": "動画",
　　　　　　　　"floor_code": "videoa",
　　　　　　　　"floor_name": "ビデオ",
　　　　　　　　"category_name": "ビデオ (動画)",
　　　　　　　　"content_id": "mizd00320",
　　　　　　　　"product_id": "mizd00320",
　　　　　　　　"title": "令和イチのメスガキ 松本いちか わからせ痴女られ10作品8時間ベスト",
　　　　　　　　"volume": "476",
　　　　　　　　"review": {
　　　　　　　　　　"count": 13,
　　　　　　　　　　"average": "5.00"
　　　　　　　　},
　　　　　　　　"URL": "https://video.dmm.co.jp/av/content/?id=mizd00320",
　　　　　　　　"affiliateURL": "https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2Fav%2Fcontent%2F%3Fid%3Dmizd00320&af_id=affiliate-990&ch=api",
　　　　　　　　"imageURL": {
　　　　　　　　　　"list": "https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320pt.jpg",
　　　　　　　　　　"small": "https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320ps.jpg",
　　　　　　　　　　"large": "https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320pl.jpg"
　　　　　　　　},
　　　　　　　　"sampleImageURL": {
　　　　　　　　　　"sample_s": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320-10.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　},
　　　　　　　　　　"sample_l": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00320/mizd00320jp-10.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"sampleMovieURL": {
　　　　　　　　　　"size_476_306": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00320/size=476_306/affi_id=affiliate-990/",
　　　　　　　　　　"size_560_360": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00320/size=560_360/affi_id=affiliate-990/",
　　　　　　　　　　"size_644_414": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00320/size=644_414/affi_id=affiliate-990/",
　　　　　　　　　　"size_720_480": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00320/size=720_480/affi_id=affiliate-990/",
　　　　　　　　　　"pc_flag": 1,
　　　　　　　　　　"sp_flag": 1
　　　　　　　　},
　　　　　　　　"prices": {
　　　　　　　　　　"price": "100~",
　　　　　　　　　　"list_price": "300~",
　　　　　　　　　　"deliveries": {
　　　　　　　　　　　　"delivery": [
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "hd",
　　　　　　　　　　　　　　　　"price": "100",
　　　　　　　　　　　　　　　　"list_price": "980"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "stream",
　　　　　　　　　　　　　　　　"price": "100",
　　　　　　　　　　　　　　　　"list_price": "300"
　　　　　　　　　　　　　　}
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"date": "2023-03-17 10:00:00",
　　　　　　　　"iteminfo": {
　　　　　　　　　　"genre": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6012,
　　　　　　　　　　　　　　"name": "4時間以上作品"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6533,
　　　　　　　　　　　　　　"name": "ハイビジョン"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6548,
　　　　　　　　　　　　　　"name": "独占配信"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6608,
　　　　　　　　　　　　　　"name": "女優ベスト・総集編"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1027,
　　　　　　　　　　　　　　"name": "美少女"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6004,
　　　　　　　　　　　　　　"name": "デジモ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1031,
　　　　　　　　　　　　　　"name": "痴女"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5001,
　　　　　　　　　　　　　　"name": "中出し"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 4025,
　　　　　　　　　　　　　　"name": "単体作品"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"maker": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1509,
　　　　　　　　　　　　　　"name": "ムーディーズ"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"actress": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054998,
　　　　　　　　　　　　　　"name": "松本いちか",
　　　　　　　　　　　　　　"ruby": "まつもといちか"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"label": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 2341,
　　　　　　　　　　　　　　"name": "MOODYZ Best"
　　　　　　　　　　　　}
　　　　　　　　　　]
　　　　　　　　},
　　　　　　　　"campaign": [
　　　　　　　　　　{
　　　　　　　　　　　　"date_begin": "2025-06-09 10:00:00",
　　　　　　　　　　　　"date_end": "2025-06-13 09:59:59",
　　　　　　　　　　　　"title": "滝沢ガレソコラボ100円セール第2弾"
　　　　　　　　　　}
　　　　　　　　]
　　　　　　},
　　　　　　{
　　　　　　　　"service_code": "digital",
　　　　　　　　"service_name": "動画",
　　　　　　　　"floor_code": "videoa",
　　　　　　　　"floor_name": "ビデオ",
　　　　　　　　"category_name": "ビデオ (動画)",
　　　　　　　　"content_id": "mizd00386",
　　　　　　　　"product_id": "mizd00386",
　　　　　　　　"title": "チ●ポとアナルシンクロ舐め犯しBEST 足腰ガクガク痙攣しながら交互に射精させられる僕",
　　　　　　　　"volume": "241",
　　　　　　　　"review": {
　　　　　　　　　　"count": 3,
　　　　　　　　　　"average": "5.00"
　　　　　　　　},
　　　　　　　　"URL": "https://video.dmm.co.jp/av/content/?id=mizd00386",
　　　　　　　　"affiliateURL": "https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2Fav%2Fcontent%2F%3Fid%3Dmizd00386&af_id=affiliate-990&ch=api",
　　　　　　　　"imageURL": {
　　　　　　　　　　"list": "https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386pt.jpg",
　　　　　　　　　　"small": "https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386ps.jpg",
　　　　　　　　　　"large": "https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386pl.jpg"
　　　　　　　　},
　　　　　　　　"sampleImageURL": {
　　　　　　　　　　"sample_s": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386-10.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　},
　　　　　　　　　　"sample_l": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/mizd00386/mizd00386jp-10.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"sampleMovieURL": {
　　　　　　　　　　"size_476_306": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00386/size=476_306/affi_id=affiliate-990/",
　　　　　　　　　　"size_560_360": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00386/size=560_360/affi_id=affiliate-990/",
　　　　　　　　　　"size_644_414": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00386/size=644_414/affi_id=affiliate-990/",
　　　　　　　　　　"size_720_480": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00386/size=720_480/affi_id=affiliate-990/",
　　　　　　　　　　"pc_flag": 1,
　　　　　　　　　　"sp_flag": 1
　　　　　　　　},
　　　　　　　　"prices": {
　　　　　　　　　　"price": "500~",
　　　　　　　　　　"list_price": "500~",
　　　　　　　　　　"deliveries": {
　　　　　　　　　　　　"delivery": [
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "hd",
　　　　　　　　　　　　　　　　"price": "1680",
　　　　　　　　　　　　　　　　"list_price": "1680"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "download",
　　　　　　　　　　　　　　　　"price": "1180",
　　　　　　　　　　　　　　　　"list_price": "1180"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "stream",
　　　　　　　　　　　　　　　　"price": "500",
　　　　　　　　　　　　　　　　"list_price": "500"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "iosdl",
　　　　　　　　　　　　　　　　"price": "1180",
　　　　　　　　　　　　　　　　"list_price": "1180"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "androiddl",
　　　　　　　　　　　　　　　　"price": "1180",
　　　　　　　　　　　　　　　　"list_price": "1180"
　　　　　　　　　　　　　　}
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"date": "2024-05-31 10:00:00",
　　　　　　　　"iteminfo": {
　　　　　　　　　　"genre": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6012,
　　　　　　　　　　　　　　"name": "4時間以上作品"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6533,
　　　　　　　　　　　　　　"name": "ハイビジョン"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6548,
　　　　　　　　　　　　　　"name": "独占配信"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5004,
　　　　　　　　　　　　　　"name": "手コキ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6003,
　　　　　　　　　　　　　　"name": "ベスト・総集編"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1031,
　　　　　　　　　　　　　　"name": "痴女"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5002,
　　　　　　　　　　　　　　"name": "フェラ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5022,
　　　　　　　　　　　　　　"name": "3P・4P"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6565,
　　　　　　　　　　　　　　"name": "期間限定セール"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"series": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 2935,
　　　　　　　　　　　　　　"name": "BEST（作品集）"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"maker": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1509,
　　　　　　　　　　　　　　"name": "ムーディーズ"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"actress": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072360,
　　　　　　　　　　　　　　"name": "倉本すみれ",
　　　　　　　　　　　　　　"ruby": "くらもとすみれ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1064143,
　　　　　　　　　　　　　　"name": "沙月恵奈",
　　　　　　　　　　　　　　"ruby": "さつきえな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065724,
　　　　　　　　　　　　　　"name": "乙アリス",
　　　　　　　　　　　　　　"ruby": "おつありす"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1016525,
　　　　　　　　　　　　　　"name": "浜崎真緒",
　　　　　　　　　　　　　　"ruby": "はまさきまお"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054923,
　　　　　　　　　　　　　　"name": "佐伯由美香",
　　　　　　　　　　　　　　"ruby": "さえきゆみか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1069702,
　　　　　　　　　　　　　　"name": "天馬ゆい",
　　　　　　　　　　　　　　"ruby": "てんまゆい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1070842,
　　　　　　　　　　　　　　"name": "結城りの",
　　　　　　　　　　　　　　"ruby": "ゆうきりの"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061586,
　　　　　　　　　　　　　　"name": "森日向子",
　　　　　　　　　　　　　　"ruby": "もりひなこ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1043832,
　　　　　　　　　　　　　　"name": "宝田もなみ",
　　　　　　　　　　　　　　"ruby": "たからだもなみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065327,
　　　　　　　　　　　　　　"name": "有岡みう",
　　　　　　　　　　　　　　"ruby": "ありおかみう"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1052094,
　　　　　　　　　　　　　　"name": "永瀬ゆい",
　　　　　　　　　　　　　　"ruby": "ながせゆい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1034249,
　　　　　　　　　　　　　　"name": "神納花",
　　　　　　　　　　　　　　"ruby": "かのはな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1055079,
　　　　　　　　　　　　　　"name": "斎藤あみり",
　　　　　　　　　　　　　　"ruby": "さいとうあみり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1078618,
　　　　　　　　　　　　　　"name": "尾崎えりか",
　　　　　　　　　　　　　　"ruby": "おざきえりか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1062056,
　　　　　　　　　　　　　　"name": "香椎花乃",
　　　　　　　　　　　　　　"ruby": "かしいかの"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1060141,
　　　　　　　　　　　　　　"name": "木下ひまり（花沢ひまり）",
　　　　　　　　　　　　　　"ruby": "きのしたひまり（はなざわひまり）"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054998,
　　　　　　　　　　　　　　"name": "松本いちか",
　　　　　　　　　　　　　　"ruby": "まつもといちか"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"label": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 2341,
　　　　　　　　　　　　　　"name": "MOODYZ Best"
　　　　　　　　　　　　}
　　　　　　　　　　]
　　　　　　　　}
　　　　　　},
　　　　　　{
　　　　　　　　"service_code": "digital",
　　　　　　　　"service_name": "動画",
　　　　　　　　"floor_code": "videoa",
　　　　　　　　"floor_name": "ビデオ",
　　　　　　　　"category_name": "ビデオ (動画)",
　　　　　　　　"content_id": "cjob00147",
　　　　　　　　"product_id": "cjob00147",
　　　　　　　　"title": "身動き出来ずに痴女られる逆3P挟み撃ち痴女ハーレムBEST52本番",
　　　　　　　　"volume": "476",
　　　　　　　　"review": {
　　　　　　　　　　"count": 7,
　　　　　　　　　　"average": "4.57"
　　　　　　　　},
　　　　　　　　"URL": "https://video.dmm.co.jp/av/content/?id=cjob00147",
　　　　　　　　"affiliateURL": "https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2Fav%2Fcontent%2F%3Fid%3Dcjob00147&af_id=affiliate-990&ch=api",
　　　　　　　　"imageURL": {
　　　　　　　　　　"list": "https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147pt.jpg",
　　　　　　　　　　"small": "https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147ps.jpg",
　　　　　　　　　　"large": "https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147pl.jpg"
　　　　　　　　},
　　　　　　　　"sampleImageURL": {
　　　　　　　　　　"sample_s": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147-10.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　},
　　　　　　　　　　"sample_l": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/cjob00147/cjob00147jp-10.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"sampleMovieURL": {
　　　　　　　　　　"size_476_306": "https://www.dmm.co.jp/litevideo/-/part/=/cid=cjob00147/size=476_306/affi_id=affiliate-990/",
　　　　　　　　　　"size_560_360": "https://www.dmm.co.jp/litevideo/-/part/=/cid=cjob00147/size=560_360/affi_id=affiliate-990/",
　　　　　　　　　　"size_644_414": "https://www.dmm.co.jp/litevideo/-/part/=/cid=cjob00147/size=644_414/affi_id=affiliate-990/",
　　　　　　　　　　"size_720_480": "https://www.dmm.co.jp/litevideo/-/part/=/cid=cjob00147/size=720_480/affi_id=affiliate-990/",
　　　　　　　　　　"pc_flag": 1,
　　　　　　　　　　"sp_flag": 1
　　　　　　　　},
　　　　　　　　"prices": {
　　　　　　　　　　"price": "300~",
　　　　　　　　　　"list_price": "300~",
　　　　　　　　　　"deliveries": {
　　　　　　　　　　　　"delivery": [
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "hd",
　　　　　　　　　　　　　　　　"price": "1180",
　　　　　　　　　　　　　　　　"list_price": "1180"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "download",
　　　　　　　　　　　　　　　　"price": "790",
　　　　　　　　　　　　　　　　"list_price": "790"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "stream",
　　　　　　　　　　　　　　　　"price": "300",
　　　　　　　　　　　　　　　　"list_price": "300"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "iosdl",
　　　　　　　　　　　　　　　　"price": "790",
　　　　　　　　　　　　　　　　"list_price": "790"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "androiddl",
　　　　　　　　　　　　　　　　"price": "790",
　　　　　　　　　　　　　　　　"list_price": "790"
　　　　　　　　　　　　　　}
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"date": "2024-01-26 10:00:34",
　　　　　　　　"iteminfo": {
　　　　　　　　　　"genre": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6012,
　　　　　　　　　　　　　　"name": "4時間以上作品"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6533,
　　　　　　　　　　　　　　"name": "ハイビジョン"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6548,
　　　　　　　　　　　　　　"name": "独占配信"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 4030,
　　　　　　　　　　　　　　"name": "淫乱・ハード系"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 4106,
　　　　　　　　　　　　　　"name": "騎乗位"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5001,
　　　　　　　　　　　　　　"name": "中出し"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 2001,
　　　　　　　　　　　　　　"name": "巨乳"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6003,
　　　　　　　　　　　　　　"name": "ベスト・総集編"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1031,
　　　　　　　　　　　　　　"name": "痴女"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"maker": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5552,
　　　　　　　　　　　　　　"name": "痴女ヘブン"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"actress": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1058710,
　　　　　　　　　　　　　　"name": "藤森里穂",
　　　　　　　　　　　　　　"ruby": "ふじもりりほ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1068671,
　　　　　　　　　　　　　　"name": "北野未奈",
　　　　　　　　　　　　　　"ruby": "きたのみな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1060141,
　　　　　　　　　　　　　　"name": "木下ひまり（花沢ひまり）",
　　　　　　　　　　　　　　"ruby": "きのしたひまり（はなざわひまり）"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061586,
　　　　　　　　　　　　　　"name": "森日向子",
　　　　　　　　　　　　　　"ruby": "もりひなこ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1016525,
　　　　　　　　　　　　　　"name": "浜崎真緒",
　　　　　　　　　　　　　　"ruby": "はまさきまお"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1052930,
　　　　　　　　　　　　　　"name": "吉根ゆりあ",
　　　　　　　　　　　　　　"ruby": "よしねゆりあ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065327,
　　　　　　　　　　　　　　"name": "有岡みう",
　　　　　　　　　　　　　　"ruby": "ありおかみう"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065724,
　　　　　　　　　　　　　　"name": "乙アリス",
　　　　　　　　　　　　　　"ruby": "おつありす"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054168,
　　　　　　　　　　　　　　"name": "弥生みづき",
　　　　　　　　　　　　　　"ruby": "やよいみづき"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1037168,
　　　　　　　　　　　　　　"name": "松本菜奈実",
　　　　　　　　　　　　　　"ruby": "まつもとななみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072356,
　　　　　　　　　　　　　　"name": "美波もも",
　　　　　　　　　　　　　　"ruby": "みなみもも"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1008769,
　　　　　　　　　　　　　　"name": "真木今日子",
　　　　　　　　　　　　　　"ruby": "まききょうこ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1062990,
　　　　　　　　　　　　　　"name": "夕季ちとせ",
　　　　　　　　　　　　　　"ruby": "ゆきちとせ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1008887,
　　　　　　　　　　　　　　"name": "AIKA",
　　　　　　　　　　　　　　"ruby": "あいか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 21549,
　　　　　　　　　　　　　　"name": "佐山愛",
　　　　　　　　　　　　　　"ruby": "さやまあい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054439,
　　　　　　　　　　　　　　"name": "妃ひかり",
　　　　　　　　　　　　　　"ruby": "きさきひかり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1008785,
　　　　　　　　　　　　　　"name": "篠田ゆう",
　　　　　　　　　　　　　　"ruby": "しのだゆう"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1059802,
　　　　　　　　　　　　　　"name": "羽生アリサ（羽生ありさ）",
　　　　　　　　　　　　　　"ruby": "はにゅうありさ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1012910,
　　　　　　　　　　　　　　"name": "本真ゆり",
　　　　　　　　　　　　　　"ruby": "ほんまゆり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065526,
　　　　　　　　　　　　　　"name": "初愛ねんね",
　　　　　　　　　　　　　　"ruby": "ういねんね"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1070448,
　　　　　　　　　　　　　　"name": "百永さりな",
　　　　　　　　　　　　　　"ruby": "ももながさりな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1051877,
　　　　　　　　　　　　　　"name": "逢見リカ",
　　　　　　　　　　　　　　"ruby": "あいみりか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1050439,
　　　　　　　　　　　　　　"name": "月乃ルナ",
　　　　　　　　　　　　　　"ruby": "つきのるな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1052094,
　　　　　　　　　　　　　　"name": "永瀬ゆい",
　　　　　　　　　　　　　　"ruby": "ながせゆい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 26225,
　　　　　　　　　　　　　　"name": "波多野結衣",
　　　　　　　　　　　　　　"ruby": "はたのゆい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 30130,
　　　　　　　　　　　　　　"name": "大槻ひびき",
　　　　　　　　　　　　　　"ruby": "おおつきひびき"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054923,
　　　　　　　　　　　　　　"name": "佐伯由美香",
　　　　　　　　　　　　　　"ruby": "さえきゆみか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1056460,
　　　　　　　　　　　　　　"name": "辻井ほのか",
　　　　　　　　　　　　　　"ruby": "つじいほのか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1053520,
　　　　　　　　　　　　　　"name": "久留木玲",
　　　　　　　　　　　　　　"ruby": "くるきれい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1050318,
　　　　　　　　　　　　　　"name": "今井夏帆",
　　　　　　　　　　　　　　"ruby": "いまいかほ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072360,
　　　　　　　　　　　　　　"name": "倉本すみれ",
　　　　　　　　　　　　　　"ruby": "くらもとすみれ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054998,
　　　　　　　　　　　　　　"name": "松本いちか",
　　　　　　　　　　　　　　"ruby": "まつもといちか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1047611,
　　　　　　　　　　　　　　"name": "黒川すみれ",
　　　　　　　　　　　　　　"ruby": "くろかわすみれ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1045373,
　　　　　　　　　　　　　　"name": "若月みいな",
　　　　　　　　　　　　　　"ruby": "わかつきみいな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1022129,
　　　　　　　　　　　　　　"name": "塚田詩織",
　　　　　　　　　　　　　　"ruby": "つかだしおり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061659,
　　　　　　　　　　　　　　"name": "姫咲はな",
　　　　　　　　　　　　　　"ruby": "ひめさきはな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1020973,
　　　　　　　　　　　　　　"name": "推川ゆうり",
　　　　　　　　　　　　　　"ruby": "おしかわゆうり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1032236,
　　　　　　　　　　　　　　"name": "西村ニーナ",
　　　　　　　　　　　　　　"ruby": "にしむらにーな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1043832,
　　　　　　　　　　　　　　"name": "宝田もなみ",
　　　　　　　　　　　　　　"ruby": "たからだもなみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1055595,
　　　　　　　　　　　　　　"name": "吉良りん",
　　　　　　　　　　　　　　"ruby": "きらりん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1032774,
　　　　　　　　　　　　　　"name": "あおいれな",
　　　　　　　　　　　　　　"ruby": "あおいれな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1039047,
　　　　　　　　　　　　　　"name": "枢木あおい",
　　　　　　　　　　　　　　"ruby": "くるるぎあおい"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"label": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 25334,
　　　　　　　　　　　　　　"name": "痴女ヘブンBEST"
　　　　　　　　　　　　}
　　　　　　　　　　]
　　　　　　　　}
　　　　　　},
　　　　　　{
　　　　　　　　"service_code": "digital",
　　　　　　　　"service_name": "動画",
　　　　　　　　"floor_code": "videoa",
　　　　　　　　"floor_name": "ビデオ",
　　　　　　　　"category_name": "ビデオ (動画)",
　　　　　　　　"content_id": "mizd00362",
　　　　　　　　"product_id": "mizd00362",
　　　　　　　　"title": "MOODYZ2022年厳選100タイトルオール本番コレクション 12時間 進化の止まらない石川澪の人気作品！超新星・宮下玲奈のデビュー作！ヒット作連発した奇跡の1年！",
　　　　　　　　"volume": "716",
　　　　　　　　"review": {
　　　　　　　　　　"count": 13,
　　　　　　　　　　"average": "4.54"
　　　　　　　　},
　　　　　　　　"URL": "https://video.dmm.co.jp/av/content/?id=mizd00362",
　　　　　　　　"affiliateURL": "https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2Fav%2Fcontent%2F%3Fid%3Dmizd00362&af_id=affiliate-990&ch=api",
　　　　　　　　"imageURL": {
　　　　　　　　　　"list": "https://pics.dmm.co.jp/digital/video/mizd00362/mizd00362pt.jpg",
　　　　　　　　　　"small": "https://pics.dmm.co.jp/digital/video/mizd00362/mizd00362ps.jpg",
　　　　　　　　　　"large": "https://pics.dmm.co.jp/digital/video/mizd00362/mizd00362pl.jpg"
　　　　　　　　},
　　　　　　　　"sampleMovieURL": {
　　　　　　　　　　"size_476_306": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00362/size=476_306/affi_id=affiliate-990/",
　　　　　　　　　　"size_560_360": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00362/size=560_360/affi_id=affiliate-990/",
　　　　　　　　　　"size_644_414": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00362/size=644_414/affi_id=affiliate-990/",
　　　　　　　　　　"size_720_480": "https://www.dmm.co.jp/litevideo/-/part/=/cid=mizd00362/size=720_480/affi_id=affiliate-990/",
　　　　　　　　　　"pc_flag": 1,
　　　　　　　　　　"sp_flag": 1
　　　　　　　　},
　　　　　　　　"prices": {
　　　　　　　　　　"price": "300~",
　　　　　　　　　　"list_price": "300~",
　　　　　　　　　　"deliveries": {
　　　　　　　　　　　　"delivery": [
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "hd",
　　　　　　　　　　　　　　　　"price": "1180",
　　　　　　　　　　　　　　　　"list_price": "1180"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "download",
　　　　　　　　　　　　　　　　"price": "790",
　　　　　　　　　　　　　　　　"list_price": "790"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "stream",
　　　　　　　　　　　　　　　　"price": "300",
　　　　　　　　　　　　　　　　"list_price": "300"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "iosdl",
　　　　　　　　　　　　　　　　"price": "790",
　　　　　　　　　　　　　　　　"list_price": "790"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "androiddl",
　　　　　　　　　　　　　　　　"price": "790",
　　　　　　　　　　　　　　　　"list_price": "790"
　　　　　　　　　　　　　　}
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"date": "2023-12-29 10:00:00",
　　　　　　　　"iteminfo": {
　　　　　　　　　　"genre": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6012,
　　　　　　　　　　　　　　"name": "4時間以上作品"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6533,
　　　　　　　　　　　　　　"name": "ハイビジョン"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6548,
　　　　　　　　　　　　　　"name": "独占配信"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6003,
　　　　　　　　　　　　　　"name": "ベスト・総集編"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 2001,
　　　　　　　　　　　　　　"name": "巨乳"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5001,
　　　　　　　　　　　　　　"name": "中出し"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1027,
　　　　　　　　　　　　　　"name": "美少女"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"maker": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1509,
　　　　　　　　　　　　　　"name": "ムーディーズ"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"actress": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1042129,
　　　　　　　　　　　　　　"name": "七沢みあ",
　　　　　　　　　　　　　　"ruby": "ななさわみあ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075464,
　　　　　　　　　　　　　　"name": "宮下玲奈",
　　　　　　　　　　　　　　"ruby": "みやしたれな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072127,
　　　　　　　　　　　　　　"name": "石川澪",
　　　　　　　　　　　　　　"ruby": "いしかわみお"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1057477,
　　　　　　　　　　　　　　"name": "八木奈々",
　　　　　　　　　　　　　　"ruby": "やぎなな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1052930,
　　　　　　　　　　　　　　"name": "吉根ゆりあ",
　　　　　　　　　　　　　　"ruby": "よしねゆりあ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075658,
　　　　　　　　　　　　　　"name": "希咲那奈",
　　　　　　　　　　　　　　"ruby": "きさきなな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075330,
　　　　　　　　　　　　　　"name": "皆瀬あかり",
　　　　　　　　　　　　　　"ruby": "みなせあかり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1074352,
　　　　　　　　　　　　　　"name": "佐久良咲希",
　　　　　　　　　　　　　　"ruby": "さくらさき"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1044982,
　　　　　　　　　　　　　　"name": "水川スミレ",
　　　　　　　　　　　　　　"ruby": "みずかわすみれ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1060480,
　　　　　　　　　　　　　　"name": "田中ねね",
　　　　　　　　　　　　　　"ruby": "たなかねね"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1067505,
　　　　　　　　　　　　　　"name": "琴音華",
　　　　　　　　　　　　　　"ruby": "ことねはな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1070842,
　　　　　　　　　　　　　　"name": "結城りの",
　　　　　　　　　　　　　　"ruby": "ゆうきりの"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1071453,
　　　　　　　　　　　　　　"name": "月乃ひな",
　　　　　　　　　　　　　　"ruby": "つきのひな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1050439,
　　　　　　　　　　　　　　"name": "月乃ルナ",
　　　　　　　　　　　　　　"ruby": "つきのるな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1076179,
　　　　　　　　　　　　　　"name": "五十嵐清華",
　　　　　　　　　　　　　　"ruby": "いがらしきよか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1076425,
　　　　　　　　　　　　　　"name": "森下ことの",
　　　　　　　　　　　　　　"ruby": "もりしたことの"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1077385,
　　　　　　　　　　　　　　"name": "黒木逢夢",
　　　　　　　　　　　　　　"ruby": "くろきあいむ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1069952,
　　　　　　　　　　　　　　"name": "新井リマ",
　　　　　　　　　　　　　　"ruby": "あらいりま"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1069702,
　　　　　　　　　　　　　　"name": "天馬ゆい",
　　　　　　　　　　　　　　"ruby": "てんまゆい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1067837,
　　　　　　　　　　　　　　"name": "朝田ひまり",
　　　　　　　　　　　　　　"ruby": "あさだひまり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1057013,
　　　　　　　　　　　　　　"name": "中山ふみか",
　　　　　　　　　　　　　　"ruby": "なかやまふみか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1077866,
　　　　　　　　　　　　　　"name": "水湊楓",
　　　　　　　　　　　　　　"ruby": "みなとかえで"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1076676,
　　　　　　　　　　　　　　"name": "森千里",
　　　　　　　　　　　　　　"ruby": "もりちさと"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1020685,
　　　　　　　　　　　　　　"name": "森沢かな（飯岡かなこ）",
　　　　　　　　　　　　　　"ruby": "もりさわかな（いいおかかなこ）"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061586,
　　　　　　　　　　　　　　"name": "森日向子",
　　　　　　　　　　　　　　"ruby": "もりひなこ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1048468,
　　　　　　　　　　　　　　"name": "深田えいみ",
　　　　　　　　　　　　　　"ruby": "ふかだえいみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1041897,
　　　　　　　　　　　　　　"name": "神宮寺ナオ",
　　　　　　　　　　　　　　"ruby": "じんぐうじなお"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1071048,
　　　　　　　　　　　　　　"name": "水原みその",
　　　　　　　　　　　　　　"ruby": "みずはらみその"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1051008,
　　　　　　　　　　　　　　"name": "稲場るか",
　　　　　　　　　　　　　　"ruby": "いなばるか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1038706,
　　　　　　　　　　　　　　"name": "水卜さくら",
　　　　　　　　　　　　　　"ruby": "みうらさくら"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1071639,
　　　　　　　　　　　　　　"name": "天然美月（天然かのん）",
　　　　　　　　　　　　　　"ruby": "あまねみづき（あまねかのん）"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1077384,
　　　　　　　　　　　　　　"name": "清水あんな",
　　　　　　　　　　　　　　"ruby": "しみずあんな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061063,
　　　　　　　　　　　　　　"name": "石原希望",
　　　　　　　　　　　　　　"ruby": "いしはらのぞみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1076678,
　　　　　　　　　　　　　　"name": "双葉くるみ",
　　　　　　　　　　　　　　"ruby": "ふたばくるみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1067117,
　　　　　　　　　　　　　　"name": "早見なな",
　　　　　　　　　　　　　　"ruby": "はやみなな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1074279,
　　　　　　　　　　　　　　"name": "佐野なつ",
　　　　　　　　　　　　　　"ruby": "さのなつ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1064143,
　　　　　　　　　　　　　　"name": "沙月恵奈",
　　　　　　　　　　　　　　"ruby": "さつきえな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054998,
　　　　　　　　　　　　　　"name": "松本いちか",
　　　　　　　　　　　　　　"ruby": "まつもといちか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075252,
　　　　　　　　　　　　　　"name": "星宮ゆのん",
　　　　　　　　　　　　　　"ruby": "ほしみやゆのん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1074076,
　　　　　　　　　　　　　　"name": "鈴音杏夏",
　　　　　　　　　　　　　　"ruby": "すずねきょうか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1063308,
　　　　　　　　　　　　　　"name": "蓮見天",
　　　　　　　　　　　　　　"ruby": "はすみてん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065327,
　　　　　　　　　　　　　　"name": "有岡みう",
　　　　　　　　　　　　　　"ruby": "ありおかみう"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1069384,
　　　　　　　　　　　　　　"name": "工藤ララ",
　　　　　　　　　　　　　　"ruby": "くどうらら"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 17802,
　　　　　　　　　　　　　　"name": "つぼみ",
　　　　　　　　　　　　　　"ruby": "つぼみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1060677,
　　　　　　　　　　　　　　"name": "小野六花",
　　　　　　　　　　　　　　"ruby": "おのりっか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1016525,
　　　　　　　　　　　　　　"name": "浜崎真緒",
　　　　　　　　　　　　　　"ruby": "はまさきまお"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061760,
　　　　　　　　　　　　　　"name": "葵いぶき",
　　　　　　　　　　　　　　"ruby": "あおいいぶき"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1076928,
　　　　　　　　　　　　　　"name": "綾瀬こころ",
　　　　　　　　　　　　　　"ruby": "あやせこころ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1069900,
　　　　　　　　　　　　　　"name": "横宮七海",
　　　　　　　　　　　　　　"ruby": "よこみやななみ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1065724,
　　　　　　　　　　　　　　"name": "乙アリス",
　　　　　　　　　　　　　　"ruby": "おつありす"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1070448,
　　　　　　　　　　　　　　"name": "百永さりな",
　　　　　　　　　　　　　　"ruby": "ももながさりな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1051877,
　　　　　　　　　　　　　　"name": "逢見リカ",
　　　　　　　　　　　　　　"ruby": "あいみりか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075256,
　　　　　　　　　　　　　　"name": "河北あさひ",
　　　　　　　　　　　　　　"ruby": "かわきたあさひ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1008887,
　　　　　　　　　　　　　　"name": "AIKA",
　　　　　　　　　　　　　　"ruby": "あいか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1058710,
　　　　　　　　　　　　　　"name": "藤森里穂",
　　　　　　　　　　　　　　"ruby": "ふじもりりほ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1053039,
　　　　　　　　　　　　　　"name": "佐知子",
　　　　　　　　　　　　　　"ruby": "さちこ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1073267,
　　　　　　　　　　　　　　"name": "三田サクラ",
　　　　　　　　　　　　　　"ruby": "みたさくら"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075010,
　　　　　　　　　　　　　　"name": "宍戸里帆",
　　　　　　　　　　　　　　"ruby": "ししどりほ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072206,
　　　　　　　　　　　　　　"name": "小花のん",
　　　　　　　　　　　　　　"ruby": "おはなのん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072360,
　　　　　　　　　　　　　　"name": "倉本すみれ",
　　　　　　　　　　　　　　"ruby": "くらもとすみれ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1008785,
　　　　　　　　　　　　　　"name": "篠田ゆう",
　　　　　　　　　　　　　　"ruby": "しのだゆう"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1034355,
　　　　　　　　　　　　　　"name": "高橋しょう子",
　　　　　　　　　　　　　　"ruby": "たかはししょうこ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1059080,
　　　　　　　　　　　　　　"name": "東條なつ",
　　　　　　　　　　　　　　"ruby": "とうじょうなつ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1061659,
　　　　　　　　　　　　　　"name": "姫咲はな",
　　　　　　　　　　　　　　"ruby": "ひめさきはな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1068670,
　　　　　　　　　　　　　　"name": "花狩まい",
　　　　　　　　　　　　　　"ruby": "かがりまい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054165,
　　　　　　　　　　　　　　"name": "夏希まろん",
　　　　　　　　　　　　　　"ruby": "なつきまろん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1074353,
　　　　　　　　　　　　　　"name": "穂花あいり",
　　　　　　　　　　　　　　"ruby": "ほのかあいり"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1068671,
　　　　　　　　　　　　　　"name": "北野未奈",
　　　　　　　　　　　　　　"ruby": "きたのみな"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075675,
　　　　　　　　　　　　　　"name": "末広純",
　　　　　　　　　　　　　　"ruby": "すえひろじゅん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1060892,
　　　　　　　　　　　　　　"name": "蜜美杏",
　　　　　　　　　　　　　　"ruby": "みつみあん"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1072694,
　　　　　　　　　　　　　　"name": "明日見未来",
　　　　　　　　　　　　　　"ruby": "あすみみらい"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1060141,
　　　　　　　　　　　　　　"name": "木下ひまり（花沢ひまり）",
　　　　　　　　　　　　　　"ruby": "きのしたひまり（はなざわひまり）"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1046723,
　　　　　　　　　　　　　　"name": "皆月ひかる",
　　　　　　　　　　　　　　"ruby": "みなづきひかる"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"label": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 2341,
　　　　　　　　　　　　　　"name": "MOODYZ Best"
　　　　　　　　　　　　}
　　　　　　　　　　]
　　　　　　　　}
　　　　　　},
　　　　　　{
　　　　　　　　"service_code": "digital",
　　　　　　　　"service_name": "動画",
　　　　　　　　"floor_code": "videoa",
　　　　　　　　"floor_name": "ビデオ",
　　　　　　　　"category_name": "ビデオ (動画)",
　　　　　　　　"content_id": "hnvr00150",
　　　　　　　　"product_id": "hnvr00150",
　　　　　　　　"title": "【VR】席替えVR 男は僕ひとりだけのクラスであの子もこの子も僕の隣の席をねらってる！？ 松本いちか",
　　　　　　　　"volume": "114",
　　　　　　　　"review": {
　　　　　　　　　　"count": 3,
　　　　　　　　　　"average": "3.67"
　　　　　　　　},
　　　　　　　　"URL": "https://video.dmm.co.jp/av/content/?id=hnvr00150",
　　　　　　　　"affiliateURL": "https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2Fav%2Fcontent%2F%3Fid%3Dhnvr00150&af_id=affiliate-990&ch=api",
　　　　　　　　"imageURL": {
　　　　　　　　　　"list": "https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150pt.jpg",
　　　　　　　　　　"small": "https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150ps.jpg",
　　　　　　　　　　"large": "https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150pl.jpg"
　　　　　　　　},
　　　　　　　　"sampleImageURL": {
　　　　　　　　　　"sample_s": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-10.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-11.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-12.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-13.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150-14.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　},
　　　　　　　　　　"sample_l": {
　　　　　　　　　　　　"image": [
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-1.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-2.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-3.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-4.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-5.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-6.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-7.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-8.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-9.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-10.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-11.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-12.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-13.jpg",
　　　　　　　　　　　　　　"https://pics.dmm.co.jp/digital/video/hnvr00150/hnvr00150jp-14.jpg"
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"prices": {
　　　　　　　　　　"price": "980~",
　　　　　　　　　　"list_price": "980~",
　　　　　　　　　　"deliveries": {
　　　　　　　　　　　　"delivery": [
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "8k",
　　　　　　　　　　　　　　　　"price": "1780",
　　　　　　　　　　　　　　　　"list_price": "1780"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "hd",
　　　　　　　　　　　　　　　　"price": "1280",
　　　　　　　　　　　　　　　　"list_price": "1280"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "download",
　　　　　　　　　　　　　　　　"price": "980",
　　　　　　　　　　　　　　　　"list_price": "980"
　　　　　　　　　　　　　　},
　　　　　　　　　　　　　　{
　　　　　　　　　　　　　　　　"type": "stream",
　　　　　　　　　　　　　　　　"price": "980",
　　　　　　　　　　　　　　　　"list_price": "980"
　　　　　　　　　　　　　　}
　　　　　　　　　　　　]
　　　　　　　　　　}
　　　　　　　　},
　　　　　　　　"date": "2025-06-08 00:00:32",
　　　　　　　　"iteminfo": {
　　　　　　　　　　"genre": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6925,
　　　　　　　　　　　　　　"name": "ハイクオリティVR"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 307935,
　　　　　　　　　　　　　　"name": "8KVR"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6793,
　　　　　　　　　　　　　　"name": "VR専用"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6548,
　　　　　　　　　　　　　　"name": "独占配信"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5004,
　　　　　　　　　　　　　　"name": "手コキ"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5063,
　　　　　　　　　　　　　　"name": "主観"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5001,
　　　　　　　　　　　　　　"name": "中出し"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 5071,
　　　　　　　　　　　　　　"name": "ハーレム"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 48,
　　　　　　　　　　　　　　"name": "制服"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"series": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 4033507,
　　　　　　　　　　　　　　"name": "本中-VR"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"maker": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 6304,
　　　　　　　　　　　　　　"name": "本中"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"actress": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1054998,
　　　　　　　　　　　　　　"name": "松本いちか",
　　　　　　　　　　　　　　"ruby": "まつもといちか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1094418,
　　　　　　　　　　　　　　"name": "水瀬りた",
　　　　　　　　　　　　　　"ruby": "みなせりた"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1088058,
　　　　　　　　　　　　　　"name": "音羽美鈴",
　　　　　　　　　　　　　　"ruby": "おとはみすず"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1083130,
　　　　　　　　　　　　　　"name": "天野花乃",
　　　　　　　　　　　　　　"ruby": "あまのかの"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 12047,
　　　　　　　　　　　　　　"name": "雪見ほのか",
　　　　　　　　　　　　　　"ruby": "ゆきみほのか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075305,
　　　　　　　　　　　　　　"name": "福田もも",
　　　　　　　　　　　　　　"ruby": "ふくだもも"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1077517,
　　　　　　　　　　　　　　"name": "白浜美羽",
　　　　　　　　　　　　　　"ruby": "しらはまみう"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1075772,
　　　　　　　　　　　　　　"name": "宮名遥",
　　　　　　　　　　　　　　"ruby": "みやなはるか"
　　　　　　　　　　　　},
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 1076466,
　　　　　　　　　　　　　　"name": "真白みのり",
　　　　　　　　　　　　　　"ruby": "ましろみのり"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"director": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 115182,
　　　　　　　　　　　　　　"name": "矢澤レシーブ",
　　　　　　　　　　　　　　"ruby": "やざわれしーぶ"
　　　　　　　　　　　　}
　　　　　　　　　　],
　　　　　　　　　　"label": [
　　　　　　　　　　　　{
　　　　　　　　　　　　　　"id": 25913,
　　　　　　　　　　　　　　"name": "本中-VR"
　　　　　　　　　　　　}
　　　　　　　　　　]
　　　　　　　　}
　　　　　　}
　　　　]
　　}
}