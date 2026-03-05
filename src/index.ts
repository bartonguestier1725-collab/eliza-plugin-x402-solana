/**
 * @hugen/plugin-x402-solana
 *
 * Solana USDC payments for ElizaOS agents via the x402 protocol.
 * Enables agents to pay for any x402-protected API using Solana USDC.
 *
 * The first Solana x402 payment plugin for ElizaOS.
 */

import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { fetchX402Action } from "./actions/fetch-x402.js";
import { createSolanaX402Fetch } from "./client.js";

/** Module-level x402 fetch — initialized once in plugin init. */
let x402Fetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;

/** Get the initialized x402 fetch. Null if plugin not configured. */
export function getX402Fetch() {
  return x402Fetch;
}

export const x402SolanaPlugin: Plugin = {
  name: "x402-solana",
  description:
    "Pay for x402-protected APIs with Solana USDC. " +
    "Automatically handles 402 Payment Required responses by signing " +
    "Solana USDC transfers and retrying. Supports all x402-enabled APIs.",

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    const privateKey =
      runtime.getSetting("SOLANA_PRIVATE_KEY") ??
      runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!privateKey) {
      console.error(
        "[x402-solana] No SOLANA_PRIVATE_KEY or WALLET_PRIVATE_KEY found in settings. " +
          "Plugin will be inactive.",
      );
      return;
    }

    try {
      x402Fetch = await createSolanaX402Fetch(String(privateKey));
      console.error("[x402-solana] Initialized — Solana USDC payments enabled");
    } catch (err) {
      console.error("[x402-solana] Failed to initialize:", err);
    }
  },

  actions: [fetchX402Action],
};

export default x402SolanaPlugin;
