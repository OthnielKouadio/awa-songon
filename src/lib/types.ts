/** ACTIVE : livre · PAUSED : pause (commandes du jour en QUEUED) · OFFLINE : dort
 *  (commandes PROGRAMMED pour 8h). Visible et commandable dans les 3 cas. */
export type TricycleStatus = "ACTIVE" | "PAUSED" | "OFFLINE";
export type TricycleEtat = "A_LA_SOURCE" | "EN_ROUTE";
export type CommandeStatus = "QUEUED" | "ASSIGNED" | "PROGRAMMED" | "ARRIVING" | "EN_COURS" | "LIVREE" | "ANNULEE";
/** app : passée par le client · manual : saisie directe par le chauffeur. */
export type CommandeSource = "app" | "manual";
/** Statut de compte, géré UNIQUEMENT par l'admin (jamais par le titulaire du compte). */
export type CompteStatut = "PAYE" | "IMPAYE" | "BLOQUE";
export type Role = "client" | "chauffeur" | "admin";

export type Cite = { id: string; nom: string };

export type Source = {
  id: string;
  nom: string;
  cite_id: string;
  lat: number | null;
  long: number | null;
};

export type Tricycle = {
  id: string;
  nom: string;
  telephone: string;
  /** Sa seule cité, fixée à l'inscription : il ne livre que là. */
  cite_id: string;
  /** Facultative : un chauffeur qui n'en choisit pas puise "un peu partout". */
  source_id: string | null;
  status: TricycleStatus;
  etat: TricycleEtat;
  /** Prix fixé par le chauffeur pour 1000 L, en FCFA. */
  prix_1000: number;
  statut: CompteStatut;
  /** Points (1 FCFA = 1 point) : 0 à l'inscription, -50 par commande créée après l'essai gratuit. */
  solde_points: number;
  /** Remis à 0 dès qu'il atteint 5000 (déclenche +50 points de fidélité). */
  total_points_utilises: number;
  /** true dès que solde_points < 50 : invisible des clients tant qu'il n'est pas rechargé. */
  is_offline: boolean;
  /** Fin de son essai gratuit (points illimités jusque-là). */
  essai_fin: string | null;
  /** Anti-intrusion : invisible des clients tant que l'admin ne l'a pas validé. */
  valide: boolean;
};

export type Client = {
  id: string;
  nom: string;
  telephone: string;
  cite_id: string;
  lot_numero: string;
  lat: number | null;
  long: number | null;
  statut: CompteStatut;
  date_paiement: string | null;
  /** Points (1 FCFA = 1 point) : 0 à l'inscription, -100 par commande créée après l'essai gratuit. */
  solde_points: number;
  /** Créé par un chauffeur (saisie directe), sans compte utilisable tant qu'il ne s'inscrit pas. */
  is_temporary: boolean;
  /** Fin de son essai gratuit (points illimités jusque-là). */
  essai_fin: string | null;
};

export type Commande = {
  id: string;
  client_id: string;
  tricycle_id: string;
  cite_id: string;
  lot_numero: string;
  position_file: number;
  status: CommandeStatus;
  /** Prix figé au moment de la commande (FCFA), même si le chauffeur change son tarif ensuite. */
  prix: number;
  lat: number | null;
  long: number | null;
  /** PROGRAMMED : livraison prévue (prochain 8h). */
  programmee_pour: string | null;
  /** ARRIVING : début du partage GPS (coupé 10 min après). */
  arriving_at: string | null;
  /** Jour de livraison prévu (YYYY-MM-DD, heure d'Abidjan) : aujourd'hui ou demain. */
  scheduled_for: string;
  /** Commande programmée pour un jour suivant : plus annulable après cette date (18h la veille). */
  annulable_jusqua: string | null;
  source: CommandeSource;
  added_by_driver_id: string | null;
  is_temporary_client: boolean;
  quantite_bidons: number | null;
  note: string | null;
  livree_at: string | null;
  created_at: string;
};

