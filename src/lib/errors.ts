export const MESSAGES: Record<string, string> = {
  AUTH_ADMIN: "Email ou mot de passe incorrect.",
  EMAIL_INVALIDE: "Adresse email invalide.",
  AUTH: "Numéro ou code incorrect.",
  BLOQUE: "Trop d'essais. Réessaie dans 15 minutes.",
  DEJA_INSCRIT: "Ce numéro a déjà un compte. Connecte-toi avec ton numéro et ton code PIN.",
  SESSION_INVALIDE: "Ta session a expiré. Reconnecte-toi avec ton numéro et ton code PIN.",
  SERVEUR_PAS_A_JOUR: "Le serveur n'est pas à jour (base de données). Préviens l'administrateur.",
  SERVICE_INDISPONIBLE: "Le serveur ne répond pas pour l'instant. Réessaie dans un instant.",
  NOM_INVALIDE: "Entre ton nom.",
  PIN_INVALIDE: "Ton code doit faire 4 chiffres.",
  PIN_TROP_SIMPLE: "Code trop facile à deviner (0000, 1234…). Choisis-en un autre.",
  TROP_DE_TENTATIVES: "Trop de tentatives depuis ta connexion. Réessaie plus tard.",
  SOURCE_INTROUVABLE: "Choisis ta source.",
  CITE_INTROUVABLE: "Choisis ta cité.",
  LOT_INVALIDE: "Numéro de lot invalide.",
  PRIX_INVALIDE: "Entre un prix valide (de 100 à 50 000 FCFA).",
  NOM_MARCHAND_INVALIDE: "Nom du marchand Wave invalide (2 à 60 caractères, sans < ni >).",
  TEL_INVALIDE_CI: "Numéro ivoirien invalide (10 chiffres, commençant par 01, 05, 07, 21, 25 ou 27).",
  TEL_INVALIDE: "Numéro de téléphone invalide.",
  TRICYCLE_INDISPONIBLE: "Ce tricycle n'est plus disponible. Choisis-en un autre.",
  TROP_DE_COMMANDES: "Tu as déjà une commande en cours. Sois livré ou annule avant d'en repasser une autre.",
  HORS_ZONE: "Ce tricycle ne livre pas dans ta cité.",
  TROP_LOIN: "Aucun tricycle disponible près de chez toi (plus de 7 km).",
  ANNULATION_IMPOSSIBLE: "Le chauffeur est déjà parti livrer : tu ne peux plus annuler.",
  ANNULATION_TARDIVE: "Commande programmée : l'annulation n'est plus possible après 18h la veille.",
  CLIENT_BLOQUE: "Ce client est bloqué. Contacte l'administrateur.",
  QUANTITE_INVALIDE: "Quantité invalide (de 1 à 200 bidons).",
  NOTE_INVALIDE: "La note ne doit pas dépasser 280 caractères.",
  DEJA_EN_COURS: "Une livraison est déjà en cours. Termine-la d'abord.",
  FILE_VIDE: "Aucune commande à livrer pour l'instant.",
  COMMANDE_INTROUVABLE: "Commande introuvable ou déjà livrée.",
  DOUBLON: "Cette valeur existe déjà.",
  REFUSE: "Action refusée : ton compte n'est pas administrateur.",
  COMPTE_BLOQUE: "Ton compte est bloqué. Contacte l'administrateur.",
  COMPTE_EN_ATTENTE: "Ton compte attend la validation de l'administrateur.",
  COMPTE_INTROUVABLE: "Compte introuvable.",
  MDP_INVALIDE: "Choisis un mot de passe d'au moins 10 caractères.",
  SOLDE_INSUFFISANT_CLIENT: "Solde insuffisant, veuillez recharger.",
  SOLDE_INSUFFISANT: "Solde de points insuffisant. Recharge pour continuer.",
  MONTANT_INVALIDE: "Le montant doit être un multiple de 50.",
  MONTANT_INVALIDE_CLIENT: "Pour un client, le montant doit être un multiple de 100 (100, 200, 300…).",
  CHAUFFEUR_INTROUVABLE: "Chauffeur introuvable.",
  CLIENT_INTROUVABLE: "Client introuvable.",
  POSITION_INVALIDE: "Position GPS invalide.",
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
  // Fonction RPC absente : schema.sql pas encore appliqué sur cette base.
  if (pgCode === "PGRST202" || pgCode === "42883") return new AppError("SERVEUR_PAS_A_JOUR");
  // Règle anti-double commande : le serveur renvoie TROP_DE_COMMANDES:<id court>.
  const dup = raw.match(/TROP_DE_COMMANDES:([0-9A-F]+)/i);
  if (dup) return tropDeCommandes(dup[1]);
  // Code exact uniquement : « AUTH » ne doit jamais matcher « AUTH_ADMIN » ni un
  // mot quelconque contenant AUTH (un faux « numéro ou code incorrect » trompe l'utilisateur).
  const code = raw.match(/\b[A-Z][A-Z0-9_]+\b/g)?.find((k) => k in MESSAGES);
  if (code) return new AppError(code);
  if (/fetch|network|failed to/i.test(raw)) return new AppError("RESEAU");
  return new AppError("UNKNOWN", raw);
}

/** 6 premiers caractères de l'id, en majuscules : "#A1B2C3". */
export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 6).toUpperCase();

export const tropDeCommandes = (idCourt: string) =>
  new AppError("TROP_DE_COMMANDES", `Tu as déjà une commande en cours (#${idCourt.toUpperCase()}). Sois livré ou annule avant d'en repasser une autre.`);

export const fail = (code: string): never => {
  throw new AppError(code);
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue.");
