/**
 * MODE DÉMO — backend 100 % navigateur (localStorage), utilisé UNIQUEMENT si
 * NEXT_PUBLIC_DEMO_MODE=true (voir data-provider.ts : jamais inclus dans un build
 * de production sinon). Implémente le même contrat Backend que remote.ts et reproduit la logique des
 * fonctions SQL de supabase/schema.sql : auth unifiée (client/chauffeur/admin),
 * file d'attente, statuts ACTIVE/PAUSED/OFFLINE, verrouillage par cité, etc.
 *
 * Temps réel : chaque écriture émet l'évènement "awa:mock" (même onglet) et
 * déclenche l'évènement natif "storage" dans les AUTRES onglets.
 * Les tâches cron (23h59 / 8h00 / purge GPS) sont rejouées à chaque lecture.
 */
import { AppError, fail, shortId, tropDeCommandes } from "./errors";
import {
  COMMANDES_ACTIVES,
  COMMANDES_ANNULABLES,
  DISTANCE_MAX_M,
  distanceMetres,
  HEURE_LIMITE_ANNULATION,
  jourAbidjan,
  PARTAGE_GPS_MAX_MS,
  POSITION_MAX_AGE_MS,
  PRIX_MAX,
  PRIX_MIN,
  prochain8h,
  revenuCommande,
  WAVE_MARCHAND_DEFAUT,
} from "./format";
import { normalizePhone, phoneCI } from "./phone";
import { pinTropSimple } from "./pin";
import type {
  AdminData,
  AdminTable,
  Backend,
  ChauffeurCommande,
  ChauffeurHistorique,
  ChauffeurProfile,
  Cite,
  Client,
  ClientHistorique,
  ClientProfile,
  Commande,
  CommandeStatus,
  CompteStatut,
  Creds,
  InscriptionChauffeur,
  InscriptionClient,
  LoginResult,
  NouvelleCommande,
  Settings,
  Source,
  Suivi,
  Tricycle,
  TricycleStatus,
  YearlyStats,
} from "./types";

export const MOCK_EVENT = "awa:mock";
const KEY = "awa:mock:v10"; // v10 : essai gratuit par compte, validation chauffeur, code provisoire
const DEFAULT_DEPOT_PHONE = "0789855418";
// Aucun identifiant admin en dur : la démo lit les siens dans l'environnement
// (local uniquement). Sans mot de passe défini, le compte admin démo est
// verrouillé par un secret aléatoire.
const DEMO_ADMIN_EMAIL = (process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? "").trim().toLowerCase();
const DEMO_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD ?? "";

type Auth = { pin: string; token: string | null; essais: number; bloque: number | null; pin_provisoire?: boolean };
type MockTricycle = Tricycle & Auth;
type MockClient = Client & Auth;
type MockAdmin = { email: string; password: string; token: string | null; essais: number; bloque: number | null };
/** jour_file : jour (UTC) où la commande est entrée en QUEUED — sert au rollover de 23h59. */
type MockCommande = Commande & { jour_file?: string; client_debite?: boolean; chauffeur_debite?: boolean };
/** Équivalent de positions_live : une position par tricycle, TTL 5 min. */
type MockPosition = { commande_id: string; lat: number; long: number; maj: string };

type DB = {
  cites: Cite[];
  sources: Source[];
  tricycles: MockTricycle[];
  clients: MockClient[];
  commandes: MockCommande[];
  positions: Record<string, MockPosition>;
  journal: { action: string; acteur_id: string | null; details: Record<string, unknown>; created_at: string }[];
  settings: Settings;
  admin: MockAdmin;
};

// ─── Utilitaires ───────────────────────────────────────────────────────────

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const token = () => uid().replace(/-/g, "") + uid().replace(/-/g, "");
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const enEssai = (fin: string | null | undefined) => !!fin && Date.now() < Date.parse(fin);
function finEssaiNouveau(db: DB): string {
  const d = new Date();
  d.setMonth(d.getMonth() + (db.settings.essai_mois ?? 2));
  return d.toISOString();
}
/** Chauffeur bloqué faute de points (jamais pendant son essai). */
const sansPoints = (t: MockTricycle) => !enEssai(t.essai_fin) && (t.is_offline || t.solde_points < 50);
const today = () => jourAbidjan();
/** "AAAA-MM-JJ" + h heures, heure d'Abidjan (UTC+0). */
const aHeure = (jour: string, h: number) => new Date(`${jour}T${String(h).padStart(2, "0")}:00:00Z`).toISOString();
const prixValide = (p: unknown): p is number => typeof p === "number" && Number.isFinite(p) && p >= PRIX_MIN && p <= PRIX_MAX;
const isActive = (s: CommandeStatus) => COMMANDES_ACTIVES.includes(s);

