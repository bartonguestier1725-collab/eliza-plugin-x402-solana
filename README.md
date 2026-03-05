# @hugen/plugin-x402-solana

Solana USDC payments for ElizaOS agents via the [x402 protocol](https://www.x402.org/).

**The first Solana x402 payment plugin for ElizaOS.** Enables agents to pay for any x402-protected API using Solana USDC — automatically handling 402 responses, signing SPL token transfers, and retrying with payment proof.

## Why?

The existing `@elizaos/plugin-x402` only supports EVM chains (Base, Ethereum). This plugin adds **Solana mainnet** support, giving agents access to the growing ecosystem of x402 APIs that accept Solana USDC.

- 75+ x402 API endpoints already accept Solana USDC payments
- Powered by `@x402/svm` (Coinbase official) and `@x402/fetch`
- Zero configuration beyond a Solana private key

## Installation

```bash
npm install @hugen/plugin-x402-solana
```

## Agent Configuration

Add the plugin to your ElizaOS character config:

```json
{
  "plugins": ["@hugen/plugin-x402-solana"],
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "your-base58-encoded-solana-keypair"
    }
  }
}
```

The wallet needs USDC (SPL token) on Solana mainnet and a small amount of SOL for transaction fees.

## How It Works

```
Agent says: "Search Hacker News for AI agent news"
    ↓
Plugin calls: GET https://scout.hugen.tokyo/scout/hn?q=AI+agents
    ↓
Server returns: 402 Payment Required (with Solana USDC payment option)
    ↓
Plugin signs: Solana USDC transfer ($0.005)
    ↓
Plugin retries: GET with X-PAYMENT header
    ↓
Server returns: 200 OK + search results
    ↓
Agent receives: Structured data to answer the user
```

## Available Action

### FETCH_X402_SOLANA

Fetches data from any x402-protected API with automatic Solana USDC payment.

**Parameters:**
| Name | Required | Description |
|------|----------|-------------|
| `url` | Yes | Full URL of the x402 API endpoint |
| `method` | No | HTTP method (GET or POST, default: GET) |
| `body` | No | JSON body for POST requests |

**Example URLs:**
- `https://scout.hugen.tokyo/scout/hn?q=AI+agents` — Search Hacker News ($0.005)
- `https://scout.hugen.tokyo/scout/report?q=MCP+servers` — 14-source intelligence report ($0.005)
- `https://defi.hugen.tokyo/defi/token?chain=1&address=0x...` — Token security audit ($0.005)
- `https://domain.hugen.tokyo/domain/full?domain=example.com` — Full domain intelligence ($0.01)
- `https://intel.hugen.tokyo/intel/token-report` — AI-synthesized token DD ($0.50)

## Technical Details

- Uses `@x402/svm` v2.5.0 (Coinbase official) for Solana transaction signing
- Uses `@x402/fetch` for automatic 402 → payment → retry flow
- Base58 key decoding is self-contained (no `bs58` dependency)
- Compatible with ElizaOS 2.0.0-alpha.3+

## License

MIT
