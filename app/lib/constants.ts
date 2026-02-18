import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "AkxWQaZUi5utcadKd31jUX7psx6NBu9ecH9dssXCJgLf"
);

export const RPC_ENDPOINT = "https://api.devnet.solana.com";

export const BINANCE_WS_TRADE = "wss://stream.binance.com:9443/ws/btcusdt@trade";
export const BINANCE_WS_DEPTH = "wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms";

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const PRICE_DECIMALS = 2;

export const TIME_WINDOWS = [30, 60, 120] as const;
export const BET_PRESETS = [0.01, 0.05, 0.1, 0.5] as const;
export const MAX_PREDICTIONS = 2;
