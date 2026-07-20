import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

import type { AgentAction, Mission } from "./types";

export interface SolanaTransferResult {
  amountSol: number;
  recipient: string;
  sender: string;
  signature: string;
  explorerUrl: string;
}

function walletProvider(): SolanaWalletProvider {
  const provider = window.okxwallet?.solana ?? window.solana;
  if (!provider) {
    throw new Error("No Solana wallet was detected. Install or unlock OKX Wallet or Phantom.");
  }
  return provider;
}

export async function executeSolanaTransfer(
  action: AgentAction,
  mission: Mission,
): Promise<SolanaTransferResult> {
  if (typeof window === "undefined") {
    throw new Error("Solana payment approval must run in the owner's browser.");
  }
  const payment = mission.payment;
  if (
    !payment ||
    action.toolName !== "wallet.transfer" ||
    action.network !== "solana-devnet" ||
    action.asset !== "SOL" ||
    action.recipient !== payment.recipientAddress ||
    action.amount !== payment.amountSol ||
    action.description !== payment.purpose ||
    action.requirements !== payment.requirements
  ) {
    throw new Error("The transfer payload does not match the sealed payment intent.");
  }

  const recipient = new PublicKey(payment.recipientAddress);
  const lamports = payment.amountSol * LAMPORTS_PER_SOL;
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("The SOL amount is invalid.");
  }

  const provider = walletProvider();
  const connected = await provider.connect();
  const senderText = provider.publicKey?.toString() ?? connected.publicKey?.toString();
  if (!senderText) throw new Error("The Solana wallet did not return an owner address.");
  const sender = new PublicKey(senderText);
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: sender,
    recentBlockhash: latest.blockhash,
  }).add(SystemProgram.transfer({ fromPubkey: sender, toPubkey: recipient, lamports }));

  let signature = "";
  if (provider.signAndSendTransaction) {
    const result = await provider.signAndSendTransaction(transaction);
    signature = typeof result === "string" ? result : result.signature ?? "";
  } else if (provider.signTransaction) {
    const signed = await provider.signTransaction(transaction);
    signature = await connection.sendRawTransaction(signed.serialize(), {
      preflightCommitment: "confirmed",
    });
  }
  if (!signature) throw new Error("The wallet did not return a transaction signature.");

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(`Solana rejected the transfer: ${JSON.stringify(confirmation.value.err)}`);
  }

  return {
    amountSol: payment.amountSol,
    recipient: recipient.toBase58(),
    sender: sender.toBase58(),
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}
