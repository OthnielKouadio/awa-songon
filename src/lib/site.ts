/** URL publique du site (sans / final), pour le SEO : robots, sitemap, OpenGraph.
 *  À définir dans l'env (NEXT_PUBLIC_SITE_URL) au passage sur le domaine .com. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://awa-songon.vercel.app").replace(/\/+$/, "");
