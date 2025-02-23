import "tailwindcss/tailwind.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "./Providers";
import { App } from "./App";
import { Explorer } from "./mud/Explorer";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "./ui/ErrorFallback";

const rootElement = document.getElementById("react-root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Providers>
          <App />
          <Explorer />
        </Providers>
      </ErrorBoundary>
    </StrictMode>
  );
} else {
  console.error("Failed to find the root element");
}
