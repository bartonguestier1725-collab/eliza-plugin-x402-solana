/**
 * Tests for security (URL validation, SSRF protection, IPv6) and base58 decoding.
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { validateUrl, maskQueryParams, configureSecurityPolicy, createMaxPaymentPolicy } from "../security.js";
import { decodeBase58, parsePrivateKey } from "../client.js";

// Minimal mock runtime for per-runtime config
const mockRuntime = {} as Parameters<typeof configureSecurityPolicy>[0];

beforeEach(() => {
  configureSecurityPolicy(mockRuntime, {});
});

// --- Base58 Decoding (#4 fix) ---

describe("decodeBase58", () => {
  it("decodes '1' to exactly 1 zero byte", () => {
    const result = decodeBase58("1");
    assert.equal(result.length, 1);
    assert.equal(result[0], 0);
  });

  it("decodes '11' to exactly 2 zero bytes", () => {
    const result = decodeBase58("11");
    assert.equal(result.length, 2);
    assert.equal(result[0], 0);
    assert.equal(result[1], 0);
  });

  it("decodes '2' to [1]", () => {
    const result = decodeBase58("2");
    assert.equal(result.length, 1);
    assert.equal(result[0], 1);
  });

  it("decodes '1A' to [0, 9]", () => {
    // '1' = leading zero, 'A' = index 9 in base58
    const result = decodeBase58("1A");
    assert.equal(result.length, 2);
    assert.equal(result[0], 0);
    assert.equal(result[1], 9);
  });

  it("throws on invalid base58 characters", () => {
    assert.throws(() => decodeBase58("0OIl"), /Invalid base58 character/);
  });
});

// --- parsePrivateKey ---

describe("parsePrivateKey", () => {
  it("parses JSON array format", () => {
    const jsonKey = JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
    const result = parsePrivateKey(jsonKey);
    assert.equal(result.length, 64);
    assert.equal(result[0], 0);
    assert.equal(result[63], 63);
  });

  it("rejects invalid JSON array values", () => {
    assert.throws(() => parsePrivateKey("[256, 0, 0]"), /numbers 0-255/);
  });

  it("rejects non-array JSON (object with { triggers base58 error)", () => {
    assert.throws(() => parsePrivateKey('{"key": "value"}'), /Invalid base58 character/);
  });

  it("trims whitespace before parsing", () => {
    const jsonKey = "  " + JSON.stringify(Array.from({ length: 64 }, () => 42)) + "  ";
    const result = parsePrivateKey(jsonKey);
    assert.equal(result.length, 64);
  });

  it("falls back to base58 for non-JSON input", () => {
    const result = parsePrivateKey("2");
    assert.ok(result.length > 0);
  });
});

// --- URL Validation ---

describe("validateUrl", () => {
  it("allows known hugen.tokyo domains", () => {
    configureSecurityPolicy(mockRuntime, {});
    assert.doesNotThrow(() => validateUrl("https://scout.hugen.tokyo/scout/hn?q=test", mockRuntime));
    assert.doesNotThrow(() => validateUrl("https://defi.hugen.tokyo/defi/token?chain=1", mockRuntime));
    assert.doesNotThrow(() => validateUrl("https://intel.hugen.tokyo/intel/token-report", mockRuntime));
  });

  it("blocks unknown domains by default", () => {
    configureSecurityPolicy(mockRuntime, {});
    assert.throws(() => validateUrl("https://evil.com/steal", mockRuntime), /not in allowlist/);
  });

  it("blocks HTTP (non-HTTPS)", () => {
    configureSecurityPolicy(mockRuntime, {});
    assert.throws(() => validateUrl("http://scout.hugen.tokyo/scout/hn", mockRuntime), /Only HTTPS/);
  });

  it("blocks private IPv4 addresses", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://127.0.0.1/admin", mockRuntime), /private.*internal/i);
    assert.throws(() => validateUrl("https://10.0.0.1/secret", mockRuntime), /private.*internal/i);
    assert.throws(() => validateUrl("https://192.168.1.1/api", mockRuntime), /private.*internal/i);
    assert.throws(() => validateUrl("https://172.16.0.1/api", mockRuntime), /private.*internal/i);
  });

  it("blocks localhost", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://localhost/api", mockRuntime), /private.*internal/i);
  });

  // #1 fix: IPv6 SSRF
  it("blocks IPv6 loopback [::1]", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://[::1]/admin", mockRuntime), /private.*internal/i);
  });

  it("blocks IPv6 link-local [fe80::]", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://[fe80::1]/api", mockRuntime), /private.*internal/i);
  });

  it("blocks IPv6 ULA [fc00::]", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://[fc00::1]/api", mockRuntime), /private.*internal/i);
  });

  it("blocks IPv4-mapped IPv6 [::ffff:169.254.169.254] (cloud metadata)", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://[::ffff:169.254.169.254]/metadata", mockRuntime), /private.*internal/i);
  });

  it("blocks IPv4-mapped IPv6 [::ffff:127.0.0.1]", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://[::ffff:127.0.0.1]/admin", mockRuntime), /private.*internal/i);
  });

  it("blocks IPv4-mapped IPv6 [::ffff:10.0.0.1]", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.throws(() => validateUrl("https://[::ffff:10.0.0.1]/secret", mockRuntime), /private.*internal/i);
  });

  it("allows custom domain allowlist", () => {
    configureSecurityPolicy(mockRuntime, { allowedDomains: ["api.example.com"] });
    assert.doesNotThrow(() => validateUrl("https://api.example.com/data", mockRuntime));
    assert.throws(() => validateUrl("https://scout.hugen.tokyo/scout/hn", mockRuntime), /not in allowlist/);
  });

  it("allows any domain when configured", () => {
    configureSecurityPolicy(mockRuntime, { allowAnyDomain: true });
    assert.doesNotThrow(() => validateUrl("https://any-public-api.com/endpoint", mockRuntime));
  });

  it("rejects invalid URLs", () => {
    configureSecurityPolicy(mockRuntime, {});
    assert.throws(() => validateUrl("not-a-url", mockRuntime), /Invalid URL/);
  });
});

// --- Payment Policy (#2 fix) ---

describe("createMaxPaymentPolicy", () => {
  it("allows payments under the limit", () => {
    const policy = createMaxPaymentPolicy(1.0); // $1.00
    const requirements = [{ amount: "500000", scheme: "exact", network: "solana:mainnet" }]; // $0.50
    const filtered = policy(2, requirements as never[]);
    assert.equal(filtered.length, 1);
  });

  it("rejects payments over the limit", () => {
    const policy = createMaxPaymentPolicy(1.0); // $1.00
    const requirements = [{ amount: "2000000", scheme: "exact", network: "solana:mainnet" }]; // $2.00
    const filtered = policy(2, requirements as never[]);
    assert.equal(filtered.length, 0);
  });

  it("allows exactly the limit", () => {
    const policy = createMaxPaymentPolicy(0.50); // $0.50
    const requirements = [{ amount: "500000", scheme: "exact", network: "solana:mainnet" }]; // $0.50
    const filtered = policy(2, requirements as never[]);
    assert.equal(filtered.length, 1);
  });

  it("handles invalid amount strings", () => {
    const policy = createMaxPaymentPolicy(1.0);
    const requirements = [{ amount: "not-a-number", scheme: "exact" }];
    const filtered = policy(2, requirements as never[]);
    assert.equal(filtered.length, 0);
  });

  // H1 fix: Math.round prevents floating point truncation
  it("allows $0.005 payment with maxPaymentUsd=0.005 (floating point safe)", () => {
    const policy = createMaxPaymentPolicy(0.005); // $0.005
    const requirements = [{ amount: "5000", scheme: "exact", network: "solana:mainnet" }]; // exactly $0.005 = 5000 base units
    const filtered = policy(2, requirements as never[]);
    assert.equal(filtered.length, 1, "Math.round should produce 5000, not 4999");
  });
});

// --- Query Masking ---

describe("maskQueryParams", () => {
  it("masks query parameter values", () => {
    const masked = maskQueryParams("https://scout.hugen.tokyo/scout/hn?q=secret&per_page=5");
    assert.ok(masked.includes("q=***"));
    assert.ok(masked.includes("per_page=***"));
    assert.ok(!masked.includes("secret"));
    assert.ok(!masked.includes("=5"));
  });

  it("preserves URL without query params", () => {
    const masked = maskQueryParams("https://scout.hugen.tokyo/health");
    assert.equal(masked, "https://scout.hugen.tokyo/health");
  });

  it("handles malformed URLs gracefully", () => {
    const masked = maskQueryParams("not-a-url?key=val");
    assert.ok(!masked.includes("val"));
  });
});
