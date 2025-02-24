import { ReactNode } from "react";
import { Providers } from "./providers";
import Navigation from "./Navigation";
import "./globals.css";

export const metadata = {
  title: "RiseX - Advanced Trading Platform",
  description: "Next generation decentralized trading platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <Navigation>{children}</Navigation>
        </Providers>
      </body>
    </html>
  );
}
