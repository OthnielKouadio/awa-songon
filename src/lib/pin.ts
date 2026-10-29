/** Codes devinés en premier : 4 chiffres identiques, suites (0123, 9876…), quelques
 *  classiques, et tout code contenant le numéro de la maison (« 0012 » pour
 *  PROMO 012). Même règle que public._code_trop_simple (supabase/schema.sql) :
 *  vérifiée ici pour prévenir avant l'envoi, imposée par le serveur. */
const CLASSIQUES = new Set(["1212", "2121", "1122", "1313", "2580", "0852", "6969", "0007", "1004", "2000", "1984", "1990"]);

export function codeTropSimple(code: string, numeroMaison?: number): boolean {
  return (
    /^(\d)\1{3}$/.test(code) ||
    "0123456789".includes(code) ||
    "9876543210".includes(code) ||
    CLASSIQUES.has(code) ||
    (numeroMaison !== undefined && code.includes(String(numeroMaison).padStart(3, "0")))
  );
}

/** « PROMO 012 » → 12 (pour la règle ci-dessus). */
export function numeroDepuisCode(codeAffichage: string): number | undefined {
  const m = /(\d+)\s*$/.exec(codeAffichage);
  return m ? Number(m[1]) : undefined;
}
