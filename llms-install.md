# Installing the shuita AI Price MCP server (`ai-price-mcp`)

Instructions for AI agents (Cline, Claude Code, Cursor, etc.) installing this MCP server for a user.

## Summary

- Package: [`ai-price-mcp`](https://www.npmjs.com/package/ai-price-mcp) on npm (official MCP Registry name: `xyz.shuita/ai-price`)
- Transport: stdio
- Requirements: Node.js 18 or later (`node -v`), plus `npx` (ships with npm)
- API keys / environment variables: **none**. Do not ask the user for any key.
- Do not clone or build this repository. The published npm package is the supported install path.
- Network: the server fetches public static JSON from `https://shuita.xyz/data/` (cached in memory for 5 minutes). Read-only; it sends no user data.

## Step 1: Check Node.js

Run:

```bash
node -v
```

If the major version is below 18, or Node is missing, ask the user to install Node.js 18+ from https://nodejs.org and stop until it is installed.

## Step 2: Add the server to the MCP settings

Add this entry under `mcpServers` in the client's MCP settings file. For Cline this is `cline_mcp_settings.json`: open it from the MCP Servers panel → Configure → "Configure MCP Servers". For the Cline CLI it is `~/.cline/data/settings/cline_mcp_settings.json`. Keep any servers that are already there.

```json
{
  "mcpServers": {
    "ai-price": {
      "command": "npx",
      "args": ["-y", "ai-price-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Use `ai-price` as the server name.

Windows: if the server fails to start with `npx` not found, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "ai-price-mcp"]`.

Other clients:
- Claude Code: `claude mcp add ai-price -- npx -y ai-price-mcp`
- Cline CLI: `cline mcp add ai-price --yes -- npx -y ai-price-mcp`
- Claude Desktop / Cursor / Windsurf: use the same `command` / `args` JSON as above in that client's MCP config file.

## Step 3: Verify

After saving, the server should show as connected with these 5 tools:

| Tool | Arguments | Purpose |
| :--- | :--- | :--- |
| `search_products` | `query` (string, Chinese or English, e.g. `"Claude Pro"`) | Find products, their in-shop price range, and how many shops have stock |
| `get_lowest_price` | `sku` (string, e.g. `"claude_pro"`, `"gpt_plus_short"`) | Lowest verified in-stock price, description, and detail-page link for one SKU |
| `list_shops` | `limit` (1–30, default 10), optional `platform` | Shops ranked by sales volume |
| `list_all_products` | `sort` (`price` / `hits` / `merchants`), `has_price_only` (bool) | Browse every tracked product |
| `get_site_stats` | none | Number of shops and products tracked, and when the data was last updated |

To confirm it works, call `get_site_stats` (no arguments). It should return shop and product counts and a "数据更新时间" (last updated) line. Output is in Chinese and prices are in CNY (¥).

Tip: SKUs are not guessable. Call `search_products` first, then pass the SKU shown in parentheses to `get_lowest_price`.

## Troubleshooting

- **First start is slow (a few seconds):** `npx` downloads the package the first time it runs. Later starts are fast.
- **`npx` / `node` not found:** Node.js is missing or not on PATH. Install Node.js 18+ and restart the editor.
- **Tool call returns an error such as `fetch failed` or `Failed to fetch core.json: 403`:** the machine cannot reach `https://shuita.xyz`. Check the network or proxy, then restart the server.
- **`未找到产品「…」` ("product not found"):** the SKU is wrong. Use `search_products` to get valid SKUs.

## Links

- Website: https://shuita.xyz
- MCP docs: https://shuita.xyz/mcp
- Source: https://github.com/gm365/shuita-ai-price/tree/main/mcp