/** Vue publique d'un tricycle de la cité (sans téléphone). */
export type TricycleDispo = {
  id: string;
  nom: string;
  source_id: string | null;
  source_nom: string | null;
  etat: TricycleEtat;
  file_count: number;
  prix_1000: number;
  status: TricycleStatus;
};

export type Suivi = {
  id: string;
  status: CommandeStatus;
  position_file: number;
  prix: number;
  lot_numero: string;
  lat: number | null;
  long: number | null;
  created_at: string;
  programmee_pour: string | null;
  arriving_at: string | null;
  scheduled_for: string;
  annulable_jusqua: string | null;
  source: CommandeSource;
  tricycle_id: string;
  chauffeur_nom: string;
  chauffeur_tel: string;
  etat: TricycleEtat;
  chauffeur_status: TricycleStatus;
  cite_nom: string;
  source_nom: string | null;
  /** Position GPS live : remplie UNIQUEMENT pendant ARRIVING (10 min max, position de moins de 5 min). */
  tricycle_lat: number | null;
  tricycle_long: number | null;
  tricycle_position_maj: string | null;
};

/** Position diffusée en direct au client pendant ARRIVING. */
export type LivePosition = { lat: number; long: number; at: string };

export type ChauffeurProfile = {
  id: string;
  nom: string;
  telephone: string;
  status: TricycleStatus;
  etat: TricycleEtat;
  prix_1000: number;
  statut: CompteStatut;
  /** Facultatif : le chauffeur peut ne pas avoir fixé de forage précis. */
  source_nom: string | null;
  /** Sa seule cité (non modifiable). */
  cite_id: string;
  cite_nom: string;
  solde_points: number;
  total_points_utilises: number;
  /** Bloqué faute de points (calculé : jamais pendant l'essai gratuit). */
  is_offline: boolean;
  essai_fin: string | null;
  /** false tant que l'admin n'a pas validé son inscription. */
  valide: boolean;
  /** Code provisoire donné par l'admin : il doit en choisir un nouveau. */
  pin_provisoire: boolean;
};

export type ChauffeurCommande = Pick<
  Commande,
  | "id"
  | "lot_numero"
  | "position_file"
  | "status"
  | "lat"
  | "long"
  | "created_at"
  | "programmee_pour"
  | "arriving_at"
  | "scheduled_for"
  | "source"
  | "is_temporary_client"
  | "quantite_bidons"
  | "note"
> & {
  client_nom: string;
  client_tel: string;
  /** Nom du chauffeur qui a saisi la commande (source manual). */
  added_by_nom: string | null;
};

export type CommandeManuelle = {
  nom: string;
  tel: string;
  lot: string;
  quantiteBidons: number | null;
  note: string;
};

/** depot_phone : numéro qui reçoit les recharges Wave, forme canonique 0XXXXXXXXX. */
export type Settings = { trial_ends_at: string; depot_phone: string; essai_mois: number };

/** Agrégats d'un mois (renvoyés par get_yearly_stats). */
export type StatsMois = {
  mois: number;
  total: number;
  app: number;
  manual: number;
  livrees: number;
  annulees: number;
  echecs: number;
  bidons: number;
  ca: number;
  clients_uniques: number;
  nouveaux: number;
  recurrents: number;
  clients_plus_3: number;
  temps_moyen_min: number | null;
  livrees_chronometrees: number;
  remboursements_montant: number;
  remboursements_nb: number;
  total_annee_precedente: number;
};

export type YearlyStats = {
  annee: number;
  mois: StatsMois[];
  synthese: { clients_actifs: number; nouveaux: number; clients_plus_3: number; temps_moyen_min: number | null };
  chauffeurs: { id: string | null; nom: string; mois: number; livraisons: number }[];
  zones: { cite_id: string; cite_nom: string; lot: string; mois: number; total: number }[];
  options: { cites: Cite[]; chauffeurs: { id: string; nom: string; cite_id: string }[] };
};

