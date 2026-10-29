import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/login", "/inscription", "/cgu", "/confidentialite"].map((p) => ({ url: `${siteUrl}${p}` }));
}
