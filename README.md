# shuita-ai-price

**English** · [中文](#中文说明)

Public tools for [水獭 shuita.xyz](https://shuita.xyz), an AI subscription price tracker. It crawls 120+ card shops and Telegram bots twice a day and publishes verified in-shop prices for ChatGPT, Claude, Gemini, Grok, Cursor and more.

This repository lets AI assistants query that data:

| Path | What | Install |
|---|---|---|
| [`mcp/`](mcp) | MCP server `ai-price-mcp` (registry name `xyz.shuita/ai-price`) | `npx -y ai-price-mcp` |
| [`skills/shuita-ai-price/`](skills/shuita-ai-price) | Agent Skill (`SKILL.md`): how to quote prices, caveats, answer format | copy the folder into `~/.claude/skills/` |

The MCP server provides data and tools; the Skill provides the rules for using them. The Skill also works without MCP by reading <https://shuita.xyz/llms.txt>.

> Not affiliated with Otter.ai (often translated "水獭 AI" in Chinese).

## 中文说明

[水獭（shuita.xyz）](https://shuita.xyz)是 AI 订阅与账号渠道的比价站：每天两次抓取 120+ 家发卡网、独立小铺与 Telegram 发卡 Bot 的**店内真实可买价**与库存状态，不采用群广告招徕价。本仓库让 AI 助手可以直接查询这些数据。

### 快速开始

**Claude Code**

```bash
claude mcp add ai-price -- npx -y ai-price-mcp
```

**Claude Desktop / Cursor / Windsurf 等**，在 MCP 配置里加入：

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

需要 Node.js 18 及以上，不需要 API Key。

**安装 Skill（Claude Code 示例）**

```bash
git clone https://github.com/gm365/shuita-ai-price.git
cp -R shuita-ai-price/skills/shuita-ai-price ~/.claude/skills/
```

### 能问什么

- “Claude Pro 现在最低多少钱？哪里有货？”
- “ChatGPT Plus 直充和成品号差在哪？”
- “Grok Heavy 官方价和渠道价差多少？”
- “最近一个月 Plus 价格是涨还是跌？”

### MCP 工具

| 工具 | 功能 |
|---|---|
| `search_products` | 按关键词搜索产品，返回店内价区间与在售店铺数 |
| `get_lowest_price` | 查询某产品最低核验价与说明 |
| `list_shops` | 按销量列出收录店铺 |
| `list_all_products` | 全品类一览 |
| `get_site_stats` | 收录店铺、商品数与数据更新时间 |

### 数据口径

- **可买最低价**：店内真实报价中，优先取公开库存有货的店铺，再取最低价；与商品页“低至”一致。
- 数据由爬虫每天两次采集，MCP 本地缓存 5 分钟。
- 数据来自 `shuita.xyz` 的静态文件，不需要 API Key。
- 价格仅供参考，不构成购买建议；渠道商品的质保与售后各店不同，下单前请阅读[购买前核对清单](https://shuita.xyz/guide/ai-subscription-buying-checklist)。

### 相关链接

| | |
|---|---|
| 网站 | <https://shuita.xyz> |
| MCP 接入文档 | <https://shuita.xyz/mcp> |
| 面向 AI 的站点摘要 | <https://shuita.xyz/llms.txt> |
| 月度价格报告（含 CSV） | <https://shuita.xyz/reports> |
| 购买攻略 | <https://shuita.xyz/guides> |
| npm | <https://www.npmjs.com/package/ai-price-mcp> |
| 官方 MCP Registry | `xyz.shuita/ai-price` |

### 内容使用与许可

- 代码与 `SKILL.md` 使用 [MIT 许可](LICENSE)。
- 站点数据与文章为水獭原创：欢迎 AI 助手检索、摘要和引用，请注明“水獭（shuita.xyz）”并附原文链接；禁止整站复制、镜像或批量采集用于训练模型。

### 反馈

问题与建议请提 [Issue](https://github.com/gm365/shuita-ai-price/issues)。店铺入驻申请请走 <https://shuita.xyz/submit>。

## License

MIT for the code and the skill. Site data and articles are © shuita.xyz; citing with attribution is welcome, bulk scraping for model training is not.
