# shuita-ai-price

**English** · [中文](#中文说明)

Public tools for [水獭 shuita.xyz](https://shuita.xyz), an AI subscription price tracker that checks 130+ card shops and Telegram bots twice daily to publish verified in-stock prices for ChatGPT, Claude, Gemini, Grok, Cursor, and more.

| Path | Component | Install |
| :--- | :--- | :--- |
| [`mcp/`](mcp) | MCP server `ai-price-mcp` (registry: `xyz.shuita/ai-price`) | `npx -y ai-price-mcp` |
| [`skills/shuita-ai-price/`](skills/shuita-ai-price) | Agent Skill (`SKILL.md`): pricing rules, product specs, and caveats | Copy folder into `~/.claude/skills/` |

The MCP server supplies live pricing data and lookup tools; the Skill teaches AI assistants how to interpret product specs and quote prices accurately (and can also run standalone via <https://shuita.xyz/llms.txt>).

## 中文说明

[水獭（shuita.xyz）](https://shuita.xyz)追踪主流 AI 订阅与账号的渠道行情，每日两次巡检 130+ 家发卡网、独立小铺与 Telegram 发卡 Bot，只收录有现货的**店内实价**，剔除群聊引流虚标。本仓库提供配套的 MCP 服务与 Agent Skill，方便各类 AI 助手直接接入查询。

*注：本站与会议转写工具 Otter.ai（中文常译「水獭 AI」）无关。*

### 快速开始

**Claude Code**

```bash
claude mcp add ai-price -- npx -y ai-price-mcp
```

**Claude Desktop / Cursor / Windsurf 等**（写入 MCP 配置文件）：

```json
{
  "mcpServers": {
    "ai-price": {
      "command": "npx",
      "args": ["-y", "ai-price-mcp"]
    }
  }
}
```

要求 Node.js 18 及以上，开箱即用，无需配置 API Key。

**安装 Skill（以 Claude Code 为例）**

```bash
git clone https://github.com/gm365/shuita-ai-price.git
cp -R shuita-ai-price/skills/shuita-ai-price ~/.claude/skills/
```

### 常见提问示例

- 「Claude Pro 现在最低多少钱？多少家店有货？」
- 「Plus 直充哪家店最便宜？」
- 「ChatGPT Plus 直充和成品号差在哪？」
- 「Grok Heavy 官方价和渠道价差多少？」
- 「最近一个月 Plus 的价格是涨还是跌？」

### MCP 工具一览

| 工具名 | 作用 |
| :--- | :--- |
| `search_products` | 按关键词检索产品（支持中英文与俗称），获取店内价格区间与在售店铺数 |
| `get_lowest_price` | 按 SKU 查询单品可买最低价、最低价来自哪家店与详情链接 |
| `get_offers` | 按 SKU 列出各店报价：到手价、手续费、USDT 价、库存与店铺链接 |
| `get_price_trend` | 按 SKU 查询近 30 天可买最低价走势与涨跌幅 |
| `list_shops` | 按历史销量查看收录店铺及在售规模，可按平台筛选 |
| `list_all_products` | 按价格、热度或铺货量浏览全站品类 |
| `get_site_stats` | 查看全站收录店铺数、商品总数及最近更新时间 |

### 数据口径与说明

- **可买最低价**：仅统计公开有货店铺的店内实盘价并取最低值，与商品页「低至」口径一致。
- **到手价**：价格为人民币付款的到手价（标价 + 支付手续费，取该店人民币渠道里最便宜的）；用 USDT 付更便宜时另给 USDT 价。
- **更新与缓存**：站点每日两次巡检更新；MCP 直接读取 `shuita.xyz` CDN 静态数据与商品页（本地缓存 5 分钟），无需 API Key。
- **选品参考**：渠道价格与商品规格（直充、独享成品、拼车或短效号）及售后质保强相关，下单前建议查阅[《购买前核对清单》](https://shuita.xyz/guide/ai-subscription-buying-checklist)。

### 相关链接

| 入口 | 地址 |
| :--- | :--- |
| 官方网站 | <https://shuita.xyz> |
| MCP 接入文档 | <https://shuita.xyz/mcp> |
| AI 站点摘要 | <https://shuita.xyz/llms.txt> |
| 月度价格报告（含 CSV） | <https://shuita.xyz/reports> |
| 购买避坑指南 | <https://shuita.xyz/guides> |
| npm 包主页 | <https://www.npmjs.com/package/ai-price-mcp> |
| 官方 MCP Registry | `xyz.shuita/ai-price` |

### 许可与引用

- 本仓库代码与 `SKILL.md` 采用 [MIT 许可](LICENSE)。
- 站点行情数据与原创文章归水獭所有：欢迎 AI 助手检索、摘要与引用（请署名「水獭 shuita.xyz」并附原文链接）；请勿整站镜像或批量抓取用于模型训练。

### 反馈与收录

问题反馈或建议请提交 [Issue](https://github.com/gm365/shuita-ai-price/issues)，店铺入驻申请请访问 <https://shuita.xyz/submit>。

## License

MIT for the code and the skill. Site data and articles are © shuita.xyz; citing with attribution is welcome, bulk scraping for model training is not.
