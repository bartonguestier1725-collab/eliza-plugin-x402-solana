/**
 * Tests for security (URL validation, SSRF protection) and base58 decoding.
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateUrl, maskQueryParams, configureSecurityPolicy } from "../security.js";
import { decodeBase58, parsePrivateKey } from "../client.js";

// --- Base58 Decoding ---

describe("decodeBase58", () => {
  it("decodes a known Solana address correctly", () => {
    // "1" in base58 = 0x00
    const result = decodeBase58("1");
    assert.equal(result[result.length - 1], 0);
  });

  it("decodes a short base58 string", () => {
    // "2" = 1 in base58 alphabet (index 1)
    const result = decodeBase58("2");
    assert.equal(result[result.length - 1], 1);
  });

  it("throws on invalid base58 characters", () => {
    assert.throws(() => decodeBase58("0OIl"), /Invalid base58 character/);
  });

  it("handles leading 1s as zero bytes", () => {
    const result = decodeBase58("111");
    // Three leading 1s = at least 3 bytes, all zero-related
    assert.ok(result.length >= 3);
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
    // { is not a valid base58 char, and parsePrivateKey only tries JSON for inputs starting with [
    assert.throws(() => parsePrivateKey('{"key": "value"}'), /Invalid base58 character/);
  });

  it("trims whitespace before parsing", () => {
    const jsonKey = "  " + JSON.stringify(Array.from({ length: 64 }, () => 42)) + "  ";
    const result = parsePrivateKey(jsonKey);
    assert.equal(result.length, 64);
  });

  it("falls back to base58 for non-JSON input", () => {
    // This should not throw — it's treated as base58
    const result = parsePrivateKey("2");
    assert.ok(result.length > 0);
  });
});

// --- URL Validation ---

describe("validateUrl", () => {
  it("allows known hugen.tokyo domains", () => {
    configureSecurityPolicy({});
    assert.doesNotThrow(() => validateUrl("https://scout.hugen.tokyo/scout/hn?q=test"));
    assert.doesNotThrow(() => validateUrl("https://defi.hugen.tokyo/defi/token?chain=1"));
    assert.doesNotThrow(() => validateUrl("https://intel.hugen.tokyo/intel/token-report"));
  });

  it("blocks unknown domains by default", () => {
    configureSecurityPolicy({});
    assert.throws(() => validateUrl("https://evil.com/steal"), /not in allowlist/);
  });

  it("blocks HTTP (non-HTTPS)", () => {
    configureSecurityPolicy({});
    assert.throws(() => validateUrl("http://scout.hugen.tokyo/scout/hn"), /Only HTTPS/);
  });

  it("blocks private IPs", () => {
    configureSecurityPolicy({ allowAnyDomain: true });
    assert.throws(() => validateUrl("https://127.0.0.1/admin"), /private.*internal/i);
    assert.throws(() => validateUrl("https://10.0.0.1/secret"), /private.*internal/i);
    assert.throws(() => validateUrl("https://192.168.1.1/api"), /private.*internal/i);
    assert.throws(() => validateUrl("https://172.16.0.1/api"), /private.*internal/i);
  });

  it("blocks localhost", () => {
    configureSecurityPolicy({ allowAnyDomain: true });
    assert.throws(() => validateUrl("https://localhost/api"), /private.*internal/i);
  });

  it("allows custom domain allowlist", () => {
    configureSecurityPolicy({ allowedDomains: ["api.example.com"] });
    assert.doesNotThrow(() => validateUrl("https://api.example.com/data"));
    assert.throws(() => validateUrl("https://scout.hugen.tokyo/scout/hn"), /not in allowlist/);
  });

  it("allows any domain when configured", () => {
    configureSecurityPolicy({ allowAnyDomain: true });
    assert.doesNotThrow(() => validateUrl("https://any-public-api.com/endpoint"));
  });

  it("rejects invalid URLs", () => {
    configureSecurityPolicy({});
    assert.throws(() => validateUrl("not-a-url"), /Invalid URL/);
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
