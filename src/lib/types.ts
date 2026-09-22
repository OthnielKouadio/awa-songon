export type TricycleStatus = "DISPO" | "OFF";
export type TricycleEtat = "A_LA_SOURCE" | "EN_ROUTE";
export type CommandeStatus = "EN_ATTENTE" | "EN_COURS" | "LIVRE";
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
  source_id: string;
  status: TricycleStatus;
  etat: TricycleEtat;
  /** Prix fixé par le chauffeur pour 1000 L, en FCFA. */
  prix_1000: number;
  statut: CompteStatut;
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
  /** Fin de l'abonnement (30 jours à l'inscription). Passé cette date, redirection vers /bloque. */
  subscription_ends_at: string;
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
  created_at: string;
};

/** Vue publique d'un tricycle DISPO (sans téléphone). */
export type TricycleDispo = {
  id: string;
  nom: string;
  source_id: string;
  source_nom: string;
  etat: TricycleEtat;
  file_count: number;
  prix_1000: number;
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
  tricycle_id: string;
  chauffeur_nom: string;
  chauffeur_tel: string;
  etat: TricycleEtat;
  cite_nom: string;
  source_nom: string;
};

export type ChauffeurProfile = {
  id: string;
  nom: string;
  telephone: string;
  status: TricycleStatus;
  etat: TricycleEtat;
  prix_1000: number;
  statut: CompteStatut;
  source_nom: string;
  cite_id: string;
  cite_nom: string;
};

export type ChauffeurCommande = Pick<
  Commande,
  "id" | "lot_numero" | "position_file" | "status" | "lat" | "long" | "created_at"
> & {
  client_nom: string;
  client_tel: string;
};

export type ClientProfile = {
  id: string;
  nom: string;
  telephone: string;
  cite_id: string;
  cite_nom: string;
  lot_numero: string;
  statut: CompteStatut;
  subscription_ends_at: string;
};

export type AdminProfile = { telephone: string };

/** Identifiants de session : téléphone + jeton (jamais le PIN/mot de passe). Un même
 *  shape sert aux 3 rôles ; `role` distingue quelle table le jeton authentifie. */
export type Creds = { role: Role; tel: string; token: string };

export type ClientSession = { creds: Creds; profile: ClientProfile };
export type ChauffeurSession = { creds: Creds; profile: ChauffeurProfile };
export type AdminSession = { creds: Creds; profile: AdminProfile };
/** Résultat d'une connexion : le rôle réel peut différer du rôle demandé
 *  (un identifiant admin saisi sur l'onglet client redirige quand même vers /admin). */
export type LoginResult =
  | { role: "client"; session: ClientSession }
  | { role: "chauffeur"; session: ChauffeurSession }
  | { role: "admin"; session: AdminSession };

export type AdminData = {
  cites: Cite[];
  sources: Source[];
  tricycles: Tricycle[];
  clients: Client[];
  commandes: Commande[];
};
export type AdminTable = "cites" | "sources" | "tricycles" | "clients";

export type NouvelleCommande = {
  tricycleId: string;
  gps?: { lat: number; long: number } | null;
};

export type InscriptionClient = {
  nom: string;
  tel: string;
  citeId: string;
  lot: string;
  pin: string;
  gps?: { lat: number; long: number } | null;
};
export type InscriptionChauffeur = { nom: string; tel: string; sourceId: string; pin: string; prix: number };

/** Contrat commun : implémenté par Supabase (remote.ts) et par le mode démo (mock.ts). */
export interface Backend {
  fetchCites(): Promise<Cite[]>;
  fetchSources(): Promise<Source[]>;
  fetchTricyclesDispo(citeId: string): Promise<TricycleDispo[]>;
  creerCommande(c: NouvelleCommande, creds: Creds): Promise<string>;
  fetchSuivi(id: string): Promise<Suivi | null>;

  /** Connexion unique : le téléphone peut appartenir à l'admin, un client ou un chauffeur
   *  indépendamment de l'onglet choisi — le rôle réel de la réponse fait foi. */
  login(roleDemande: "client" | "chauffeur", tel: string, pin: string): Promise<LoginResult>;
  inscrireClient(i: InscriptionClient): Promise<ClientSession>;
  inscrireChauffeur(i: InscriptionChauffeur): Promise<ChauffeurSession>;

  clientProfil(c: Creds): Promise<ClientProfile>;
  clientCommandeActive(c: Creds): Promise<Suivi | null>;

  chauffeurProfil(c: Creds): Promise<ChauffeurProfile>;
  chauffeurFile(c: Creds): Promise<ChauffeurCommande[]>;
  chauffeurSetStatus(c: Creds, status: TricycleStatus): Promise<void>;
  chauffeurSetEtat(c: Creds, etat: TricycleEtat): Promise<void>;
  chauffeurSetPrix(c: Creds, prix: number): Promise<void>;
  chauffeurPartir(c: Creds): Promise<void>;
  chauffeurLivrer(c: Creds, commandeId: string): Promise<void>;

  admin: {
    load(c: Creds): Promise<AdminData>;
    save(c: Creds, table: AdminTable, id: string | null, row: Record<string, unknown>): Promise<void>;
    remove(c: Creds, table: AdminTable, id: string): Promise<void>;
    setStatut(c: Creds, table: "tricycles" | "clients", id: string, statut: CompteStatut): Promise<void>;
    /** +30 jours d'abonnement à partir de max(date d'expiration actuelle, maintenant). */
    prolongerAbonnement(c: Creds, clientId: string): Promise<void>;
    changerMotDePasse(c: Creds, nouveau: string): Promise<void>;
    /** Notifie à chaque changement. Renvoie la fonction de désabonnement. */
    subscribe(onChange: () => void, onStatus?: (live: boolean) => void): () => void;
  };
}
