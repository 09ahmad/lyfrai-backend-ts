import { expect, test } from "bun:test";
import { computeHmac, isValidSignature } from "../app/security.ts";

test("computeHmac produces deterministic hex", () => {
  const secret = "secret";
  const body = '{"hello":"world"}';
  const sig = computeHmac(secret, body);
  expect(sig).toBe("2677ad3e7c090b2fa2c0fb13020d66d5420879b8316eb356a2d60fb9073bc778");
});

test("isValidSignature returns true for matching signature", () => {
  const secret = "secret";
  const body = "abc";
  const sig = computeHmac(secret, body);
  expect(isValidSignature(sig, secret, body)).toBeTrue();
});

test("isValidSignature returns false for mismatched signature", () => {
  const secret = "secret";
  const body = "abc";
  expect(isValidSignature("deadbeef", secret, body)).toBeFalse();
});

