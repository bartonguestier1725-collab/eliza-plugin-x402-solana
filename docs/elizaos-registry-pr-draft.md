# ElizaOS Registry PR

## File to modify
`index.json` in `elizaos-plugins/registry`

## Entry to add
```json
"@hugen/plugin-x402-solana": "github:bartonguestier1725-collab/eliza-plugin-x402-solana"
```

## PR Title
feat: add @hugen/plugin-x402-solana — Solana x402 payment support

## PR Body

```markdown
Adds Solana network support to x402 payments for ElizaOS agents.

The existing `plugin-x402` covers EVM chains. This plugin handles the Solana side — agents can pay for x402-protected APIs using Solana USDC (SPL token on mainnet).

Built on `@x402/svm` and `@x402/fetch` from the Coinbase x402 SDK.

### What it does

- Wraps `fetch()` to handle 402 → Solana USDC payment → retry
- SSRF protection (IPv4, IPv6, IPv4-mapped IPv6, domain allowlist)
- Configurable payment limits and request timeouts
- Supports hex, base58, and JSON array key formats

### Testing

- 38 unit tests (`npm test`)
- E2E verified against a live x402 API with real Solana USDC payment
- Tested on Node.js 24 (requires ≥20 per `@solana/kit`)

### Links

- npm: [@hugen/plugin-x402-solana](https://www.npmjs.com/package/@hugen/plugin-x402-solana)
- GitHub: https://github.com/bartonguestier1725-collab/eliza-plugin-x402-solana
```
