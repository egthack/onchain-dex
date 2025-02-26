import type { ReactNode } from "react";
import { Providers } from "./providers";
import Navigation from "./Navigation";
import "./globals.css";
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700']
})

export const metadata = {
  title: "RiseX - Advanced Trading Platform",
  description: "Next generation decentralized trading platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <Providers>
          <Navigation>{children}</Navigation>
        </Providers>
      </body>
    </html>
  );
}