function seed(): DB {
  const c1 = uid(),
    c2 = uid(),
    c3 = uid();
  const s1 = uid(),
    s2 = uid(),
    s3 = uid(),
    s4 = uid();
  const kaderId = uid(),
    yaoId = uid(),
    seydouId = uid(),
    moussaId = uid(),
    koffiId = uid();
  const fatouId = uid(),
    issaId = uid(),
    ayaId = uid();

  const tri = (
    id: string,
    nom: string,
    telephone: string,
    cite_id: string,
    source_id: string | null,
    status: TricycleStatus,
    etat: "A_LA_SOURCE" | "EN_ROUTE",
    prix_1000: number,
    statut: CompteStatut = "PAYE",
    solde_points = 2500,
    is_offline = false,
    essai_fin: string | null = minutesAgo(-60 * 24 * 45)
  ): MockTricycle => ({
    id,
    nom,
    telephone,
    cite_id,
    source_id,
    status,
    etat,
    prix_1000,
    statut,
    solde_points,
    total_points_utilises: 0,
    is_offline,
    essai_fin,
    valide: true,
    pin: "1234",
    token: null,
    essais: 0,
    bloque: null,
  });
  const cli = (
    id: string,
    nom: string,
    telephone: string,
    cite_id: string,
    lot_numero: string,
    lat: number | null,
    long: number | null,
    statut: CompteStatut = "PAYE",
    solde_points = 1200,
    essai_fin: string | null = minutesAgo(-60 * 24 * 45)
  ): MockClient => ({
    id,
    nom,
    telephone,
    cite_id,
    lot_numero,
    lat,
    long,
    statut,
    date_paiement: statut === "PAYE" ? minutesAgo(60 * 24 * 3) : null,
    solde_points,
    is_temporary: false,
    essai_fin,
    pin: "1234",
    token: null,
    essais: 0,
    bloque: null,
  });
  const cmd = (
    client_id: string,
    tricycle_id: string,
    cite_id: string,
    lot: string,
    prix: number,
    pos: number,
    status: CommandeStatus,
    lat: number | null,
    long: number | null,
    ago: number
  ): MockCommande => ({
    id: uid(),
    client_id,
    tricycle_id,
    cite_id,
    lot_numero: lot,
    prix,
    position_file: pos,
    status,
    lat,
    long,
    programmee_pour: null,
    arriving_at: null,
    scheduled_for: today(),
    annulable_jusqua: null,
    source: "app",
    added_by_driver_id: null,
    is_temporary_client: false,
    quantite_bidons: null,
    note: null,
    livree_at: null,
    created_at: minutesAgo(ago),
    // Passées pendant l'essai gratuit des comptes de démo : rien de débité.
    client_debite: false,
    chauffeur_debite: false,
  });
  const mariamId = uid();
  const mariam: MockClient = {
    ...cli(mariamId, "Mariam Traoré", "0544332211", c1, "4", null, null, "IMPAYE", 0),
    is_temporary: true,
    pin: `!${token()}`,
  };
  const manuelle: MockCommande = {
    ...cmd(mariamId, kaderId, c1, "4", 2500, 3, "ASSIGNED", null, null, 5),
    source: "manual",
    added_by_driver_id: kaderId,
    is_temporary_client: true,
    quantite_bidons: 4,
    note: "Appeler en arrivant",
  };

  return {
    cites: [
      { id: c1, nom: "Cité 1" },
      { id: c2, nom: "Cité 2" },
      { id: c3, nom: "Cité 3" },
    ],
    sources: [
      { id: s1, nom: "Forage Nord", cite_id: c1, lat: 5.3861, long: -4.2712 },
      { id: s2, nom: "Forage Est", cite_id: c1, lat: 5.384, long: -4.266 },
      { id: s3, nom: "Forage Centre", cite_id: c2, lat: 5.3802, long: -4.265 },
      { id: s4, nom: "Forage Sud", cite_id: c3, lat: 5.3745, long: -4.2698 },
    ],
    tricycles: [
      tri(kaderId, "Kader", "0700000001", c1, s1, "ACTIVE", "A_LA_SOURCE", 2500),
      tri(yaoId, "Yao", "0700000002", c1, s2, "ACTIVE", "EN_ROUTE", 2500),
      // Seydou dort : ses nouvelles commandes partent en PROGRAMMED (demain 8h).
      tri(seydouId, "Seydou", "0700000005", c1, null, "OFFLINE", "A_LA_SOURCE", 2000),
      // Moussa est en pause : ses nouvelles commandes partent en QUEUED (aujourd'hui).
      tri(moussaId, "Moussa", "0700000003", c2, s3, "PAUSED", "A_LA_SOURCE", 3000),
      // Koffi : solde de points épuisé (démo de la page bloquante "Solde épuisé").
      tri(koffiId, "Koffi", "0700000004", c3, s4, "OFFLINE", "A_LA_SOURCE", 2000, "PAYE", 20, true, minutesAgo(60 * 24 * 3)),
    ],
    clients: [
      cli(fatouId, "Fatou", "0701020304", c1, "12", 5.3868, -4.2705, "PAYE", 1200),
      // Issa : solde sous 100 (démo de la page bloquante "Solde insuffisant").
      cli(issaId, "Issa", "0705060708", c1, "7", null, null, "IMPAYE", 50, minutesAgo(60 * 24 * 3)),
      cli(ayaId, "Aya", "0709101112", c1, "21", 5.3852, -4.2671, "PAYE", 1200),
      mariam,
    ],
    commandes: [
      cmd(fatouId, kaderId, c1, "12", 2500, 1, "ASSIGNED", 5.3868, -4.2705, 25),
      cmd(issaId, kaderId, c1, "7", 2500, 2, "ASSIGNED", null, null, 12),
      manuelle,
      cmd(ayaId, yaoId, c1, "21", 2500, 1, "EN_COURS", 5.3852, -4.2671, 40),
      ...historique(
        [
          { id: fatouId, lot: "12" },
          { id: ayaId, lot: "21" },
          { id: issaId, lot: "7" },
          { id: mariamId, lot: "4" },
        ],
        [
          { id: kaderId, prix: 2500 },
          { id: yaoId, prix: 2500 },
        ],
        c1
      ),
    ],
    positions: {},
    journal: [],
    settings: { trial_ends_at: "2026-12-31", depot_phone: DEFAULT_DEPOT_PHONE, essai_mois: 2, wave_marchand: WAVE_MARCHAND_DEFAUT },
    admin: { email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD || `!${token()}`, token: null, essais: 0, bloque: null },
  };
}

/** Historique de démonstration (janvier 2025 → hier) pour la page Statistiques :
 *  déterministe, ~2 commandes livrées par jour ouvré, quelques annulations. */
function historique(clients: { id: string; lot: string }[], chauffeurs: { id: string; prix: number }[], citeId: string): MockCommande[] {
  const out: MockCommande[] = [];
  // Livraisons par chauffeur : 1 sur 100 est offerte (bonus fidélité), comme en base.
  const livreesParChauffeur = new Map<string, number>();
  let seedRand = 7;
  const rand = () => (seedRand = (seedRand * 16807) % 2147483647) / 2147483647;
  const debut = Date.UTC(2025, 0, 1);
  const fin = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86400000;
  for (let j = debut; j <= fin; j += 86400000) {
    const n = Math.floor(rand() * 3) + (new Date(j).getUTCMonth() % 6 === 2 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const cl = clients[Math.floor(rand() * clients.length)];
      const ch = chauffeurs[Math.floor(rand() * chauffeurs.length)];
      const created = j + (7 + Math.floor(rand() * 10)) * 3600000 + Math.floor(rand() * 60) * 60000;
      const manuel = rand() < 0.28;
      const r = rand();
      const status: CommandeStatus = r < 0.07 ? "ANNULEE" : "LIVREE";
      const rang = status === "LIVREE" ? (livreesParChauffeur.get(ch.id) ?? 0) + 1 : 0;
      if (rang) livreesParChauffeur.set(ch.id, rang);
      out.push({
        id: uid(),
        client_id: cl.id,
        tricycle_id: ch.id,
        cite_id: citeId,
        lot_numero: cl.lot,
        prix: ch.prix,
        position_file: 0,
        status,
        lat: null,
        long: null,
        programmee_pour: null,
        arriving_at: null,
        scheduled_for: new Date(created).toISOString().slice(0, 10),
        annulable_jusqua: null,
        source: manuel ? "manual" : "app",
        added_by_driver_id: manuel ? ch.id : null,
        is_temporary_client: false,
        quantite_bidons: manuel ? 2 + Math.floor(rand() * 5) : null,
        note: null,
        livree_at: status === "LIVREE" ? new Date(created + (25 + Math.floor(rand() * 70)) * 60000).toISOString() : null,
        created_at: new Date(created).toISOString(),
        // Historique antérieur aux essais : débité (valeur par défaut en base), sauf
        // le client d'une saisie manuelle, qui ne paie rien dans l'appli.
        client_debite: !manuel,
        chauffeur_debite: true,
        chauffeur_bonus: rang > 0 && rang % 100 === 0,
      });
    }
  }
  return out;
}

