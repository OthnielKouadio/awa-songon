/** Appels RPC Supabase + traduction des codes d'erreur du serveur en français. */
import { requireSupabase } from "./supabase";

const MESSAGES: Record<string, string> = {
  // Réseau / session
  RESEAU: "Pas de connexion internet. Réessaie dans un instant.",
  SESSION: "Ce téléphone n'est plus connecté à la maison. Retape le code maison.",
  ADMIN_REQUIS: "Accès réservé à l'administrateur (2FA requise).",
  TROP_DE_TENTATIVES: "Trop d'essais. Patiente 15 minutes puis réessaie.",
  // Maison / foyer
  INTROUVABLE: "Ce QR code n'existe pas. Vérifie l'autocollant ou appelle le service.",
  MAISON_INTROUVABLE: "Maison introuvable.",
  MAISON_BLOQUEE: "Cette maison est suspendue. Contacte le service Distribution Eau.",
  MAISON_LIBRE: "Aucun foyer n'est encore inscrit dans cette maison.",
  DEJA_OCCUPEE: "Un foyer est déjà inscrit dans cette maison. Demande le code maison à ta famille.",
  MAISON_VERROUILLEE:
    "Trop de codes faux ont été essayés sur cette maison. Utilise un téléphone de la famille déjà connecté, ou appelle le service.",
  CODE_FAUX: "Code maison incorrect.",
  CODE_FORMAT: "Le code maison fait 4 chiffres.",
  CODE_TROP_SIMPLE: "Code trop facile à deviner (1234, 0000, numéro de la maison…). Choisis-en un autre.",
  CGV_NON_ACCEPTEES: "Coche la case « crédits non remboursables » pour continuer.",
  CGV_FOYER_EN_ATTENTE:
    "Ce foyer n'a pas encore accepté les conditions « non remboursable » (elles lui sont demandées à la fin de l'essai, à sa prochaine visite). Recharge impossible avant.",
  NOM_FAMILLE_INVALIDE: "Indique le nom de la famille (2 à 60 lettres).",
  NOM_INVALIDE: "Indique ton prénom (40 lettres maximum).",
  ROLE_INVALIDE: "Choisis qui tu es (Papa, Maman…).",
  TELEPHONE_INVALIDE: "Numéro invalide : 10 chiffres commençant par 01, 05, 07, 21, 25 ou 27.",
  TROP_DE_MEMBRES: "Ce foyer a déjà 15 membres. Contacte le service.",
  // Commande
  COMMANDE_EN_COURS: "Une commande est déjà en cours pour la maison.",
  LIVREUR_INDISPONIBLE: "Ce livreur n'est plus disponible. Choisis-en un autre.",
  SOLDE_INSUFFISANT: "Solde insuffisant. Recharge ton compte pour commander.",
  ANNULATION_IMPOSSIBLE: "Le livreur est déjà parti : la commande ne peut plus être annulée.",
  COMMANDE_INTROUVABLE: "Commande introuvable pour cette maison.",
  // Avis
  NOTE_INVALIDE: "Choisis une note de 1 à 5 étoiles.",
  DEJA_NOTE: "Cette livraison a déjà été notée. Merci !",
  PAS_ENCORE_LIVREE: "Tu pourras noter cette livraison une fois livrée.",
  AVIS_EXPIRE: "Le délai pour noter cette livraison (7 jours) est dépassé.",
  AVIS_RECENT: "Ton foyer a déjà donné son avis cette semaine. Merci !",
  // Admin
  CITE_EXISTE: "Une cité porte déjà ce nom.",
  CITE_INTROUVABLE: "Cité introuvable.",
  CODE_COURT_INVALIDE: "Code court : 2 à 5 lettres majuscules (ex. PROMO).",
  CODE_COURT_PRIS: "Ce code court est déjà utilisé par une autre cité.",
  CODE_COURT_VERROUILLE: "Le code court est imprimé sur les autocollants : il ne peut plus changer.",
  CITE_NON_VIDE: "Cette cité a des maisons ou des livreurs : suppression impossible.",
  MAISON_EXISTE: "Cette maison existe déjà dans la cité.",
  NUMERO_INVALIDE: "Numéro de maison invalide (1 à 9999).",
  PLAGE_INVALIDE: "Plage invalide (début ≤ fin, entre 1 et 9999).",
  LOT_TROP_GRAND: "1000 maisons maximum par lot.",
  AUCUN_FOYER: "Aucun foyer actif dans cette maison.",
  MOTIF_INVALIDE: "Indique un motif (3 caractères minimum).",
  MAISON_NON_BLOQUEE: "Cette maison n'est pas bloquée.",
  MAISON_A_HISTORIQUE: "Cette maison a un historique : bloque-la plutôt que de la supprimer.",
  MONTANT_INVALIDE: "Montant invalide (100 à 1 000 000 points).",
  PRIX_INVALIDE: "Prix invalide (100 à 50 000 FCFA).",
  TELEPHONE_PRIS: "Ce numéro est déjà utilisé par un autre livreur.",
  LIVREUR_INTROUVABLE: "Livreur introuvable.",
  STATUT_INVALIDE: "Statut invalide.",
  TRANSITION_INVALIDE: "Ce changement de statut n'est pas possible.",
  SITE_URL_INVALIDE: "Adresse du site invalide (ex. https://awa-songon.vercel.app, sans chemin).",
  COUT_INVALIDE: "Coût invalide (0 à 100 000 points).",
  ESSAI_TROP_LONG: "La fin d'essai ne peut pas dépasser 2 ans.",
  // Livreur
  IDENTIFIANTS: "Numéro ou code incorrect.",
  LIVREUR_BLOQUE: "Ton compte livreur est suspendu. Contacte l'administrateur.",
  CODE_A_CHANGER: "Choisis d'abord ton code personnel.",
  CODE_IDENTIQUE: "Le nouveau code doit être différent du code provisoire.",
  SOLDE_INSUFFISANT_LIVREUR: "Solde de points insuffisant. Recharge pour recevoir des commandes.",
  POSITION_INVALIDE: "Position GPS invalide. Réessaie à l'extérieur.",
  POSITION_DEJA_CONNUE: "La position de cette maison est déjà enregistrée.",
  NOM_TEL_REQUIS: "Cette maison n'a pas encore de foyer inscrit : indique le nom et le numéro du client.",
  LIMITE_JOUR: "Limite de saisies directes atteinte pour aujourd'hui.",
  GPS_REFUSE: "Autorise la localisation dans ton navigateur pour enregistrer la position.",
  // Fonctionnalités V2
  ANNULATION_TARDIVE: "Trop tard pour annuler : une livraison programmée n'est plus annulable après 18h la veille.",
  DEJA_EN_COURS: "Termine d'abord la livraison en cours.",
  PAS_LE_PREMIER: "Livre d'abord la commande qui est en tête de ta file.",
  COMPTE_EN_ATTENTE: "Ton compte est en attente de validation par l'administrateur.",
  COMPTE_V2_EN_ATTENTE:
    "Ton compte est en cours de transfert vers ta maison. Scanne le QR collé sur ton portail, ou appelle le service pour qu'il le rattache.",
  CLIENT_INTROUVABLE: "Ancien client introuvable.",
  DEJA_REPRIS: "Ce client a déjà été rattaché à une maison.",
  SOURCE_INTROUVABLE: "Forage introuvable (il doit être dans la cité du livreur).",
  DEJA_INSCRIT: "Ce numéro est déjà inscrit. Connecte-toi plutôt.",
  INTROUVABLE_GENERIQUE: "Élément introuvable.",
  GPS_INDISPONIBLE: "Position introuvable. Active le GPS et réessaie à l'extérieur.",
};

export class ApiError extends Error {
  constructor(
    public code: string,
    public data?: Record<string, unknown>
  ) {
    super(MESSAGES[code] ?? "Une erreur est survenue. Réessaie.");
  }
}

export const messageErreur = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error && MESSAGES[e.message] ? MESSAGES[e.message] : "Une erreur est survenue. Réessaie.";

/** Appelle une fonction RPC. Les exceptions SQL (raise 'CODE') et les réponses
 *  { ok: false, erreur } / { erreur } deviennent toutes des ApiError. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await requireSupabase().rpc(fn, args);
  } catch {
    throw new ApiError("RESEAU");
  }
  if (res.error) {
    const code = /^[A-Z_]+$/.test(res.error.message) ? res.error.message : res.error.message?.includes("fetch") ? "RESEAU" : "INCONNU";
    if (code === "INCONNU") console.error(`[rpc ${fn}]`, res.error);
    throw new ApiError(code);
  }
  const data = res.data as T & { erreur?: string; ok?: boolean };
  if (data && typeof data === "object" && !Array.isArray(data) && typeof data.erreur === "string") {
    throw new ApiError(data.erreur, data as Record<string, unknown>);
  }
  return data;
}
