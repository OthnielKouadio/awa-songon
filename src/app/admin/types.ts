/** Formes renvoyées par les RPC admin (voir supabase/schema.sql). */

export type Cite = {
  id: string;
  nom: string;
  code_court: string;
  created_at: string;
  maisons: number;
  occupees: number;
  bloquees: number;
  livreurs: number;
  dernier_numero: number | null;
};

export type StatutMaison = "LIBRE" | "OCCUPEE" | "BLOQUEE";

export type MaisonLigne = {
  id: string;
  code_affichage: string;
  numero: number;
  statut: StatutMaison;
  qr_token: string;
  lien_qr: string;
  cite_id: string;
  cite: string;
  nom_famille: string | null;
  telephone_principal: string | null;
  verifie_at: string | null;
  date_debut: string | null;
  solde_points: number | null;
  commande_en_cours: boolean;
  a_position: boolean;
};

export type MaisonDetail = {
  maison: {
    id: string;
    code_affichage: string;
    numero_sequentiel: number;
    statut: StatutMaison;
    qr_token: string;
    lien_qr: string;
    motif_blocage: string | null;
    cite: string;
    lat: number | null;
    long: number | null;
    position_source: "POSE" | "LIVREUR" | null;
    position_maj: string | null;
  };
  essais_rates_24h: number;
  foyer: null | {
    id: string;
    nom_famille: string;
    telephone_principal: string;
    date_debut: string;
    verifie_at: string | null;
    verifie_par: "ADMIN" | "LIVREUR" | null;
    statut_paiement: "PAYE" | "IMPAYE";
    date_paiement: string | null;
    cgv_version: string | null;
    cgv_acceptees_at: string | null;
    solde_points: number;
    appareils_actifs: number;
    membres: { nom: string; role: string; telephone: string | null; est_titulaire: boolean }[];
    transactions: { type: string; montant: number; solde_apres: number; reference: string | null; created_at: string }[];
  };
  commandes: { reference: string; statut: string; created_at: string; nom_famille: string; commande_par: string; livreur: string }[];
  archives: { nom_famille: string; telephone_principal: string; date_debut: string; date_fin: string; motif_fin: string }[];
};

export type Livreur = {
  id: string;
  nom: string;
  telephone: string;
  prix_fcfa: number;
  statut: "ACTIF" | "PAUSE" | "HORS_LIGNE" | "BLOQUE";
  cite_id: string;
  cite: string;
  source_id: string | null;
  source_nom: string | null;
  /** Inscrit par le lien de recrutement et pas encore validé : false. */
  valide: boolean;
  statut_paiement: "PAYE" | "IMPAYE";
  total_points_utilises: number;
  note_moyenne: number | null;
  total_avis: number;
  alerte_note: boolean;
  file: number;
  solde_points: number;
  /** Un code d'accès a été créé. */
  acces: boolean;
  /** Code provisoire pas encore remplacé par le livreur. */
  code_provisoire: boolean;
  /** Visible des clients (actif, accès, points suffisants). */
  disponible: boolean;
};

export type AvisLivreur = {
  id: string;
  note: number;
  commentaire: string | null;
  created_at: string;
  livreur_id: string;
  livreur: string;
  reference: string;
  code_affichage: string;
  nom_famille: string;
  auteur: string | null;
};
