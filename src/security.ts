/**
 * URL validation and SSRF protection for x402 fetch requests.
 *
 * Prevents:
 * - SSRF via private/internal IPs
 * - Wallet drain via unapproved domains
 * - Prompt injection attacks that trick the agent into calling malicious URLs
 */

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

/** Private/internal IP ranges that must never be accessed. */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
];

/** Default max payment per single request in USD. */
const DEFAULT_MAX_PAYMENT_USD = 1.0;

export interface SecurityConfig {
  allowedDomains?: string[];
  maxPaymentUsd?: number;
  allowAnyDomain?: boolean;
}

let config: SecurityConfig = {};

export function configureSecurityPolicy(c: SecurityConfig): void {
  config = c;
}

/**
 * Validate a URL before making an x402 fetch request.
 * Throws if the URL is not allowed.
 */
export function validateUrl(url: string): void {
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

  // Block private/internal IPs
  const hostname = parsed.hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Access to private/internal addresses is blocked: ${hostname}`);
    }
  }

  // Domain allowlist check (unless allowAnyDomain is set)
  if (!config.allowAnyDomain) {
    const allowed = config.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
    const isAllowed = allowed.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
    if (!isAllowed) {
      throw new Error(
        `Domain not in allowlist: ${hostname}. ` +
          `Allowed: ${allowed.join(", ")}. ` +
          `Set allowAnyDomain: true in plugin config to disable this check.`,
      );
    }
  }
}

/** Get the max payment USD threshold. */
export function getMaxPaymentUsd(): number {
  return config.maxPaymentUsd ?? DEFAULT_MAX_PAYMENT_USD;
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
