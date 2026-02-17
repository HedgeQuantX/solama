import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "AkxWQaZUi5utcadKd31jUX7psx6NBu9ecH9dssXCJgLf"
);

export const RPC_ENDPOINT = "https://api.devnet.solana.com";

export const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade";

// Zone grid: rows of price levels around current price
// Each row = a distance from price, each cell = a multiplier
export const ZONE_GRID = [
  { offset: 0.02, multiplier: "x0.5", bps: 5_000 },
  { offset: 0.05, multiplier: "x1", bps: 10_000 },
  { offset: 0.08, multiplier: "x1.5", bps: 15_000 },
  { offset: 0.12, multiplier: "x2", bps: 20_000 },
  { offset: 0.18, multiplier: "x3", bps: 30_000 },
  { offset: 0.25, multiplier: "x5", bps: 50_000 },
  { offset: 0.35, multiplier: "x8", bps: 80_000 },
  { offset: 0.50, multiplier: "x10", bps: 100_000 },
] as const;

export const MAX_ZONES_PER_BET = 2;
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const PRICE_DECIMALS = 2;
