import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Les chemins secrets (admin, chauffeur, recrutement) n'apparaissent PAS ici :
 *  robots.txt est public, les y lister reviendrait à les publier. Ils sont déjà
 *  marqués « noindex » par le middleware (X-Robots-Tag). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/suivi/", "/bloque"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
