---
title: I Built the First Solana Payment Plugin for ElizaOS AI Agents
published: false
description: How I enabled AI agents to pay for APIs with Solana USDC using the x402 protocol — and why I gave it away for free
tags: solana, ai, web3, typescript
cover_image:
---

AI agents are getting wallets. They're browsing the web, calling APIs, and — increasingly — paying for things. But until now, ElizaOS agents could only pay with EVM chains like Base and Ethereum.

I built the first plugin that lets ElizaOS agents pay with **Solana USDC**.

## The Gap I Found

[ElizaOS](https://github.com/elizaos/eliza) is the dominant AI agent framework in the Solana ecosystem, created by [ai16z](https://twitter.com/ai16zdao). Thousands of agents run on it.

The [x402 protocol](https://www.x402.org/) (by Coinbase) enables HTTP 402 micropayments — agents automatically pay small amounts of USDC to access paid APIs. Think of it as "pay-per-API-call" for AI agents.

There was already an x402 plugin for ElizaOS (`@elizaos/plugin-x402`), but when I read its source code, I found something surprising:

```typescript
// networks.ts from plugin-x402
export const NETWORK_REGISTRY = {
  base: { caip2: "eip155:8453", ... },
  ethereum: { caip2: "eip155:1", ... },
  // That's it. No Solana.
};
```

**Zero Solana support.** ElizaOS agents — running on a Solana-native framework — couldn't pay for x402 APIs with Solana USDC.

Meanwhile, Coinbase had already built `@x402/svm` — a complete Solana implementation of the x402 client. The building blocks existed. Nobody had connected them to ElizaOS.

## The Build

The plugin is ~500 lines of TypeScript across 6 files:

```
src/
├── index.ts       # Plugin definition + init
├── state.ts       # Per-runtime state (WeakMap)
├── client.ts      # x402 SVM client setup
├── security.ts    # SSRF protection + payment policy
├── actions/
│   └── fetch-x402.ts  # The main action
└── __tests__/
    └── security.test.ts  # 35 tests
```

### How It Works

```
Agent: "Search Hacker News for AI agent news"
  ↓
Plugin: GET https://scout.hugen.tokyo/scout/hn?q=AI+agents
  ↓
Server: 402 Payment Required (Solana USDC option)
  ↓
Plugin: Signs USDC transfer ($0.005) → retries with proof
  ↓
Server: 200 OK + search results
  ↓
Agent: Here are the top AI agent discussions on HN...
```

The core is simple — `@x402/fetch` wraps `fetch()` to automatically handle 402 responses:

```typescript
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { toClientSvmSigner } from "@x402/svm";

const client = new x402Client();
registerExactSvmScheme(client, {
  signer: toClientSvmSigner(solanaKeypair),
  networks: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
});

const fetchWithPay = wrapFetchWithPayment(fetch, client);
// Now any 402 response triggers automatic Solana USDC payment
```

### Security Was the Hard Part

The interesting engineering wasn't the payment flow — it was making it safe:

**SSRF Protection**: An AI agent accepting URLs from conversation is an SSRF vector. A prompt injection could make the agent call `https://[::ffff:169.254.169.254]/metadata` (AWS metadata endpoint via IPv4-mapped IPv6). Node.js normalizes this to hex (`[::ffff:a9fe:a9fe]`), so naive regex checks miss it. I decode the hex back to IPv4 for checking.

**USDC-Only Policy**: The x402 protocol lets servers request payment in any SPL token. Without validation, a malicious server could request 1 unit of a high-value token. The payment policy now explicitly checks that `asset === USDC_SOLANA_MAINNET`.

**Payment Limits**: `Math.floor(0.005 * 1_000_000)` = `4999` (not `5000`). This floating-point truncation would silently reject payments at exactly $0.005 — the most common API price point. `Math.round` fixes it.

**Redirect Blocking**: `redirect: "error"` prevents 302/307 chains that could bypass the domain allowlist.

**Streaming Body Reader**: Don't trust `Content-Length`. A malicious server can claim `Content-Length: 0` while streaming gigabytes. The response body is read chunk-by-chunk with a hard 4MB limit.

## 75+ APIs Already Accept Solana USDC

The plugin isn't theoretical. There are 75+ x402 API endpoints already accepting Solana USDC payments:

- **Multi-source intelligence search** (Hacker News, GitHub, npm, PyPI, ArXiv, and 14 more sources)
- **DeFi security audits** (token security, rug pull detection, bridge quotes)
- **Domain intelligence** (WHOIS, DNS, SSL, tech stack, subdomains)
- **Content analysis** (extraction, summarization, sentiment analysis)
- **AI-synthesized reports** (token due diligence, wallet intelligence, yield scans)

## Try It

```bash
npm install @hugen/plugin-x402-solana
```

Add to your ElizaOS character config:

```json
{
  "plugins": ["@hugen/plugin-x402-solana"],
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "your-base58-keypair"
    }
  }
}
```

The code is MIT licensed: [GitHub](https://github.com/bartonguestier1725-collab/eliza-plugin-x402-solana)

## Why Give It Away?

The plugin is free. The APIs behind it aren't. Every agent that installs this plugin gets access to 75+ paid endpoints. The plugin is the railroad; the APIs are the stations.

More agents using this plugin = more API calls = the ecosystem grows. Even if someone forks it, the payments still flow to whichever x402 API the agent calls.

---

*Built with `@x402/svm` (Coinbase), `@x402/fetch`, and ElizaOS 2.0. 35 tests, 3 rounds of security review, 500 lines of TypeScript.*
