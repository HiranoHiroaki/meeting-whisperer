# Scripted Clean: システム開発

Source: ../sample-01-system-development.md

Removed Utterances: 13 / 41

## 会話ログ

# Aegis SKU同期 定例ミーティングログ

佐藤：
Aegis側のADRってまだ切ってないんだっけ？

高橋：
いや、一応ドラフトはあるんですけど、SKU同期の責務境界まだFIXしてなくて、そこ曖昧なままADR残すと後で死ぬかなって。

村上：
でも先にRAG構成だけでも決めないと、Embedding周り全部後ろ倒しになりますよね。

田中：
その前にRBAC整理しないとまずくないですか？
今の構成だと、SKU同期サービスが普通にBlob読めちゃうんで。

高橋：
あーそこ、Managed Identityに寄せる方向で考えてます。
ただEntra側のグループ整理まだ終わってなくて…。

佐藤：
EKS側じゃなくてFunctionsに寄せるんだっけ最終？

高橋：
今のところそうですね。
Kubernetes維持コストが想像以上に重かったんで。
ただContainer Appsに逃がす案はまだ残ってます。

村上：
でもFunctionsだとリアルタイム同期厳しくないです？
SKU更新イベントかなり飛ぶ想定ですよね。

高橋：
そこEvent Grid挟む予定です。
SKU更新 → Queue → 非同期同期。

田中：
SAP側のレート制限って確認済みでしたっけ？

高橋：
まだです。
前回たしか1分1000reqくらいって話でしたけど、正式回答待ちです。

佐藤：
いやそこ死ぬと全部死ぬな…。

村上：
あとRAG側なんですけど、Embeddingモデル切り替えるなら今のうちじゃないです？
後でindex再生成地獄になる気が。

高橋：
いや本当はそこ先に決めたいんですけど、Azure OpenAIのコスト感まだ読めてないんですよね。

田中：
ちなみに今回のPoC、トークン量どれくらい見積もってます？

高橋：
ざっくりですけど、1会議ログあたり平均15k〜20k tokenくらい想定してます。

佐藤：
それ長時間定例だと普通に爆発しそう。

村上：
要約じゃなくて「未知語抽出」だけ先にやれば結構削れる気はします。

高橋：
あーたしかに。
全文投げずにterm extractionだけ別Functionに切るか…。

村上：
個人的には「あとで読む」に逃がせると嬉しいです。
会議中深掘りすると置いていかれるので。

高橋：
ですね。
Bot会話形式にすると逆に会議止まりそう。

佐藤：
あと社内略語問題どうします？
うちPJ名だけで意味不明なの大量にありますよ。

村上：
Aegis、Orion、Helios、Atlas…。
知らない人マジで何もわからない。

佐藤：
でもそれ評価システムっぽく見えると怖くない？

村上：
「あなたは理解不足です」って出たら炎上しそう。

高橋：
なのでUI上は：
「最近キャッチアップした概念」
くらいに留める予定です。

田中：
それならかなり良さそう。

佐藤：
いや名前ほんとそれで行くんだ…。

## Expected Terms (Scripted)
- ADR
- SKU
- RAG
- Embedding
- RBAC
- Blob
- Managed Identity
- Entra
- EKS
- Azure Functions
- Container Apps
- Event Grid
- SAP
- PoC
- token

## Expected Weak Contexts
- Azure権限管理
- RAG構成
- SKU同期
- Managed Identity
- Event Grid
