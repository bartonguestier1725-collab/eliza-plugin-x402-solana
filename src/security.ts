/**
 * URL validation, SSRF protection, and payment policy for x402 fetch requests.
 *
 * Prevents:
 * - SSRF via private/internal IPs (IPv4 + IPv6 + IPv4-mapped IPv6)
 * - Wallet drain via unapproved domains or excessive payments
 * - Prompt injection attacks that trick the agent into calling malicious URLs
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { PaymentPolicy, PaymentRequirements } from "@x402/fetch";

/** Default allowed domains for x402 API calls. */
const DEFAULT_ALLOWED_DOMAINS = [
  "scout.hugen.tokyo",
  "weather.hugen.tokyo",
  "mailcheck.hugen.tokyo",
  "defi.hugen.tokyo",
  "content.hugen.tokyo",
  "domain.hugen.tokyo",
  "visual.hugen.tokyo",
  "intel.hugen.tokyo",
  "gotobi.hugen.tokyo",
];

/** Private/internal IP patterns (applied to bare hostname, brackets stripped). */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
  /^localhost$/i,
  // IPv4-mapped IPv6: ::ffff:10.x, ::ffff:127.x, ::ffff:192.168.x, etc.
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/i,
];

/** Default max payment per single request in USD. */
const DEFAULT_MAX_PAYMENT_USD = 1.0;

export interface SecurityConfig {
  allowedDomains?: string[];
  maxPaymentUsd?: number;
  allowAnyDomain?: boolean;
}

// --- Per-runtime config storage (#3 fix) ---
const configMap = new WeakMap<IAgentRuntime, SecurityConfig>();
let fallbackConfig: SecurityConfig = {};

export function configureSecurityPolicy(runtime: IAgentRuntime, c: SecurityConfig): void {
  configMap.set(runtime, c);
  fallbackConfig = c;
}

function getConfig(runtime?: IAgentRuntime): SecurityConfig {
  if (runtime) {
    return configMap.get(runtime) ?? fallbackConfig;
  }
  return fallbackConfig;
}

/**
 * Strip IPv6 brackets from hostname for pattern matching.
 * `new URL("https://[::1]").hostname` returns `[::1]`.
 */
function bareHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

/**
 * Convert IPv4-mapped IPv6 hex to IPv4 dotted format.
 * Node.js normalizes `::ffff:127.0.0.1` to `::ffff:7f00:1`.
 * Returns null if not an IPv4-mapped address.
 */
function ipv4MappedToIpv4(bare: string): string | null {
  const m = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!m) return null;
  const hi = parseInt(m[1], 16);
  const lo = parseInt(m[2], 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * Validate a URL before making an x402 fetch request.
 * Throws if the URL is not allowed.
 */
export function validateUrl(url: string, runtime?: IAgentRuntime): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Must be HTTPS
  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS URLs are allowed, got: ${parsed.protocol}`);
  }

  // Block private/internal IPs (strip brackets for IPv6)
  const bare = bareHostname(parsed.hostname);
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(bare)) {
      throw new Error(`Access to private/internal addresses is blocked: ${parsed.hostname}`);
    }
  }

  // IPv4-mapped IPv6: Node normalizes ::ffff:127.0.0.1 → ::ffff:7f00:1 (hex)
  // Decode back to IPv4 and re-check against IPv4 patterns
  const mappedIpv4 = ipv4MappedToIpv4(bare);
  if (mappedIpv4) {
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(mappedIpv4)) {
        throw new Error(`Access to private/internal addresses is blocked: ${parsed.hostname}`);
      }
    }
  }

  // Domain allowlist check (unless allowAnyDomain is set)
  const cfg = getConfig(runtime);
  if (!cfg.allowAnyDomain) {
    const allowed = cfg.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
    const isAllowed = allowed.some(
      (d) => bare === d || bare.endsWith(`.${d}`),
    );
    if (!isAllowed) {
      throw new Error(
        `Domain not in allowlist: ${parsed.hostname}. ` +
          `Allowed: ${allowed.join(", ")}. ` +
          `Set allowAnyDomain: true in plugin config to disable this check.`,
      );
    }
  }
}

/** Get the max payment USD threshold. */
export function getMaxPaymentUsd(runtime?: IAgentRuntime): number {
  return getConfig(runtime).maxPaymentUsd ?? DEFAULT_MAX_PAYMENT_USD;
}

/**
 * Create a PaymentPolicy that rejects payments above a USD threshold.
 * USDC has 6 decimals: $1.00 = "1000000".
 *
 * PaymentPolicy type: (x402Version: number, requirements: PaymentRequirements[]) => PaymentRequirements[]
 */
export function createMaxPaymentPolicy(maxUsd: number): PaymentPolicy {
  const maxBaseUnits = BigInt(Math.floor(maxUsd * 1_000_000));
  return (_version: number, requirements: PaymentRequirements[]): PaymentRequirements[] => {
    return requirements.filter((r) => {
      try {
        return BigInt(r.amount) <= maxBaseUnits;
      } catch {
        return false;
      }
    });
  };
}

/** Mask query parameter values for safe logging. */
export function maskQueryParams(url: string): string {
  try {
    const parsed = new URL(url);
    const masked = new URL(parsed.origin + parsed.pathname);
    for (const [key] of parsed.searchParams) {
      masked.searchParams.set(key, "***");
    }
    return masked.toString();
  } catch {
    return url.split("?")[0] + "?***";
  }
}
