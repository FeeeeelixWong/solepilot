import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { createOnlinePlan } from "@/lib/planner";
import { adapterForPayment } from "@/lib/payment-adapters";
import type { MissionDraft, PaymentIntent } from "@/lib/types";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\r/g, "").trim().slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const missionType = body?.missionType === "payment" ? "payment" : "work";
  const rawPayment = body?.payment && typeof body.payment === "object"
    ? body.payment as Record<string, unknown>
    : null;
  const payment: PaymentIntent | undefined = missionType === "payment" && rawPayment
    ? {
        payeeName: cleanText(rawPayment.payeeName, 120),
        scheme: rawPayment.scheme === "x402" ? "x402" : "native-transfer",
        network: cleanText(rawPayment.network, 80),
        asset: cleanText(rawPayment.asset, 32).toUpperCase(),
        amount: Number(rawPayment.amount),
        maxAmount: Number(rawPayment.maxAmount),
        payTo: cleanText(rawPayment.payTo, 128),
        resource: cleanText(rawPayment.resource, 500) || undefined,
        purpose: cleanText(rawPayment.purpose, 500),
        requirements: cleanText(rawPayment.requirements, 500),
      }
    : undefined;
  const budgetCapUsd = payment?.maxAmount ?? Number(body?.budgetCapUsd);
  const draft: MissionDraft = {
    objective: payment?.purpose ?? cleanText(body?.objective, 500),
    customer: payment?.payeeName ?? cleanText(body?.customer, 120),
    source: payment ? "Owner-entered payment instruction" : cleanText(body?.source, 180),
    deadline: cleanText(body?.deadline, 20),
    budgetCapUsd,
    missionType,
    payment,
  };

  let paymentAddressIsValid = missionType !== "payment";
  if (
    payment?.scheme === "native-transfer" &&
    payment.network === "solana-devnet"
  ) {
    try {
      new PublicKey(payment.payTo);
      paymentAddressIsValid = true;
    } catch {
      paymentAddressIsValid = false;
    }
  }

  if (!draft.objective || !draft.customer || !draft.source || !/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline)) {
    return NextResponse.json({ error: "A valid mission draft is required." }, { status: 400 });
  }
  if (!Number.isFinite(budgetCapUsd) || budgetCapUsd <= 0) {
    return NextResponse.json({ error: "Enter a positive authorization cap." }, { status: 400 });
  }
  if (missionType === "payment") {
    if (!payment || !adapterForPayment(payment)) {
      return NextResponse.json({ error: "The selected payment route is not supported." }, { status: 400 });
    }
    if (!paymentAddressIsValid) {
      return NextResponse.json({ error: "Enter a valid payment recipient." }, { status: 400 });
    }
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      return NextResponse.json({ error: "Enter a positive payment amount." }, { status: 400 });
    }
    if (
      payment.asset === "SOL" &&
      !Number.isSafeInteger(payment.amount * LAMPORTS_PER_SOL)
    ) {
      return NextResponse.json({ error: "SOL payment precision cannot exceed nine decimal places." }, { status: 400 });
    }
    if (payment.amount > payment.maxAmount) {
      return NextResponse.json({ error: "Payment amount cannot exceed the maximum authorized amount." }, { status: 400 });
    }
    if (!payment.requirements) {
      return NextResponse.json({ error: "Add the execution requirements for this payment." }, { status: 400 });
    }
  }

  return NextResponse.json(createOnlinePlan(draft), {
    headers: { "Cache-Control": "no-store" },
  });
}
