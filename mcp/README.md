# ai-price-mcp

水獭 AI 订阅比价 MCP Server —— 让 AI 助手直接查询 ChatGPT、Claude、Gemini、Grok、Cursor 等主流 AI 订阅的渠道实盘行情。

数据源自[水獭比价站（shuita.xyz）](https://shuita.xyz)，覆盖 120+ 家核验店铺与近 70 种细分规格。

## 快速接入

### Claude Desktop

在 `claude_desktop_config.json` 中加入：

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

### Cursor / Windsurf / 其他 MCP 客户端

```bash
npx -y ai-price-mcp
```

## 工具列表

| 工具名 | 作用 | 提问示例 |
| :--- | :--- | :--- |
| `search_products` | 按关键词检索产品与价格区间 | 「Claude Pro 现在最低多少钱」 |
| `get_lowest_price` | 查询单品最低核验价与规格说明 | 查询 `gpt_plus_short` 的实盘底价 |
| `list_shops` | 按历史销量查看收录店铺 | 「按销量列出前 10 家发卡店」 |
| `list_all_products` | 浏览全站收录品类与行情 | 「目前覆盖了哪些 AI 订阅产品」 |
| `get_site_stats` | 查看全站收录规模与更新时间 | 「一共收录了多少家店和商品」 |

## 数据口径

- **现货实价**：所有对外报价均为每日两次（09:30 / 21:30）巡检所得的**店内核验价**，剔除群聊引流虚标；「可买最低价」优先取公开有货店铺的最低实价，与站点商品页口径一致。
- **零配置运行**：直接通过 `shuita.xyz` CDN 获取静态数据，本地缓存 5 分钟，无需申请任何 API Key。
- **接入指南**：完整说明参见 [shuita.xyz/mcp](https://shuita.xyz/mcp)。

## 许可

MIT
