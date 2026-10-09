import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { network } from "@/lib/env";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://imprest-chi.vercel.app";
const NAME = "Imprest";
const DESCRIPTION =
  "Funded trading desks for perpetual futures on Perpl (Monad). Stake, trade under rules a contract enforces, graduate to pool credit, and claim realized profit by contract. Monad testnet, test tokens only.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: NAME,
  title: { default: `${NAME}: funded trading desks on Perpl${network.environment === "mainnet" ? "" : ` (${network.label})`}`, template: `%s · ${NAME}` },
  description: DESCRIPTION,
  keywords: ["Imprest", "Monad", "Perpl", "perpetual futures", "funded trading", "prop trading", "onchain risk", "AUSD", "testnet"],
  authors: [{ name: "Imprest" }],
  creator: "Imprest",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: NAME,
    title: `${NAME}: trading credit with risk enforced at the order layer`,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${NAME}: trading credit with risk enforced at the order layer`,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#f6f5f1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
