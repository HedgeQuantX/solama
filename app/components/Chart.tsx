"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
} from "lightweight-charts";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useProgram } from "@/hooks/useProgram";
import { LAMPORTS_PER_SOL, PRICE_DECIMALS } from "@/lib/constants";

interface Cell {
  row: number;
  col: number;
  id: string;
  priceTop: number;
  priceBot: number;
  multi: string;
  multiBps: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLS = 8;
const ROWS = 12;
const BET_PRESETS = [0.01, 0.05, 0.1, 0.5];

// Multiplier based on distance from price row
function getMultiplier(rowDist: number): { label: string; bps: number } {
  if (rowDist <= 1) return { label: "1.5X", bps: 15_000 };
  if (rowDist <= 2) return { label: "3X", bps: 30_000 };
  if (rowDist <= 3) return { label: "5.54X", bps: 55_400 };
  if (rowDist <= 4) return { label: "10X", bps: 100_000 };
  if (rowDist <= 5) return { label: "50X", bps: 500_000 };
  return { label: "200X", bps: 2_000_000 };
}

export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cellsRef = useRef<Cell[]>([]);
  const animRef = useRef<number>(0);
  const hoverIdRef = useRef("");

  const { ticks, price, direction, connected } = usePriceHistory();
  const { publicKey } = useWallet();
  const { program } = useProgram();

