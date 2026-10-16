import { NextResponse, type NextRequest } from "next/server";
import { type Area, INTERNAL, privatePaths, readSessionCookie, SESSION_COOKIE, verifySession } from "@/lib/private-routes";

/**
 * Accès (chemins dans .env.local, voir src/lib/private-routes.ts) :
 * - /, /login, /inscription, /dashboard… → public (clients)
 * - /<DRIVER_SIGNUP_PATH> → inscription chauffeur, sans compte (lien secret, non indexé)
 * - /<ADMIN_LOGIN_PATH>   → connexion admin, toujours affichée ;
 *                           admin déjà connecté → son cockpit
 * - /<DRIVER_PATH>/…      → chauffeur uniquement
 * - /<ADMIN_PATH>/…       → admin uniquement
 *     pas de session (ou jeton expiré)  → /login (/<ADMIN_LOGIN_PATH> pour l'admin)
 *     session d'un autre rôle           → 404 (pas 403 : on ne confirme pas que la page existe)
 * - dossiers réels (/admin, /chauffeur, /acces-admin, /recrutement-chauffeur) → 404
 * - ?demo=… hors mode démo → retiré de l'URL
 * - http:// → https:// (301) si FORCE_HTTPS=true
 */
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Vercel redirige déjà vers HTTPS ; filet de sécurité derrière un autre proxy.
  // Activable seulement : sans proxy HTTPS devant (ex. `next start` en local),
  // la requête arrive toujours en http et la redirection bouclerait.
  if (process.env.FORCE_HTTPS === "true" && req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "http") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  if (searchParams.has("demo") && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    const url = req.nextUrl.clone();
    url.searchParams.delete("demo");
    return NextResponse.redirect(url);
  }

  const [, first = "", ...rest] = pathname.split("/");
  if ((Object.values(INTERNAL) as string[]).includes(first)) return notFound(req);

  const paths = privatePaths();
  const area = first ? (Object.keys(paths) as Area[]).find((a) => paths[a] === first) : undefined;
  if (!area) return NextResponse.next();

  const creds = readSessionCookie(req.cookies.get(SESSION_COOKIE)?.value);

  if (area === "adminLogin") {
    // Toujours servie (lien secret, non indexé) : une session client ou chauffeur
    // ouverte dans ce navigateur ne doit pas empêcher l'admin de se connecter —
    // sa connexion remplace simplement cette session. Admin déjà connecté → cockpit.
    if (creds?.role === "admin" && paths.admin && (await verifySession(creds))) return NextResponse.redirect(new URL(`/${paths.admin}`, req.url));
  } else if (area === "chauffeur" || area === "admin") {
    const login = area === "admin" && paths.adminLogin ? `/${paths.adminLogin}` : "/login";
    if (!creds) return NextResponse.redirect(new URL(login, req.url));
    if (creds.role !== area) return notFound(req);
    if (!(await verifySession(creds))) {
      const res = NextResponse.redirect(new URL(login, req.url));
      res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/" + [INTERNAL[area], ...rest].join("/");
  const res = NextResponse.rewrite(url);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  // Les sites tiers (tuiles OpenStreetMap, polices) ne reçoivent que l'origine du
  // site, jamais le chemin secret. Pas « no-referrer » : OSM bloque (403) les
  // tuiles demandées sans Referer.
  res.headers.set("Referrer-Policy", "strict-origin");
  return res;
}

/** Réécriture vers une route inexistante : page not-found de Next, statut 404. */
function notFound(req: NextRequest) {
  return NextResponse.rewrite(new URL("/_introuvable", req.url));
}

export const config = {
  // Tout sauf l'API, les fichiers Next et les fichiers statiques.
  matcher: ["/((?!api/|_next/|icons/|sw\\.js|manifest\\.webmanifest|favicon|icon\\.png|apple-icon\\.png|robots\\.txt|sitemap\\.xml|opengraph-image).*)"],
};
