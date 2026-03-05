/**
 * Action: Fetch an x402-protected API with automatic Solana USDC payment.
 *
 * When the agent needs data from a paid API (scout intelligence, DeFi data,
 * domain analysis, etc.), this action handles the x402 payment flow:
 * 1. Validates URL against domain allowlist and SSRF rules
 * 2. Makes the HTTP request (with timeout)
 * 3. Receives 402 Payment Required
 * 4. Signs a Solana USDC transfer (enforced by payment policy max limit)
 * 5. Retries with payment proof
 * 6. Returns the API response to the agent
 */

import type {
  Action,
  ActionExample,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { getX402Fetch } from "../index.js";
import { validateUrl, maskQueryParams, getFetchTimeoutMs } from "../security.js";

/** Max response body size (4 MB). Prevents OOM on large payloads like base64 images. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

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
      schema: { type: "string", enumValues: ["GET", "POST", "PUT"] },
    },
    {
      name: "body",
      description: "JSON request body for POST/PUT requests.",
      required: false,
      schema: { type: "string" },
    },
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return getX402Fetch(runtime) !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: HandlerOptions | Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const x402Fetch = getX402Fetch(runtime);
    if (!x402Fetch) {
      if (callback) {
        await callback({
          text: "Solana x402 payment is not configured. Set SOLANA_PRIVATE_KEY in agent settings.",
          actions: [],
        });
      }
      return { success: false, error: "x402-solana not initialized" };
    }

    // Extract parameters from HandlerOptions.parameters
    const params =
      (options as HandlerOptions)?.parameters ??
      (options as Record<string, unknown>);
    const url = params?.url as string | undefined;

    if (!url) {
      if (callback) {
        await callback({ text: "No URL provided for the API request.", actions: [] });
      }
      return { success: false, error: "Missing url parameter" };
    }

    // Validate URL against allowlist and SSRF rules
    try {
      validateUrl(url, runtime);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({ text: `URL blocked: ${reason}`, actions: [] });
      }
      return { success: false, error: reason };
    }

    const method = ((params?.method as string) || "GET").toUpperCase();
    const body = params?.body as string | undefined;
    const safeUrl = maskQueryParams(url);

    // H2 fix: Timeout via AbortController
    const timeoutMs = getFetchTimeoutMs(runtime);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.error(`[x402-solana] ${method} ${safeUrl}`);

      const init: RequestInit = { method, signal: controller.signal };
      if (body && (method === "POST" || method === "PUT")) {
        init.body = body;
        init.headers = { "Content-Type": "application/json" };
      }

      const response = await x402Fetch(url, init);

      // L3 fix: Check Content-Length before reading body
      const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
      if (contentLength > MAX_RESPONSE_BYTES) {
        console.error(`[x402-solana] Response too large: ${contentLength} bytes`);
        if (callback) {
          await callback({ text: `Response too large (${contentLength} bytes, max ${MAX_RESPONSE_BYTES})`, actions: [] });
        }
        return { success: false, error: "Response too large" };
      }

      const text = await response.text();

      if (!response.ok) {
        console.error(`[x402-solana] ${safeUrl} → ${response.status}`);
        if (callback) {
          await callback({
            text: `API returned status ${response.status}: ${text.slice(0, 500)}`,
            actions: [],
          });
        }
        return { success: false, error: `HTTP ${response.status}` };
      }

      // Parse as JSON — keep full structure
      let data: Record<string, unknown> | undefined;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        } else {
          data = { result: parsed };
        }
      } catch {
        data = { text: text.slice(0, 4000) };
      }

      console.error(`[x402-solana] OK ${safeUrl} (${text.length}B)`);

      if (callback) {
        const summary = JSON.stringify(data, null, 2).slice(0, 2000);
        await callback({ text: summary, actions: [] });
      }

      // M3 fix: proper cast via unknown to ProviderDataRecord
      return { success: true, data: data as unknown as Record<string, never> };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const displayMsg = isTimeout ? `Request timed out after ${timeoutMs}ms` : message;
      console.error(`[x402-solana] Error on ${safeUrl}: ${displayMsg}`);
      if (callback) {
        await callback({ text: `Failed to fetch: ${displayMsg}`, actions: [] });
      }
      return { success: false, error: displayMsg };
    } finally {
      clearTimeout(timer);
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
