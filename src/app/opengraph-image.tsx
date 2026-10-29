import { ImageResponse } from "next/og";

// Aperçu affiché quand le lien est partagé (WhatsApp, Facebook…). Généré au build.
export const alt = "Distribution Eau — Livraison d'eau dans votre cité";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 64, padding: 80, background: "#F7FBFF", color: "#0A1931" }}>
        <div
          style={{
            width: 260,
            height: 260,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 56,
            border: "6px solid #0A1931",
            background: "#E0F2FF",
            boxShadow: "12px 12px 0 #0A1931",
          }}
        >
          <svg width="170" height="170" viewBox="0 0 24 24">
            <path d="M12 2.5c3.6 4.3 6.2 7.5 6.2 10.8a6.2 6.2 0 1 1-12.4 0C5.8 10 8.4 6.8 12 2.5z" fill="#0096FF" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
            Distribution<span style={{ color: "#0096FF", marginLeft: 20 }}>Eau</span>
          </div>
          <div style={{ fontSize: 40, marginTop: 20, color: "rgba(10,25,49,.75)" }}>Eau livrée chez vous, dans votre cité</div>
          <div style={{ fontSize: 32, marginTop: 28, color: "#0096FF", fontWeight: 700 }}>Scannez le QR de votre maison · commandez</div>
        </div>
      </div>
    ),
    size
  );
}
