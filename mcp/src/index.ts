#!/usr/bin/env node

/**
 * shuita-mcp — AI 订阅比价 MCP Server
 *
 * 在本地运行，从 shuita.xyz 的静态 JSON（CDN）读取数据。
 * 静态资源请求不经过 Cloudflare Worker，不消耗免费套餐的每天 10 万次额度。
 *
 * 用法：
 *   npx shuita-mcp              # 直接运行
 *   node dist/index.js           # 或编译后运行
 *
 * Claude Desktop 配置：
 *   { "mcpServers": { "shuita": { "command": "npx", "args": ["shuita-mcp"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// 数据源：读取 shuita.xyz 的静态 JSON（Cloudflare CDN，免费无限量）
// ---------------------------------------------------------------------------

const DATA_BASE = "https://shuita.xyz/data";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

// summaries 的 min / max / hits 来自 Telegram 广告报价快照，不是店内价；
// 对外报价一律用 shop_summaries（爬虫在店内读到的可买价）。
interface Summary {
  sku: string;
  name: string;
  blurb: string;
  hits: number;
  merchants: number;
  min: number | null;
  max: number | null;
  accounts: number;
}

interface ShopSummary {
  min_price: number;
  max_price?: number;
  merchants?: number;
}

interface Shop {
  token: string;
  name: string;
  platform: string;
  province: string | null;
  url: string;
  url_sponsored?: boolean;
  sell_count: number | null;
  last_ok: number;
  sku_count: number;
  item_count: number;
  checked_at: string | null;
}

interface Bot {
  handle: string;
  name: string;
  url: string;
  accounts: number;
  sku_count: number;
  min_quotes: Array<{ currency: string; price: number }>;
  bio: string | null;
  quotes: Array<{ name: string; sku: string }>;
}

interface CoreData {
  summaries: Summary[];
  shop_summaries: Record<string, ShopSummary>;
  shops_index: Shop[];
  bots_index: Bot[];
}

interface MetaData {
  generated_at: string;
  stats: {
    shops: number;
    items: number;
    sold: number;
    bots: number;
    updated: string;
  };
}

interface SiteData {
  core: CoreData;
  meta: MetaData;
}

let cachedData: SiteData | null = null;
let cacheTimestamp = 0;

async function fetchSiteData(): Promise<SiteData> {
  if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData;
  }

  const [coreRes, metaRes] = await Promise.all([
    fetch(`${DATA_BASE}/core.json`),
    fetch(`${DATA_BASE}/meta.json`),
  ]);

  if (!coreRes.ok) throw new Error(`Failed to fetch core.json: ${coreRes.status}`);
  if (!metaRes.ok) throw new Error(`Failed to fetch meta.json: ${metaRes.status}`);

  cachedData = {
    core: (await coreRes.json()) as CoreData,
    meta: (await metaRes.json()) as MetaData,
  };
  cacheTimestamp = Date.now();
  return cachedData;
}

// ---------------------------------------------------------------------------
// 搜索辅助
// ---------------------------------------------------------------------------

/** 简单的多关键词匹配（不区分大小写） */
function matchesQuery(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => lower.includes(term));
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "暂无报价";
  return `¥${price}`;
}

/** 店内价：可买最低价（有货优先）、最高价与在售店铺数；无店内报价返回 null */
function shopPrice(data: SiteData, sku: string) {
  const s = data.core.shop_summaries?.[sku];
  if (!s || s.min_price == null) return null;
  return { min: s.min_price, max: s.max_price ?? null, merchants: s.merchants ?? null };
}

function priceRange(data: SiteData, sku: string): string {
  const p = shopPrice(data, sku);
  if (!p) return "暂无店内核验价";
  return p.max != null && p.max !== p.min
    ? `${formatPrice(p.min)} ~ ${formatPrice(p.max)}`
    : formatPrice(p.min);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "shuita-ai-price",
  version: "1.0.2",
});

// ── Tool 1: 搜索 AI 产品 ───────────────────────────────────────────────────

