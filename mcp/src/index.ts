#!/usr/bin/env node

/**
 * ai-price-mcp — 水獭 AI 订阅比价 MCP Server
 *
 * 在本地运行，从 shuita.xyz 的静态资源（Cloudflare CDN）读取数据：
 *   - /data/core.json、/data/meta.json：SKU 汇总、店铺索引与更新时间
 *   - /sku/<sku> 页面内嵌的 boot-data：各店报价（shop_floors）与 30 天走势（price_trend）
 * 静态资源请求不经过 Cloudflare Worker，不消耗免费套餐的每天 10 万次额度。
 *
 * 不要设置自定义 User-Agent：站点 WAF 对含 `ai-price` 的 UA 做质询（防克隆站冒名），
 * Node 自带 fetch 的 `node` UA 在放行名单里。
 *
 * 用法：
 *   npx -y ai-price-mcp
 *
 * Claude Desktop 配置：
 *   { "mcpServers": { "ai-price": { "command": "npx", "args": ["-y", "ai-price-mcp"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const VERSION = "1.1.0";
const SITE = "https://shuita.xyz";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存（站点每天更新两次）
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// 数据结构
// ---------------------------------------------------------------------------

// summaries 的 min / max / hits 来自 Telegram 广告报价快照，不是店内价；
// 对外报价一律用 shop_summaries（爬虫在店内读到的到手价）。
interface Summary {
  sku: string;
  name: string;
  blurb: string;
  hits: number;
  merchants: number;
  min: number | null;
  max: number | null;
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
  url: string; // https://shuita.xyz/go/<code>，出站跳转到商家店铺
  sell_count: number | null;
  last_ok: number;
  sku_count: number;
  item_count: number;
}

interface CoreData {
  summaries: Summary[];
  shop_summaries: Record<string, ShopSummary>;
  shops_index: Shop[];
  bots_index: unknown[];
}

interface MetaData {
  generated_at: string;
  stats: { shops: number; items: number; sold: number; bots: number; updated: string };
}

type StockStatus = "in_stock" | "unknown" | "out";

/** SKU 页 boot-data.shop_floors：每家店在该 SKU 下的最低报价 */
interface ShopFloor {
  shop_token: string;
  shop_name?: string;
  platform: string;
  sku: string;
  price: number; // 到手价：标价 + 人民币渠道最便宜的支付手续费
  list_price?: number;
  fee?: number;
  fee_channel?: string;
  usdt_price?: number;
  usdt_only?: boolean;
  stock_count: number | null;
  stock_status: StockStatus;
  checked_at: string | null;
}

interface SkuPage {
  shop_floors: ShopFloor[];
  price_trend: Array<[string, number]>;
}

interface SiteData {
  core: CoreData;
  meta: MetaData;
  shopsByToken: Map<string, Shop>;
}

// ---------------------------------------------------------------------------
// 数据获取（带超时与缓存）
// ---------------------------------------------------------------------------

class SiteUnavailable extends Error {}

async function get(path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "请求超时" : "网络错误";
    throw new SiteUnavailable(`${reason}：${path}`);
  }
  if (!res.ok) throw new SiteUnavailable(`${path} 返回 HTTP ${res.status}`);
  return res;
}

let cachedSite: { at: number; data: SiteData } | null = null;

async function fetchSiteData(): Promise<SiteData> {
  if (cachedSite && Date.now() - cachedSite.at < CACHE_TTL_MS) return cachedSite.data;
  const [coreRes, metaRes] = await Promise.all([get("/data/core.json"), get("/data/meta.json")]);
  const core = (await coreRes.json()) as CoreData;
  const meta = (await metaRes.json()) as MetaData;
  const data = { core, meta, shopsByToken: new Map(core.shops_index.map((s) => [s.token, s])) };
  cachedSite = { at: Date.now(), data };
  return data;
}

const skuCache = new Map<string, { at: number; page: SkuPage }>();

async function fetchSkuPage(sku: string): Promise<SkuPage> {
  const hit = skuCache.get(sku);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.page;
  const html = await (await get(`/sku/${encodeURIComponent(sku)}`)).text();
  const m = html.match(/<script type="application\/json" id="boot-data">([\s\S]*?)<\/script>/);
  if (!m) throw new SiteUnavailable(`/sku/${sku} 页面结构变化，未找到报价数据`);
  const boot = JSON.parse(m[1]) as Partial<SkuPage>;
  const page: SkuPage = {
    shop_floors: (boot.shop_floors ?? []).filter((f) => f.sku === sku),
    price_trend: boot.price_trend ?? [],
  };
  skuCache.set(sku, { at: Date.now(), page });
  return page;
}

