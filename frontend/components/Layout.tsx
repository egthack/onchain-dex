import { ReactNode } from "react";
import Link from "next/link";
import ConnectButton from "./ConnectButton";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
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
            <button
              id="theme-toggle"
              className="p-2 rounded-lg bg-trading-light hover:bg-opacity-80"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            </button>
            <ConnectButton />
          </div>
        </nav>
      </header>
      <main className="container mx-auto p-3">{children}</main>
    </div>
  );
}
