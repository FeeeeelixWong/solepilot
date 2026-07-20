import { NextRequest, NextResponse } from "next/server";

import { createOnlinePlan } from "@/lib/planner";
import type { MissionDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\r/g, "").trim().slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const budgetCapUsd = Number(body?.budgetCapUsd);
  const draft: MissionDraft = {
    objective: cleanText(body?.objective, 500),
    customer: cleanText(body?.customer, 120),
    source: cleanText(body?.source, 180),
    deadline: cleanText(body?.deadline, 20),
    budgetCapUsd,
  };

  if (
    !draft.objective ||
    !draft.customer ||
    !draft.source ||
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline) ||
    !Number.isFinite(budgetCapUsd) ||
    budgetCapUsd < 1
  ) {
    return NextResponse.json({ error: "A valid mission draft is required." }, { status: 400 });
  }

  return NextResponse.json(createOnlinePlan(draft), {
    headers: { "Cache-Control": "no-store" },
  });
}
