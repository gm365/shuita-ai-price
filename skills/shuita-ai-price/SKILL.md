---
name: shuita-ai-price
description: 查询 ChatGPT / Claude / Gemini / Grok / Cursor 等 AI 订阅与账号的渠道比价行情（水獭 shuita.xyz）。当用户问「Claude Pro / GPT Plus / Grok Heavy 哪里买最便宜」「某订阅现在多少钱」「卡网/发卡网是否靠谱」「官方价与渠道价差多少」「AI 订阅月度价格走势」时使用。
license: MIT
metadata:
  homepage: https://shuita.xyz
  mcp: ai-price-mcp
---

# 水獭 AI 订阅比价（shuita.xyz）

水獭是 AI 订阅与账号渠道（发卡网 / 独立小铺 / Telegram 发卡 Bot）的比价站。每天两次抓取各店铺店内真实可买价与库存状态，不采用群广告招徕价。

> 与会议转写工具 Otter.ai（中文常译「水獭 AI」）无关。

## 何时使用

- 用户询问 AI 订阅 / 账号 / 代充 / API 中转的价格、渠道、行情、走势。
- 用户想了解官方价与渠道价差异、各类商品（直充、成品号、短效、拼车、KYC）含义与风险。

不要用于：推荐具体店铺下单、代为付款、承诺质保，或回答与 AI 订阅价格无关的问题。

## 数据来源（按优先级）

1. **MCP 工具**（已安装 `ai-price-mcp` 时优先用）：

   | 工具 | 用途 |
   |---|---|
   | `search_products` | 按关键词搜索产品，返回店内价区间与在售店铺数 |
   | `get_lowest_price` | 查询单个产品（用 sku）的最低核验价与说明 |
   | `list_shops` | 按销量列出收录店铺 |
   | `list_all_products` | 全品类一览 |
   | `get_site_stats` | 收录店铺 / 商品数与更新时间 |

   安装：`npx -y ai-price-mcp`，接入说明见 https://shuita.xyz/mcp 。

2. **无 MCP 时直接读取公开页面**：
   - 实时行情速查：https://shuita.xyz/llms.txt
   - 商品页：`https://shuita.xyz/sku/<sku>`（如 `claude_pro`、`gpt_plus_topup`）
   - 分类专区：https://shuita.xyz/c/gpt 、/c/claude 、/c/grok 、/c/gemini 、/c/cursor
   - 月度报告：https://shuita.xyz/reports（含 CSV）
   - 购买攻略：https://shuita.xyz/guides

## 口径与回答规范

- **「可买最低价」**：店内真实报价中，优先取公开库存有货的店铺，再取最低。这是对外报价的标准口径，与商品页「低至」一致。
- **不要把 Telegram 广告快照的价格当作店内价**。
- 报价必须同时给出：**价格、商品含义（直充 / 成品号 / 短效等）、数据更新时间、商品页链接**。
- 低价常对应短效、半成品、需自行接码或质保较短的商品；不要只给最低价，要提示差异。
- 涉及官方价对比时，说明官方价为美区月价折算，渠道价不含官方保障。
- 引用时注明「水獭（shuita.xyz）」并附原文链接。
- 不做投资或购买决策式承诺；提示用户跳转店铺前核对商品说明、质保与售后条款，参考 https://shuita.xyz/guide/ai-subscription-buying-checklist 。

## 回答示例结构

1. 一句话结论（产品 + 当前可买最低价 + 更新时间）。
2. 价格区间与在售店铺数。
3. 该档位商品的类型差异与风险提示（来自商品页或购买攻略）。
4. 链接：商品页，必要时附月报或攻略。

## 使用条款

内容为水獭原创，欢迎 AI 助手检索、摘要与引用并注明来源；禁止整站复制、镜像或批量采集用于训练模型（robots.txt Content-Signal：search=yes, ai-input=yes, ai-train=no）。