export type ClientProfile = {
  id: string;
  nom: string;
  telephone: string;
  cite_id: string;
  cite_nom: string;
  lot_numero: string;
  statut: CompteStatut;
  solde_points: number;
  essai_fin: string | null;
  /** Code provisoire donné par l'admin : il doit en choisir un nouveau. */
  pin_provisoire: boolean;
};

export type AdminProfile = { email: string };

/** Identifiants de session : identifiant + jeton (jamais le PIN/mot de passe). Un même
 *  shape sert aux 3 rôles ; `role` distingue quelle table le jeton authentifie.
 *  `tel` = téléphone pour client/chauffeur, email pour l'admin. */
export type Creds = { role: Role; tel: string; token: string };

export type ClientSession = { creds: Creds; profile: ClientProfile };
export type ChauffeurSession = { creds: Creds; profile: ChauffeurProfile };
export type AdminSession = { creds: Creds; profile: AdminProfile };
/** Résultat d'une connexion /login : c'est le serveur qui dit si le numéro est
 *  celui d'un client ou d'un chauffeur (l'admin ne se connecte jamais par là). */
export type LoginResult = { role: "client"; session: ClientSession } | { role: "chauffeur"; session: ChauffeurSession };

export type AdminData = {
  cites: Cite[];
  sources: Source[];
  tricycles: Tricycle[];
  clients: Client[];
  commandes: Commande[];
  settings: Settings;
};
export type AdminTable = "cites" | "sources" | "tricycles" | "clients";

export type NouvelleCommande = {
  tricycleId: string;
  gps?: { lat: number; long: number } | null;
  /** Livraison demain plutôt qu'aujourd'hui (aucune autre date possible). */
  demain?: boolean;
};

export type InscriptionClient = {
  nom: string;
  tel: string;
  citeId: string;
  lot: string;
  pin: string;
  gps?: { lat: number; long: number } | null;
};
export type InscriptionChauffeur = {
  nom: string;
  tel: string;
  /** Une seule cité, définitive. */
  citeId: string;
  /** Facultatif : le forage précis où il puise l'eau. */
  sourceId: string | null;
  pin: string;
  prix: number;
};

/** Contrat commun : implémenté par Supabase (remote.ts) et par le mode démo (mock.ts),
 *  choisi une seule fois dans data-provider.ts. */
export interface Backend {
  fetchCites(): Promise<Cite[]>;
  fetchSources(): Promise<Source[]>;
  fetchTricyclesDispo(citeId: string): Promise<TricycleDispo[]>;
  creerCommande(c: NouvelleCommande, creds: Creds): Promise<string>;
  fetchSuivi(id: string): Promise<Suivi | null>;
  /** Pings « quelque chose a changé » sur ces canaux (cite:<id>, tricycle:<id>…).
   *  Renvoie la fonction de désabonnement. */
  subscribeTopics(topics: string[], onChange: () => void): () => void;
  /** Numéro de dépôt (settings.depot_phone), lisible sans connexion. */
  fetchDepotPhone(): Promise<string>;
  /** Fin de la période d'essai (settings.trial_ends_at, AAAA-MM-JJ). */
  fetchEssaiFin(): Promise<string>;

  /** Connexion /login, sans choix de rôle : client ou chauffeur selon le numéro. */
  login(tel: string, pin: string): Promise<LoginResult>;
  /** Connexion admin (page secrète uniquement) : email + mot de passe. */
  loginAdmin(email: string, password: string): Promise<AdminSession>;
  inscrireClient(i: InscriptionClient): Promise<ClientSession>;
  inscrireChauffeur(i: InscriptionChauffeur): Promise<ChauffeurSession>;

