/**
 * Solana x402 client setup.
 *
 * Creates a payment-aware fetch that automatically handles 402 responses
 * by signing Solana USDC transfers via the x402 protocol.
 */

import { x402Client } from "@x402/fetch";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme, toClientSvmSigner } from "@x402/svm";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/signers";

/** Solana mainnet CAIP-2 identifier */
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/**
 * Decode a base58-encoded Solana keypair to Uint8Array.
 * Solana CLI keypairs are 64 bytes: [32-byte private key | 32-byte public key].
 */
function decodeBase58(encoded: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = 58;
  const bytes: number[] = [0];

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

  // Leading '1's in base58 = leading zero bytes
  for (const char of encoded) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Create a payment-aware fetch function for Solana x402 payments.
 *
 * @param privateKeyBase58 - Base58-encoded Solana keypair (64 bytes)
 * @returns A fetch function that auto-handles 402 → Solana USDC payment → retry
 */
export async function createSolanaX402Fetch(
  privateKeyBase58: string,
): Promise<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  // 1. Decode base58 private key to bytes
  const keyBytes = decodeBase58(privateKeyBase58.trim());

  // 2. Create a KeyPairSigner from the bytes
  const signer = await createKeyPairSignerFromBytes(keyBytes);

  // 3. Convert to x402 SVM signer
  const svmSigner = toClientSvmSigner(signer);

  // 4. Create x402 client and register Solana scheme
  const client = new x402Client();
  registerExactSvmScheme(client, { signer: svmSigner });

  console.error(
    `[x402-solana] Wallet: ${signer.address} on ${SOLANA_MAINNET}`,
  );

  // 5. Wrap fetch with payment handling
  return wrapFetchWithPayment(fetch, client);
}