/** Même calcul que get_yearly_stats (schema.sql), sur les données locales. */
function statsDemo(db: DB, annee: number, citeId: string | null, tricycleId: string | null): YearlyStats {
  const anMois = (iso: string) => ({ an: Number(iso.slice(0, 4)), mois: Number(iso.slice(5, 7)) });
  const premiere = new Map<string, string>();
  for (const c of db.commandes) {
    const p = premiere.get(c.client_id);
    if (!p || c.created_at < p) premiere.set(c.client_id, c.created_at);
  }
  const filtre = db.commandes.filter((c) => (!citeId || c.cite_id === citeId) && (!tricycleId || c.tricycle_id === tricycleId));
  const cur = filtre.filter((c) => anMois(c.created_at).an === annee);
  const prev = filtre.filter((c) => anMois(c.created_at).an === annee - 1);
  const auj = today();
  const minutes = (c: Commande) => (new Date(c.livree_at!).getTime() - new Date(c.created_at).getTime()) / 60000;
  const moyenne = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const plus3 = (cs: Commande[]) => {
    const n = new Map<string, number>();
    cs.forEach((c) => n.set(c.client_id, (n.get(c.client_id) ?? 0) + 1));
    return [...n.values()].filter((v) => v > 3).length;
  };

  const mois = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const cs = cur.filter((c) => anMois(c.created_at).mois === m);
    const livrees = cs.filter((c) => c.status === "LIVREE");
    const chrono = livrees.filter((c) => c.livree_at);
    const clients = new Set(cs.map((c) => c.client_id));
    const nouveaux = new Set(
      cs.filter((c) => {
        const p = anMois(premiere.get(c.client_id)!);
        return p.an === annee && p.mois === m;
      }).map((c) => c.client_id)
    );
    const rembs = cs.filter((c) => c.status === "ANNULEE" && c.source === "app");
    return {
      mois: m,
      total: cs.length,
      app: cs.filter((c) => c.source === "app").length,
      manual: cs.filter((c) => c.source === "manual").length,
      livrees: livrees.length,
      annulees: cs.filter((c) => c.status === "ANNULEE").length,
      echecs: cs.filter((c) => isActive(c.status) && c.scheduled_for < auj).length,
      bidons: livrees.reduce((s, c) => s + (c.quantite_bidons ?? 0), 0),
      // Même calcul que get_yearly_stats : ce qui a réellement été débité, moins les livraisons offertes.
      ca: livrees.reduce((s, c) => s + revenuCommande(c).net, 0),
      ca_brut: livrees.reduce((s, c) => s + revenuCommande(c).brut, 0),
      bonus: livrees.filter((c) => c.chauffeur_bonus).length,
      clients_uniques: clients.size,
      nouveaux: nouveaux.size,
      recurrents: clients.size - nouveaux.size,
      clients_plus_3: plus3(cs),
      temps_moyen_min: moyenne(chrono.map(minutes)),
      livrees_chronometrees: chrono.length,
      remboursements_montant: rembs.length * 100,
      remboursements_nb: rembs.length,
      total_annee_precedente: prev.filter((c) => anMois(c.created_at).mois === m).length,
    };
  });

  const parChauffeur = new Map<string, { id: string; nom: string; mois: number; livraisons: number }>();
  const parZone = new Map<string, { cite_id: string; cite_nom: string; lot: string; mois: number; total: number }>();
  for (const c of cur) {
    const m = anMois(c.created_at).mois;
    if (c.status === "LIVREE") {
      const k = `${c.tricycle_id}|${m}`;
      const nom = db.tricycles.find((t) => t.id === c.tricycle_id)?.nom ?? "Chauffeur supprimé";
      const e = parChauffeur.get(k) ?? { id: c.tricycle_id, nom, mois: m, livraisons: 0 };
      e.livraisons += 1;
      parChauffeur.set(k, e);
    }
    const kz = `${c.cite_id}|${c.lot_numero}|${m}`;
    const ez = parZone.get(kz) ?? { cite_id: c.cite_id, cite_nom: db.cites.find((x) => x.id === c.cite_id)?.nom ?? "?", lot: c.lot_numero, mois: m, total: 0 };
    ez.total += 1;
    parZone.set(kz, ez);
  }

  return {
    annee,
    mois,
    synthese: {
      clients_actifs: new Set(cur.map((c) => c.client_id)).size,
      nouveaux: new Set(cur.filter((c) => anMois(premiere.get(c.client_id)!).an === annee).map((c) => c.client_id)).size,
      clients_plus_3: plus3(cur),
      temps_moyen_min: moyenne(cur.filter((c) => c.status === "LIVREE" && c.livree_at).map(minutes)),
    },
    chauffeurs: [...parChauffeur.values()],
    zones: [...parZone.values()],
    options: {
      cites: [...db.cites].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true })),
      chauffeurs: db.tricycles.map((t) => ({ id: t.id, nom: t.nom, cite_id: t.cite_id })).sort((a, b) => a.nom.localeCompare(b.nom)),
    },
  };
}

/** Rejoue les tâches cron de schema.sql (rollover 23h59, sortie des PROGRAMMED à 8h, TTL GPS). */
function cron(db: DB): boolean {
  let changed = false;
  const now = Date.now();
  for (const c of db.commandes) {
    // 23h59 : une commande QUEUED d'un jour précédent passe PROGRAMMED pour le 8h suivant.
    if (c.status === "QUEUED" && c.jour_file && c.jour_file < today()) {
      c.status = "PROGRAMMED";
      c.programmee_pour = prochain8h(new Date(`${c.jour_file}T23:59:00Z`)).toISOString();
      c.scheduled_for = c.programmee_pour.slice(0, 10);
      c.jour_file = undefined;
      changed = true;
    }
    // 00h00 / 8h00 : PROGRAMMED dont le jour est arrivé → ASSIGNED si le chauffeur est ACTIVE, sinon QUEUED.
    if (c.status === "PROGRAMMED" && c.scheduled_for <= today()) {
      const t = db.tricycles.find((x) => x.id === c.tricycle_id);
      c.status = t?.status === "ACTIVE" ? "ASSIGNED" : "QUEUED";
      c.jour_file = c.status === "QUEUED" ? today() : undefined;
      c.programmee_pour = null;
      changed = true;
    }
  }
  for (const [tid, p] of Object.entries(db.positions)) {
    if (now - new Date(p.maj).getTime() > POSITION_MAX_AGE_MS) {
      delete db.positions[tid];
      changed = true;
    }
  }
  return changed;
}

function read(): DB {
  let db: DB | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) db = JSON.parse(raw) as DB;
  } catch {}
  if (!db) {
    db = seed();
    write(db, false);
    return db;
  }
  db.positions ??= {};
  db.journal ??= [];
  db.settings ??= { trial_ends_at: "2026-12-31", depot_phone: DEFAULT_DEPOT_PHONE, essai_mois: 2, wave_marchand: WAVE_MARCHAND_DEFAUT };
  db.settings.depot_phone ??= DEFAULT_DEPOT_PHONE;
  db.settings.wave_marchand ??= WAVE_MARCHAND_DEFAUT;
  db.settings.essai_mois ??= 2;
  if (cron(db)) write(db, false);
  return db;
}

function write(db: DB, notify = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
  if (notify && typeof window !== "undefined") window.dispatchEvent(new Event(MOCK_EVENT));
}

/** Lecture + écriture atomique (tout est synchrone → pas de course). */
function tx<T>(fn: (db: DB) => T): T {
  const db = read();
  const out = fn(db);
  write(db);
  return out;
}

const actives = (db: DB, tricycleId: string) => db.commandes.filter((c) => c.tricycle_id === tricycleId && isActive(c.status));

/** Position live d'une commande, seulement pendant ARRIVING (10 min max) et si elle a moins de 5 min. */
function livePosition(db: DB, c: Commande): MockPosition | null {
  const p = db.positions[c.tricycle_id];
  if (!p || p.commande_id !== c.id || c.status !== "ARRIVING" || !c.arriving_at) return null;
  const now = Date.now();
  if (now - new Date(c.arriving_at).getTime() > PARTAGE_GPS_MAX_MS) return null;
  if (now - new Date(p.maj).getTime() > POSITION_MAX_AGE_MS) return null;
  return p;
}

