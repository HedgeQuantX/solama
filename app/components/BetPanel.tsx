"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { useProgram } from "@/hooks/useProgram";
import { LAMPORTS_PER_SOL, MIN_BET_SOL, PRICE_DECIMALS } from "@/lib/constants";
import type { SelectedZone } from "./TradingZones";

interface BetPanelProps {
  selectedZones: SelectedZone[];
  onClearZones: () => void;
}

export default function BetPanel({ selectedZones, onClearZones }: BetPanelProps) {
  const { publicKey } = useWallet();
  const { program } = useProgram();
  const [betAmount, setBetAmount] = useState("0.05");
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const potentialPayout = selectedZones.reduce((acc, zone) => {
    const amount = parseFloat(betAmount) || 0;
    return acc + (amount * zone.multiplierBps) / 10_000;
  }, 0);

  const placeBet = useCallback(async () => {
    if (!program || !publicKey || selectedZones.length === 0) return;

    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const amount = parseFloat(betAmount);
      if (amount < MIN_BET_SOL) throw new Error(`Min bet: ${MIN_BET_SOL} SOL`);

      const roundId = BigInt(Date.now());
      const lamports = new BN(Math.floor(amount * LAMPORTS_PER_SOL));

      const zones = selectedZones.map((z) => ({
        lowerBound: new BN(Math.floor(z.lower * 10 ** PRICE_DECIMALS)),
        upperBound: new BN(Math.floor(z.upper * 10 ** PRICE_DECIMALS)),
        multiplierBps: z.multiplierBps,
      }));

      const sig = await program.methods
        .placeBet(new BN(roundId.toString()), lamports, zones)
        .accounts({
          player: publicKey,
        } as never)
        .rpc();

      setTxSig(sig);
      onClearZones();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, selectedZones, betAmount, onClearZones]);

  const presets = ["0.01", "0.05", "0.1", "0.5"];

  return (
    <div className="flex flex-col gap-4 p-4 border-t border-border-primary bg-bg-secondary/60">
      {/* Amount input */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-text-muted">
            Bet Amount
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            {selectedZones.length}/2 zones
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-bg-tertiary border border-border-primary rounded-lg px-3 h-10 focus-within:border-accent-blue/50 transition-colors">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              step="0.01"
              min={MIN_BET_SOL}
              className="flex-1 bg-transparent text-sm font-mono text-text-primary outline-none"
              placeholder="0.00"
            />
            <span className="text-xs text-text-muted ml-2">SOL</span>
          </div>
        </div>

        <div className="flex gap-1.5">
          {presets.map((val) => (
            <button
              key={val}
              onClick={() => setBetAmount(val)}
              className={`flex-1 text-[11px] font-mono py-1.5 rounded-md border transition-all
                ${
                  betAmount === val
                    ? "bg-accent-blue/10 border-accent-blue/40 text-accent-blue"
                    : "bg-bg-tertiary border-border-primary text-text-secondary hover:border-border-hover"
                }`}
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      {/* Payout preview */}
      {selectedZones.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-tertiary border border-border-primary">
          <span className="text-[10px] text-text-muted uppercase">
            Max Payout
          </span>
          <span className="text-sm font-mono font-bold text-accent-green">
            {potentialPayout.toFixed(4)} SOL
          </span>
        </div>
      )}

      {/* Place bet button */}
      <button
        onClick={placeBet}
        disabled={!publicKey || selectedZones.length === 0 || loading}
        className={`
          w-full h-12 rounded-lg font-semibold text-sm tracking-wide transition-all duration-150
          ${
            !publicKey
              ? "bg-bg-tertiary text-text-muted border border-border-primary cursor-not-allowed"
              : selectedZones.length === 0
                ? "bg-bg-tertiary text-text-muted border border-border-primary cursor-not-allowed"
                : loading
                  ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30 cursor-wait"
                  : "bg-accent-blue text-white hover:bg-accent-blue/90 active:scale-[0.98]"
          }
        `}
      >
        {!publicKey
          ? "Connect Wallet"
          : selectedZones.length === 0
            ? "Select Zones"
            : loading
              ? "Confirming..."
              : `Place Bet — ${betAmount} SOL`}
      </button>

      {/* Feedback */}
      {txSig && (
        <a
          href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-mono text-accent-green hover:underline truncate text-center"
        >
          TX: {txSig.slice(0, 20)}...{txSig.slice(-8)}
        </a>
      )}
      {error && (
        <p className="text-[11px] font-mono text-accent-red text-center truncate">
          {error}
        </p>
      )}
    </div>
  );
}
