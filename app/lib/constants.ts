import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "AkxWQaZUi5utcadKd31jUX7psx6NBu9ecH9dssXCJgLf"
);

export const RPC_ENDPOINT = "https://api.devnet.solana.com";

export const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade";

export const ZONE_MULTIPLIERS = [
  { distance: 0.1, multiplier: 15000, label: "x1.5" },
  { distance: 0.25, multiplier: 20000, label: "x2.0" },
  { distance: 0.5, multiplier: 30000, label: "x3.0" },
  { distance: 1.0, multiplier: 50000, label: "x5.0" },
] as const;

export const ROUND_DURATION_MS = 60_000;
export const MAX_ZONES_PER_BET = 2;
export const MIN_BET_SOL = 0.01;
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const PRICE_DECIMALS = 2;