// ---------------------------------------------------------------------------
// 搜索
// ---------------------------------------------------------------------------

// 按 SKU 前缀补品牌别名，让「ChatGPT Plus」「克劳德」这类说法也能命中
const BRAND_ALIASES: Array<[string, string]> = [
  ["gpt_", "chatgpt gpt openai"],
  ["codex", "chatgpt gpt openai codex"],
  ["claude", "claude anthropic 克劳德"],
  ["gemini", "gemini google 谷歌 双子座"],
  ["antigravity", "gemini google 谷歌"],
  ["grok", "grok xai 马斯克"],
  ["x_", "twitter 推特"],
];

// 不参与匹配的口语词：问句里常见，但商品名里没有（中文词也会从连写的问句里剔除）
const STOP_WORDS = [
  "多少钱", "最便宜", "最低价", "多少", "价格", "价钱", "便宜", "现在", "哪里", "哪家", "购买", "会员", "订阅", "的", "买",
  "price", "cheapest", "buy", "subscription", "how", "much",
];

const CJK = /[一-鿿]/;

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (let t of text.toLowerCase().match(/[a-z0-9.+]+|[一-鿿]+/g) ?? []) {
    if (CJK.test(t)) for (const w of STOP_WORDS) if (CJK.test(w)) t = t.split(w).join(" ");
    for (const part of t.split(" ")) if (part && !STOP_WORDS.includes(part)) out.push(part);
  }
  return out;
}

interface Haystack {
  name: string;
  nameWords: string[];
  all: string;
  words: string[];
}

function haystack(s: Summary): Haystack {
  const brand = BRAND_ALIASES.filter(([prefix]) => s.sku.startsWith(prefix)).map(([, a]) => a);
  const name = s.name.toLowerCase();
  const all = [name, s.sku.replace(/_/g, " "), s.blurb.toLowerCase(), ...brand].join(" ");
  const split = (x: string) => x.split(/[^a-z0-9.+一-鿿]+/).filter(Boolean);
  return { name, nameWords: split(name), all, words: split(all) };
}

// 英文词按词首匹配（避免 "x" 命中所有含字母 x 的名字），中文按子串匹配
function hit(term: string, text: string, words: string[]): boolean {
  return CJK.test(term) ? text.includes(term) : words.some((w) => w.startsWith(term));
}

interface Match {
  summary: Summary;
  score: number;
  partial: boolean;
}

/** 多关键词打分：全部命中优先；没有全部命中的结果时退回部分命中 */
function searchSummaries(data: SiteData, query: string): Match[] {
  const q = query.trim().toLowerCase();
  const terms = tokenize(q);
  if (terms.length === 0) return [];
  const out: Match[] = [];
  for (const s of data.core.summaries) {
    const h = haystack(s);
    let score = 0;
    let hits = 0;
    for (const t of terms) {
      if (hit(t, h.all, h.words)) {
        hits++;
        score += hit(t, h.name, h.nameWords) ? 10 : 3;
      }
    }
    if (hits === 0) continue;
    if (s.sku === q || h.name === q) score += 100;
    else if (h.name.includes(q)) score += 30;
    out.push({ summary: s, score: score + (hits === terms.length ? 50 : 0), partial: hits < terms.length });
  }
  const full = out.filter((m) => !m.partial);
  const pool = full.length > 0 ? full : out;
  const merchants = (m: Match) => data.core.shop_summaries[m.summary.sku]?.merchants ?? 0;
  return pool.sort((a, b) => b.score - a.score || merchants(b) - merchants(a));
}

/** 精确 SKU / 名称优先；否则只有唯一完全命中时才当作这个产品，其余给出候选 */
function resolveSku(data: SiteData, input: string): { summary?: Summary; suggestions: Summary[] } {
  const key = input.trim().toLowerCase();
  const exact = data.core.summaries.find((s) => s.sku === key || s.name.toLowerCase() === key);
  if (exact) return { summary: exact, suggestions: [] };
  const matches = searchSummaries(data, input);
  if (matches.length === 1 && !matches[0].partial) return { summary: matches[0].summary, suggestions: [] };
  return { suggestions: matches.slice(0, 5).map((m) => m.summary) };
}

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------

