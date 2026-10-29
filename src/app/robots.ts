import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Les pages de maison (/m/<jeton>), d'avis et l'admin ne sont jamais indexées
 *  (aussi marquées noindex par le middleware). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/livreur", "/m/", "/avis", "/avis-plateforme", "/suivi/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
