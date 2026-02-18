"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@/lib/constants";

export default function Header() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    const fetchBalance = async () => {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / LAMPORTS_PER_SOL);
    };
    fetchBalance();
    const id = connection.onAccountChange(publicKey, (acc) => {
      setBalance(acc.lamports / LAMPORTS_PER_SOL);
    });
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection]);

  return (
    <header className="flex items-center justify-between px-6 h-14 border-b border-border-primary bg-bg-secondary/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="text-lg font-bold tracking-tight text-accent-cyan">
          SOLAMA
        </div>
        <div className="h-4 w-px bg-border-primary" />
        <span className="text-xs font-display text-accent-yellow">DEVNET</span>
      </div>

      <div className="flex items-center gap-4">
        {publicKey && balance !== null && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />
            <span className="text-xs font-display text-text-secondary">
              {balance.toFixed(4)} SOL
            </span>
          </div>
        )}
        <WalletMultiButton />
      </div>
    </header>
  );
}
