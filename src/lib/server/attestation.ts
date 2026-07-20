import { createHmac, timingSafeEqual } from "node:crypto";

import { canonicalize } from "../receipt";

function signingSecret(): string {
  const secret = process.env.SOLEPILOT_ATTESTATION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "solepilot-local-development-only";
  throw new Error("Online attestation is not configured.");
}

export function attestToolResult(result: unknown): string {
  const signature = createHmac("sha256", signingSecret())
    .update(canonicalize(result))
    .digest("hex");
  return `sp_hmac_${signature}`;
}

export function verifyToolAttestation(result: unknown, attestation: string): boolean {
  const expected = Buffer.from(attestToolResult(result));
  const provided = Buffer.from(attestation);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function ownerCodeMatches(provided: string | null): boolean {
  const expected = process.env.SOLEPILOT_OWNER_CODE;
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function attestationConfigured(): boolean {
  return Boolean(process.env.SOLEPILOT_ATTESTATION_SECRET);
}
