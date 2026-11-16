import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = {
  schema_version: 1,
  generated_at: "2026-11-16 14:00 UTC",
  stats: { shops: 2, bots: 3, items: 42, updated: "2026-11-16 22:00" },
  products: [
    {
      sku: "gpt_plus_topup", name: "ChatGPT Plus 月付直充", blurb: "Plus 月付直充", hits: 20,
      min_price: 100, max_price: 120, merchants: 2, telegram_min: 80,
    },
    {
      sku: "claude_pro", name: "Claude Pro", blurb: "克劳德 独享", hits: 10,
      min_price: 200, max_price: 200, merchants: 1, telegram_min: null,
    },
  ],
};
const shops = {
  schema_version: 1,
  shops: [
    { token: "shop-a", name: "测试店 A", platform: "catfk", item_count: 9 },
    { token: "shop-b", name: "测试店 B", platform: "aisou", item_count: 5 },
  ],
};
const gptSku = {
  schema_version: 1,
  sku: "gpt_plus_topup",
  shop_floors: [
    {
      sku: "gpt_plus_topup", shop_token: "shop-a", platform: "catfk", price: 100,
      list_price: 98, fee: 2, fee_channel: "支付宝", usdt_price: 96,
      stock_status: "in_stock", stock_count: 4, checked_at: "2026-11-16 13:59 UTC",
    },
    {
      sku: "gpt_plus_topup", shop_token: "shop-b", platform: "aisou", price: 120,
      stock_status: "out", stock_count: 0, checked_at: "2026-11-16 13:58 UTC",
    },
  ],
  price_trend: [["11-15", 110], ["11-16", 100]],
};

test("1.5.0 通过查询切片完成全部七个工具，保留输出并保持缓存", { timeout: 20_000 }, async () => {
  const requests = [];
  const fixture = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://fixture").pathname;
    requests.push({ pathname, ua: req.headers["user-agent"] });
    const bodies = {
      "/api/mcp/index.json": index,
      "/api/mcp/shops.json": shops,
      "/api/mcp/sku/gpt_plus_topup.json": gptSku,
      "/api/mcp/sku/claude_pro.json": { schema_version: 1, sku: "claude_pro", shop_floors: [], price_trend: [] },
    };
    const body = bodies[pathname];
    res.writeHead(body ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body ?? { error: "not found" }));
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: root,
    env: { ...process.env, AI_PRICE_SITE: `http://127.0.0.1:${address.port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  const lines = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  let nextId = 0;
  function rpc(method, params) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} 超时；stderr=${stderr.join("")}`));
      }, 8_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  const call = async (name, args = {}) => rpc("tools/call", { name, arguments: args });

  try {
    await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "ai-price-mcp-test", version: "1.0.0" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    const search = await call("search_products", { query: "克劳德" });
    assert.equal(search.structuredContent.products[0].sku, "claude_pro");
    assert.equal(search.structuredContent.updated, "2026-11-16 22:00");

    const lowest = await call("get_lowest_price", { sku: "gpt_plus_topup" });
    assert.equal(lowest.structuredContent.min_price, 100);
    assert.equal(lowest.structuredContent.cheapest.shop, "测试店 A");
    assert.equal(lowest.structuredContent.cheapest.fee, 2);

    const offers = await call("get_offers", { sku: "gpt_plus_topup", limit: 5 });
    assert.equal(offers.structuredContent.total, 1, "默认排除无货报价");
    assert.equal(offers.structuredContent.offers[0].usdt_price, 96);
    assert.equal(offers.structuredContent.offers[0].stock_count, 4);

    const trend = await call("get_price_trend", { sku: "gpt_plus_topup" });
    assert.equal(trend.structuredContent.first, 110);
    assert.equal(trend.structuredContent.last, 100);
    assert.equal(trend.structuredContent.change_pct, -9.1);

    const shopList = await call("list_shops", { platform: "catfk", limit: 10 });
    assert.equal(shopList.structuredContent.total, 1);
    assert.equal(shopList.structuredContent.shops[0].item_count, 9);

    const products = await call("list_all_products", { sort: "price" });
    assert.equal(products.structuredContent.total, 2);
    assert.equal(products.structuredContent.products[0].sku, "gpt_plus_topup");

    const stats = await call("get_site_stats");
    assert.deepEqual(stats.structuredContent, {
      shops: 2, bots: 3, skus: 2, skus_with_price: 2, items: 42,
      updated: "2026-11-16 22:00", generated_at: "2026-11-16 14:00 UTC",
    });

    const missing = await call("get_offers", { sku: "not_in_catalog" });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /未找到产品/);

    const paths = requests.map((r) => r.pathname);
    assert.ok(paths.every((p) => p.startsWith("/api/mcp/")), "不得回退旧 core/meta 或 HTML 页面");
    assert.equal(paths.filter((p) => p === "/api/mcp/index.json").length, 1, "站点目录使用 5 分钟缓存");
    assert.equal(paths.filter((p) => p === "/api/mcp/shops.json").length, 1, "店铺目录使用 5 分钟缓存");
    assert.equal(paths.filter((p) => p === "/api/mcp/sku/gpt_plus_topup.json").length, 1, "SKU 使用 5 分钟缓存");
    assert.ok(requests.every((r) => r.ua === "shuita-mcp/1.5.0 (+https://shuita.xyz)"));
  } finally {
    lines.close();
    child.kill();
    await new Promise((resolve) => fixture.close(resolve));
    for (const { timer } of pending.values()) clearTimeout(timer);
  }
});
