import type { AgentAction, Mission, PaymentIntent } from "./types";

export interface PaymentAdapterDescriptor {
  id: string;
  label: string;
  scheme: PaymentIntent["scheme"];
  network: string;
  assets: string[];
  environment: "testnet" | "mainnet";
}

export interface PaymentExecutionResult {
  amount: number;
  asset: string;
  recipient: string;
  sender: string;
  transactionId: string;
  explorerUrl: string;
  provider: string;
}

export const paymentAdapters: PaymentAdapterDescriptor[] = [
  {
    id: "solana-native-devnet",
    label: "Solana Devnet",
    scheme: "native-transfer",
    network: "solana-devnet",
    assets: ["SOL"],
    environment: "testnet",
  },
];

export function adapterForPayment(
  payment: PaymentIntent,
): PaymentAdapterDescriptor | undefined {
  return paymentAdapters.find(
    (adapter) =>
      adapter.scheme === payment.scheme &&
      adapter.network === payment.network &&
      adapter.assets.includes(payment.asset),
  );
}

export async function executePayment(
  action: AgentAction,
  mission: Mission,
): Promise<PaymentExecutionResult> {
  const payment = mission.payment;
  if (!payment) throw new Error("The mission has no sealed payment intent.");

  const adapter = adapterForPayment(payment);
  if (!adapter) {
    throw new Error(
      `No payment adapter supports ${payment.scheme} on ${payment.network} with ${payment.asset}.`,
    );
  }

  if (adapter.id === "solana-native-devnet") {
    const { executeSolanaTransfer } = await import("./solana");
    const result = await executeSolanaTransfer(action, mission);
    return {
      amount: result.amount,
      asset: result.asset,
      recipient: result.recipient,
      sender: result.sender,
      transactionId: result.signature,
      explorerUrl: result.explorerUrl,
      provider: adapter.id,
    };
  }

  throw new Error(`Payment adapter ${adapter.id} is not executable.`);
}
