# Scripted Clean: 経営

Source: ../sample-02-management.md

Removed Utterances: 8 / 58

## 会話ログ

# FY26 事業戦略レビュー 会議ログ

黒田：
とりあえずQ3時点でARRは想定より伸びてます。
ただCACが若干悪化してるので、LTVとのバランス見ないと危ないです。

石井：
広告CPAかなり上がってますよね。
特にSMB向け獲得。

長谷川：
その代わりチャーン率は改善してます。
オンボーディング施策かなり効いてる。

黒田：
NRRどうでしたっけ？

石井：
現状112%です。
ただEnterprise側がかなり牽引してるので、Mid-market単体で見るとそこまで強くないです。

高田：
Burn Rateはまだ許容範囲？

石井：
現状Runway的には18ヶ月。
ただAI推論コスト想定以上です。

黒田：
Azure OpenAI側？

石井：
はい。
Inference costが結構重いです。
RAGの再検索頻度が高くて。

長谷川：
でもあそこ削るとUX落ちません？

黒田：
いや、Retention落ちる方がまずい。
今一番重要なの継続率なので。

高田：
ところでFabric連携っていつGA予定なんでしたっけ？

石井：
たしかFY26 H2想定だったと思います。
まだPreviewです。

黒田：
そこGAしないと大手導入止まりませんよね。

長谷川：
特に金融系。
ガバナンス周りかなり厳しいので。

石井：
あとEntra ID連携必須って言われるケース増えてます。

高田：
SSOなしだと通らない？

石井：
最近ほぼ無理ですね。

黒田：
代理店経由案件どうなってます？

長谷川：
今月2件PoC入ってます。
ただ片方、Decision Makerまだ見えてないです。

石井：
Championはいるんですけどね。

黒田：
それ一番危ないやつだ…。

高田：
ちなみに今期KPIって結局何優先なんでしたっけ？

黒田：
MRRよりRetention。
新規獲得競争かなりレッドオーシャン化してるので。

長谷川：
とはいえPL的には新規売上も欲しいですよね。

高田：
あー、Copilot文脈に乗せる感じか。

黒田：
そう。
単体AIツールだと差別化難しいので。

長谷川：
あと最近「AI導入したいけど社員が使いこなせない」相談かなり増えてます。

石井：
結局そこなんですよね。
みんな知識ギャップで会議止まる。

高田：
新人教育コストも減りそうですよね。

長谷川：
ただHR評価に見えると危ない気はします。

黒田：
絶対「理解力スコア化」はやらない方がいい。

高田：
炎上する未来しか見えない。

長谷川：
あと多分ユーザー、知らないって認めたくないですよ。

石井：
若干ふざけてる名前の方が心理障壁下がるかなと。

高田：
たしかに「Knowledge Gap Optimizer」より押しやすい。

長谷川：
逆に親しみある。

石井：
略語だらけ会議ログ流します。
ADR、SKU、RAG、ARR、EBITDA全部入り。

高田：
地獄みたいな会議だな…。

石井：
その中で：
「わからないけど聞けない」
を再現します。

長谷川：
かなりリアル。

黒田：
で、クリックした単語だけ、
後で個人向け補足生成される？

石井：
そうです。
全体議事録じゃなくて、
「自分が置いていかれた部分だけ」。

高田：
それ結構面白いですね。

長谷川：
会議後のキャッチアップかなり楽になりそう。

高田：
賢明。

石井：
Azure Functions + OpenAIだけでまず成立させます。

黒田：
その方がいい。
今回インフラ勝負じゃないので。

高田：
AKSやり始めたら終わる。

石井：
完全に同意です。

## Expected Terms (Scripted)
- ARR
- CAC
- LTV
- SMB
- チャーン率
- NRR
- Burn Rate
- Runway
- Azure OpenAI
- Inference cost
- RAG
- Fabric
- GA
- Preview
- Entra ID
- SSO
- PoC
- Decision Maker
- Champion
- KPI
- MRR
- Retention
- Upsell
- Enterprise
- HR
- AKS

## Expected Weak Contexts
- SaaS経営指標
- AI推論コスト
- Enterprise営業
- Microsoft ecosystem
- Retention戦略
- PoC営業構造
