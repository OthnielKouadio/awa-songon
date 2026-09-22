import type { Metadata, Viewport } from "next";
import { Sora, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["600", "700", "800"] });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "AWA SONGON — Livraison d'eau par tricycle",
  description: "De l'eau à ton lot en 2 clics. Commande ton tricycle de Songon.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7FBFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sora.variable} ${grotesk.variable}`}>
      <head>
        {/* Clash Display (Fontshare) : titres. Sora sert de repli si le CDN est bloqué. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap"
        />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
