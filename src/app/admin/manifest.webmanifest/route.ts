import { basesEspaces } from "@/lib/chemins";
import { manifestEspace, reponseManifest } from "@/lib/manifestEspace";

export const dynamic = "force-dynamic";

/** Appli installable « Admin » : s'ouvre directement sur le cockpit (chemin secret). */
export function GET() {
  return reponseManifest(manifestEspace(basesEspaces().admin, "Admin", "/distribution-eau-admin"));
}
