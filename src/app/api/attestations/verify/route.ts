import { NextRequest, NextResponse } from "next/server";

import { verifyToolAttestation } from "@/lib/server/attestation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as
    | { result?: unknown; attestation?: unknown }
    | null;
  if (!body?.result || typeof body.attestation !== "string") {
    return NextResponse.json({ valid: false, error: "Result and attestation are required." }, { status: 400 });
  }

  return NextResponse.json(
    { valid: verifyToolAttestation(body.result, body.attestation) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
