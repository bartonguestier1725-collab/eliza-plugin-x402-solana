/**
 * Shared state for the x402-solana plugin.
 *
 * Extracted to break the circular dependency between index.ts and fetch-x402.ts.
 * Both modules import from here instead of from each other.
 */

import type { IAgentRuntime } from "@elizaos/core";

type X402Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Per-runtime x402 fetch instances */
const fetchMap = new WeakMap<IAgentRuntime, X402Fetch>();

/** Store a fetch instance for a runtime. */
export function setX402Fetch(runtime: IAgentRuntime, fetch: X402Fetch): void {
  fetchMap.set(runtime, fetch);
}

/** Remove a fetch instance for a runtime. */
export function deleteX402Fetch(runtime: IAgentRuntime): void {
  fetchMap.delete(runtime);
}

/** Get the initialized x402 fetch for a runtime. Null if not configured. */
export function getX402Fetch(runtime: IAgentRuntime): X402Fetch | null {
  return fetchMap.get(runtime) ?? null;
}
