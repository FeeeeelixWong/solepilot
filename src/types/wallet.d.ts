interface SolanaWalletPublicKey {
  toString(): string;
}

interface SolanaWalletProvider {
  publicKey?: SolanaWalletPublicKey | null;
  connect(): Promise<{ publicKey?: SolanaWalletPublicKey }>;
  signAndSendTransaction?: (
    transaction: import("@solana/web3.js").Transaction,
  ) => Promise<string | { signature?: string }>;
  signTransaction?: (
    transaction: import("@solana/web3.js").Transaction,
  ) => Promise<import("@solana/web3.js").Transaction>;
}

interface Window {
  solana?: SolanaWalletProvider;
  okxwallet?: {
    solana?: SolanaWalletProvider;
  };
}
