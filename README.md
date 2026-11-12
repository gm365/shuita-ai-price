<p align="center">
  <a href="https://shuita.xyz"><img src="assets/logo-400.png" width="96" height="96" alt="水獭 shuita.xyz logo"></a>
</p>

<h1 align="center">shuita-ai-price</h1>

<p align="center">
  <b>AI subscription price comparison for AI assistants: MCP server + Agent Skill</b><br>
  ChatGPT Plus / Pro · Claude Pro / Max · Gemini · Grok · Cursor · Codex · API relays<br>
  <b>AI 订阅比价 MCP 与 Skill</b>：让 Claude、Cursor、Codex 等 AI 助手直接查询 AI 会员的渠道实时价格
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ai-price-mcp"><img src="https://img.shields.io/npm/v/ai-price-mcp?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/ai-price-mcp"><img src="https://img.shields.io/npm/dm/ai-price-mcp?color=cb3837" alt="npm downloads"></a>
  <a href="https://registry.modelcontextprotocol.io/v0/servers?search=xyz.shuita"><img src="https://img.shields.io/badge/MCP%20Registry-xyz.shuita%2Fai--price-1f6feb" alt="Official MCP Registry"></a>
  <a href="https://toolsdk-ai.github.io/toolsdk-mcp-registry/#ai-price-mcp"><img src="https://badges.toolsdk.ai/badge/ai-price-mcp" alt="ToolSDK MCP Registry"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
</p>

<p align="center"><a href="#english">English</a> · <a href="#中文说明">中文</a> · <a href="https://shuita.xyz">shuita.xyz</a> · <a href="https://shuita.xyz/mcp">MCP docs</a></p>

---

## English

