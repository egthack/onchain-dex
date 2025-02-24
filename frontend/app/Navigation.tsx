"use client";

import { ReactNode } from "react";
import Link from "next/link";
import ConnectButton from "../components/ConnectButton";

export default function Navigation({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-trading-black">
      <header className="border-b border-trading-light">
        <nav className="container mx-auto px-3 py-2 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-2xl gradient-text tracking-tight flex items-center gap-2"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h16v16H4V4z" fill="url(#gradient)" />
                <path
                  d="M8 16l4-8 4 8H8z"
                  fill="currentColor"
                  className="text-trading-black"
                />
                <defs>
                  <linearGradient id="gradient" x1="4" y1="4" x2="20" y2="20">
                    <stop offset="0%" stopColor="#00E8B5" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                </defs>
              </svg>
              RiseX
            </Link>
            <div className="flex gap-4">
              <Link
                href="/"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Trade
              </Link>
              <Link
                href="/faucet"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Faucet
              </Link>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <ConnectButton />
          </div>
        </nav>
      </header>
      <main className="container mx-auto p-3">{children}</main>
    </div>
  );
}
