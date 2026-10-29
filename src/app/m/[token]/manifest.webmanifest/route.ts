import { manifestEspace, reponseManifest } from "@/lib/manifestEspace";

const QR = /^[2-9A-HJ-NP-Z]{6}$/;

/**
 * Appli des familles installée depuis la page d'une maison : elle s'ouvre
 * directement sur cette maison. Même identifiant que l'appli publique (« / ») :
 * une seule appli Distribution Eau par téléphone, mise à jour vers la maison.
 * Le jeton est déjà dans l'adresse de la page : le manifeste ne révèle rien de plus.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const qr = (await params).token.trim().toUpperCase();
  if (!QR.test(qr)) return new Response("Introuvable", { status: 404 });
  return reponseManifest({ ...manifestEspace(`/m/${qr}`, "Distribution Eau", "/"), name: "Distribution Eau — Livraison d'eau", scope: "/" });
}
