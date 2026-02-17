"use client";

import Header from "@/components/Header";
import Chart from "@/components/Chart";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Chart />
      </main>
    </div>
  );
}
