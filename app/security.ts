import { createHmac } from "node:crypto";

export function computeHmac(secret: string, body: string | Uint8Array): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function isValidSignature(
  provided: string | null,
  secret: string | null,
  rawBody: string
): boolean {
  if (!secret || !provided) return false;
  const expected = computeHmac(secret, rawBody);
  return timingSafeEqualHex(expected, provided);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

