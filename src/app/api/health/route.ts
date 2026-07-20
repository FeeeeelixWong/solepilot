import { NextResponse } from "next/server";

import { attestationConfigured } from "@/lib/server/attestation";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      online: true,
      research: true,
      telegram: Boolean(
        process.env.TELEGRAM_BOT_TOKEN &&
        process.env.TELEGRAM_CHAT_ID &&
        process.env.SOLEPILOT_OWNER_CODE,
      ),
      attestation: attestationConfigured(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
