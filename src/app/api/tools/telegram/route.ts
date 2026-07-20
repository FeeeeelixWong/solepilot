import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { attestToolResult, ownerCodeMatches } from "@/lib/server/attestation";
import type { OnlineToolResult } from "@/lib/types";

export const dynamic = "force-dynamic";

interface TelegramRequest {
  actionId?: unknown;
  artifactId?: unknown;
  content?: unknown;
  missionId?: unknown;
  objective?: unknown;
  title?: unknown;
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\r/g, "").trim().slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  if (!ownerCodeMatches(request.headers.get("x-solepilot-owner-code"))) {
    return NextResponse.json({ error: "Owner connector code is missing or invalid." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return NextResponse.json({ error: "Telegram connector is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as TelegramRequest | null;
  const missionId = text(body?.missionId, 100);
  const actionId = text(body?.actionId, 100);
  const artifactId = text(body?.artifactId, 100);
  const title = text(body?.title, 180);
  const objective = text(body?.objective, 500);
  const content = text(body?.content, 2_700);

  if (!missionId || !actionId || !artifactId || !title || !content) {
    return NextResponse.json({ error: "A completed mission artifact is required." }, { status: 400 });
  }

  const message = [
    "SOLEPILOT APPROVED DELIVERY",
    title,
    "",
    `Objective: ${objective}`,
    `Mission: ${missionId}`,
    `Artifact: ${artifactId}`,
    "",
    content,
    "",
    "Released by the owner through the SolePilot policy gate.",
  ].join("\n").slice(0, 4_000);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as
    | { ok?: boolean; description?: string; result?: { message_id?: number; date?: number } }
    | null;
  if (!response.ok || !payload?.ok || !payload.result?.message_id) {
    return NextResponse.json(
      { error: payload?.description || "Telegram rejected the delivery." },
      { status: 502 },
    );
  }

  const messageId = payload.result.message_id;
  const base = {
    provider: "telegram" as const,
    requestId: `telegram_${randomUUID()}`,
    summary: `Telegram accepted the owner-approved delivery as message ${messageId}.`,
    content: [
      "TELEGRAM DELIVERY RECEIPT",
      `Mission: ${missionId}`,
      `Artifact: ${artifactId}`,
      `Provider message ID: ${messageId}`,
      `Provider timestamp: ${payload.result.date || "unknown"}`,
      "Status: delivered",
    ].join("\n"),
    executedAt: new Date().toISOString(),
    externalReference: `telegram:message:${messageId}`,
  };
  const result: OnlineToolResult = { ...base, attestation: attestToolResult(base) };
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
