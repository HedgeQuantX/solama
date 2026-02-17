"use client";

import { useMemo } from "react";
import { useBinancePrice } from "@/hooks/useBinancePrice";
import { ZONE_MULTIPLIERS, MAX_ZONES_PER_BET } from "@/lib/constants";

export interface SelectedZone {
  lower: number;
  upper: number;
  multiplierBps: number;
  label: string;
  side: "long" | "short";
}

interface TradingZonesProps {
  selectedZones: SelectedZone[];
  onToggleZone: (zone: SelectedZone) => void;
}

export default function TradingZones({
  selectedZones,
  onToggleZone,
}: TradingZonesProps) {
  const { price } = useBinancePrice();

  const zones = useMemo(() => {
    if (price <= 0) return [];

    return ZONE_MULTIPLIERS.flatMap(({ distance, multiplier, label }) => {
      const offset = price * (distance / 100);
      return [
        {
          lower: price + offset - offset * 0.1,
          upper: price + offset + offset * 0.1,
          multiplierBps: multiplier,
          label,
          side: "long" as const,
          distancePct: distance,
        },
        {
          lower: price - offset - offset * 0.1,
          upper: price - offset + offset * 0.1,
          multiplierBps: multiplier,
          label,
          side: "short" as const,
          distancePct: distance,
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(price / 10)]);

  const isSelected = (zone: { lower: number; upper: number }) =>
    selectedZones.some(
      (s) =>
        Math.abs(s.lower - zone.lower) < 0.01 &&
        Math.abs(s.upper - zone.upper) < 0.01
    );

  const canSelect = selectedZones.length < MAX_ZONES_PER_BET;

  const longZones = zones.filter((z) => z.side === "long");
  const shortZones = zones.filter((z) => z.side === "short");

  return (
    <div className="flex-1 flex flex-col gap-3 p-4">
      {/* Long zones (above price) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-text-muted px-1">
          Long Zones
        </span>
        {longZones.map((zone, i) => {
          const selected = isSelected(zone);
          return (
            <button
              key={`long-${i}`}
              onClick={() =>
                (selected || canSelect) && onToggleZone(zone)
              }
              disabled={!selected && !canSelect}
              className={`
                flex items-center justify-between px-4 py-2.5 rounded-lg border transition-all duration-150
                ${
                  selected
                    ? "bg-accent-green/10 border-accent-green/40 zone-active"
                    : canSelect
                      ? "bg-bg-tertiary border-border-primary hover:border-accent-green/30 hover:bg-bg-hover cursor-pointer"
                      : "bg-bg-tertiary border-border-primary opacity-40 cursor-not-allowed"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${selected ? "bg-accent-green" : "bg-accent-green/30"}`}
                />
                <span className="text-xs font-mono text-text-secondary">
                  +{zone.distancePct}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-text-muted">
                  ${zone.lower.toFixed(0)} - ${zone.upper.toFixed(0)}
                </span>
                <span
                  className={`text-xs font-bold ${selected ? "text-accent-green" : "text-text-primary"}`}
                >
                  {zone.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Current price divider */}
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-border-primary" />
        <span className="text-[10px] font-mono text-text-muted">
          CURRENT PRICE
        </span>
        <div className="flex-1 h-px bg-border-primary" />
      </div>

      {/* Short zones (below price) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-text-muted px-1">
          Short Zones
        </span>
        {shortZones.map((zone, i) => {
          const selected = isSelected(zone);
          return (
            <button
              key={`short-${i}`}
              onClick={() =>
                (selected || canSelect) && onToggleZone(zone)
              }
              disabled={!selected && !canSelect}
              className={`
                flex items-center justify-between px-4 py-2.5 rounded-lg border transition-all duration-150
                ${
                  selected
                    ? "bg-accent-red/10 border-accent-red/40 zone-active"
                    : canSelect
                      ? "bg-bg-tertiary border-border-primary hover:border-accent-red/30 hover:bg-bg-hover cursor-pointer"
                      : "bg-bg-tertiary border-border-primary opacity-40 cursor-not-allowed"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${selected ? "bg-accent-red" : "bg-accent-red/30"}`}
                />
                <span className="text-xs font-mono text-text-secondary">
                  -{zone.distancePct}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-text-muted">
                  ${zone.lower.toFixed(0)} - ${zone.upper.toFixed(0)}
                </span>
                <span
                  className={`text-xs font-bold ${selected ? "text-accent-red" : "text-text-primary"}`}
                >
                  {zone.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