function chauffeurProfile(db: DB, t: MockTricycle): ChauffeurProfile {
  const s = db.sources.find((x) => x.id === t.source_id);
  const ci = db.cites.find((x) => x.id === t.cite_id);
  return {
    id: t.id,
    nom: t.nom,
    telephone: t.telephone,
    status: t.status,
    etat: t.etat,
    prix_1000: t.prix_1000,
    statut: t.statut,
    source_nom: s?.nom ?? null,
    cite_id: t.cite_id,
    cite_nom: ci?.nom ?? "?",
    solde_points: t.solde_points,
    total_points_utilises: t.total_points_utilises,
    is_offline: sansPoints(t),
    essai_fin: t.essai_fin,
    valide: t.valide,
    pin_provisoire: !!t.pin_provisoire,
  };
}

function clientProfile(db: DB, cl: MockClient): ClientProfile {
  const c = db.cites.find((x) => x.id === cl.cite_id)!;
  return {
    id: cl.id,
    nom: cl.nom,
    telephone: cl.telephone,
    cite_id: c.id,
    cite_nom: c.nom,
    lot_numero: cl.lot_numero,
    statut: cl.statut,
    solde_points: cl.solde_points,
    essai_fin: cl.essai_fin,
    pin_provisoire: !!cl.pin_provisoire,
  };
}

function suivi(db: DB, c: Commande): Suivi {
  const t = db.tricycles.find((x) => x.id === c.tricycle_id)!;
  const s = db.sources.find((x) => x.id === t.source_id);
  const ci = db.cites.find((x) => x.id === c.cite_id)!;
  const p = livePosition(db, c);
  return {
    id: c.id,
    status: c.status,
    position_file: c.position_file,
    prix: c.prix,
    lot_numero: c.lot_numero,
    lat: c.lat,
    long: c.long,
    created_at: c.created_at,
    programmee_pour: c.programmee_pour,
    arriving_at: c.arriving_at,
    scheduled_for: c.scheduled_for,
    annulable_jusqua: c.annulable_jusqua,
    source: c.source,
    tricycle_id: t.id,
    chauffeur_nom: t.nom,
    chauffeur_tel: t.telephone,
    etat: t.etat,
    chauffeur_status: t.status,
    cite_nom: ci.nom,
    source_nom: s?.nom ?? null,
    tricycle_lat: p?.lat ?? null,
    tricycle_long: p?.long ?? null,
    tricycle_position_maj: p?.maj ?? null,
  };
}

/** -50 points au chauffeur pour une commande reçue (+ fidélité, passage is_offline).
 *  Rien pendant son essai gratuit. Renvoie true si débité. */
function debiterChauffeur(t: MockTricycle, cmd: Commande): boolean {
  if (enEssai(t.essai_fin)) return false;
  t.solde_points -= 50;
  t.total_points_utilises += 50;
  if (t.total_points_utilises >= 5000) {
    t.solde_points += 50;
    t.total_points_utilises = 0;
    cmd.chauffeur_bonus = true;
  }
  t.is_offline = t.solde_points < 50;
  return true;
}

/** Retire une commande de la file : les suivantes remontent d'un cran. */
function sortirDeLaFile(db: DB, cmd: Commande, status: "LIVREE" | "ANNULEE") {
  const pos = cmd.position_file;
  cmd.status = status;
  cmd.position_file = 0;
  cmd.programmee_pour = null;
  actives(db, cmd.tricycle_id).forEach((x) => {
    if (x.position_file > pos) x.position_file -= 1;
  });
}

function authTricycle(db: DB, c: Creds): MockTricycle {
  if (c.role !== "chauffeur") return fail("AUTH");
  const t = db.tricycles.find((x) => x.telephone === normalizePhone(c.tel));
  if (!t || !t.token || t.token !== c.token) return fail("AUTH");
  return t;
}
function authClient(db: DB, c: Creds): MockClient {
  if (c.role !== "client") return fail("AUTH");
  const cl = db.clients.find((x) => x.telephone === normalizePhone(c.tel));
  if (!cl || !cl.token || cl.token !== c.token) return fail("AUTH");
  return cl;
}
function authAdmin(db: DB, c: Creds): void {
  if (c.role !== "admin" || !db.admin.email || db.admin.email !== c.tel.trim().toLowerCase() || !db.admin.token || db.admin.token !== c.token) return fail("REFUSE");
}

type Lockable = { essais: number; bloque: number | null };

/** Vérifie PIN/mot de passe avec compteur d'essais + blocage 15 min (anti-devinette),
 *  commun aux 3 tables d'auth (le nom du champ secret diffère : pin pour client/chauffeur,
 *  password pour l'admin — on le passe donc à part plutôt que via une contrainte de type).
 *  Ne lève jamais : renvoie le résultat pour ne pas perdre l'incrément du compteur dans
 *  une transaction annulée. */
function checkAuth<T extends Lockable>(entry: T | undefined, stored: string, secret: string): { ok: true } | { ok: false; error: "AUTH" | "BLOQUE" } {
  if (!entry) return { ok: false, error: "AUTH" };
  if (entry.bloque && entry.bloque > Date.now()) return { ok: false, error: "BLOQUE" };
  if (stored !== secret) {
    entry.essais += 1;
    if (entry.essais >= 5) {
      entry.bloque = Date.now() + 15 * 60000;
      entry.essais = 0;
      return { ok: false, error: "BLOQUE" };
    }
    return { ok: false, error: "AUTH" };
  }
  entry.essais = 0;
  entry.bloque = null;
  return { ok: true };
}

// ─── Backend ───────────────────────────────────────────────────────────────

const ORDRE_STATUS: Record<TricycleStatus, number> = { ACTIVE: 0, PAUSED: 1, OFFLINE: 2 };