server.tool(
  "search_products",
  "搜索 AI 订阅产品（ChatGPT Plus、Claude Pro、Gemini、Grok、Cursor 等），返回价格区间和在售商家数。支持中英文关键词。",
  {
    query: z
      .string()
      .describe("搜索关键词，如 'Claude Pro'、'GPT Plus'、'短效'、'Grok Heavy'"),
  },
  async ({ query }) => {
    const data = await fetchSiteData();
    const results = data.core.summaries
      .filter(
        (s) =>
          matchesQuery(s.name, query) ||
          matchesQuery(s.blurb, query) ||
          matchesQuery(s.sku, query),
      )
      .slice(0, 15);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `未找到与「${query}」相关的产品。试试其他关键词，如 "Claude"、"Plus"、"Grok"。`,
          },
        ],
      };
    }

    const lines = results.map((s) => {
      const p = shopPrice(data, s.sku);
      const shops = p?.merchants != null ? `，${p.merchants} 家店铺在售` : "";
      return `• ${s.name}（${s.sku}）— 店内价 ${priceRange(data, s.sku)}${shops}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `找到 ${results.length} 个产品：\n\n${lines.join("\n")}\n\n数据来源：shuita.xyz（${data.meta.stats.updated}）`,
        },
      ],
    };
  },
);

// ── Tool 2: 查询产品最低价 ─────────────────────────────────────────────────

server.tool(
  "get_lowest_price",
  "查询某个 AI 产品的最低核验价格、商家数和详细说明。",
  {
    sku: z
      .string()
      .describe(
        "产品 SKU 标识，如 'gpt_plus_short'、'claude_pro'、'grok_heavy'。可先用 search_products 查找。",
      ),
  },
  async ({ sku }) => {
    const data = await fetchSiteData();
    const summary = data.core.summaries.find(
      (s) => s.sku === sku || s.name === sku,
    );

    if (!summary) {
      // 尝试模糊匹配
      const fuzzy = data.core.summaries.filter(
        (s) =>
          matchesQuery(s.name, sku) ||
          matchesQuery(s.sku, sku),
      );
      if (fuzzy.length > 0) {
        const suggestions = fuzzy
          .slice(0, 5)
          .map((s) => `  ${s.sku} — ${s.name}`)
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `未找到精确匹配「${sku}」，你可能是指：\n${suggestions}`,
            },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: `未找到产品「${sku}」。` },
        ],
      };
    }

    const p = shopPrice(data, summary.sku);
    const lines = [
      `📦 ${summary.name}（${summary.sku}）`,
      `📝 ${summary.blurb}`,
      "",
      ...(p
        ? [
            `💰 可买最低价（店内核验，有货优先）：${formatPrice(p.min)}`,
            ...(p.max != null ? [`💰 店内最高价：${formatPrice(p.max)}`] : []),
            ...(p.merchants != null ? [`🏪 在售店铺：${p.merchants} 家`] : []),
          ]
        : ["💰 暂无店内核验价"]),
      ...(summary.min != null
        ? [`📣 Telegram 广告宣称价：${formatPrice(summary.min)} 起（仅供参考，未核验）`]
        : []),
      "",
      `🔗 详情页：https://shuita.xyz/sku/${summary.sku}`,
      `📅 数据更新：${data.meta.stats.updated}`,
    ];

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ── Tool 3: 列出热门店铺 ──────────────────────────────────────────────────

server.tool(
  "list_shops",
  "列出 AI 订阅商家店铺，按销量排序。可查看店铺名称、平台、销量、在售商品数。",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(10)
      .describe("返回数量，默认 10，最多 30"),
    platform: z
      .string()
      .optional()
      .describe(
        "按平台过滤，可选：ldxp（链动小铺）、aisou（Aisou同族）、catfk、jrsoft（16688鲸软）、cardnet",
      ),
  },
  async ({ limit, platform }) => {
    const data = await fetchSiteData();
    let shops = [...data.core.shops_index];

    if (platform) {
      shops = shops.filter((s) => s.platform === platform);
    }

    // 按销量降序（null 排最后）
    shops.sort((a, b) => (b.sell_count ?? -1) - (a.sell_count ?? -1));
    shops = shops.slice(0, limit);

    if (shops.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: platform
              ? `没有找到平台「${platform}」的店铺。`
              : "暂无店铺数据。",
          },
        ],
      };
    }

    const lines = shops.map((s, i) => {
      const sales = s.sell_count !== null ? `${s.sell_count.toLocaleString()} 笔` : "未知";
      const status = s.last_ok ? "✅" : "⚠️";
      return `${i + 1}. ${status} ${s.name}\n   平台：${s.platform} | 销量：${sales} | 在售 SKU：${s.sku_count} | 商品：${s.item_count}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `共 ${data.core.shops_index.length} 家店铺${platform ? `（${platform} 平台）` : ""}，按销量排序前 ${shops.length} 名：\n\n${lines.join("\n\n")}\n\n🔗 完整列表：https://shuita.xyz/shops\n📅 ${data.meta.stats.updated}`,
        },
      ],
    };
  },
);

