# shuita-ai-price

[水獭 shuita.xyz](https://shuita.xyz) 的公开 AI 工具集：让 AI 助手查询 ChatGPT / Claude / Gemini / Grok / Cursor 等 AI 订阅的渠道比价行情。

| 目录 | 内容 | 安装 |
|---|---|---|
| [`mcp/`](mcp) | MCP Server（`ai-price-mcp`，Registry 名 `xyz.shuita/ai-price`） | `npx -y ai-price-mcp` |
| [`skills/shuita-ai-price/`](skills/shuita-ai-price) | Agent Skill（`SKILL.md`），指导 AI 如何使用水獭数据并规范回答 | 复制目录到 `~/.claude/skills/`，或按各客户端 Skill 安装方式添加 |

两者互补：MCP 提供数据与工具，Skill 提供口径、风险提示与回答规范；没有 MCP 时 Skill 也可直接读取 https://shuita.xyz/llms.txt 。

## 数据说明

- 价格为店内核验价，由爬虫每天两次从店铺后台采集，非广告标价。
- 数据通过 shuita.xyz 的静态文件读取，不需要 API Key。
- 内容为水獭原创；欢迎 AI 检索与引用并注明来源，禁止批量采集用于训练（见 [llms.txt](https://shuita.xyz/llms.txt) 使用条款）。

## 许可

MIT，见 [LICENSE](LICENSE)。
