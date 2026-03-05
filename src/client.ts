/**
 * Solana x402 client setup.
 *
 * Creates a payment-aware fetch that automatically handles 402 responses
 * by signing Solana USDC transfers via the x402 protocol.
 */

import { x402Client } from "@x402/fetch";
import { wrapFetchWithPayment } from "@x402/fetch";
import { toClientSvmSigner } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import { createMaxPaymentPolicy } from "./security.js";

/** Solana mainnet CAIP-2 identifier */
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/**
 * Decode a base58-encoded Solana keypair to Uint8Array.
 * Solana CLI keypairs are 64 bytes: [32-byte private key | 32-byte public key].
 */
export function decodeBase58(encoded: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = 58;
  const bytes: number[] = [];

  for (const char of encoded) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * BASE;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Count leading '1's = leading zero bytes
  let leadingZeros = 0;
  for (const char of encoded) {
    if (char !== "1") break;
    leadingZeros++;
  }

  // Reverse the computed bytes and prepend leading zeros
  const reversed = bytes.reverse();
  const result = new Uint8Array(leadingZeros + reversed.length);
  result.set(reversed, leadingZeros);
  return result;
}

/**
 * Parse a Solana private key from base58 string or JSON array format.
 *
 * Supports:
 * - Base58 string: standard Solana wallet format (64-byte keypair)
 * - JSON array: Solana CLI's ~/.config/solana/id.json format ([12, 34, ...])
 */
export function parsePrivateKey(input: string): Uint8Array {
  const trimmed = input.trim();

  // JSON array format: [12, 34, 56, ...]
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as number[];
      if (!Array.isArray(arr) || !arr.every((n) => typeof n === "number" && n >= 0 && n <= 255)) {
        throw new Error("JSON array must contain numbers 0-255");
      }
      return new Uint8Array(arr);
    } catch (e) {
      throw new Error(`Invalid JSON array key format: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Base58 format (default)
  return decodeBase58(trimmed);
}

/**
 * Create a payment-aware fetch function for Solana x402 payments.
 *
 * @param privateKeyInput - Base58-encoded Solana keypair or JSON array
 * @param maxPaymentUsd - Maximum payment amount in USD per request
 * @returns A fetch function that auto-handles 402 → Solana USDC payment → retry
 */
export async function createSolanaX402Fetch(
  privateKeyInput: string,
  maxPaymentUsd: number = 1.0,
): Promise<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  // 1. Parse private key (base58 or JSON array)
  const keyBytes = parsePrivateKey(privateKeyInput);

  // 2. Create a KeyPairSigner from the bytes
  const signer = await createKeyPairSignerFromBytes(keyBytes);

  // 3. Convert to x402 SVM signer
  const svmSigner = toClientSvmSigner(signer);

  // 4. Create x402 client and register Solana scheme
  //    M2 fix: Explicitly specify mainnet only to prevent devnet/testnet payments
  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer: svmSigner,
    policies: [createMaxPaymentPolicy(maxPaymentUsd)],
    networks: [SOLANA_MAINNET],
  });

  console.error(
    `[x402-solana] Wallet: ${signer.address} on ${SOLANA_MAINNET} (max $${maxPaymentUsd}/req)`,
  );

  // 5. Wrap fetch with payment handling
  return wrapFetchWithPayment(fetch, client);
}
