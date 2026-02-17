"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
} from "lightweight-charts";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { ZONE_MULTIPLIERS } from "@/lib/constants";
import type { SelectedZone } from "./TradingZones";

interface ChartProps {
  selectedZones: SelectedZone[];
  onToggleZone: (zone: SelectedZone) => void;
  maxZones: number;
}

export default function Chart({ selectedZones, onToggleZone, maxZones }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const { ticks, price, direction, connected } = usePriceHistory();

  // Generate zones based on current price
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
  }, [Math.floor(price / 50)]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0a0b0d" },
        textColor: "#64748b",
        fontSize: 11,
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: "#1e233010" },
        horzLines: { color: "#1e233040" },
      },
      crosshair: {
        vertLine: { color: "#4a9eff40", width: 1, style: 2, labelBackgroundColor: "#1a1d26" },
        horzLine: { color: "#4a9eff40", width: 1, style: 2, labelBackgroundColor: "#1a1d26" },
      },
      rightPriceScale: {
        borderColor: "#1e2330",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor: "#1e2330",
        timeVisible: true,
        secondsVisible: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#4a9eff",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: "#4a9eff",
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: "#4a9eff50",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update series data
  useEffect(() => {
    if (!seriesRef.current || ticks.length === 0) return;
    seriesRef.current.setData(ticks as LineData[]);
  }, [ticks]);

  // Update price line color based on direction
  useEffect(() => {
    if (!seriesRef.current) return;
    const color = direction === "up" ? "#00d4aa" : direction === "down" ? "#ff4757" : "#4a9eff";
    seriesRef.current.applyOptions({ color });
  }, [direction]);

  // Draw zone price lines on chart
  useEffect(() => {
    if (!seriesRef.current || zones.length === 0) return;

    // Remove existing price lines
    const series = seriesRef.current;
    zones.forEach((_, i) => {
      series.removePriceLine(series.createPriceLine({ price: 0, color: "transparent", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `z${i}` }));
    });

    // Add zone bands as price lines
    zones.forEach((zone) => {
      const isSelected = selectedZones.some(
        (s) => Math.abs(s.lower - zone.lower) < 0.01 && Math.abs(s.upper - zone.upper) < 0.01
      );
      const baseColor = zone.side === "long" ? "#00d4aa" : "#ff4757";
      const opacity = isSelected ? "80" : "25";
      const midPrice = (zone.lower + zone.upper) / 2;

      series.createPriceLine({
        price: midPrice,
        color: baseColor + opacity,
        lineWidth: 1,
        lineStyle: isSelected ? 0 : 2,
        axisLabelVisible: isSelected,
        title: `${zone.label} ${zone.side === "long" ? "\u25B2" : "\u25BC"}`,
      });
    });
  }, [zones, selectedZones]);

  // Handle click on chart to select zones
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const handleClick = (param: { point?: { x: number; y: number } }) => {
      if (!param.point || !seriesRef.current) return;

      const clickPrice = seriesRef.current.coordinateToPrice(param.point.y);
      if (clickPrice === null) return;

      // Find closest zone to click
      let closestZone: (typeof zones)[0] | null = null;
      let closestDist = Infinity;

      for (const zone of zones) {
        const mid = (zone.lower + zone.upper) / 2;
        const dist = Math.abs(Number(clickPrice) - mid);
        if (dist < closestDist) {
          closestDist = dist;
          closestZone = zone;
        }
      }

      if (!closestZone) return;

      // Only select if click is reasonably close to a zone
      const zoneHeight = closestZone.upper - closestZone.lower;
      if (closestDist > zoneHeight * 3) return;

      const isSelected = selectedZones.some(
        (s) =>
          Math.abs(s.lower - closestZone!.lower) < 0.01 &&
          Math.abs(s.upper - closestZone!.upper) < 0.01
      );

      if (isSelected || selectedZones.length < maxZones) {
        onToggleZone(closestZone);
      }
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [zones, selectedZones, maxZones, onToggleZone]);

  const dirColor = direction === "up" ? "text-accent-green" : direction === "down" ? "text-accent-red" : "text-text-primary";

  return (
    <div className="relative flex-1 min-h-0">
      {/* Price overlay */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <span className="text-xs text-text-muted font-mono">BTC/USDT</span>
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`} />
        <span className={`text-lg font-mono font-bold ${dirColor} transition-colors duration-100`}>
          {price > 0 ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "---"}
        </span>
        {direction !== "neutral" && (
          <span className={`text-xs ${dirColor}`}>{direction === "up" ? "\u25B2" : "\u25BC"}</span>
        )}
      </div>

      {/* Zone legend overlay */}
      <div className="absolute top-3 right-4 z-10 flex flex-col gap-1">
        {selectedZones.map((z, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono border ${
              z.side === "long"
                ? "bg-accent-green/10 border-accent-green/30 text-accent-green"
                : "bg-accent-red/10 border-accent-red/30 text-accent-red"
            }`}
          >
            <span>{z.side === "long" ? "\u25B2" : "\u25BC"} {z.label}</span>
            <span className="text-text-muted">${z.lower.toFixed(0)}-${z.upper.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* Instruction overlay */}
      {selectedZones.length === 0 && price > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg bg-bg-secondary/90 border border-border-primary">
          <span className="text-xs text-text-muted">Click on the chart near a price zone to select it</span>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
