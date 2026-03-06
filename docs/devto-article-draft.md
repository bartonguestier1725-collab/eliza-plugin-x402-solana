---
title: "Adding Solana Payments to ElizaOS: What I Learned About SSRF, Floating-Point, and IPv6"
published: false
description: Notes on building an x402 Solana payment plugin for ElizaOS — SSRF edge cases, floating-point traps, and SDK migration surprises
tags: solana, ai, web3, typescript
cover_image:
---

I spent the past couple of weeks adding Solana USDC payment support to ElizaOS via the x402 protocol. The payment flow itself was straightforward. The security and edge cases were not. This post is mostly about the latter.

## Context

[ElizaOS](https://github.com/elizaos/eliza) is an AI agent framework popular in the Solana ecosystem. The [x402 protocol](https://www.x402.org/) (by Coinbase) lets HTTP clients pay for API calls automatically — when a server responds with `402 Payment Required`, the client signs a USDC transfer and retries.

There was already an EVM-only x402 plugin for ElizaOS (`@elizaos/plugin-x402`). Coinbase had also shipped `@x402/svm` — a Solana client implementation. But nobody had connected the two. So I did.

The plugin itself is about 500 lines across 6 files. The interesting part wasn't wiring up the payment — it was everything that could go wrong.

## The IPv6 hex normalization problem

An ElizaOS agent takes URLs from conversation. That makes it an SSRF vector. A prompt injection could tell the agent to fetch `https://169.254.169.254/latest/meta-data/` (the AWS metadata endpoint), or any internal service.

Blocking private IP ranges sounds simple. It isn't.

Node.js normalizes IPv4-mapped IPv6 addresses into hex. If someone passes `::ffff:127.0.0.1`, Node resolves it and stores the IP as `::ffff:7f00:1`. A regex checking for `127.` never sees the string "127" — it's been rewritten to `7f00:1`.

The fix: parse the resolved address, detect `::ffff:` prefixed hex, extract the four hex bytes, convert back to dotted decimal, and then run the private-range check against that.

```typescript
// ::ffff:7f00:1 → extract 7f00 and 0001 → 127.0.0.1
const hex = address.split("::ffff:")[1]; // "7f00:1"
const parts = hex.split(":");
const hi = parseInt(parts[0], 16);
const lo = parseInt(parts[1] || "0", 16);
const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
```

This catches `::ffff:7f00:1`, `::ffff:a9fe:a9fe` (169.254.x.x), `::ffff:ac10:fe01` (172.16.x.x), and every other mapped private address.

## The floating-point trap at exactly $0.005

USDC on Solana has 6 decimal places. To convert dollars to micro-units:

```typescript
Math.floor(0.005 * 1_000_000) // Expected: 5000. Actual: 4999.
```

IEEE 754 represents `0.005` as `0.00499999999999999...`. `Math.floor` truncates it to `4999`. This means a payment policy with a `$0.005` max would silently reject legitimate `$0.005` charges — which happens to be the most common price point for x402 APIs.

`Math.round` fixes it. But it's the kind of bug that passes every test unless you specifically test the boundary value.

## Redirect chains bypass domain allowlists

The plugin has a domain allowlist. But if `allowed-domain.com` returns a `302` to `evil.com`, the default `fetch` behavior follows the redirect transparently. The domain check passed on the original URL; the actual request hits a completely different host.

The fix is `redirect: "error"` in the fetch options. Any redirect becomes an exception instead of being followed silently.

## Don't trust Content-Length

A malicious server can set `Content-Length: 42` and then stream gigabytes. If you allocate a buffer based on the header and then read the body, you're at the mercy of the server.

The response body reader ignores `Content-Length` entirely. It reads chunks incrementally with a hard 4MB cap. If the stream exceeds that, it aborts.

## USDC-only payment policy

The x402 protocol is token-agnostic — a server can request payment in any SPL token. Without validation, a compromised or malicious server could request 1 unit of some high-value token instead of USDC. The payment policy rejects anything that isn't USDC on Solana mainnet:

```typescript
if (asset !== USDC_SOLANA_MAINNET) {
  return { accept: false, reason: "Only USDC payments accepted" };
}
```

## @solana/kit v2 vs @solana/web3.js keypair formats

ElizaOS uses `@solana/web3.js` v1, where a keypair is a `Uint8Array(64)` (32 bytes secret + 32 bytes public). The `@x402/svm` client expects `@solana/kit` (the v2 rewrite), where a `CryptoKeyPair` is an opaque object created via `createKeyPairFromBytes`.

The migration isn't just a type change — `createKeyPairFromBytes` is async, the key extraction methods are async, and the underlying representation uses the Web Crypto API. Getting the two to coexist required converting at the boundary rather than trying to share a single keypair type.

## Circular references and state isolation

ElizaOS plugins share a single runtime. If `client.ts` imports from `index.ts` to access initialization state, and `index.ts` imports from `client.ts` to set up the client, you get a circular dependency that silently resolves to `undefined`.

The fix was extracting shared state into `state.ts` using a `WeakMap` keyed by the runtime instance. Both files import from `state.ts`; neither imports from each other.

## Using it

```bash
npm install @hugen/plugin-x402-solana
```

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

The agent can then call any x402 API that accepts Solana USDC. When the server responds with 402, the plugin handles the payment and retry automatically.

Code is MIT licensed: [github.com/bartonguestier1725-collab/eliza-plugin-x402-solana](https://github.com/bartonguestier1725-collab/eliza-plugin-x402-solana)

---

*If you're building x402 integrations and hit similar edge cases, I'm happy to compare notes in the comments.*
