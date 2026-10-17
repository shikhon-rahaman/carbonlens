import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";
import { TooltipProvider } from "@/components/ui/tooltip";

import "leaflet/dist/leaflet.css";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "CarbonLens — Evidence before claims",
    template: "%s | CarbonLens"
  },
  description:
    "Explore satellite-derived vegetation evidence with transparent scores, provenance, and clear limitations.",
  applicationName: "CarbonLens",
  keywords: ["satellite evidence", "vegetation health", "NDVI", "climate technology"],
  robots: { index: false, follow: false },
  openGraph: {
    title: "CarbonLens — Evidence before claims",
    description:
      "Satellite-derived vegetation evidence, made clearer. A testnet demonstration.",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#111816" }
  ],
  colorScheme: "light dark"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Providers nonce={nonce}>
          <TooltipProvider>
            <a
              className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only"
              href="#main-content"
            >
              Skip to content
            </a>
            <Navbar />
            {children}
            <Footer />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