  clientProfil(c: Creds): Promise<ClientProfile>;
  clientCommandeActive(c: Creds): Promise<Suivi | null>;
  /** Annulation tant que le chauffeur n'est pas parti (QUEUED/ASSIGNED/PROGRAMMED) — points rendus. */
  clientAnnulerCommande(c: Creds, commandeId: string): Promise<void>;
  /** Nouveau code PIN choisi par le client (obligatoire après un code provisoire). */
  clientChangerPin(c: Creds, nouveau: string): Promise<void>;
  /** Écoute la position live d'une commande ARRIVING. Renvoie la fonction de désabonnement. */
  subscribePosition(commandeId: string, onPosition: (p: LivePosition) => void): () => void;

  chauffeurProfil(c: Creds): Promise<ChauffeurProfile>;
  chauffeurFile(c: Creds): Promise<ChauffeurCommande[]>;
  /** Saisie directe : client retrouvé par son numéro ou créé en temporaire, commande ASSIGNED. */
  chauffeurCommandeManuelle(c: Creds, cmd: CommandeManuelle): Promise<string>;
  /** Lots déjà connus dans sa cité. */
  chauffeurLots(c: Creds): Promise<string[]>;
  /** Repasser ACTIVE assigne automatiquement ses commandes QUEUED (FIFO). */
  chauffeurSetStatus(c: Creds, status: TricycleStatus): Promise<void>;
  chauffeurSetEtat(c: Creds, etat: TricycleEtat): Promise<void>;
  chauffeurSetPrix(c: Creds, prix: number): Promise<void>;
  /** Position GPS, acceptée seulement pendant ARRIVING. `actif: false` = partage terminé, couper le GPS. */
  chauffeurSetPosition(c: Creds, lat: number, long: number): Promise<{ actif: boolean }>;
  /** Première commande ASSIGNED → EN_COURS. */
  chauffeurPartir(c: Creds): Promise<{ bonusFidelite: boolean; soldePoints: number }>;
  /** « J'arrive chez toi » : EN_COURS → ARRIVING, démarre le partage GPS (10 min max). */
  chauffeurArriver(c: Creds, commandeId: string): Promise<void>;
  chauffeurLivrer(c: Creds, commandeId: string): Promise<void>;
  /** Nouveau code PIN choisi par le chauffeur (obligatoire après un code provisoire). */
  chauffeurChangerPin(c: Creds, nouveau: string): Promise<void>;

  admin: {
    load(c: Creds): Promise<AdminData>;
    save(c: Creds, table: AdminTable, id: string | null, row: Record<string, unknown>): Promise<void>;
    remove(c: Creds, table: AdminTable, id: string): Promise<void>;
    setStatut(c: Creds, table: "tricycles" | "clients", id: string, statut: CompteStatut): Promise<void>;
    /** Recharge manuelle après paiement Wave (client ou chauffeur). Montant multiple de 50 obligatoire ; débloque le chauffeur si le solde repasse ≥ 50. */
    rechargerPoints(c: Creds, table: "tricycles" | "clients", id: string, montant: number): Promise<void>;
    changerMotDePasse(c: Creds, nouveau: string): Promise<void>;
    /** Code oublié : génère un code provisoire à 4 chiffres (à donner par téléphone). */
    reinitialiserPin(c: Creds, table: "tricycles" | "clients", id: string): Promise<string>;
    /** Anti-intrusion : rend un chauffeur nouvellement inscrit visible des clients. */
    validerChauffeur(c: Creds, id: string): Promise<void>;
    /** Change settings.depot_phone (numéro ivoirien obligatoire). */
    setDepotPhone(c: Creds, tel: string): Promise<void>;
    /** Toutes les agrégations de /admin/statistiques en un appel. */
    statsAnnuelles(c: Creds, annee: number, citeId: string | null, tricycleId: string | null): Promise<YearlyStats>;
    /** Notifie à chaque changement. Renvoie la fonction de désabonnement. */
    subscribe(onChange: () => void, onStatus?: (live: boolean) => void): () => void;
  };
}
