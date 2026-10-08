import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { network } from "@/lib/env";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: `Imprest${network.environment === "mainnet" ? "" : ` (${network.label})`}`, template: "%s · Imprest" },
  description:
    "Use-restricted trading credit priced on onchain trading history. Risk limits enforced inside every Perpl order; realized profit paid by contract.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint (no light flash for dark-mode users). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
