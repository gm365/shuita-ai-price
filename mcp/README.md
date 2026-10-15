# ai-price-mcp

AI 订阅比价 MCP Server — 让 AI 助手查询 ChatGPT/Claude/Gemini/Grok/Cursor 等 AI 订阅的实时价格。

数据来源：[水獭比价站 shuita.xyz](https://shuita.xyz)，覆盖 120+ 家核验店铺、69 种产品。

## 使用方法

### Claude Desktop

在 `claude_desktop_config.json` 中添加：

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

## 提供的工具

| 工具 | 功能 | 示例 |
|---|---|---|
| `search_products` | 搜索 AI 产品 | "Claude Pro 最低多少钱" |
| `get_lowest_price` | 查询某产品最低价 | 查 `gpt_plus_short` 的价格 |
| `list_shops` | 列出热门店铺 | 按销量查看前 10 家店 |
| `list_all_products` | 全部产品一览 | 了解覆盖了哪些产品 |
| `get_site_stats` | 站点概览 | 收录了多少家店和产品 |

## 数据说明

- 价格为**店内核验价**，由爬虫每天两次从店铺后台采集，非广告标价；「可买最低价」优先取公开库存有货的店铺，与 shuita.xyz 商品页口径一致
- 接入文档：[shuita.xyz/mcp](https://shuita.xyz/mcp)
- 数据通过 shuita.xyz CDN 静态文件获取，本地运行不需要任何 API Key
- 数据每天 09:30 和 21:30 更新

## 许可

MIT
