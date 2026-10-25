import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equity Lens India – financial analysis & valuation workbench",
  description:
    "Explore financial performance, comparable-company and DCF valuation for NSE/BSE-listed companies using your own public-source data. No API keys. Demo data is synthetic.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

// Applies the saved theme before first paint to avoid a flash. Falls back to the OS setting via CSS.
const THEME_SCRIPT = `try{var t=localStorage.getItem('eli-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
