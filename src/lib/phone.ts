/**
 * Téléphones ivoiriens : UNE seule forme canonique partout (inscription, login,
 * saisie manuelle, comparaisons) — `0XXXXXXXXX`, 10 chiffres.
 *
 *   0789855418 · 07 89 85 54 18 · +225789855418 · +2250789855418
 *   00225789855418 · 225789855418                        → 0789855418
 *
 * ⚠ Doit rester identique à public.normalize_phone() dans supabase/schema.sql :
 * la base renormalise de son côté et la colonne phone_normalized est UNIQUE.
 */
export function normalizePhone(phone: string): string {
  let p = (phone ?? "").replace(/[^0-9+]/g, "");
  if (p.startsWith("+225")) p = p.slice(4);
  else if (p.startsWith("00225")) p = p.slice(5);
  // "225…" sans + : seulement s'il reste un numéro complet derrière (un numéro
  // local à 10 chiffres ne doit jamais perdre ses 3 premiers chiffres).
  else if (p.startsWith("225") && p.length > 10) p = p.slice(3);
  p = p.replace(/\+/g, "");
  // 0 initial perdu (+225 789855418) : seulement sur 9 chiffres — les fixes
  // (21, 25, 27…) font déjà 10 chiffres sans commencer par 0.
  if (p.length === 9 && !p.startsWith("0")) p = "0" + p;
  return p;
}

/** Numéro ivoirien valide (01, 05, 07 mobiles ; 21, 25, 27 fixes) → forme canonique, sinon null. */
export function phoneCI(p: string): string | null {
  const n = normalizePhone(p);
  return /^(01|05|07|21|25|27)\d{8}$/.test(n) ? n : null;
}

export function isValidPhone(p: string) {
  return phoneCI(p) !== null;
}

/** 0789855418 → "07 89 85 54 18" (affichage uniquement, jamais stocké). */
export function formatPhone(p: string): string {
  const n = normalizePhone(p);
  return /^\d{10}$/.test(n) ? n.replace(/(\d{2})(?=\d)/g, "$1 ") : p;
}

export function callLink(tel: string) {
  return `tel:${normalizePhone(tel)}`;
}
