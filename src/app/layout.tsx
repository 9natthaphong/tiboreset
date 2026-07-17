import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { PublicAnalytics } from "@/components/public-analytics";

const editorial = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-editorial", display: "swap" });
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Sacred Forecast — Reset Oracle",
  description: "An unofficial, deterministic forecast for Codex reset signals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${editorial.variable} ${sans.variable} ${mono.variable}`}><body>{children}<PublicAnalytics/></body></html>;
}
