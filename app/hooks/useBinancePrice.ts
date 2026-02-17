"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BINANCE_WS_URL } from "@/lib/constants";

interface PriceTick {
  price: number;
  time: number;
}

export function useBinancePrice() {
  const [price, setPrice] = useState<number>(0);
  const [prevPrice, setPrevPrice] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(BINANCE_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const newPrice = parseFloat(data.p);
      if (newPrice > 0) {
        setPrice((prev) => {
          setPrevPrice(prev);
          return newPrice;
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

  return { price, prevPrice, direction, connected };
}

export type { PriceTick };
