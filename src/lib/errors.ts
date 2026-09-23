export const MESSAGES: Record<string, string> = {
  AUTH: "Numéro ou code incorrect.",
  BLOQUE: "Trop d'essais. Réessaie dans 15 minutes.",
  DEJA_INSCRIT: "Ce numéro est déjà inscrit. Connecte-toi avec ton code.",
  NOM_INVALIDE: "Entre ton nom.",
  PIN_INVALIDE: "Ton code doit faire 4 chiffres.",
  SOURCE_INTROUVABLE: "Choisis ta source.",
  CITE_INTROUVABLE: "Choisis ta cité.",
  LOT_INVALIDE: "Numéro de lot invalide.",
  PRIX_INVALIDE: "Entre un prix valide (de 100 à 50 000 FCFA).",
  TEL_INVALIDE: "Numéro de téléphone invalide.",
  TRICYCLE_INDISPONIBLE: "Ce tricycle vient de passer OFF. Choisis-en un autre.",
  TROP_DE_COMMANDES: "Tu as déjà une commande en cours.",
  DEJA_EN_COURS: "Une livraison est déjà en cours. Termine-la d'abord.",
  FILE_VIDE: "Aucune commande en attente.",
  COMMANDE_INTROUVABLE: "Commande introuvable ou déjà livrée.",
  DOUBLON: "Cette valeur existe déjà.",
  REFUSE: "Action refusée : ton compte n'est pas administrateur.",
  COMPTE_BLOQUE: "Ton compte est bloqué. Contacte l'administrateur.",
  MDP_INVALIDE: "Choisis un mot de passe d'au moins 6 caractères.",
  SOLDE_INSUFFISANT: "Solde de points insuffisant. Recharge pour continuer.",
  MONTANT_INVALIDE: "Le montant doit être un multiple de 50.",
  CHAUFFEUR_INTROUVABLE: "Chauffeur introuvable.",
  RESEAU: "Pas de connexion. Réessaie dans un instant.",
};

export class AppError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code);
    this.code = code;
  }
}

/** Transforme un message brut (exception SQL, réseau…) en erreur lisible. */
export function toAppError(raw: string, pgCode?: string): AppError {
  if (pgCode === "23505") return new AppError("DOUBLON");
  if (pgCode === "42501") return new AppError("REFUSE");
  for (const key of Object.keys(MESSAGES)) {
    if (raw.includes(key)) return new AppError(key);
  }
  if (/fetch|network|failed to/i.test(raw)) return new AppError("RESEAU");
  return new AppError("UNKNOWN", raw);
}

export const fail = (code: string): never => {
  throw new AppError(code);
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue.");