function yuan(price: number | null | undefined): string {
  if (price == null) return "暂无报价";
  return `¥${Number.isInteger(price) ? price : Number(price.toFixed(2))}`;
}

/** 去掉店名里的推广后缀，如「AI金牌供应商 | 对接：xxx」 */
function cleanShopName(name: string): string {
  const head = name.split(/\s*[|｜]\s*/)[0].trim();
  return head || name.trim();
}

const STOCK_LABEL: Record<StockStatus, string> = { in_stock: "有货", unknown: "库存未公开", out: "无货" };
const STOCK_RANK: Record<StockStatus, number> = { in_stock: 0, unknown: 1, out: 2 };

function shopPrice(data: SiteData, sku: string) {
  const s = data.core.shop_summaries?.[sku];
  if (!s || s.min_price == null) return null;
  return { min: s.min_price, max: s.max_price ?? null, merchants: s.merchants ?? null };
}

function priceRange(data: SiteData, sku: string): string {
  const p = shopPrice(data, sku);
  if (!p) return "暂无店内核验价";
  return p.max != null && p.max !== p.min ? `${yuan(p.min)} ~ ${yuan(p.max)}` : yuan(p.min);
}

interface Offer {
  shop: string;
  shop_token: string;
  platform: string;
  price: number;
  list_price?: number;
  fee?: number;
  fee_channel?: string;
  usdt_price?: number;
  usdt_only?: boolean;
  stock: StockStatus;
  stock_count?: number;
  checked_at?: string;
  shop_url?: string;
  shop_page: string;
}

function toOffers(data: SiteData, floors: ShopFloor[], includeOut: boolean): Offer[] {
  return floors
    .filter((f) => includeOut || f.stock_status !== "out")
    .sort((a, b) => STOCK_RANK[a.stock_status] - STOCK_RANK[b.stock_status] || a.price - b.price)
    .map((f) => {
      const shop = data.shopsByToken.get(f.shop_token);
      const offer: Offer = {
        shop: cleanShopName(shop?.name ?? f.shop_name ?? f.shop_token),
        shop_token: f.shop_token,
        platform: f.platform,
        price: f.price,
        stock: f.stock_status,
        shop_page: `${SITE}/shop/${encodeURIComponent(f.shop_token)}`,
      };
      if (f.fee) Object.assign(offer, { list_price: f.list_price, fee: f.fee, fee_channel: f.fee_channel });
      if (f.usdt_price != null) offer.usdt_price = f.usdt_price;
      if (f.usdt_only) offer.usdt_only = true;
      if (f.stock_status === "in_stock" && f.stock_count != null) offer.stock_count = f.stock_count;
      if (f.checked_at) offer.checked_at = f.checked_at;
      if (shop?.url) offer.shop_url = shop.url;
      return offer;
    });
}

function offerLine(o: Offer, i: number): string {
  const extras = [
    o.usdt_only ? "仅支持 USDT" : null,
    o.fee ? `标价 ${yuan(o.list_price)} + ${o.fee_channel ?? "支付"}手续费 ${yuan(o.fee)}` : null,
    o.usdt_price != null ? `USDT 付 ${yuan(o.usdt_price)}` : null,
    o.stock_count != null ? `库存 ${o.stock_count}` : STOCK_LABEL[o.stock],
  ].filter(Boolean);
  return `${i + 1}. ${o.shop} — ${yuan(o.price)}（${extras.join("，")}）\n   店铺：${o.shop_url ?? o.shop_page}`;
}

function textResult(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** 统一兜底：数据源不可用时返回可读的错误，而不是让工具调用直接失败 */
function safe<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      const reason = err instanceof SiteUnavailable ? err.message : String(err);
      return errorResult(`水獭数据暂时无法获取（${reason}）。请稍后再试，或直接访问 ${SITE}。`);
    }
  };
}

function notFound(input: string, suggestions: Summary[]): CallToolResult {
  return errorResult(
    suggestions.length > 0
      ? `未找到精确匹配「${input}」，你可能是指：\n${suggestions.map((s) => `  ${s.sku} — ${s.name}`).join("\n")}`
      : `未找到产品「${input}」。可先用 search_products 搜索，或用 list_all_products 查看全部 SKU。`,
  );
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "ai-price-mcp", version: VERSION });