export const mock: Backend = {
  async fetchCites() {
    return read().cites;
  },
  async fetchSources() {
    return read().sources;
  },

  // Tous les chauffeurs de la cité, quel que soit leur statut (ils ne refusent jamais).
  async fetchTricyclesDispo(citeId) {
    const db = read();
    return db.tricycles
      .filter((t) => t.cite_id === citeId && t.statut !== "BLOQUE" && t.valide && !sansPoints(t))
      .map((t) => {
        const s = db.sources.find((x) => x.id === t.source_id);
        return {
          id: t.id,
          nom: t.nom,
          source_id: s?.id ?? null,
          source_nom: s?.nom ?? null,
          etat: t.etat,
          file_count: actives(db, t.id).length,
          prix_1000: t.prix_1000,
          status: t.status,
        };
      })
      .sort((a, b) => ORDRE_STATUS[a.status] - ORDRE_STATUS[b.status] || a.file_count - b.file_count || a.nom.localeCompare(b.nom));
  },

  // Mêmes contrôles et même ordre que creer_commande (schema.sql).
  async creerCommande(c: NouvelleCommande, creds: Creds) {
    return tx((db) => {
      const cl = authClient(db, creds);
      if (cl.statut === "BLOQUE") return fail("COMPTE_BLOQUE");
      const deja = db.commandes
        .filter((x) => x.client_id === cl.id && isActive(x.status))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (deja) throw tropDeCommandes(shortId(deja.id));
      const clientEssai = enEssai(cl.essai_fin);
      if (!clientEssai && cl.solde_points < 100) return fail("SOLDE_INSUFFISANT_CLIENT");
      const t = db.tricycles.find((x) => x.id === c.tricycleId);
      if (!t || t.statut === "BLOQUE" || !t.valide || sansPoints(t)) return fail("TRICYCLE_INDISPONIBLE");
      if (t.cite_id !== cl.cite_id) return fail("HORS_ZONE");

      const gpsIn = c.gps && Math.abs(c.gps.lat) <= 90 && Math.abs(c.gps.long) <= 180 ? c.gps : null;
      const lat = gpsIn?.lat ?? cl.lat;
      const long = gpsIn?.long ?? cl.long;

      const src = db.sources.find((s) => s.id === t.source_id);
      if (src?.lat != null && src.long != null && lat != null && long != null && distanceMetres(src.lat, src.long, lat, long) > DISTANCE_MAX_M) {
        return fail("TROP_LOIN");
      }

      let status: CommandeStatus;
      let programmee: string | null = null;
      let jour = today();
      if (c.demain) {
        status = "PROGRAMMED";
        jour = jourAbidjan(1);
        programmee = aHeure(jour, 8);
      } else {
        status = t.status === "ACTIVE" ? "ASSIGNED" : t.status === "PAUSED" ? "QUEUED" : "PROGRAMMED";
        if (status === "PROGRAMMED") {
          programmee = prochain8h().toISOString();
          jour = programmee.slice(0, 10);
        }
      }
      const commande: MockCommande = {
        id: uid(),
        client_id: cl.id,
        tricycle_id: t.id,
        cite_id: cl.cite_id,
        lot_numero: cl.lot_numero,
        prix: t.prix_1000,
        position_file: actives(db, t.id).length + 1,
        status,
        lat,
        long,
        programmee_pour: programmee,
        arriving_at: null,
        scheduled_for: jour,
        annulable_jusqua: jour > today() ? aHeure(jourAbidjan(-1, new Date(`${jour}T12:00:00Z`)), HEURE_LIMITE_ANNULATION) : null,
        source: "app",
        added_by_driver_id: null,
        is_temporary_client: false,
        quantite_bidons: null,
        note: null,
        livree_at: null,
        created_at: new Date().toISOString(),
        jour_file: status === "QUEUED" ? today() : undefined,
      };
      db.commandes.push(commande);

      if (!clientEssai) cl.solde_points -= 100;
      commande.client_debite = !clientEssai;
      commande.chauffeur_debite = debiterChauffeur(t, commande);

      return commande.id;
    });
  },

  // Démo : évènements localStorage (même onglet + synchro entre onglets), sans notion de canal.
  subscribeTopics(_topics, onChange) {
    window.addEventListener(MOCK_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(MOCK_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },

  async fetchDepotPhone() {
    return read().settings.depot_phone;
  },

  async fetchWaveMarchand() {
    return read().settings.wave_marchand;
  },

  async fetchEssaiFin() {
    return read().settings.trial_ends_at;
  },

  async fetchSuivi(id) {
    const db = read();
    const c = db.commandes.find((x) => x.id === id);
    return c ? suivi(db, c) : null;
  },

  // ── Authentification unifiée ───────────────────────────────────────────

  // Même règle que auth_login('auto') : compte client puis compte chauffeur du numéro.
  async login(telRaw, pin): Promise<LoginResult> {
    const db = read();
    const tel = normalizePhone(telRaw);
    const cl = db.clients.find((x) => x.telephone === tel && !x.is_temporary);
    const t = db.tricycles.find((x) => x.telephone === tel);
    if (!cl && !t) throw new AppError("AUTH");

    const libre = (e: Lockable) => !e.bloque || e.bloque <= Date.now();
    if (cl && libre(cl) && cl.pin === pin) {
      cl.essais = 0;
      cl.bloque = null;
      cl.token = token();
      write(db);
      return { role: "client", session: { creds: { role: "client", tel, token: cl.token }, profile: clientProfile(db, cl) } };
    }
    if (t && libre(t) && t.pin === pin) {
      t.essais = 0;
      t.bloque = null;
      t.token = token();
      write(db);
      return { role: "chauffeur", session: { creds: { role: "chauffeur", tel, token: t.token }, profile: chauffeurProfile(db, t) } };
    }

    let bloque = false;
    for (const e of [cl, t]) {
      if (!e) continue;
      const r = checkAuth(e, e.pin, pin); // ici : bloqué ou PIN faux → compte l'échec
      if (!r.ok && r.error === "BLOQUE") bloque = true;
    }
    write(db, false);
    throw new AppError(bloque ? "BLOQUE" : "AUTH");
  },

  async loginAdmin(emailRaw, password) {
    const db = read();
    const email = emailRaw.trim().toLowerCase();
    if (!db.admin.email || db.admin.email !== email) throw new AppError("AUTH_ADMIN");
    const r = checkAuth(db.admin, db.admin.password, password);
    if (!r.ok) {
      write(db, false);
      throw new AppError(r.error === "AUTH" ? "AUTH_ADMIN" : r.error);
    }
    db.admin.token = token();
    write(db);
    return { creds: { role: "admin", tel: email, token: db.admin.token }, profile: { email } };
  },

  async inscrireClient(i: InscriptionClient) {
    return tx((db) => {
      const nom = i.nom.trim();
      const tel = normalizePhone(i.tel);
      const lot = i.lot.trim();
      if (!nom || nom.length > 40) return fail("NOM_INVALIDE");
      if (tel.length < 8 || tel.length > 16) return fail("TEL_INVALIDE");
      if (!/^[0-9]{4}$/.test(i.pin)) return fail("PIN_INVALIDE");
      if (pinTropSimple(i.pin)) return fail("PIN_TROP_SIMPLE");
      if (!lot || lot.length > 20) return fail("LOT_INVALIDE");
      if (!db.cites.some((c) => c.id === i.citeId)) return fail("CITE_INTROUVABLE");
      if (db.clients.some((c) => c.telephone === tel && !c.is_temporary)) return fail("DEJA_INSCRIT");

      const gps = i.gps && Math.abs(i.gps.lat) <= 90 && Math.abs(i.gps.long) <= 180 ? i.gps : null;

      // Client temporaire (saisi par un chauffeur) : il récupère son compte et son historique.
      const temp = db.clients.find((c) => c.telephone === tel && c.is_temporary);
      if (temp) {
        Object.assign(temp, {
          nom,
          cite_id: i.citeId,
          lot_numero: lot,
          lat: gps?.lat ?? null,
          long: gps?.long ?? null,
          solde_points: 0,
          essai_fin: finEssaiNouveau(db),
          is_temporary: false,
          pin: i.pin,
          pin_provisoire: false,
          token: token(),
        });
        return { creds: { role: "client" as const, tel, token: temp.token! }, profile: clientProfile(db, temp) };
      }
      const cl: MockClient = {
        id: uid(),
        nom,
        telephone: tel,
        cite_id: i.citeId,
        lot_numero: lot,
        lat: gps?.lat ?? null,
        long: gps?.long ?? null,
        statut: "IMPAYE",
        date_paiement: null,
        // Essai gratuit (points illimités) puis recharge : solde de départ 0.
        solde_points: 0,
        essai_fin: finEssaiNouveau(db),
        is_temporary: false,
        pin: i.pin,
        token: token(),
        essais: 0,
        bloque: null,
      };
      db.clients.push(cl);
      return { creds: { role: "client" as const, tel, token: cl.token! }, profile: clientProfile(db, cl) };
    });
  },

  async inscrireChauffeur(i: InscriptionChauffeur) {
    return tx((db) => {
      const nom = i.nom.trim();
      const tel = normalizePhone(i.tel);
      if (!nom || nom.length > 40) return fail("NOM_INVALIDE");
      if (tel.length < 8 || tel.length > 16) return fail("TEL_INVALIDE");
      if (!/^[0-9]{4}$/.test(i.pin)) return fail("PIN_INVALIDE");
      if (pinTropSimple(i.pin)) return fail("PIN_TROP_SIMPLE");
      if (!prixValide(i.prix)) return fail("PRIX_INVALIDE");
      if (!i.citeId || !db.cites.some((c) => c.id === i.citeId)) return fail("CITE_INTROUVABLE");
      if (i.sourceId && !db.sources.some((s) => s.id === i.sourceId && s.cite_id === i.citeId)) return fail("SOURCE_INTROUVABLE");
      if (db.tricycles.some((t) => t.telephone === tel)) return fail("DEJA_INSCRIT");

      const t: MockTricycle = {
        id: uid(),
        nom,
        telephone: tel,
        cite_id: i.citeId,
        source_id: i.sourceId,
        status: "OFFLINE",
        etat: "A_LA_SOURCE",
        prix_1000: i.prix,
        statut: "IMPAYE",
        // Essai gratuit (points illimités) puis recharge : solde de départ 0.
        solde_points: 0,
        total_points_utilises: 0,
        is_offline: false,
        essai_fin: finEssaiNouveau(db),
        // Anti-intrusion : invisible des clients tant que l'admin ne l'a pas validé.
        valide: false,
        pin: i.pin,
        token: token(),
        essais: 0,
        bloque: null,
      };
      db.tricycles.push(t);
      return { creds: { role: "chauffeur" as const, tel, token: t.token! }, profile: chauffeurProfile(db, t) };
    });
  },

  // ── Client ──────────────────────────────────────────────────────────────

  async clientProfil(c) {
    const db = read();
    return clientProfile(db, authClient(db, c));
  },

  async clientCommandeActive(c) {
    const db = read();
    const cl = authClient(db, c);
    const cmd = db.commandes.find((x) => x.client_id === cl.id && isActive(x.status));
    return cmd ? suivi(db, cmd) : null;
  },

  // Même périmètre que client_historique : 12 derniers mois, plus récentes d'abord.
  async clientHistorique(c): Promise<ClientHistorique[]> {
    const db = read();
    const cl = authClient(db, c);
    const depuis = new Date();
    depuis.setUTCMonth(depuis.getUTCMonth() - 12);
    return db.commandes
      .filter((x) => x.client_id === cl.id && x.created_at > depuis.toISOString())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((x) => ({
        id: x.id,
        status: x.status,
        prix: x.prix,
        source: x.source,
        created_at: x.created_at,
        livree_at: x.livree_at,
        scheduled_for: x.scheduled_for,
        chauffeur_nom: db.tricycles.find((t) => t.id === x.tricycle_id)?.nom ?? "?",
        client_debite: x.source === "app" && (x as MockCommande).client_debite !== false,
      }));
  },

  async clientChangerPin(c, nouveau) {
    tx((db) => {
      const cl = authClient(db, c);
      if (!/^[0-9]{4}$/.test(nouveau)) return fail("PIN_INVALIDE");
      if (pinTropSimple(nouveau)) return fail("PIN_TROP_SIMPLE");
      cl.pin = nouveau;
      cl.pin_provisoire = false;
    });
  },

  async clientAnnulerCommande(c, commandeId) {
    tx((db) => {
      const cl = authClient(db, c);
      const cmd = db.commandes.find((x) => x.id === commandeId && x.client_id === cl.id);
      if (!cmd || !COMMANDES_ANNULABLES.includes(cmd.status)) return fail("ANNULATION_IMPOSSIBLE");
      if (cmd.annulable_jusqua && Date.now() >= new Date(cmd.annulable_jusqua).getTime()) return fail("ANNULATION_TARDIVE");
      sortirDeLaFile(db, cmd, "ANNULEE");
      const m = cmd as MockCommande;
      if (cmd.source === "app" && m.client_debite !== false) cl.solde_points += 100;
      const t = db.tricycles.find((x) => x.id === cmd.tricycle_id);
      if (t && m.chauffeur_debite !== false) {
        t.solde_points += 50;
        if (t.solde_points >= 50) t.is_offline = false;
      }
    });
  },

  // Démo : la position est relue à chaque écriture (évènements localStorage).
  subscribePosition(commandeId, onPosition) {
    let last = "";
    const check = () => {
      const db = read();
      const c = db.commandes.find((x) => x.id === commandeId);
      const p = c ? livePosition(db, c) : null;
      if (p && p.maj !== last) {
        last = p.maj;
        onPosition({ lat: p.lat, long: p.long, at: p.maj });
      }
    };
    window.addEventListener(MOCK_EVENT, check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(MOCK_EVENT, check);
      window.removeEventListener("storage", check);
    };
  },

  // ── Chauffeur ───────────────────────────────────────────────────────────

  async chauffeurProfil(c) {
    const db = read();
    return chauffeurProfile(db, authTricycle(db, c));
  },

  async chauffeurFile(c) {
    const db = read();
    const t = authTricycle(db, c);
    return actives(db, t.id)
      .sort((a, b) => a.position_file - b.position_file)
      .map((cmd): ChauffeurCommande => {
        const cl = db.clients.find((x) => x.id === cmd.client_id);
        return {
          id: cmd.id,
          lot_numero: cmd.lot_numero,
          position_file: cmd.position_file,
          status: cmd.status,
          lat: cmd.lat,
          long: cmd.long,
          created_at: cmd.created_at,
          programmee_pour: cmd.programmee_pour,
          arriving_at: cmd.arriving_at,
          scheduled_for: cmd.scheduled_for,
          source: cmd.source,
          is_temporary_client: cmd.is_temporary_client,
          quantite_bidons: cmd.quantite_bidons,
          note: cmd.note,
          client_nom: cl?.nom ?? "Client",
          client_tel: cl?.telephone ?? "",
          added_by_nom: db.tricycles.find((x) => x.id === cmd.added_by_driver_id)?.nom ?? null,
        };
      });
  },

  // Même périmètre que chauffeur_historique : 12 derniers mois, plus récentes d'abord.
  async chauffeurHistorique(c): Promise<ChauffeurHistorique[]> {
    const db = read();
    const t = authTricycle(db, c);
    const depuis = new Date();
    depuis.setUTCMonth(depuis.getUTCMonth() - 12);
    return db.commandes
      .filter((x) => x.tricycle_id === t.id && x.created_at > depuis.toISOString())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((x) => ({
        id: x.id,
        status: x.status,
        prix: x.prix,
        source: x.source,
        created_at: x.created_at,
        livree_at: x.livree_at,
        lot_numero: x.lot_numero,
        quantite_bidons: x.quantite_bidons,
        client_nom: db.clients.find((cl) => cl.id === x.client_id)?.nom ?? "Client",
        chauffeur_debite: (x as MockCommande).chauffeur_debite !== false,
        chauffeur_bonus: !!x.chauffeur_bonus,
      }));
  },

  async chauffeurCommandeManuelle(c, m) {
    return tx((db) => {
      const t = authTricycle(db, c);
      const nom = m.nom.trim();
      const tel = phoneCI(m.tel);
      const lot = m.lot.trim();
      const note = m.note.trim() || null;
      if (!nom || nom.length > 40) return fail("NOM_INVALIDE");
      if (!tel) return fail("TEL_INVALIDE_CI");
      if (!lot || lot.length > 20) return fail("LOT_INVALIDE");
      if (m.quantiteBidons != null && !(Number.isInteger(m.quantiteBidons) && m.quantiteBidons >= 1 && m.quantiteBidons <= 200)) return fail("QUANTITE_INVALIDE");
      if (note && note.length > 280) return fail("NOTE_INVALIDE");
      if (t.statut === "BLOQUE") return fail("COMPTE_BLOQUE");
      if (!t.valide) return fail("COMPTE_EN_ATTENTE");
      if (sansPoints(t)) return fail("SOLDE_INSUFFISANT");

      let cl = db.clients
        .filter((x) => x.telephone === tel)
        .sort((a, b) => Number(a.is_temporary) - Number(b.is_temporary))[0];
      if (cl) {
        if (cl.cite_id !== t.cite_id) return fail("HORS_ZONE");
        if (cl.statut === "BLOQUE") return fail("CLIENT_BLOQUE");
        const deja = db.commandes
          .filter((x) => x.client_id === cl!.id && isActive(x.status))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (deja) throw tropDeCommandes(shortId(deja.id));
      } else {
        cl = {
          id: uid(),
          nom,
          telephone: tel,
          cite_id: t.cite_id,
          lot_numero: lot,
          lat: null,
          long: null,
          statut: "IMPAYE",
          date_paiement: null,
          solde_points: 0,
          is_temporary: true,
          essai_fin: null,
          pin: `!${token()}`,
          token: null,
          essais: 0,
          bloque: null,
        };
        db.clients.push(cl);
      }

      const commande: MockCommande = {
        id: uid(),
        client_id: cl.id,
        tricycle_id: t.id,
        cite_id: t.cite_id,
        lot_numero: lot,
        prix: t.prix_1000,
        position_file: actives(db, t.id).length + 1,
        status: "ASSIGNED",
        lat: cl.lat,
        long: cl.long,
        programmee_pour: null,
        arriving_at: null,
        scheduled_for: today(),
        annulable_jusqua: null,
        source: "manual",
        added_by_driver_id: t.id,
        is_temporary_client: cl.is_temporary,
        quantite_bidons: m.quantiteBidons,
        note,
        livree_at: null,
        created_at: new Date().toISOString(),
      };
      db.commandes.push(commande);
      commande.client_debite = false;
      commande.chauffeur_debite = debiterChauffeur(t, commande);
      db.journal.push({
        action: "COMMANDE_MANUELLE",
        acteur_id: t.id,
        details: { commande_id: commande.id, client_id: cl.id, client_temporaire: cl.is_temporary, chauffeur_nom: t.nom },
        created_at: commande.created_at,
      });
      return commande.id;
    });
  },

  async chauffeurLots(c) {
    const db = read();
    const t = authTricycle(db, c);
    return [...new Set(db.clients.filter((x) => x.cite_id === t.cite_id).map((x) => x.lot_numero))].sort((a, b) =>
      a.localeCompare(b, "fr", { numeric: true })
    );
  },

  async chauffeurChangerPin(c, nouveau) {
    tx((db) => {
      const t = authTricycle(db, c);
      if (!/^[0-9]{4}$/.test(nouveau)) return fail("PIN_INVALIDE");
      if (pinTropSimple(nouveau)) return fail("PIN_TROP_SIMPLE");
      t.pin = nouveau;
      t.pin_provisoire = false;
    });
  },

  async chauffeurSetStatus(c, status) {
    tx((db) => {
      const t = authTricycle(db, c);
      if (status !== "OFFLINE" && t.statut === "BLOQUE") return fail("COMPTE_BLOQUE");
      if (status !== "OFFLINE" && !t.valide) return fail("COMPTE_EN_ATTENTE");
      if (status !== "OFFLINE" && sansPoints(t)) return fail("SOLDE_INSUFFISANT");
      t.status = status;
      if (status === "ACTIVE") {
        // Reprise : ses commandes QUEUED (et PROGRAMMED du jour) lui sont assignées, FIFO conservé.
        actives(db, t.id).forEach((x) => {
          if (x.status === "QUEUED" || (x.status === "PROGRAMMED" && x.scheduled_for <= today())) {
            x.status = "ASSIGNED";
            x.programmee_pour = null;
            (x as MockCommande).jour_file = undefined;
          }
        });
      }
    });
  },

  async chauffeurSetEtat(c, etat) {
    tx((db) => {
      authTricycle(db, c).etat = etat;
    });
  },

  async chauffeurSetPrix(c, prix) {
    tx((db) => {
      if (!prixValide(prix)) return fail("PRIX_INVALIDE");
      authTricycle(db, c).prix_1000 = Math.round(prix);
    });
  },

  // Acceptée uniquement pendant ARRIVING (10 min max) — sinon { actif: false }.
  async chauffeurSetPosition(c, lat, long) {
    return tx((db) => {
      if (!Number.isFinite(lat) || !Number.isFinite(long) || Math.abs(lat) > 90 || Math.abs(long) > 180) return fail("POSITION_INVALIDE");
      const t = authTricycle(db, c);
      const cmd = actives(db, t.id).find(
        (x) => x.status === "ARRIVING" && x.arriving_at && Date.now() - new Date(x.arriving_at).getTime() < PARTAGE_GPS_MAX_MS
      );
      if (!cmd) {
        delete db.positions[t.id];
        return { actif: false };
      }
      db.positions[t.id] = { commande_id: cmd.id, lat, long, maj: new Date().toISOString() };
      return { actif: true };
    });
  },

  // Les points sont déduits à la CRÉATION de la commande, pas ici. Renvoie quand
  // même {bonusFidelite, soldePoints} (bonus toujours false) pour le contrat frontend.
  async chauffeurPartir(c) {
    return tx((db) => {
      const t = authTricycle(db, c);
      const file = actives(db, t.id);
      if (file.some((x) => x.status === "EN_COURS" || x.status === "ARRIVING")) return fail("DEJA_EN_COURS");
      const next = file.filter((x) => x.status === "ASSIGNED").sort((a, b) => a.position_file - b.position_file)[0];
      if (!next) return fail("FILE_VIDE");

      next.status = "EN_COURS";
      t.etat = "EN_ROUTE";

      return { bonusFidelite: false, soldePoints: t.solde_points };
    });
  },

  async chauffeurArriver(c, commandeId) {
    tx((db) => {
      const t = authTricycle(db, c);
      const cmd = db.commandes.find((x) => x.id === commandeId && x.tricycle_id === t.id && x.status === "EN_COURS");
      if (!cmd) return fail("COMMANDE_INTROUVABLE");
      cmd.status = "ARRIVING";
      cmd.arriving_at = new Date().toISOString();
    });
  },

  async chauffeurLivrer(c, commandeId) {
    tx((db) => {
      const t = authTricycle(db, c);
      const cmd = db.commandes.find((x) => x.id === commandeId && x.tricycle_id === t.id && (x.status === "EN_COURS" || x.status === "ARRIVING"));
      if (!cmd) return fail("COMMANDE_INTROUVABLE");
      sortirDeLaFile(db, cmd, "LIVREE");
      cmd.livree_at = new Date().toISOString();
      delete db.positions[t.id]; // fin de course : le partage GPS s'arrête
      const essai = today() <= db.settings.trial_ends_at;
      db.journal.push({
        action: "FACTURATION",
        acteur_id: t.id,
        details: { commande_id: cmd.id, prix: cmd.prix, source: cmd.source, periode_essai: essai, facturable: !essai, trial_ends_at: db.settings.trial_ends_at },
        created_at: new Date().toISOString(),
      });
    });
  },

  // ── Admin ───────────────────────────────────────────────────────────────

  admin: {
    async load(c): Promise<AdminData> {
      const db = read();
      authAdmin(db, c);
      return {
        cites: db.cites,
        sources: db.sources,
        tricycles: db.tricycles.map(({ id, nom, telephone, cite_id, source_id, status, etat, prix_1000, statut, solde_points, total_points_utilises, is_offline, essai_fin, valide }) => ({
          id,
          nom,
          telephone,
          cite_id,
          source_id,
          status,
          etat,
          prix_1000,
          statut,
          solde_points,
          total_points_utilises,
          is_offline,
          essai_fin,
          valide,
        })),
        settings: db.settings,
        clients: db.clients.map(({ id, nom, telephone, cite_id, lot_numero, lat, long, statut, date_paiement, solde_points, is_temporary, essai_fin }) => ({
          is_temporary,
          id,
          nom,
          telephone,
          cite_id,
          lot_numero,
          lat,
          long,
          statut,
          date_paiement,
          solde_points,
          essai_fin,
        })),
        commandes: db.commandes.map(({ jour_file: _, ...cmd }) => cmd).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      };
    },

    async save(c, table: AdminTable, id, row) {
      tx((db) => {
        authAdmin(db, c);
        if (table === "cites") {
          const nom = String(row.nom ?? "").trim();
          if (!nom) return fail("NOM_INVALIDE");
          if (db.cites.some((x) => x.nom === nom && x.id !== id)) return fail("DOUBLON");
          if (id) Object.assign(db.cites.find((x) => x.id === id)!, { nom });
          else db.cites.push({ id: uid(), nom });
        } else if (table === "sources") {
          const data = {
            nom: String(row.nom ?? "").trim(),
            cite_id: String(row.cite_id),
            lat: (row.lat as number | null) ?? null,
            long: (row.long as number | null) ?? null,
          };
          if (!data.nom) return fail("NOM_INVALIDE");
          if (id) Object.assign(db.sources.find((x) => x.id === id)!, data);
          else db.sources.push({ id: uid(), ...data });
        } else {
          fail("REFUSE"); // tricycles/clients : uniquement via setStatut / remove (pas de création manuelle)
        }
      });
    },

    async remove(c, table: AdminTable, id) {
      tx((db) => {
        authAdmin(db, c);
        const dropTricycles = (ids: string[]) => {
          db.tricycles = db.tricycles.filter((t) => !ids.includes(t.id));
          db.commandes = db.commandes.filter((cm) => !ids.includes(cm.tricycle_id));
          ids.forEach((tid) => delete db.positions[tid]);
        };
        if (table === "tricycles") dropTricycles([id]);
        else if (table === "clients") {
          db.clients = db.clients.filter((cl) => cl.id !== id);
          db.commandes = db.commandes.filter((cm) => cm.client_id !== id);
        } else if (table === "sources") {
          dropTricycles(db.tricycles.filter((t) => t.source_id === id).map((t) => t.id));
          db.sources = db.sources.filter((s) => s.id !== id);
        } else {
          // Supprimer une cité supprime ses chauffeurs, sources, clients et commandes (cascade SQL).
          dropTricycles(db.tricycles.filter((t) => t.cite_id === id).map((t) => t.id));
          db.sources = db.sources.filter((s) => s.cite_id !== id);
          db.clients = db.clients.filter((cl) => cl.cite_id !== id);
          db.commandes = db.commandes.filter((cm) => cm.cite_id !== id);
          db.cites = db.cites.filter((x) => x.id !== id);
        }
      });
    },

    async setStatut(c, table, id, statut) {
      tx((db) => {
        authAdmin(db, c);
        if (table === "tricycles") {
          const t = db.tricycles.find((x) => x.id === id);
          if (!t) return fail("CHAUFFEUR_INTROUVABLE");
          t.statut = statut;
          if (statut === "BLOQUE") t.status = "OFFLINE"; // un tricycle bloqué ne peut pas rester visible des clients
        } else {
          const cl = db.clients.find((x) => x.id === id);
          if (!cl) return fail("CLIENT_INTROUVABLE");
          cl.statut = statut;
          if (statut === "PAYE") cl.date_paiement = new Date().toISOString();
        }
      });
    },

    async rechargerPoints(c, table, id, montant) {
      tx((db) => {
        authAdmin(db, c);
        if (!Number.isFinite(montant) || montant <= 0 || montant % 50 !== 0) return fail("MONTANT_INVALIDE");
        if (table === "clients" && montant % 100 !== 0) return fail("MONTANT_INVALIDE_CLIENT");
        if (table === "tricycles") {
          const t = db.tricycles.find((x) => x.id === id);
          if (!t) return fail("CHAUFFEUR_INTROUVABLE");
          t.solde_points += montant;
          if (t.solde_points >= 50) t.is_offline = false;
        } else {
          const cl = db.clients.find((x) => x.id === id);
          if (!cl) return fail("CLIENT_INTROUVABLE");
          cl.solde_points += montant;
        }
      });
    },

    async changerMotDePasse(c, nouveau) {
      tx((db) => {
        authAdmin(db, c);
        if (!nouveau || nouveau.length < 10) return fail("MDP_INVALIDE");
        db.admin.password = nouveau;
      });
    },

    async reinitialiserPin(c, table, id) {
      return tx((db) => {
        authAdmin(db, c);
        const e = table === "tricycles" ? db.tricycles.find((x) => x.id === id) : db.clients.find((x) => x.id === id && !x.is_temporary);
        if (!e) return fail("COMPTE_INTROUVABLE");
        const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
        Object.assign(e, { pin, pin_provisoire: true, token: null, essais: 0, bloque: null });
        return pin;
      });
    },

    async validerChauffeur(c, id) {
      tx((db) => {
        authAdmin(db, c);
        const t = db.tricycles.find((x) => x.id === id);
        if (!t) return fail("CHAUFFEUR_INTROUVABLE");
        t.valide = true;
      });
    },

    async setDepotPhone(c, tel) {
      tx((db) => {
        authAdmin(db, c);
        const n = phoneCI(tel);
        if (!n) return fail("TEL_INVALIDE_CI");
        db.settings.depot_phone = n;
      });
    },

    // Mêmes règles que admin_set_wave_marchand (schema.sql).
    async setWaveMarchand(c, nom) {
      tx((db) => {
        authAdmin(db, c);
        const n = nom.replace(/s+/g, " ").trim();
        if (n.length < 2 || n.length > 60 || /[\u0000-\u001f<>]/.test(n)) return fail("NOM_MARCHAND_INVALIDE");
        db.settings.wave_marchand = n;
      });
    },

    async statsAnnuelles(c, annee, citeId, tricycleId) {
      const db = read();
      authAdmin(db, c);
      return statsDemo(db, annee, citeId, tricycleId);
    },

    subscribe(onChange, onStatus) {
      const h = () => onChange();
      window.addEventListener(MOCK_EVENT, h);
      window.addEventListener("storage", h);
      onStatus?.(true);
      return () => {
        window.removeEventListener(MOCK_EVENT, h);
        window.removeEventListener("storage", h);
      };
    },
  },
};

/** Remet la démo à zéro (données d'origine). */
export function resetMock() {
  write(seed());
}
