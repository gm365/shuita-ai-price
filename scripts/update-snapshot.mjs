#!/usr/bin/env node
// 每日行情快照：读 https://shuita.xyz/llms.txt 的「实时行情速查」，改写 README 里
// <!-- snapshot:start --> 与 <!-- snapshot:end --> 之间的表格。
// 只有表格内容变了才写文件（时间戳单独变不算），由 .github/workflows/snapshot.yml 每天跑一次。
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "https://shuita.xyz/llms.txt";
const README = new URL("../README.md", import.meta.url);
const START = "<!-- snapshot:start -->";
const END = "<!-- snapshot:end -->";
const STATS_EN_START = "<!-- stats:en:start -->";
const STATS_EN_END = "<!-- stats:en:end -->";
const STATS_ZH_START = "<!-- stats:zh:start -->";
const STATS_ZH_END = "<!-- stats:zh:end -->";
const MIN_ROWS = 5;

// 接码、邮箱、免费号这类配件不放进 README 快照
const SKIP = new Set([
  "gpt_otp", "claude_otp", "mail_account", "gpt_free", "claude_free", "grok_free", "cursor_free",
  "virtual_card", "apple_id", "tg_account", "x_account", "residential_ip",
  "payment_link", "gv_account",
]);
// 固定顺序：主流订阅在前，减少每天的无谓变动；不在名单里的按品牌分组、再按价格排在后面
const ORDER = [
  "gpt_plus_topup", "gpt_plus_month", "gpt_go", "gpt_pro_5x", "gpt_pro_20x", "gpt_pro_500",
  "gpt_plus_short", "gpt_team_seat", "gpt_team_nonrotation", "gpt_team_rotation", "gpt_team_10x", "codex_credit",
  "claude_pro", "claude_5x", "claude_20x", "claude_team", "claude_kyc",
  "gemini_pro", "gemini_ultra", "antigravity", "grok_super", "grok_super_15x", "grok_heavy",
  "cursor_pro", "cursor_ultra", "muse_account", "api_relay",
];
const GROUPS = ["gpt_", "codex", "claude_", "gemini_", "antigravity", "grok_", "cursor_"];
const NAMES = { api_relay: "API 中转站" };

async function fetchText(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.text();
      last = new Error(`${url} 返回 HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((s) => setTimeout(s, 5000));
  }
  throw last;
}

const LINE =
  /^- \[(.+?)\]\(https:\/\/shuita\.xyz\/sku\/([a-z0-9_]+)\): 可买最低价 ¥([\d.]+)，店内最高 ¥([\d.]+)，(\d+) 家卡网在售(?:；美区官方月价 (\$[\d.]+))?/;
const STATS_LINE = /(\d+)\s*家发卡网与独立小铺[、,]\s*(\d+)\s*件在售商品/;

function displayName(sku, name) {
  if (NAMES[sku]) return NAMES[sku];
  if (sku.startsWith("gpt_") && !/gpt|chatgpt/i.test(name)) return `ChatGPT ${name}`;
  return name;
}

function rank(sku) {
  const i = ORDER.indexOf(sku);
  if (i !== -1) return [0, i];
  const g = GROUPS.findIndex((p) => sku.startsWith(p));
  return [1, g === -1 ? GROUPS.length : g];
}

function parse(text) {
  const section = text.split("## 实时行情速查")[1]?.split("\n## ")[0] ?? "";
  const rows = [];
  for (const line of section.split("\n")) {
    const m = LINE.exec(line.trim());
    if (!m) continue;
    const [, name, sku, min, max, shops, official] = m;
    if (SKIP.has(sku)) continue;
    rows.push({ name: displayName(sku, name), sku, min: Number(min), max: Number(max), shops: Number(shops), official });
  }
  rows.sort((a, b) => {
    const [ra, rb] = [rank(a.sku), rank(b.sku)];
    return ra[0] - rb[0] || ra[1] - rb[1] || a.min - b.min;
  });
  const stamp = /数据更新状态：(\d+)月(\d+)日 (\d{1,2}:\d{2})/.exec(text);
  const statsMatch = STATS_LINE.exec(text);
  const stats = statsMatch
    ? { shops: Number(statsMatch[1]), listings: Number(statsMatch[2]) }
    : null;
  return { rows, stamp, stats };
}

function stampLabel(stamp) {
  if (!stamp) return "";
  const now = new Date();
  const [, mo, d, hm] = stamp;
  let year = now.getUTCFullYear();
  if (Number(mo) > now.getUTCMonth() + 1) year -= 1; // 1 月初读到 12 月的数据
  return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")} ${hm}`;
}

const yuan = (n) => `¥${n}`;

function table(rows) {
  return [
    "| 产品 | SKU | 低至 | 店内最高 | 在售店铺 | 美区官方月价 |",
    "| :--- | :--- | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (r) =>
        `| [${r.name}](https://shuita.xyz/sku/${r.sku}) | \`${r.sku}\` | ${yuan(r.min)} | ${yuan(r.max)} | ${r.shops} | ${r.official ?? "—"} |`,
    ),
  ].join("\n");
}

function replaceOptionalMarker(text, start, end, nextInner) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) return { text, changed: false };
  if (text.slice(a + start.length, b) === nextInner) return { text, changed: false };
  return {
    text: text.slice(0, a + start.length) + nextInner + text.slice(b),
    changed: true,
  };
}

const { rows, stamp, stats } = parse(await fetchText(SOURCE));
if (rows.length < MIN_ROWS) {
  console.error(`只解析到 ${rows.length} 行，llms.txt 格式可能变了，不改 README`);
  process.exit(1);
}

const readme = readFileSync(README, "utf8");
const a = readme.indexOf(START);
const b = readme.indexOf(END);
if (a === -1 || b === -1 || b < a) {
  console.error("README 里找不到 snapshot 标记");
  process.exit(1);
}
const oldBlock = readme.slice(a + START.length, b);
const newTable = table(rows);
const tableChanged = !oldBlock.includes(newTable);

let nextReadme = readme;
if (tableChanged) {
  const block = `
数据时间：${stampLabel(stamp)}（北京时间），每天自动从 [shuita.xyz/llms.txt](https://shuita.xyz/llms.txt) 刷新。只作量级参考，实时价格以 MCP 返回或商品页为准。「低至」是公开有货店铺里的最低人民币到手价；同一产品的低价往往对应短效、拼车或短质保等不同规格。

${newTable}
`;
  nextReadme = readme.slice(0, a + START.length) + block + readme.slice(b);
}

let statsChanged = false;
if (stats) {
  const enStats = `**${stats.shops} verified shops · ${stats.listings} in-stock listings · 70+ products** (refreshed daily; \`get_site_stats\` returns live numbers).`;
  const zhStats = `${stats.shops} 家店铺、${stats.listings} 件在售商品、70+ 种产品`;
  const resEn = replaceOptionalMarker(nextReadme, STATS_EN_START, STATS_EN_END, enStats);
  nextReadme = resEn.text;
  const resZh = replaceOptionalMarker(nextReadme, STATS_ZH_START, STATS_ZH_END, zhStats);
  nextReadme = resZh.text;
  statsChanged = resEn.changed || resZh.changed;
}

if (!tableChanged && !statsChanged) {
  console.log(`表格与统计均无变化（${rows.length} 行），不改 README`);
  process.exit(0);
}

writeFileSync(README, nextReadme);
console.log(
  `已更新快照：${rows.length} 行（table=${tableChanged}, stats=${statsChanged}），数据时间 ${stampLabel(stamp)}`,
);