const productShape = {
  sku: z.string(),
  name: z.string(),
  min_price: z.number().nullable().describe("可买最低到手价（人民币，有货优先）"),
  max_price: z.number().nullable(),
  merchants: z.number().nullable().describe("在售店铺数"),
  url: z.string(),
};

const offerShape = z.object({
  shop: z.string(),
  shop_token: z.string(),
  platform: z.string(),
  price: z.number().describe("人民币到手价（标价 + 支付手续费）"),
  list_price: z.number().optional(),
  fee: z.number().optional(),
  fee_channel: z.string().optional(),
  usdt_price: z.number().optional().describe("用 USDT 付款时的价格（比人民币便宜时才有）"),
  usdt_only: z.boolean().optional().describe("该店只收 USDT"),
  stock: z.enum(["in_stock", "unknown", "out"]),
  stock_count: z.number().optional(),
  checked_at: z.string().optional(),
  shop_url: z.string().optional().describe("商家店铺链接（经 shuita.xyz/go/ 跳转）"),
  shop_page: z.string().describe("水獭上的店铺详情页"),
});

function productOf(data: SiteData, s: Summary) {
  const p = shopPrice(data, s.sku);
  return {
    sku: s.sku,
    name: s.name,
    min_price: p?.min ?? null,
    max_price: p?.max ?? null,
    merchants: p?.merchants ?? null,
    url: `${SITE}/sku/${s.sku}`,
  };
}

// ── search_products ─────────────────────────────────────────────────────────

