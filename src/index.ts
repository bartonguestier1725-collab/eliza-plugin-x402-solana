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
import { configureSecurityPolicy, getMaxPaymentUsd } from "./security.js";
import { setX402Fetch, deleteX402Fetch } from "./state.js";

// Re-export for external consumers
export { getX402Fetch } from "./state.js";

export const x402SolanaPlugin: Plugin = {
  name: "x402-solana",
  description:
    "Pay for x402-protected APIs with Solana USDC. " +
    "Automatically handles 402 Payment Required responses by signing " +
    "Solana USDC transfers and retrying. Supports all x402-enabled APIs.",

  init: async (pluginConfig: Record<string, string>, runtime: IAgentRuntime) => {
    // Configure security policy per-runtime
    configureSecurityPolicy(runtime, {
      allowedDomains: pluginConfig.allowedDomains?.split(",").map((d) => d.trim()),
      maxPaymentUsd: pluginConfig.maxPaymentUsd
        ? parseFloat(pluginConfig.maxPaymentUsd)
        : undefined,
      allowAnyDomain: pluginConfig.allowAnyDomain === "true",
      fetchTimeoutMs: pluginConfig.fetchTimeoutMs
        ? parseInt(pluginConfig.fetchTimeoutMs, 10)
        : undefined,
    });

    const privateKey =
      runtime.getSetting("SOLANA_PRIVATE_KEY") ??
      runtime.getSetting("WALLET_PRIVATE_KEY");

    if (!privateKey) {
      console.error(
        "[x402-solana] No SOLANA_PRIVATE_KEY or WALLET_PRIVATE_KEY found in settings. " +
          "Plugin will be inactive.",
      );
      deleteX402Fetch(runtime);
      return;
    }

    try {
      const maxUsd = getMaxPaymentUsd(runtime);
      const x402Fetch = await createSolanaX402Fetch(String(privateKey), maxUsd);
      setX402Fetch(runtime, x402Fetch);
      console.error("[x402-solana] Initialized — Solana USDC payments enabled");
    } catch (err) {
      deleteX402Fetch(runtime);
      console.error("[x402-solana] Failed to initialize:", err);
    }
  },

  actions: [fetchX402Action],
};

export default x402SolanaPlugin;
