import type { Metadata, Viewport } from "next";
import { Sora, Space_Grotesk } from "next/font/google";
import CookieBanner from "@/components/CookieBanner";
import PwaInstall from "@/components/PwaInstall";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["600", "700", "800"] });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

const DESCRIPTION = "Livraison d'eau dans votre cité. Scannez l'autocollant de votre maison et commandez en 2 clics.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Distribution Eau — Livraison d'eau dans votre cité",
  description: DESCRIPTION,
  applicationName: "Distribution Eau",
  // L'image (opengraph-image.tsx) est ajoutée automatiquement par Next.js.
  openGraph: {
    type: "website",
    locale: "fr_CI",
    siteName: "Distribution Eau",
    title: "Distribution Eau — Livraison d'eau dans votre cité",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Distribution Eau — Livraison d'eau dans votre cité", description: DESCRIPTION },
  // app/manifest.ts est servi automatiquement sur /manifest.webmanifest et lié
  // dans le <head> par Next.js — pas besoin de l'ajouter ici.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Distribution Eau",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F7FBFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sora.variable} ${grotesk.variable}`}>
      <head>
        {/* Capture beforeinstallprompt AVANT l'hydratation React : Chrome peut le
            déclencher dès que la page charge, souvent avant qu'un useEffect ait pu
            s'accrocher — et l'évènement n'est jamais rejoué une fois raté. On le
            stocke sur window pour que usePwaInstall le récupère à son montage. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__awaBip=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__awaBip=e;window.dispatchEvent(new Event("awa:bip-ready"));});`,
          }}
        />
        {/* Clash Display (Fontshare) : titres. Sora sert de repli si le CDN est bloqué. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap"
        />
      </head>
      <body className="min-h-dvh">
        <PwaInstall />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
