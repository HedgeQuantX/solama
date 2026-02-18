"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
  LineType,
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
  payout: number;
  multiBps: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const GRID_COLS = 10;
const GRID_ROWS = 8;
const BET_PRESETS = [0.01, 0.05, 0.1, 0.5];
const MAX_SELECT = 2;
const RIGHT_BARS = 50;
const SOL_PRICE_USD = 170;

function getMultiplier(rowDist: number): number {
  if (rowDist === 0) return 15_000;
  if (rowDist === 1) return 30_000;
  if (rowDist === 2) return 55_000;
  if (rowDist === 3) return 100_000;
  return 200_000 + (rowDist - 4) * 150_000;
}

function formatPayout(val: number): string {
  if (val >= 1000) return `+$${(val / 1000).toFixed(1)}K`;
  if (val >= 100) return `+$${Math.round(val)}`;
  if (val >= 10) return `+$${val.toFixed(1)}`;
  return `+$${val.toFixed(2)}`;
}

export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cellsRef = useRef<Cell[]>([]);
  const animRef = useRef<number>(0);
  const hoverIdRef = useRef("");
  const hitCellsRef = useRef<Map<string, number>>(new Map());

  const { ticks, price, direction, connected } = usePriceHistory();
  const { publicKey } = useWallet();
  const { program } = useProgram();

  const [betAmount, setBetAmount] = useState(0.05);
  const [selected, setSelected] = useState<Map<string, Cell>>(new Map());
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleCell = useCallback((cell: Cell) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(cell.id)) {
        next.delete(cell.id);
      } else if (next.size < MAX_SELECT) {
        next.set(cell.id, cell);
      }
      return next;
    });
  }, []);

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
      setError(e instanceof Error ? e.message : "TRANSACTION FAILED");
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, selected, betAmount]);

  // Init chart — large rightOffset to leave space for grid
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#08090c" },
        textColor: "#616161",
        fontSize: 11,
        fontFamily: "Rajdhani, sans-serif",
        attributionLogo: false,
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
        borderColor: "#1a1e28",
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#1a1e28",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: RIGHT_BARS,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#00e5ff",
      lineWidth: 2,
      lineType: LineType.Curved,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBackgroundColor: "#ffffff",
      crosshairMarkerBorderColor: "#00e5ff",
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

  // Draw grid — RIGHT side only, ahead of price
  useEffect(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    if (!canvas || !chart) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      const priceScaleW = 60;
      const timeScaleH = 26;
      const chartW = cw - priceScaleW;
      const chartH = ch - timeScaleH;

      // Find where the last data point ends on screen
      // The rightOffset creates empty space — that's where our grid goes
      const timeScale = chart.timeScale();
      const visRange = timeScale.getVisibleLogicalRange();
      let gridStartX = chartW * 0.5;

      if (visRange) {
        const totalBars = visRange.to - visRange.from;
        if (totalBars > 0) {
          // The data ends at (visRange.to - RIGHT_BARS)
          // So the empty zone starts at that pixel position
          const dataEndLogical = visRange.to - RIGHT_BARS;
          const dataEndRatio = (dataEndLogical - visRange.from) / totalBars;
          gridStartX = Math.max(chartW * 0.3, chartW * dataEndRatio + 10);
        }
      }

      const gridW = chartW - gridStartX;
      const cellW = gridW / GRID_COLS;
      const cellH = chartH / GRID_ROWS;

      const basePrice = price > 0 ? price : 100_000;
      const priceStep = basePrice * 0.0012;
      const midRow = Math.floor(GRID_ROWS / 2);
      const hoverId = hoverIdRef.current;
      const now = Date.now();

      const CYAN = { r: 0, g: 229, b: 255 };
      const PINK = { r: 194, g: 24, b: 91 };
      const FADE_MS = 800;
      const hitCells = hitCellsRef.current;

      const cells: Cell[] = [];

      for (let row = 0; row < GRID_ROWS; row++) {
        const rowDist = Math.abs(row - midRow);
        const priceTop = basePrice + (midRow - row) * priceStep;
        const priceBot = basePrice + (midRow - row - 1) * priceStep;
        const rowHit = price > 0
          && price >= Math.min(priceTop, priceBot)
          && price <= Math.max(priceTop, priceBot);

        for (let col = 0; col < GRID_COLS; col++) {
          const id = `${row}-${col}`;
          const x = gridStartX + col * cellW;
          const y = row * cellH;

          // Columns closer to the price (left) have lower payouts
          // Columns further right have higher payouts
          const colFactor = 1 + col * 0.12;
          const baseBps = getMultiplier(rowDist);
          const effectiveBps = Math.round(baseBps * colFactor);
          const payout = (betAmount * effectiveBps * SOL_PRICE_USD) / 10_000;

          const sel = selected.has(id);
          const hover = hoverId === id;

          // Track hit cells for fade
          if (rowHit && col === 0 && !hitCells.has(id)) {
            hitCells.set(id, now);
          }

          const hitTime = hitCells.get(id);
          const elapsed = hitTime ? now - hitTime : 0;
          const fading = hitTime !== undefined && !rowHit;
          const fadeAlpha = fading ? Math.max(0, 1 - elapsed / FADE_MS) : 1;
          const gone = fading && fadeAlpha <= 0;

          if (gone && !sel) {
            cells.push({
              row, col, id, priceTop, priceBot,
              payout, multiBps: effectiveBps,
              x, y, w: cellW, h: cellH,
            });
            continue;
          }

          ctx.globalAlpha = sel ? 1 : fadeAlpha;

          // --- BACKGROUND ---
          if (sel) {
            ctx.fillStyle = `rgba(${CYAN.r},${CYAN.g},${CYAN.b},0.15)`;
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          } else if (rowHit && col === 0) {
            ctx.fillStyle = `rgba(${PINK.r},${PINK.g},${PINK.b},0.1)`;
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          } else if (hover) {
            ctx.fillStyle = `rgba(${CYAN.r},${CYAN.g},${CYAN.b},0.06)`;
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          }

          // --- BORDER — dotted grid ---
          ctx.setLineDash([2, 3]);
          let borderAlpha = 0.07;
          if (sel) borderAlpha = 0;
          else if (hover) borderAlpha = 0.15;

          if (borderAlpha > 0) {
            ctx.strokeStyle = `rgba(${PINK.r},${PINK.g},${PINK.b},${borderAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
          }
          ctx.setLineDash([]);

          // --- SELECTED BORDER — cyan glow ---
          if (sel) {
            const pulse = 0.5 + Math.sin(now / 400) * 0.2;
            ctx.shadowColor = `rgba(${CYAN.r},${CYAN.g},${CYAN.b},${pulse})`;
            ctx.shadowBlur = 14;
            ctx.strokeStyle = `rgba(${CYAN.r},${CYAN.g},${CYAN.b},0.8)`;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
            ctx.shadowBlur = 0;
          }

          // --- TEXT ---
          const cx = x + cellW / 2;
          const cy = y + cellH / 2;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (sel) {
            ctx.font = "600 9px Rajdhani, sans-serif";
            ctx.fillStyle = `rgba(${CYAN.r},${CYAN.g},${CYAN.b},0.6)`;
            ctx.fillText(`${betAmount} SOL`, cx, cy - 10);

            ctx.font = "bold 15px Rajdhani, sans-serif";
            ctx.fillStyle = "#f5f5f5";
            ctx.fillText(formatPayout(payout), cx, cy + 4);

            if (rowHit && col === 0) {
              ctx.font = "bold 9px Rajdhani, sans-serif";
              ctx.fillStyle = "#fdd835";
              ctx.fillText("HIT!", cx, cy + 17);
            }
          } else {
            const isHighPayout = rowDist >= 3;
            ctx.font = `${isHighPayout ? "600 12px" : "500 10px"} Rajdhani, sans-serif`;
            if (isHighPayout) {
              ctx.fillStyle = `rgba(253,216,53,${0.35 + rowDist * 0.06})`;
            } else {
              ctx.fillStyle = `rgba(${CYAN.r},${CYAN.g},${CYAN.b},${0.18 + rowDist * 0.04})`;
            }
            ctx.fillText(formatPayout(payout), cx, cy);
          }

          ctx.globalAlpha = 1;

          cells.push({
            row, col, id, priceTop, priceBot,
            payout, multiBps: effectiveBps,
            x, y, w: cellW, h: cellH,
          });
        }
      }

      // Clean up faded
      hitCells.forEach((t, cid) => {
        if (now - t > FADE_MS) hitCells.delete(cid);
      });

      cellsRef.current = cells;
      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [price, selected, betAmount]);

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
  const maxPayout = selectedArr.reduce((a, c) => a + c.payout, 0);

  const dirColor =
    direction === "up" ? "text-accent-cyan" : direction === "down" ? "text-accent-pink" : "text-accent-white";

  return (
    <div className="relative flex-1 min-h-0">
      {/* PRICE */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-3 pointer-events-none">
        <span className="text-xs text-text-muted font-display uppercase">BTC/USDT</span>
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent-cyan" : "bg-accent-pink"}`} />
        <span className={`text-xl font-display font-bold uppercase ${dirColor} transition-colors duration-100`}>
          {price > 0
            ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "---"}
        </span>
      </div>

      {/* BET SELECTOR */}
      <div className="absolute top-12 left-4 z-20 flex items-center gap-1.5">
        <span className="text-[10px] text-text-muted mr-1 font-display uppercase">BET</span>
        {BET_PRESETS.map((val) => (
          <button
            key={val}
            onClick={() => setBetAmount(val)}
            className={`px-2 py-1 rounded text-[11px] font-display uppercase border transition-all ${
              betAmount === val
                ? "bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan"
                : "bg-bg-tertiary/60 border-border-primary/50 text-text-muted hover:border-border-hover"
            }`}
          >
            {val}
          </button>
        ))}
        <span className="text-[10px] text-text-muted ml-0.5 font-display uppercase">SOL</span>
      </div>

      {/* SELECTION COUNT */}
      {selected.size > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="text-xs font-display text-accent-cyan uppercase">
            {selected.size}/{MAX_SELECT} CELLS
          </span>
        </div>
      )}

      {/* CONFIRM BAR */}
      {selected.size > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 px-5 py-2.5 rounded-xl bg-bg-secondary/95 border border-border-primary backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-text-muted font-display uppercase">TOTAL BET</span>
            <span className="text-sm font-display font-bold text-accent-white uppercase">{totalBet.toFixed(2)} SOL</span>
          </div>
          <div className="w-px h-8 bg-border-primary" />
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-text-muted font-display uppercase">MAX WIN</span>
            <span className="text-sm font-display font-bold text-accent-yellow uppercase">${maxPayout.toFixed(2)}</span>
          </div>
          <button
            onClick={placeBet}
            disabled={!publicKey || loading}
            className={`ml-2 px-5 py-2 rounded-lg text-xs font-bold font-display uppercase transition-all ${
              !publicKey
                ? "bg-bg-tertiary text-text-muted cursor-not-allowed"
                : loading
                  ? "bg-accent-pink/20 text-accent-pink cursor-wait"
                  : "bg-accent-cyan text-bg-primary hover:bg-accent-cyan/90 active:scale-95"
            }`}
          >
            {!publicKey ? "CONNECT WALLET" : loading ? "..." : "PLACE BET"}
          </button>
        </div>
      )}

      {/* INSTRUCTION */}
      {selected.size === 0 && price > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-bg-secondary/70 border border-border-primary/50 backdrop-blur-sm pointer-events-none">
          <span className="text-[11px] text-text-muted font-display uppercase">
            TAP UP TO {MAX_SELECT} CELLS AHEAD OF THE PRICE — IF IT HITS THEM, YOU WIN
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
            className="text-[10px] font-display uppercase text-accent-cyan hover:underline"
          >
            TX: {txSig.slice(0, 12)}...
          </a>
        </div>
      )}
      {error && (
        <div className="absolute top-3 right-20 z-20">
          <span className="text-[10px] font-display uppercase text-accent-pink">{error.slice(0, 50)}</span>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        onClick={onClick}
        onMouseMove={onMove}
      />
    </div>
  );
}
