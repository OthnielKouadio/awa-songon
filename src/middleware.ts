import { NextResponse, type NextRequest } from "next/server";
import { cheminsSecrets, INTERNE } from "@/lib/chemins";

/**
 * - http:// → https:// (301) si FORCE_HTTPS=true (filet derrière un proxy autre que Vercel).
 * - Chemins secrets (V2, voir src/lib/chemins.ts) : /<ADMIN_PATH> → admin,
 *   /<DRIVER_PATH> → livreur, /<DRIVER_SIGNUP_PATH> → recrutement-chauffeur.
 *   Les dossiers réels répondent 404 dès qu'un secret est défini.
 * - Pages privées (admin, livreur, recrutement, /m/…, /avis…) : jamais indexées,
 *   aucun Referer envoyé (le jeton d'une maison ne part jamais vers un site tiers).
 *
 * La sécurité ne repose PAS sur ce fichier : chaque fonction de la base exige
 * un admin 2FA, un jeton de livreur ou le code maison.
 */
export function middleware(req: NextRequest) {
  if (process.env.FORCE_HTTPS === "true" && req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "http") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  const [, premier = "", ...reste] = req.nextUrl.pathname.split("/");
  const c = cheminsSecrets();
  const secrets: Record<string, string> = {};
  if (c.admin) secrets[c.admin] = INTERNE.admin;
  if (c.adminLogin) secrets[c.adminLogin] = INTERNE.admin;
  if (c.livreur) secrets[c.livreur] = INTERNE.livreur;
  if (c.recrutement) secrets[c.recrutement] = INTERNE.recrutement;

  let res: NextResponse;
  if (secrets[premier]) {
    const url = req.nextUrl.clone();
    url.pathname = "/" + [secrets[premier], ...reste].join("/");
    res = NextResponse.rewrite(url);
  } else if (
    (premier === INTERNE.admin && (c.admin || c.adminLogin)) ||
    (premier === INTERNE.livreur && c.livreur) ||
    (premier === INTERNE.recrutement && c.recrutement)
  ) {
    // Dossier réel appelé directement alors qu'un chemin secret existe : 404.
    return NextResponse.rewrite(new URL("/_introuvable", req.url));
  } else if (["admin", "livreur", "recrutement-chauffeur", "m", "avis", "avis-plateforme", "suivi"].includes(premier)) {
    res = NextResponse.next();
  } else {
    return NextResponse.next();
  }
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  // Tout sauf l'API, les fichiers Next et les fichiers statiques.
  matcher: ["/((?!api/|_next/|icons/|sw\\.js|manifest\\.webmanifest|favicon|icon\\.png|apple-icon\\.png|robots\\.txt|sitemap\\.xml|opengraph-image).*)"],
};
