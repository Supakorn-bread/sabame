import type { Metadata, Viewport } from "next";
import { Geist, Manrope } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: { default: "Sabame", template: "%s · Sabame" },
  description: "A calm daily anime tracker for the stories you are watching.",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#14121b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${manrope.variable} ${geist.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
