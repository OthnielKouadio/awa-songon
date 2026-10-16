/** PIN devinés en premier : 4 chiffres identiques, suites (0123, 9876…) et
 *  quelques classiques. Même règle que public._pin_trop_simple (schema.sql) :
 *  vérifiée ici pour prévenir avant l'envoi, imposée par le serveur. */
const CLASSIQUES = new Set(["1212", "2121", "1122", "1313", "2580", "0852", "6969", "0007", "1004", "2000", "1984", "1990"]);

export function pinTropSimple(pin: string): boolean {
  return /^(\d)\1{3}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin) || CLASSIQUES.has(pin);
}
