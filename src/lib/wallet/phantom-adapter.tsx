"use client";

/**
 * Solana wallet auth wrapper — Phantom adapter as the default.
 *
 * Wrap your `app/layout.tsx` (or a dedicated client component) with
 * `<SolanaWalletProvider>` and you'll get the Phantom-only adapter list
 * with auto-connect on first load.
 *
 * If you want to add Solflare / Backpack later, drop them into the
 * `wallets` memo below — keep the array small to minimise bundle size.
 */

import {
  ConnectionProvider,
  WalletProvider
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo, type ReactNode } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";

export interface SolanaWalletProviderProps {
  children: ReactNode;
  /** Override the RPC endpoint. Defaults to NEXT_PUBLIC_SOLANA_RPC_URL. */
  endpoint?: string;
  /** Auto-connect on first render. Defaults to true. */
  autoConnect?: boolean;
}

export function SolanaWalletProvider({
  children,
  endpoint,
  autoConnect = true
}: SolanaWalletProviderProps) {
  const rpcUrl =
    endpoint ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    clusterApiUrl("mainnet-beta");

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
