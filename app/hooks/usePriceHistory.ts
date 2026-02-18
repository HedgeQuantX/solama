"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BINANCE_WS_TRADE } from "@/lib/constants";

export interface Tick {
  time: number;
  value: number;
}

export function usePriceHistory() {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [price, setPrice] = useState(0);
  const [prevPrice, setPrevPrice] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(BINANCE_WS_TRADE);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const newPrice = parseFloat(data.p);
      const time = Math.floor(data.T / 1000);

      if (newPrice > 0) {
        setPrevPrice((prev) => prev || newPrice);
        setPrice((prev) => {
          setPrevPrice(prev);
          return newPrice;
        });

        setTicks((prev) => {
          const tick = { time, value: newPrice };
          // Keep last tick per second, max 300 points
          if (prev.length > 0 && prev[prev.length - 1].time === time) {
            const updated = [...prev];
            updated[updated.length - 1] = tick;
            return updated;
          }
          const next = [...prev, tick];
          return next.length > 300 ? next.slice(-300) : next;
        });
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const direction: "up" | "down" | "neutral" =
    price > prevPrice ? "up" : price < prevPrice ? "down" : "neutral";

  return { ticks, price, prevPrice, direction, connected };
}