// ── Tool 4: 站点统计概览 ──────────────────────────────────────────────────

server.tool(
  "get_site_stats",
  "获取水獭比价站整体统计信息：收录商家数、商品数、产品种类等。",
  {},
  async () => {
    const data = await fetchSiteData();

    const skuWithPrice = data.core.summaries.filter(
      (s) => shopPrice(data, s.sku) !== null,
    ).length;
    const totalMerchants = data.core.shops_index.length;
    const totalBots = data.core.bots_index.length;
    const totalSkus = data.core.summaries.length;

    // 算全站最热 SKU
    const topByHits = [...data.core.summaries]
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);

    const lines = [
      "📊 水獭 AI 比价站（shuita.xyz）概览",
      "",
      `🏪 收录店铺：${totalMerchants} 家`,
      `🤖 收录 Bot：${totalBots} 个`,
      `📦 产品种类：${totalSkus} 种（${skuWithPrice} 种有核验价）`,
      `🛒 商品总数：${data.meta.stats.items}`,
      "",
      "🔥 广告最活跃的产品：",
      ...topByHits.map(
        (s) => `   ${s.name} — 店内价 ${formatPrice(shopPrice(data, s.sku)?.min)} 起`,
      ),
      "",
      `📅 数据更新时间：${data.meta.stats.updated}`,
      `🔗 网站：https://shuita.xyz`,
    ];

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ── Tool 5: 全部产品一览 ──────────────────────────────────────────────────

server.tool(
  "list_all_products",
  "列出所有可比价的 AI 产品及其价格区间，方便了解全站覆盖范围。",
  {
    sort: z
      .enum(["price", "hits", "merchants"])
      .default("hits")
      .describe("排序方式：price（店内最低价）、hits（广告热度）、merchants（在售店铺数）"),
    has_price_only: z
      .boolean()
      .default(false)
      .describe("仅显示有核验价格的产品"),
  },
  async ({ sort, has_price_only }) => {
    const data = await fetchSiteData();
    let products = [...data.core.summaries];

    const priceOf = (sku: string) => shopPrice(data, sku);
    if (has_price_only) {
      products = products.filter((s) => priceOf(s.sku) !== null);
    }

    switch (sort) {
      case "price":
        products.sort((a, b) => (priceOf(a.sku)?.min ?? Infinity) - (priceOf(b.sku)?.min ?? Infinity));
        break;
      case "hits":
        products.sort((a, b) => b.hits - a.hits);
        break;
      case "merchants":
        products.sort((a, b) => (priceOf(b.sku)?.merchants ?? 0) - (priceOf(a.sku)?.merchants ?? 0));
        break;
    }

    const lines = products.map((s) => {
      const p = priceOf(s.sku);
      const price = p ? `${formatPrice(p.min)} 起` : "暂无店内核验价";
      return `• ${s.name}（${s.sku}）— ${price}${p?.merchants != null ? `，${p.merchants} 家店铺` : ""}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `共 ${products.length} 种产品，按${sort === "price" ? "店内最低价" : sort === "hits" ? "广告热度" : "在售店铺数"}排序：\n\n${lines.join("\n")}\n\n📅 ${data.meta.stats.updated}`,
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("shuita-mcp failed to start:", err);
  process.exit(1);
});
