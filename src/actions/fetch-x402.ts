/**
 * Action: Fetch an x402-protected API with automatic Solana USDC payment.
 *
 * When the agent needs data from a paid API (scout intelligence, DeFi data,
 * domain analysis, etc.), this action handles the x402 payment flow:
 * 1. Makes the HTTP request
 * 2. Receives 402 Payment Required
 * 3. Signs a Solana USDC transfer
 * 4. Retries with payment proof
 * 5. Returns the API response to the agent
 */

import type {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { getX402Fetch } from "../index.js";

export const fetchX402Action: Action = {
  name: "FETCH_X402_SOLANA",
  description:
    "Fetch data from an x402-protected API, paying with Solana USDC. " +
    "Use this when you need to access paid intelligence APIs like scout " +
    "(multi-source search), DeFi security data, domain intelligence, " +
    "weather data, email validation, or any x402-enabled service. " +
    "Payment is automatic — the agent's Solana wallet pays USDC directly.",

  similes: [
    "pay for API with Solana",
    "x402 Solana payment",
    "fetch paid API",
    "search with scout",
    "get intelligence report",
    "access paid endpoint",
  ],

  parameters: [
    {
      name: "url",
      description:
        "Full URL of the x402-protected API endpoint. " +
        "Examples: https://scout.hugen.tokyo/scout/hn?q=AI+agents, " +
        "https://defi.hugen.tokyo/defi/token?chain=1&address=0x...",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "method",
      description: "HTTP method. Defaults to GET.",
      required: false,
      schema: { type: "string", enumValues: ["GET", "POST"] },
    },
    {
      name: "body",
      description: "JSON request body for POST requests.",
      required: false,
      schema: { type: "string" },
    },
  ],

  validate: async (_runtime: IAgentRuntime): Promise<boolean> => {
    return getX402Fetch() !== null;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const x402Fetch = getX402Fetch();
    if (!x402Fetch) {
      if (callback) {
        await callback({
          text: "Solana x402 payment is not configured. Set SOLANA_PRIVATE_KEY in agent settings.",
          actions: [],
        });
      }
      return { success: false, error: "x402-solana not initialized" };
    }

    const url = options?.url as string;
    if (!url) {
      if (callback) {
        await callback({ text: "No URL provided for the API request.", actions: [] });
      }
      return { success: false, error: "Missing url parameter" };
    }

    const method = ((options?.method as string) || "GET").toUpperCase();
    const body = options?.body as string | undefined;

    try {
      console.error(`[x402-solana] ${method} ${url}`);

      const init: RequestInit = { method };
      if (body && (method === "POST" || method === "PUT")) {
        init.body = body;
        init.headers = { "Content-Type": "application/json" };
      }

      const response = await x402Fetch(url, init);
      const text = await response.text();

      if (!response.ok) {
        console.error(`[x402-solana] Response ${response.status}: ${text.slice(0, 200)}`);
        if (callback) {
          await callback({
            text: `API returned status ${response.status}: ${text.slice(0, 500)}`,
            actions: [],
          });
        }
        return { success: false, error: `HTTP ${response.status}` };
      }

      // Try to parse as JSON for structured response
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      console.error(`[x402-solana] Success: ${url} (${text.length} bytes)`);

      if (callback) {
        const summary =
          typeof data === "object" && data !== null
            ? JSON.stringify(data, null, 2).slice(0, 2000)
            : String(data).slice(0, 2000);
        await callback({ text: summary, actions: [] });
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[x402-solana] Error: ${message}`);
      if (callback) {
        await callback({ text: `Failed to fetch: ${message}`, actions: [] });
      }
      return { success: false, error: message };
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Search Hacker News for AI agent news" },
      },
      {
        name: "assistant",
        content: {
          text: "I'll search Hacker News for AI agent news using the Scout API.",
          actions: ["FETCH_X402_SOLANA"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "Get a multi-source intelligence report on MCP servers" },
      },
      {
        name: "assistant",
        content: {
          text: "I'll generate a multi-source intelligence report on MCP servers.",
          actions: ["FETCH_X402_SOLANA"],
        },
      },
    ],
  ] as ActionExample[][],
};
