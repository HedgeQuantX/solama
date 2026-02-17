"use client";

import { useState, useCallback } from "react";
import Header from "@/components/Header";
import Chart from "@/components/Chart";
import BetPanel from "@/components/BetPanel";
import { MAX_ZONES_PER_BET } from "@/lib/constants";
import type { SelectedZone } from "@/components/TradingZones";

export default function Home() {
  const [selectedZones, setSelectedZones] = useState<SelectedZone[]>([]);

  const handleToggleZone = useCallback((zone: SelectedZone) => {
    setSelectedZones((prev) => {
      const exists = prev.some(
        (s) =>
          Math.abs(s.lower - zone.lower) < 0.01 &&
          Math.abs(s.upper - zone.upper) < 0.01
      );
      if (exists)
        return prev.filter(
          (s) =>
            !(
              Math.abs(s.lower - zone.lower) < 0.01 &&
              Math.abs(s.upper - zone.upper) < 0.01
            )
        );
      if (prev.length >= MAX_ZONES_PER_BET) return prev;
      return [...prev, zone];
    });
  }, []);

  const handleClearZones = useCallback(() => setSelectedZones([]), []);

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Chart
          selectedZones={selectedZones}
          onToggleZone={handleToggleZone}
          maxZones={MAX_ZONES_PER_BET}
        />
        <BetPanel
          selectedZones={selectedZones}
          onClearZones={handleClearZones}
        />
      </main>
    </div>
  );
}
