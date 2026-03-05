# ElizaOS Registry PR Draft

## File to modify
`index.json` in `elizaos-plugins/registry`

## Entry to add
```json
"@hugen/plugin-x402-solana": "github:bartonguestier1725-collab/eliza-plugin-x402-solana"
```

## PR Title
feat: add @hugen/plugin-x402-solana — Solana USDC payments via x402

## PR Body

```markdown
## Summary

First Solana x402 payment plugin for ElizaOS. Enables agents to pay for any x402-protected API using Solana USDC.

- **Payment flow**: Automatic 402 → sign USDC transfer → retry with proof
- **Security**: SSRF protection (IPv4/IPv6/mapped), USDC-only policy, domain allowlist, payment limits, redirect blocking, streaming body reader
- **Powered by**: `@x402/svm` (Coinbase official) + `@x402/fetch`
- **75+ API endpoints** already accept Solana USDC
- **35 tests**, 3 rounds of security review
- MIT licensed

## Links

- npm: `@hugen/plugin-x402-solana`
- GitHub: https://github.com/bartonguestier1725-collab/eliza-plugin-x402-solana
- x402 protocol: https://www.x402.org/

## Test plan

- [x] `npm run build` passes
- [x] `npm test` passes (35 tests)
- [x] Plugin loads via `import { x402SolanaPlugin } from "@hugen/plugin-x402-solana"`
- [ ] E2E: Agent pays for x402 API with Solana USDC (pending)
```