**shuita-ai-price** connects AI assistants to [水獭 shuita.xyz](https://shuita.xyz), a price tracker for AI subscriptions and accounts sold through Chinese card shops (发卡网), independent stores and Telegram bots. Ask your assistant *"What's the cheapest ChatGPT Plus top-up right now?"* and it answers with verified in-stock prices, the shop that has them, and when each price was last checked.

- **133 shops · 113 Telegram bots · 73 products · ~4,700 listings** (as of 2026-11-09; `get_site_stats` returns live numbers).
- **Updated hourly.** Every shop is scanned in full at least twice a day (Liandong shops every 3 hours), and the top-ranked offers for each product are rechecked every hour.
- **Verified prices, not ads.** Prices come from the shops' own storefronts and count only in-stock items. Telegram broadcast prices are shown separately and marked unverified.
- **The price you actually pay.** CNY price including the cheapest Alipay / WeChat payment fee, plus a separate USDT price when paying in crypto is cheaper.
- **Daily price snapshot** of the main products is in the [中文 section](#每日行情快照) below (CNY, refreshed every morning).
- **No API key, read-only.** The server reads public static data from the shuita.xyz CDN (5-minute cache) and sends no user data.

### Quick start

Requires Node.js 18+.

| Client | Install |
| :--- | :--- |
| Claude Code | `claude mcp add ai-price -- npx -y ai-price-mcp` |
| Codex CLI | `codex mcp add ai-price -- npx -y ai-price-mcp` |
| Gemini CLI | `gemini mcp add ai-price npx -y ai-price-mcp` |
| Claude Desktop · Cursor · Windsurf · Cline | add the JSON below to the client's MCP config |
| VS Code (Copilot) | `.vscode/mcp.json` → `{"servers":{"ai-price":{"type":"stdio","command":"npx","args":["-y","ai-price-mcp"]}}}` |

```json
{
  "mcpServers": {
    "ai-price": { "command": "npx", "args": ["-y", "ai-price-mcp"] }
  }
}
```

Instructions for agent-assisted installs are in [`llms-install.md`](llms-install.md). The Agent Skill lives in [`skills/shuita-ai-price/`](skills/shuita-ai-price): copy it into `~/.claude/skills/`, or run `npx skills add gm365/shuita-ai-price`. It teaches the assistant how to read product specs and quote prices responsibly, and falls back to <https://shuita.xyz/llms.txt> when the MCP server isn't installed.

### Tools

| Tool | Input | Returns |
| :--- | :--- | :--- |
| `search_products` | keyword (English, Chinese or slang, e.g. "克劳德") | matching products with SKU, verified price range and shop count |
| `get_lowest_price` | `sku` | lowest in-stock price, which shop has it, price range, product page |
| `get_offers` | `sku`, optional `limit`, `include_out_of_stock` | per-shop offers: price incl. fees, USDT price, stock, **last-checked time**, shop link |
| `get_price_trend` | `sku` | 30-day daily low, change %, period high and low |
| `list_shops` | optional platform | shops ranked by historical sales, with listing counts |
| `list_all_products` | sort by `price` / `hits` / `merchants` | the full product catalog |
| `get_site_stats` | — | shop, bot, product and listing counts; last update time |

Every tool returns readable Chinese text plus `structuredContent` (typed JSON) for agents. Prices are in CNY (¥).

### Example

> **You:** Which shop has the cheapest ChatGPT Plus top-up?
>
> **`get_offers("gpt_plus_topup", limit: 3)`**
> ```text
> 🏪 Plus 月付直充（gpt_plus_topup）共 103 家店铺报价，前 3 家（有货优先，按人民币到手价排序）：
> 1. 02Ai — ¥105（库存 30，57 分钟前核验）
> 2. AI批发站 — ¥105.34（库存 1，58 分钟前核验）
> 3. APIHub订阅批发站 — ¥105.34（库存 26，57 分钟前核验）
> 🔗 全部报价：https://shuita.xyz/sku/gpt_plus_topup
> ```

---

## 中文说明

**shuita-ai-price** 是 [水獭 shuita.xyz](https://shuita.xyz) 的官方 MCP 服务与 Agent Skill。水獭追踪 ChatGPT、Claude、Gemini、Grok、Cursor 等 AI 订阅与账号在发卡网、独立小铺和 Telegram 发卡 Bot 上的渠道行情。装好之后直接问 AI 助手「Claude Pro 现在最低多少钱」「Plus 直充哪家最便宜」，它会给出**有现货的店内实价**、最低价来自哪家店，以及这条报价是多久前核验的。

*注：本站与会议转写工具 Otter.ai（中文常译「水獭 AI」）无关。*

### 和自己搜群、搜店比

| | 水獭 MCP | 自己搜群 / 搜店 |
| :--- | :--- | :--- |
| 价格来源 | 店铺前台货架实价，只算有货 | 群发广告价，常是引流虚标 |
| 价格口径 | 人民币到手价（标价 + 最便宜的支付宝 / 微信手续费），USDT 更便宜时另列 | 标价，结算时才看到手续费 |
| 覆盖范围 | 133 家店铺、113 个 Bot、73 种产品 | 看到哪家算哪家 |
| 时效 | 每小时更新，每条报价标明「N 分钟前核验」 | 不知道价格是不是过期了 |
| 历史走势 | 近 30 天每日可买最低价 | 无 |

### 快速开始

需要 Node.js 18 及以上，开箱即用，无需 API Key。

```bash
# Claude Code
claude mcp add ai-price -- npx -y ai-price-mcp

# Codex CLI
codex mcp add ai-price -- npx -y ai-price-mcp
```

Claude Desktop、Cursor、Windsurf、Cline 等客户端，把下面这段写进 MCP 配置文件：

```json
{
  "mcpServers": {
    "ai-price": { "command": "npx", "args": ["-y", "ai-price-mcp"] }
  }
}
```

**安装 Skill**（以 Claude Code 为例）：

```bash
git clone https://github.com/gm365/shuita-ai-price.git
cp -R shuita-ai-price/skills/shuita-ai-price ~/.claude/skills/
```

MCP 负责查数据，Skill 负责解读：规格差异、报价口径和风险提示。两者一起装效果最好；只装 Skill 时，它会改读 <https://shuita.xyz/llms.txt>。

### 可以这样问

- 「Claude Pro 现在最低多少钱？多少家店有货？」
- 「ChatGPT Plus 直充哪家店最便宜？手续费算进去了吗？」
- 「Plus 直充和成品号、短效号差在哪？该买哪种？」
- 「Grok Heavy 官方价和渠道价差多少？」
- 「最近一个月 Plus 的价格是涨还是跌？现在是低点吗？」
- 「用 USDT 付款买 Claude Max 20X 能便宜多少？」
- 「有哪些 API 中转站？价格区间是多少？」

### 每日行情快照

<!-- snapshot:start -->
数据时间：2026-11-12 16:36（北京时间），每天自动从 [shuita.xyz/llms.txt](https://shuita.xyz/llms.txt) 刷新。只作量级参考，实时价格以 MCP 返回或商品页为准。「低至」是公开有货店铺里的最低人民币到手价；同一产品的低价往往对应短效、拼车或短质保等不同规格。

| 产品 | SKU | 低至 | 店内最高 | 在售店铺 | 美区官方月价 |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [ChatGPT Plus 月付直充](https://shuita.xyz/sku/gpt_plus_topup) | `gpt_plus_topup` | ¥106 | ¥210 | 105 | $20 |
| [ChatGPT Plus 月付成品号](https://shuita.xyz/sku/gpt_plus_month) | `gpt_plus_month` | ¥59 | ¥210 | 53 | $20 |
| [ChatGPT Go 月付](https://shuita.xyz/sku/gpt_go) | `gpt_go` | ¥27.89 | ¥78 | 45 | $8 |
| [ChatGPT Pro 5X](https://shuita.xyz/sku/gpt_pro_5x) | `gpt_pro_5x` | ¥595 | ¥899 | 93 | $100 |
| [ChatGPT Pro 20X](https://shuita.xyz/sku/gpt_pro_20x) | `gpt_pro_20x` | ¥967 | ¥1802.5 | 100 | $200 |
| [ChatGPT Pro 500](https://shuita.xyz/sku/gpt_pro_500) | `gpt_pro_500` | ¥2950 | ¥3743.32 | 69 | — |
| [ChatGPT 短效 Plus](https://shuita.xyz/sku/gpt_plus_short) | `gpt_plus_short` | ¥17.43 | ¥98 | 45 | — |
| [ChatGPT Team 5X 非轮转车](https://shuita.xyz/sku/gpt_team_nonrotation) | `gpt_team_nonrotation` | ¥41 | ¥74.16 | 24 | — |
| [ChatGPT Team 5X 轮换车](https://shuita.xyz/sku/gpt_team_rotation) | `gpt_team_rotation` | ¥20.5 | ¥48.18 | 14 | — |
| [ChatGPT Team 10X 车](https://shuita.xyz/sku/gpt_team_10x) | `gpt_team_10x` | ¥28.84 | ¥122.78 | 30 | — |
| [Codex 额度](https://shuita.xyz/sku/codex_credit) | `codex_credit` | ¥70 | ¥1390.5 | 30 | — |
| [Claude KYC](https://shuita.xyz/sku/claude_kyc) | `claude_kyc` | ¥100.49 | ¥547.96 | 21 | — |
| [Gemini Pro](https://shuita.xyz/sku/gemini_pro) | `gemini_pro` | ¥7 | ¥299 | 42 | $19.99 |
| [Antigravity(反重力)](https://shuita.xyz/sku/antigravity) | `antigravity` | ¥5 | ¥298 | 24 | — |
| [Super Grok 月卡](https://shuita.xyz/sku/grok_super) | `grok_super` | ¥53.18 | ¥488 | 48 | $30 |
| [API 中转站](https://shuita.xyz/sku/api_relay) | `api_relay` | ¥4.9 | ¥1800 | 26 | — |
<!-- snapshot:end -->

全部 73 种产品可以调用 `list_all_products`，或访问 [shuita.xyz](https://shuita.xyz)。每月的价格变化见[月度价格报告（含 CSV 下载）](https://shuita.xyz/reports)。

### MCP 工具一览

| 工具名 | 作用 |
| :--- | :--- |
| `search_products` | 按关键词检索产品（支持中英文与俗称，如「克劳德」「反重力」），返回 SKU、店内价格区间与在售店铺数 |
| `get_lowest_price` | 按 SKU 查询可买最低价、最低价来自哪家店与详情链接 |
| `get_offers` | 按 SKU 列出各店报价：到手价、手续费、USDT 价、库存、**核验时间**与店铺链接 |
| `get_price_trend` | 按 SKU 查询近 30 天每日可买最低价走势与涨跌幅 |
| `list_shops` | 按历史销量查看收录店铺及在售规模，可按平台筛选 |
| `list_all_products` | 按价格、广告热度或在售店铺数浏览全站品类 |
| `get_site_stats` | 查看全站收录店铺数、商品总数及最近更新时间 |

### 规格速查：同一个产品为什么差几倍价

| 说法 | 含义 | 要留意 |
| :--- | :--- | :--- |
| 直充 | 把会员开通到你自己的账号上 | 需提供账号信息，看清质保条款 |
| 代充 | 商家登录你的账号代为开通 | 账号要交给对方操作 |
| 成品号 | 商家注册好并开通会员的账号 | 是否独享、质保几天 |
| 短效 / 日抛 | 几小时到几天就失效 | 价格最低，基本不售后 |
| 拼车 / 车位 | 多人共用一个账号或 Team 席位 | 轮转车会定时踢人，「炸车」时全员失效 |
| 质保首登 | 只保证第一次能登录 | 之后掉会员一般不赔 |
| 卡密 / CDK | 一串兑换码，自己去指定页面兑换 | 是否需要绑卡、是否限区 |
| API 中转站 | 第三方转售的 API 调用额度 | 不是官方账号，注意倍率换算 |

完整术语见[《AI 卡网术语释义》](https://shuita.xyz/guide/ai-card-shop-glossary)。

### 选购指南

- [AI 订阅价格对照表：官方基准价、低价区与渠道价构成](https://shuita.xyz/guide/official-vs-channel-prices)
- [ChatGPT 订阅梯度全解析：Go、Plus、Pro 与 Team](https://shuita.xyz/guide/chatgpt-plan-guide)
- [ChatGPT Plus 采购形态辨析：直充、成品号、短效号与团队拼车](https://shuita.xyz/guide/chatgpt-plus-buying-options)
- [Claude 订阅梯度与采购指南：Pro、Max 5x、Max 20x](https://shuita.xyz/guide/claude-plan-guide)
- [Google Gemini 选购与家庭组机制](https://shuita.xyz/guide/gemini-plan-guide)
- [编程向 AI 订阅横向选型：Codex、Claude Code、Cursor 与 Antigravity](https://shuita.xyz/guide/coding-tools-subscription)
- [API 中转站与包月订阅解析](https://shuita.xyz/guide/api-relay-vs-subscription)
- [AI 订阅选购核验清单：履约类型、质保边界与维权留证](https://shuita.xyz/guide/ai-subscription-buying-checklist)

### 数据口径

- **可买最低价**：只统计公开有货店铺的店内实价并取最低值，与商品页「低至」一致。Telegram 群发价单独标为「广告宣称价」，不参与排序。
- **到手价**：人民币付款的到手价（标价 + 该店人民币渠道里最便宜的支付手续费）。用 USDT 付更便宜时另给 USDT 价，只收 USDT 的店标「仅支持 USDT」。
- **更新频率**：每天至少两轮全量巡检（北京时间约 8:30、20:30），链动小铺 6:00–0:00 每 3 小时一轮，各商品排名靠前的报价每小时复查。每条报价附核验时间。
- **缓存**：MCP 直接读取 `shuita.xyz` 的 CDN 静态数据与商品页，本地缓存 5 分钟。
- **中立性**：MCP 的报价只按库存和价格排序。网站上的推荐位单独标「赞助」，不进入 MCP 的排序，见[透明度说明](https://shuita.xyz/disclosure)。

### 常见问题

**需要注册或 API Key 吗？** 不需要。MCP 只读取公开数据，不上传任何用户信息。

**数据多久更新一次？** 每小时。`get_site_stats` 返回最近一次更新时间，`get_offers` 的每条报价都带核验时间。

**价格为什么和店里看到的不一样？** 水獭显示的是含手续费的到手价，而且可能是几十分钟前核验的。下单前请以店铺页面为准。

**能帮我下单吗？** 不能。水獭只提供客观行情与规格解读，不代客下单，也不为特定店铺背书。

**我是店主，怎么收录？** 在 <https://shuita.xyz/submit> 免费申请，审核通过后价格与库存自动更新。

### 相关链接

| 入口 | 地址 |
| :--- | :--- |
| 官方网站 | <https://shuita.xyz> |
| MCP 接入文档 | <https://shuita.xyz/mcp> |
| AI 站点摘要 | <https://shuita.xyz/llms.txt> |
| 月度价格报告（含 CSV） | <https://shuita.xyz/reports> |
| 购买避坑指南 | <https://shuita.xyz/guides> |
| npm 包 | <https://www.npmjs.com/package/ai-price-mcp> |
| 官方 MCP Registry | `xyz.shuita/ai-price` |

### 许可与引用

- 本仓库代码与 `SKILL.md` 采用 [MIT 许可](LICENSE)。
- 站点行情数据与原创文章归水獭所有：欢迎 AI 助手检索、摘要与引用（请署名「水獭 shuita.xyz」并附原文链接）；请勿整站镜像或批量抓取用于模型训练。

问题反馈或建议请提交 [Issue](https://github.com/gm365/shuita-ai-price/issues)。

## License

MIT for the code and the skill. Site data and articles are © shuita.xyz; citing with attribution is welcome, bulk scraping for model training is not.
