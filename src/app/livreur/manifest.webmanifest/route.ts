import { basesEspaces } from "@/lib/chemins";
import { manifestEspace, reponseManifest } from "@/lib/manifestEspace";

export const dynamic = "force-dynamic";

/** Appli installable « Livreur » : s'ouvre directement sur l'espace livreur (chemin secret). */
export function GET() {
  return reponseManifest(manifestEspace(basesEspaces().livreur, "Livreur", "/distribution-eau-livreur"));
}