server.registerTool(
  "search_products",
  {
    title: "搜索 AI 订阅产品",
    description:
      "按关键词搜索 AI 订阅产品（ChatGPT Plus、Claude Pro、Gemini、Grok、Cursor 等），返回 SKU、店内到手价区间和在售店铺数。支持中英文与常见俗称（如「克劳德」「GPT 会员」）。",
    inputSchema: {
      query: z.string().min(1).describe("搜索关键词，如 'Claude Pro'、'ChatGPT Plus 直充'、'短效'、'Grok Heavy'"),
      limit: z.number().int().min(1).max(30).default(10).describe("返回数量，默认 10，最多 30"),
    },
    outputSchema: {
      total: z.number(),
      approximate: z.boolean().describe("true 表示没有全部关键词都命中的产品，返回的是部分命中结果"),
      products: z.array(z.object(productShape)),
      updated: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async ({ query, limit }: { query: string; limit: number }) => {
    const data = await fetchSiteData();
    const updated = data.meta.stats.updated;
    const matches = searchSummaries(data, query);
    if (matches.length === 0) {
      return textResult(
        `未找到与「${query}」相关的产品。试试 "Claude"、"Plus"、"Grok"，或用 list_all_products 查看全部。`,
        { total: 0, approximate: false, products: [], updated },
      );
    }
    const approximate = matches[0].partial;
    const shown = matches.slice(0, limit);
    const lines = shown.map(({ summary: s }) => {
      const p = shopPrice(data, s.sku);
      const shops = p?.merchants != null ? `，${p.merchants} 家店铺在售` : "";
      return `• ${s.name}（${s.sku}）— 店内价 ${priceRange(data, s.sku)}${shops}`;
    });
    const head = approximate
      ? `没有完全匹配「${query}」的产品，以下是部分匹配的 ${shown.length} 个：`
      : `找到 ${matches.length} 个产品${matches.length > shown.length ? `，显示前 ${shown.length} 个` : ""}：`;
    return textResult(
      `${head}\n\n${lines.join("\n")}\n\n查看哪家店最便宜：get_offers(sku)\n数据来源：shuita.xyz（${updated}）`,
      { total: matches.length, approximate, products: shown.map((m) => productOf(data, m.summary)), updated },
    );
  }),
);

// ── get_lowest_price ────────────────────────────────────────────────────────

server.registerTool(
  "get_lowest_price",
  {
    title: "查询产品最低价",
    description:
      "查询某个 AI 产品的可买最低价（店内核验的人民币到手价，有货优先）、价格区间、在售店铺数，以及最低价来自哪家店。",
    inputSchema: {
      sku: z
        .string()
        .min(1)
        .describe("产品 SKU，如 'gpt_plus_short'、'claude_pro'、'grok_heavy'；也接受产品名称。可先用 search_products 查找。"),
    },
    outputSchema: {
      ...productShape,
      blurb: z.string(),
      cheapest: offerShape.nullable().describe("最低价对应的店铺；报价数据暂不可用时为 null"),
      updated: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async ({ sku }: { sku: string }) => {
    const data = await fetchSiteData();
    const { summary, suggestions } = resolveSku(data, sku);
    if (!summary) return notFound(sku, suggestions);

    const p = shopPrice(data, summary.sku);
    let cheapest: Offer | null = null;
    try {
      cheapest = toOffers(data, (await fetchSkuPage(summary.sku)).shop_floors, false)[0] ?? null;
    } catch {
      // 报价页取不到时仍返回汇总价
    }
    const lines = [
      `📦 ${summary.name}（${summary.sku}）`,
      `📝 ${summary.blurb}`,
      "",
      ...(p
        ? [
            `💰 可买最低价（店内核验到手价，有货优先）：${yuan(p.min)}${cheapest ? `，来自「${cheapest.shop}」` : ""}`,
            ...(p.max != null ? [`💰 店内最高价：${yuan(p.max)}`] : []),
            ...(p.merchants != null ? [`🏪 在售店铺：${p.merchants} 家`] : []),
            ...(cheapest?.shop_url ? [`🛒 最低价店铺：${cheapest.shop_url}`] : []),
          ]
        : ["💰 暂无店内核验价"]),
      ...(summary.min != null ? [`📣 Telegram 广告宣称价：${yuan(summary.min)} 起（仅供参考，未核验）`] : []),
      "",
      `更多店铺报价：get_offers("${summary.sku}")；近 30 天走势：get_price_trend("${summary.sku}")`,
      `🔗 详情页：${SITE}/sku/${summary.sku}`,
      `📅 数据更新：${data.meta.stats.updated}`,
    ];
    return textResult(lines.join("\n"), {
      ...productOf(data, summary),
      blurb: summary.blurb,
      cheapest,
      updated: data.meta.stats.updated,
    });
  }),
);

// ── get_offers ──────────────────────────────────────────────────────────────

server.registerTool(
  "get_offers",
  {
    title: "查看各店报价",
    description:
      "列出某个 AI 产品在各家店铺的报价，按「有货优先、再比到手价」排序：店名、人民币到手价（含支付手续费）、USDT 价、库存与店铺链接。用于回答「哪家店最便宜」「去哪买」。",
    inputSchema: {
      sku: z.string().min(1).describe("产品 SKU 或名称，如 'claude_pro'、'gpt_plus_topup'"),
      limit: z.number().int().min(1).max(20).default(5).describe("返回店铺数，默认 5，最多 20"),
      include_out_of_stock: z.boolean().default(false).describe("是否包含明确无货的店铺，默认不包含"),
    },
    outputSchema: {
      sku: z.string(),
      name: z.string(),
      total: z.number().describe("符合条件的店铺总数"),
      offers: z.array(offerShape),
      url: z.string(),
      updated: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async ({ sku, limit, include_out_of_stock }: { sku: string; limit: number; include_out_of_stock: boolean }) => {
    const data = await fetchSiteData();
    const { summary, suggestions } = resolveSku(data, sku);
    if (!summary) return notFound(sku, suggestions);

    const all = toOffers(data, (await fetchSkuPage(summary.sku)).shop_floors, include_out_of_stock);
    const offers = all.slice(0, limit);
    const url = `${SITE}/sku/${summary.sku}`;
    const updated = data.meta.stats.updated;
    const structured = { sku: summary.sku, name: summary.name, total: all.length, offers, url, updated };
    if (offers.length === 0) {
      return textResult(`「${summary.name}」目前没有可买的店铺报价。详情页：${url}`, structured);
    }
    const text = [
      `🏪 ${summary.name}（${summary.sku}）共 ${all.length} 家店铺报价，前 ${offers.length} 家（有货优先，按人民币到手价排序）：`,
      "",
      offers.map(offerLine).join("\n"),
      "",
      "价格为店内核验的到手价（含支付手续费）。不同店铺的交付方式与质保差异较大，下单前请进店核对商品说明。",
      `🔗 全部报价：${url}`,
      `📅 数据更新：${updated}`,
    ].join("\n");
    return textResult(text, structured);
  }),
);

// ── get_price_trend ─────────────────────────────────────────────────────────

server.registerTool(
  "get_price_trend",
  {
    title: "查询近 30 天价格走势",
    description:
      "查询某个 AI 产品近 30 天每天的可买最低价走势（与详情页走势图同口径），返回起止价格、最高最低点和涨跌幅。用于回答「最近是涨还是跌」「现在是不是低点」。",
    inputSchema: {
      sku: z.string().min(1).describe("产品 SKU 或名称，如 'claude_pro'、'gpt_plus_topup'"),
    },
    outputSchema: {
      sku: z.string(),
      name: z.string(),
      points: z.array(z.object({ date: z.string().describe("MM-DD，北京时间"), price: z.number() })),
      first: z.number().nullable(),
      last: z.number().nullable(),
      low: z.number().nullable(),
      high: z.number().nullable(),
      change_pct: z.number().nullable().describe("首日到最新一天的涨跌幅（%）"),
      url: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async ({ sku }: { sku: string }) => {
    const data = await fetchSiteData();
    const { summary, suggestions } = resolveSku(data, sku);
    if (!summary) return notFound(sku, suggestions);

    const points = (await fetchSkuPage(summary.sku)).price_trend.map(([date, price]) => ({ date, price }));
    const url = `${SITE}/sku/${summary.sku}`;
    const base = { sku: summary.sku, name: summary.name, points, url };
    if (points.length === 0) {
      return textResult(`「${summary.name}」的历史数据不足，暂无走势。详情页：${url}`, {
        ...base, first: null, last: null, low: null, high: null, change_pct: null,
      });
    }
    const prices = points.map((p) => p.price);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const change_pct = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : null;
    const dateOf = (v: number) => points.find((p) => p.price === v)!.date;
    const trend =
      change_pct == null ? "" : change_pct > 0 ? `，上涨 ${change_pct}%` : change_pct < 0 ? `，下跌 ${-change_pct}%` : "，持平";
    // 只列出价格变化的日子，避免 30 行重复数字
    const changes = points.filter((p, i) => i === 0 || i === points.length - 1 || p.price !== points[i - 1].price);
    const text = [
      `📈 ${summary.name}（${summary.sku}）近 ${points.length} 天可买最低价走势`,
      "",
      `${points[0].date} ${yuan(first)} → ${points[points.length - 1].date} ${yuan(last)}${trend}`,
      `区间最低 ${yuan(low)}（${dateOf(low)}），最高 ${yuan(high)}（${dateOf(high)}）`,
      "",
      `价格变动：${changes.map((p) => `${p.date} ${yuan(p.price)}`).join("，")}`,
      "",
      `🔗 走势图：${url}`,
    ].join("\n");
    return textResult(text, { ...base, first, last, low, high, change_pct });
  }),
);

// ── list_shops ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_shops",
  {
    title: "列出收录店铺",
    description:
      "按累计销量列出水獭收录的 AI 订阅店铺（卡网、独立站），可按平台筛选；返回店名、平台、销量、在售 SKU 数与店铺链接。",
    inputSchema: {
      limit: z.number().int().min(1).max(30).default(10).describe("返回数量，默认 10，最多 30"),
      platform: z
        .string()
        .optional()
        .describe("按平台过滤，如 ldxp（链动小铺）、aisou、catfk、jrsoft（鲸软）、cardnet、dujiao_next；传错时会列出可选值"),
    },
    outputSchema: {
      total: z.number().describe("符合筛选条件的店铺总数"),
      platforms: z.array(z.string()),
      shops: z.array(
        z.object({
          name: z.string(),
          token: z.string(),
          platform: z.string(),
          sell_count: z.number().nullable(),
          sku_count: z.number(),
          item_count: z.number(),
          url: z.string(),
          shop_page: z.string(),
        }),
      ),
      updated: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async ({ limit, platform }: { limit: number; platform?: string }) => {
    const data = await fetchSiteData();
    const all = data.core.shops_index;
    const platforms = [...new Set(all.map((s) => s.platform))].sort();
    const key = platform?.trim().toLowerCase();
    if (key && !platforms.includes(key)) {
      return errorResult(`没有平台「${platform}」。可选平台：${platforms.join("、")}`);
    }
    const filtered = key ? all.filter((s) => s.platform === key) : all;
    const shops = [...filtered].sort((a, b) => (b.sell_count ?? -1) - (a.sell_count ?? -1)).slice(0, limit);
    const rows = shops.map((s) => ({
      name: cleanShopName(s.name),
      token: s.token,
      platform: s.platform,
      sell_count: s.sell_count,
      sku_count: s.sku_count,
      item_count: s.item_count,
      url: s.url,
      shop_page: `${SITE}/shop/${encodeURIComponent(s.token)}`,
    }));
    const lines = rows.map((s, i) => {
      const sales = s.sell_count != null ? `${s.sell_count.toLocaleString("en-US")} 笔` : "未公开";
      return `${i + 1}. ${s.name}\n   平台：${s.platform} | 销量：${sales} | 在售 SKU：${s.sku_count} | 商品：${s.item_count}\n   店铺：${s.url}`;
    });
    const updated = data.meta.stats.updated;
    return textResult(
      `共 ${filtered.length} 家店铺${key ? `（${key} 平台）` : ""}，按销量排序前 ${rows.length} 家：\n\n${lines.join("\n\n")}\n\n🔗 完整列表：${SITE}/shops\n📅 ${updated}`,
      { total: filtered.length, platforms, shops: rows, updated },
    );
  }),
);

// ── get_site_stats ──────────────────────────────────────────────────────────

server.registerTool(
  "get_site_stats",
  {
    title: "站点统计概览",
    description: "获取水獭比价站整体统计：收录店铺数、Telegram Bot 数、产品种类、商品总数与数据更新时间。",
    inputSchema: {},
    outputSchema: {
      shops: z.number(),
      bots: z.number(),
      skus: z.number(),
      skus_with_price: z.number(),
      items: z.number(),
      updated: z.string(),
      generated_at: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async () => {
    const data = await fetchSiteData();
    const stats = {
      shops: data.core.shops_index.length,
      bots: data.core.bots_index.length,
      skus: data.core.summaries.length,
      skus_with_price: data.core.summaries.filter((s) => shopPrice(data, s.sku) !== null).length,
      items: data.meta.stats.items,
      updated: data.meta.stats.updated,
      generated_at: data.meta.generated_at,
    };
    const topByHits = [...data.core.summaries].sort((a, b) => b.hits - a.hits).slice(0, 5);
    const lines = [
      "📊 水獭 AI 比价站（shuita.xyz）概览",
      "",
      `🏪 收录店铺：${stats.shops} 家`,
      `🤖 收录 Bot：${stats.bots} 个`,
      `📦 产品种类：${stats.skus} 种（${stats.skus_with_price} 种有核验价）`,
      `🛒 商品总数：${stats.items}`,
      "",
      "🔥 广告最活跃的产品：",
      ...topByHits.map((s) => `   ${s.name} — 店内价 ${yuan(shopPrice(data, s.sku)?.min)} 起`),
      "",
      `📅 数据更新时间：${stats.updated}`,
      `🔗 网站：${SITE}`,
    ];
    return textResult(lines.join("\n"), stats);
  }),
);

// ── list_all_products ───────────────────────────────────────────────────────

server.registerTool(
  "list_all_products",
  {
    title: "全部产品一览",
    description: "列出所有可比价的 AI 产品（SKU）及店内到手价区间，方便了解全站覆盖范围。",
    inputSchema: {
      sort: z
        .enum(["price", "hits", "merchants"])
        .default("hits")
        .describe("排序方式：price（店内最低价）、hits（广告热度）、merchants（在售店铺数）"),
      has_price_only: z.boolean().default(false).describe("仅显示有核验价格的产品"),
    },
    outputSchema: {
      total: z.number(),
      products: z.array(z.object(productShape)),
      updated: z.string(),
    },
    annotations: READ_ONLY,
  },
  safe(async ({ sort, has_price_only }: { sort: "price" | "hits" | "merchants"; has_price_only: boolean }) => {
    const data = await fetchSiteData();
    let products = [...data.core.summaries];
    const priceOf = (sku: string) => shopPrice(data, sku);
    if (has_price_only) products = products.filter((s) => priceOf(s.sku) !== null);

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
      const price = p ? `${yuan(p.min)} 起` : "暂无店内核验价";
      return `• ${s.name}（${s.sku}）— ${price}${p?.merchants != null ? `，${p.merchants} 家店铺` : ""}`;
    });
    const label = sort === "price" ? "店内最低价" : sort === "hits" ? "广告热度" : "在售店铺数";
    const updated = data.meta.stats.updated;
    return textResult(`共 ${products.length} 种产品，按${label}排序：\n\n${lines.join("\n")}\n\n📅 ${updated}`, {
      total: products.length,
      products: products.map((s) => productOf(data, s)),
      updated,
    });
  }),
);

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("ai-price-mcp failed to start:", err);
  process.exit(1);
});
