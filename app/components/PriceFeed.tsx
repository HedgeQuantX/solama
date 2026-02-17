"use client";

import { useBinancePrice } from "@/hooks/useBinancePrice";

export default function PriceFeed() {
  const { price, direction, connected } = useBinancePrice();

  const directionColor =
    direction === "up"
      ? "text-accent-green"
      : direction === "down"
        ? "text-accent-red"
        : "text-text-primary";

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border-primary bg-bg-secondary/40">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          BTC/USDT
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`}
        />
      </div>

      <div className={`text-2xl font-mono font-bold tracking-tight ${directionColor} transition-colors duration-150`}>
        {price > 0 ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "---"}
      </div>

      {direction !== "neutral" && (
        <span className={`text-xs font-mono ${directionColor}`}>
          {direction === "up" ? "\u25B2" : "\u25BC"}
        </span>
      )}
    </div>
  );
}

export { PriceFeed };