  const [betAmount, setBetAmount] = useState(0.05);
  const [selected, setSelected] = useState<Map<string, Cell>>(new Map());
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Toggle cell selection (max 2)
  const toggleCell = useCallback((cell: Cell) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(cell.id)) {
        next.delete(cell.id);
      } else if (next.size < 2) {
        next.set(cell.id, cell);
      }
      return next;
    });
  }, []);

  // Place bet on-chain
  const placeBet = useCallback(async () => {
    if (!program || !publicKey || selected.size === 0) return;
    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const roundId = BigInt(Date.now());
      const lamports = new BN(Math.floor(betAmount * LAMPORTS_PER_SOL));
      const zones = Array.from(selected.values()).map((c) => ({
        lowerBound: new BN(Math.floor(c.priceBot * 10 ** PRICE_DECIMALS)),
        upperBound: new BN(Math.floor(c.priceTop * 10 ** PRICE_DECIMALS)),
        multiplierBps: c.multiBps,
      }));

      const sig = await program.methods
        .placeBet(new BN(roundId.toString()), lamports, zones)
        .accounts({ player: publicKey } as never)
        .rpc();

      setTxSig(sig);
      setSelected(new Map());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, selected, betAmount]);

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0c0c10" },
        textColor: "#64748b",
        fontSize: 11,
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: "transparent" },
        horzLines: { color: "transparent" },
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      rightPriceScale: {
        borderColor: "#1e2330",
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#1e2330",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 3,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#ff4060",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBackgroundColor: "#ffffff",
      crosshairMarkerBorderColor: "#ff4060",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { clientWidth: w, clientHeight: h } = containerRef.current;
      chart.applyOptions({ width: w, height: h });
      const dpr = window.devicePixelRatio;
      canvasRef.current.width = w * dpr;
      canvasRef.current.height = h * dpr;
      canvasRef.current.style.width = `${w}px`;
      canvasRef.current.style.height = `${h}px`;
    };

    window.addEventListener("resize", resize);
    resize();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed data
  useEffect(() => {
    if (!seriesRef.current || ticks.length === 0) return;
    seriesRef.current.setData(ticks as LineData[]);
  }, [ticks]);

  // Draw grid on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!canvas || !series || !chart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (price <= 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      const priceScaleW = 60;
      const timeScaleH = 26;
      const gridW = cw - priceScaleW;
      const gridH = ch - timeScaleH;

      const cellW = gridW / COLS;
      const cellH = gridH / ROWS;

      // Determine price range visible — center on current price
      const priceStep = price * 0.002; // each row ~0.2% of price
      const midRow = Math.floor(ROWS / 2);
      const hoverId = hoverIdRef.current;
      const now = Date.now();

      const cells: Cell[] = [];

      for (let row = 0; row < ROWS; row++) {
        const rowDist = Math.abs(row - midRow);
        const { label, bps } = getMultiplier(rowDist);
        const priceTop = price + (midRow - row) * priceStep;
        const priceBot = price + (midRow - row - 1) * priceStep;

        for (let col = 0; col < COLS; col++) {
          const id = `${row}-${col}`;
          const x = col * cellW;
          const y = row * cellH;

          const sel = selected.has(id);
          const hover = hoverId === id;

          // Check if price is in this row
          const hit = price >= Math.min(priceTop, priceBot) && price <= Math.max(priceTop, priceBot);

          // Cell background
          const baseR = 180, baseG = 30, baseB = 50;
          let alpha = 0.04 + rowDist * 0.015;
          if (hit) alpha = 0.15;
          if (sel) alpha = 0.3;
          if (hover && !sel) alpha = 0.12;

          ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${alpha})`;
          ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);

          // Cell border
          let borderAlpha = 0.08;
          if (sel) borderAlpha = 0.6;
          else if (hover) borderAlpha = 0.25;
          else if (hit) borderAlpha = 0.3;

          ctx.strokeStyle = `rgba(${baseR},${baseG},${baseB},${borderAlpha})`;
          ctx.lineWidth = sel ? 1.5 : 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);

          // Glow for selected
          if (sel) {
            const pulse = 0.15 + Math.sin(now / 300) * 0.1;
            ctx.shadowColor = `rgba(255,60,90,${pulse})`;
            ctx.shadowBlur = 15;
            ctx.fillStyle = `rgba(255,60,90,0.08)`;
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
            ctx.shadowBlur = 0;
          }

          // Text
          const cx = x + cellW / 2;
          const cy = y + cellH / 2;

          if (sel) {
            // Show bet amount
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 13px monospace";
            ctx.fillStyle = "#ffffff";
            const betDisplay = betAmount >= 1 ? `${betAmount}` : `${betAmount}`;
            ctx.fillText(`${betDisplay} SOL`, cx, cy - 8);

            // Multiplier below
            ctx.font = "bold 11px monospace";
            ctx.fillStyle = "rgba(255,100,120,0.9)";
            ctx.fillText(label, cx, cy + 7);
          } else {
            // Just multiplier
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `${rowDist >= 5 ? "bold 11px" : "10px"} monospace`;
            const textAlpha = rowDist >= 4 ? 0.7 : 0.35;
            ctx.fillStyle = `rgba(255,100,120,${textAlpha})`;
            ctx.fillText(label, cx, cy);
          }

          // Win animation
          if (hit && sel) {
            const winPayout = (betAmount * bps) / 10_000;
            ctx.font = "bold 14px monospace";
            ctx.fillStyle = "#00ff88";
            ctx.shadowColor = "#00ff88";
            ctx.shadowBlur = 10;
            ctx.fillText(`+${winPayout.toFixed(2)}`, cx, cy - 8);
            ctx.shadowBlur = 0;

            ctx.font = "bold 10px monospace";
            ctx.fillStyle = "#ffffff";
            ctx.fillText("HIT!", cx, cy + 8);
          }

          cells.push({
            row, col, id, priceTop, priceBot,
            multi: label, multiBps: bps,
            x, y, w: cellW, h: cellH,
          });
        }
      }

      cellsRef.current = cells;
      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [price, selected, betAmount]);

  // Click
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const cell of cellsRef.current) {
        if (x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h) {
          toggleCell(cell);
          return;
        }
      }
    },
    [toggleCell]
  );

  // Hover
  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let id = "";
    for (const cell of cellsRef.current) {
      if (x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h) {
        id = cell.id;
        break;
      }
    }
    hoverIdRef.current = id;
    canvas.style.cursor = id ? "pointer" : "default";
  }, []);

  const selectedArr = Array.from(selected.values());
  const totalBet = betAmount * selected.size;
  const maxPayout = selectedArr.reduce((a, c) => a + (betAmount * c.multiBps) / 10_000, 0);

  const dirColor =
    direction === "up" ? "text-accent-green" : direction === "down" ? "text-accent-red" : "text-text-primary";

  return (
    <div className="relative flex-1 min-h-0">
      {/* Top-left: price */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-3 pointer-events-none">
        <span className="text-xs text-text-muted font-mono">BTC/USDT</span>
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`} />
        <span className={`text-xl font-mono font-bold ${dirColor} transition-colors duration-100`}>
          {price > 0
            ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "---"}
        </span>
      </div>

      {/* Bet selector */}
      <div className="absolute top-12 left-4 z-20 flex items-center gap-1.5">
        <span className="text-[10px] text-text-muted mr-1 font-mono">BET</span>
        {BET_PRESETS.map((val) => (
          <button
            key={val}
            onClick={() => setBetAmount(val)}
            className={`px-2 py-1 rounded text-[11px] font-mono border transition-all ${
              betAmount === val
                ? "bg-accent-red/15 border-accent-red/40 text-accent-red"
                : "bg-bg-tertiary/60 border-border-primary/50 text-text-muted hover:border-border-hover"
            }`}
          >
            {val}
          </button>
        ))}
        <span className="text-[10px] text-text-muted ml-0.5 font-mono">SOL</span>
      </div>

      {/* Bottom: confirm */}
      {selected.size > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 px-5 py-2.5 rounded-xl bg-bg-secondary/95 border border-border-primary backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-text-muted uppercase">Total</span>
            <span className="text-sm font-mono font-bold text-text-primary">{totalBet.toFixed(2)} SOL</span>
          </div>
          <div className="w-px h-8 bg-border-primary" />
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-text-muted uppercase">Max Win</span>
            <span className="text-sm font-mono font-bold text-accent-green">{maxPayout.toFixed(2)} SOL</span>
          </div>
          <button
            onClick={placeBet}
            disabled={!publicKey || loading}
            className={`ml-2 px-5 py-2 rounded-lg text-xs font-bold font-mono transition-all ${
              !publicKey
                ? "bg-bg-tertiary text-text-muted cursor-not-allowed"
                : loading
                  ? "bg-accent-red/20 text-accent-red cursor-wait"
                  : "bg-accent-red text-white hover:bg-accent-red/90 active:scale-95"
            }`}
          >
            {!publicKey ? "Connect Wallet" : loading ? "..." : "PLACE BET"}
          </button>
        </div>
      )}

      {/* Instruction */}
      {selected.size === 0 && price > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-bg-secondary/70 border border-border-primary/50 backdrop-blur-sm pointer-events-none">
          <span className="text-[11px] text-text-muted font-mono">
            TAP A CELL — IF PRICE HITS IT, YOU WIN THE MULTIPLIER
          </span>
        </div>
      )}

      {/* TX */}
      {txSig && (
        <div className="absolute top-3 right-20 z-20">
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-accent-green hover:underline"
          >
            TX: {txSig.slice(0, 12)}...
          </a>
        </div>
      )}
      {error && (
        <div className="absolute top-3 right-20 z-20">
          <span className="text-[10px] font-mono text-accent-red">{error.slice(0, 50)}</span>
        </div>
      )}

      {/* Chart behind */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Grid overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        onClick={onClick}
        onMouseMove={onMove}
      />
    </div>
  );
}
