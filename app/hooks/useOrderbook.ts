"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BINANCE_WS_DEPTH, BINANCE_WS_TRADE } from "@/lib/constants";

export interface OrderLevel {
  price: number;
  qty: number;
  total: number;
}

export interface OrderbookState {
  bids: OrderLevel[];
  asks: OrderLevel[];
  midPrice: number;
  lastPrice: number;
  prevPrice: number;
  spread: number;
  connected: boolean;
}

export function useOrderbook(): OrderbookState {
  const [bids, setBids] = useState<OrderLevel[]>([]);
  const [asks, setAsks] = useState<OrderLevel[]>([]);
  const [lastPrice, setLastPrice] = useState(0);
  const [prevPrice, setPrevPrice] = useState(0);
  const [connected, setConnected] = useState(false);
  const depthWsRef = useRef<WebSocket | null>(null);
  const tradeWsRef = useRef<WebSocket | null>(null);
  const reconnectDepthRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectTradeRef = useRef<ReturnType<typeof setTimeout>>();

  const connectDepth = useCallback(() => {
    if (depthWsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(BINANCE_WS_DEPTH);
    depthWsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const rawBids: [string, string][] = data.bids || [];
      const rawAsks: [string, string][] = data.asks || [];

      const parsedBids: OrderLevel[] = [];
      let bidTotal = 0;
      for (const [p, q] of rawBids) {
        const price = parseFloat(p);
        const qty = parseFloat(q);
        bidTotal += qty;
        parsedBids.push({ price, qty, total: bidTotal });
      }

      const parsedAsks: OrderLevel[] = [];
      let askTotal = 0;
      for (const [p, q] of rawAsks) {
        const price = parseFloat(p);
        const qty = parseFloat(q);
        askTotal += qty;
        parsedAsks.push({ price, qty, total: askTotal });
      }

      setBids(parsedBids);
      setAsks(parsedAsks);
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectDepthRef.current = setTimeout(connectDepth, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  const connectTrade = useCallback(() => {
    if (tradeWsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(BINANCE_WS_TRADE);
    tradeWsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const newPrice = parseFloat(data.p);
      if (newPrice > 0) {
        setLastPrice((prev) => {
          setPrevPrice(prev);
          return newPrice;
        });
      }
    };

    ws.onclose = () => {
      reconnectTradeRef.current = setTimeout(connectTrade, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connectDepth();
    connectTrade();
    return () => {
      clearTimeout(reconnectDepthRef.current);
      clearTimeout(reconnectTradeRef.current);
      depthWsRef.current?.close();
      tradeWsRef.current?.close();
    };
  }, [connectDepth, connectTrade]);

  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : lastPrice;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;

  return { bids, asks, midPrice, lastPrice, prevPrice, spread, connected };
}
