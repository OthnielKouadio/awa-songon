/**
 * MODE DÉMO — backend 100 % navigateur (localStorage), utilisé tant que les
 * variables NEXT_PUBLIC_SUPABASE_* sont absentes. Reproduit la logique des
 * fonctions SQL de supabase/schema.sql : auth unifiée (client/chauffeur/admin),
 * file d'attente, prix par chauffeur, statuts PAYE/IMPAYE/BLOQUE, etc.
 *
 * Temps réel : chaque écriture émet l'évènement "awa:mock" (même onglet) et
 * déclenche l'évènement natif "storage" dans les AUTRES onglets.
 */
import { AppError, fail } from "./errors";
import { normalizePhone, PRIX_MAX, PRIX_MIN } from "./format";
import type {
  AdminData,
  AdminTable,
  Backend,
  ChauffeurCommande,
  ChauffeurProfile,
  Cite,
  Client,
  ClientProfile,
  Commande,
  CompteStatut,
  Creds,
  InscriptionChauffeur,
  InscriptionClient,
  LoginResult,
  NouvelleCommande,
  Source,
  Suivi,
  Tricycle,
} from "./types";

export const MOCK_EVENT = "awa:mock";
const KEY = "awa:mock:v4"; // v4 : comptes clients + admin caché + statuts PAYE/IMPAYE/BLOQUE
const ACTIVE = ["EN_ATTENTE", "EN_COURS"];
const DEFAULT_ADMIN_TEL = "0566036825";
const DEFAULT_ADMIN_PASSWORD = "admin123";

type Auth = { pin: string; token: string | null; essais: number; bloque: number | null };
type MockTricycle = Tricycle & Auth;
type MockClient = Client & Auth;
type MockAdmin = { telephone: string; password: string; token: string | null; essais: number; bloque: number | null };

type DB = {
  cites: Cite[];
  sources: Source[];
  tricycles: MockTricycle[];
  clients: MockClient[];
  commandes: Commande[];
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
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const prixValide = (p: unknown): p is number => typeof p === "number" && Number.isFinite(p) && p >= PRIX_MIN && p <= PRIX_MAX;

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
    moussaId = uid(),
    koffiId = uid();
  const fatouId = uid(),
    issaId = uid(),
    ayaId = uid();

  const tri = (
    id: string,
    nom: string,
    telephone: string,
    source_id: string | null,
    status: "DISPO" | "OFF",
    etat: "A_LA_SOURCE" | "EN_ROUTE",
    prix_1000: number,
    cite_ids: string[],
    statut: CompteStatut = "PAYE",
    solde_points = 2500,
    is_offline = false
  ): MockTricycle => ({
    id,
    nom,
    telephone,
    source_id,
    status,
    etat,
    prix_1000,
    statut,
    cite_ids,
    solde_points,
    total_points_utilises: 0,
    is_offline,
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
    subscriptionDays = 30
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
    subscription_ends_at: daysFromNow(subscriptionDays),
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
    status: Commande["status"],
    lat: number | null,
    long: number | null,
    ago: number
  ): Commande => ({
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
    created_at: minutesAgo(ago),
  });

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
      // Kader livre 2 cités à la fois : démo du multi-cité.
      tri(kaderId, "Kader", "0700000001", s1, "DISPO", "A_LA_SOURCE", 2500, [c1, c2]),
      tri(yaoId, "Yao", "0700000002", s2, "DISPO", "EN_ROUTE", 2500, [c1]),
      tri(moussaId, "Moussa", "0700000003", s3, "DISPO", "A_LA_SOURCE", 3000, [c2]),
      // Koffi : solde de points épuisé (démo de la page bloquante "Solde épuisé").
      tri(koffiId, "Koffi", "0700000004", s4, "OFF", "A_LA_SOURCE", 2000, [c3], "PAYE", 20, true),
    ],
    clients: [
      cli(fatouId, "Fatou", "0701020304", c1, "12", 5.3868, -4.2705, "PAYE", 25),
      cli(issaId, "Issa", "0705060708", c1, "7", null, null, "IMPAYE", 2), // badge orange (≤3 j) pour la démo
      cli(ayaId, "Aya", "0709101112", c1, "21", 5.3852, -4.2671, "PAYE", 15),
    ],
    commandes: [
      cmd(fatouId, kaderId, c1, "12", 2500, 1, "EN_ATTENTE", 5.3868, -4.2705, 25),
      cmd(issaId, kaderId, c1, "7", 2500, 2, "EN_ATTENTE", null, null, 12),
      cmd(ayaId, yaoId, c1, "21", 2500, 1, "EN_COURS", 5.3852, -4.2671, 40),
    ],
    admin: { telephone: DEFAULT_ADMIN_TEL, password: DEFAULT_ADMIN_PASSWORD, token: null, essais: 0, bloque: null },
  };
}

function read(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {}
  const db = seed();
  write(db, false);
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

const actives = (db: DB, tricycleId: string) => db.commandes.filter((c) => c.tricycle_id === tricycleId && ACTIVE.includes(c.status));

function chauffeurProfile(db: DB, t: MockTricycle): ChauffeurProfile {
  const s = db.sources.find((x) => x.id === t.source_id);
  return {
    id: t.id,
    nom: t.nom,
    telephone: t.telephone,
    status: t.status,
    etat: t.etat,
    prix_1000: t.prix_1000,
    statut: t.statut,
    source_nom: s?.nom ?? null,
    cites: t.cite_ids.map((id) => db.cites.find((c) => c.id === id)).filter((c): c is Cite => !!c),
    solde_points: t.solde_points,
    total_points_utilises: t.total_points_utilises,
    is_offline: t.is_offline,
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
    subscription_ends_at: cl.subscription_ends_at,
  };
}

function suivi(db: DB, c: Commande): Suivi {
  const t = db.tricycles.find((x) => x.id === c.tricycle_id)!;
  const s = db.sources.find((x) => x.id === t.source_id);
  const ci = db.cites.find((x) => x.id === c.cite_id)!;
  return {
    id: c.id,
    status: c.status,
    position_file: c.position_file,
    prix: c.prix,
    lot_numero: c.lot_numero,
    lat: c.lat,
    long: c.long,
    created_at: c.created_at,
    tricycle_id: t.id,
    chauffeur_nom: t.nom,
    chauffeur_tel: t.telephone,
    etat: t.etat,
    cite_nom: ci.nom,
    source_nom: s?.nom ?? null,
  };
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
  if (c.role !== "admin" || db.admin.telephone !== normalizePhone(c.tel) || !db.admin.token || db.admin.token !== c.token) return fail("REFUSE");
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

export const mock: Backend = {
  async fetchCites() {
    return read().cites;
  },
  async fetchSources() {
    return read().sources;
  },

  async fetchTricyclesDispo(citeId) {
    const db = read();
    return db.tricycles
      .filter((t) => t.cite_ids.includes(citeId) && t.status === "DISPO" && t.statut !== "BLOQUE" && !t.is_offline)
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
        };
      })
      .sort((a, b) => a.file_count - b.file_count || a.nom.localeCompare(b.nom));
  },

  async creerCommande(c: NouvelleCommande, creds: Creds) {
    return tx((db) => {
      const cl = authClient(db, creds);
      if (cl.statut === "BLOQUE") return fail("COMPTE_BLOQUE");
      const t = db.tricycles.find((x) => x.id === c.tricycleId);
      if (!t || t.status !== "DISPO" || t.statut === "BLOQUE") return fail("TRICYCLE_INDISPONIBLE");
      if (db.commandes.some((x) => x.client_id === cl.id && ACTIVE.includes(x.status))) return fail("TROP_DE_COMMANDES");

      const gpsIn = c.gps && Math.abs(c.gps.lat) <= 90 && Math.abs(c.gps.long) <= 180 ? c.gps : null;
      const lat = gpsIn?.lat ?? cl.lat;
      const long = gpsIn?.long ?? cl.long;

      const commande: Commande = {
        id: uid(),
        client_id: cl.id,
        tricycle_id: t.id,
        cite_id: cl.cite_id,
        lot_numero: cl.lot_numero,
        prix: t.prix_1000,
        position_file: actives(db, t.id).length + 1,
        status: "EN_ATTENTE",
        lat,
        long,
        created_at: new Date().toISOString(),
      };
      db.commandes.push(commande);
      return commande.id;
    });
  },

  async fetchSuivi(id) {
    const db = read();
    const c = db.commandes.find((x) => x.id === id);
    return c ? suivi(db, c) : null;
  },

  // ── Authentification unifiée ───────────────────────────────────────────

  async login(roleDemande, telRaw, pin): Promise<LoginResult> {
    const db = read();
    const tel = normalizePhone(telRaw);

    // L'admin est reconnu par son téléphone, quel que soit l'onglet choisi :
    // aucun lien /admin visible, le même formulaire sert aux 3 rôles.
    if (db.admin.telephone === tel) {
      const r = checkAuth(db.admin, db.admin.password, pin);
      if (!r.ok) {
        write(db, false);
        throw new AppError(r.error);
      }
      db.admin.token = token();
      write(db);
      return { role: "admin", session: { creds: { role: "admin", tel, token: db.admin.token }, profile: { telephone: tel } } };
    }

    if (roleDemande === "client") {
      const cl = db.clients.find((x) => x.telephone === tel);
      const r = checkAuth(cl, cl?.pin ?? "", pin);
      if (!r.ok) {
        write(db, false);
        throw new AppError(r.error);
      }
      cl!.token = token();
      write(db);
      return { role: "client", session: { creds: { role: "client", tel, token: cl!.token }, profile: clientProfile(db, cl!) } };
    }

    const t = db.tricycles.find((x) => x.telephone === tel);
    const r = checkAuth(t, t?.pin ?? "", pin);
    if (!r.ok) {
      write(db, false);
      throw new AppError(r.error);
    }
    t!.token = token();
    write(db);
    return { role: "chauffeur", session: { creds: { role: "chauffeur", tel, token: t!.token }, profile: chauffeurProfile(db, t!) } };
  },

  async inscrireClient(i: InscriptionClient) {
    return tx((db) => {
      const nom = i.nom.trim();
      const tel = normalizePhone(i.tel);
      const lot = i.lot.trim();
      if (!nom || nom.length > 40) return fail("NOM_INVALIDE");
      if (tel.length < 8 || tel.length > 16) return fail("TEL_INVALIDE");
      if (!/^[0-9]{4}$/.test(i.pin)) return fail("PIN_INVALIDE");
      if (!lot || lot.length > 20) return fail("LOT_INVALIDE");
      if (!db.cites.some((c) => c.id === i.citeId)) return fail("CITE_INTROUVABLE");
      if (db.admin.telephone === tel) return fail("DEJA_INSCRIT");
      if (db.clients.some((c) => c.telephone === tel)) return fail("DEJA_INSCRIT");

      const gps = i.gps && Math.abs(i.gps.lat) <= 90 && Math.abs(i.gps.long) <= 180 ? i.gps : null;
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
        subscription_ends_at: daysFromNow(30),
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
      const citeIds = [...new Set(i.citeIds)];
      if (!nom || nom.length > 40) return fail("NOM_INVALIDE");
      if (tel.length < 8 || tel.length > 16) return fail("TEL_INVALIDE");
      if (!/^[0-9]{4}$/.test(i.pin)) return fail("PIN_INVALIDE");
      if (!prixValide(i.prix)) return fail("PRIX_INVALIDE");
      if (citeIds.length === 0 || !citeIds.every((id) => db.cites.some((c) => c.id === id))) return fail("CITE_INTROUVABLE");
      if (i.sourceId && !db.sources.some((s) => s.id === i.sourceId && citeIds.includes(s.cite_id))) return fail("SOURCE_INTROUVABLE");
      if (db.admin.telephone === tel) return fail("DEJA_INSCRIT");
      if (db.tricycles.some((t) => t.telephone === tel)) return fail("DEJA_INSCRIT");

      const t: MockTricycle = {
        id: uid(),
        nom,
        telephone: tel,
        source_id: i.sourceId,
        status: "OFF",
        etat: "A_LA_SOURCE",
        prix_1000: i.prix,
        statut: "IMPAYE",
        cite_ids: citeIds,
        // Bonus d'essai à l'inscription : 2500 points = 50 livraisons gratuites.
        solde_points: 2500,
        total_points_utilises: 0,
        is_offline: false,
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
    const cmd = db.commandes.find((x) => x.client_id === cl.id && ACTIVE.includes(x.status));
    return cmd ? suivi(db, cmd) : null;
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
          client_nom: cl?.nom ?? "Client",
          client_tel: cl?.telephone ?? "",
        };
      });
  },

  async chauffeurSetStatus(c, status) {
    tx((db) => {
      const t = authTricycle(db, c);
      if (status === "DISPO" && t.statut === "BLOQUE") return fail("COMPTE_BLOQUE");
      if (status === "DISPO" && t.is_offline) return fail("SOLDE_INSUFFISANT");
      t.status = status;
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

  async chauffeurPartir(c) {
    // Points (1 FCFA = 1 point) : accepter une livraison = 1 citerne = -50 points.
    // Sous 50 restants, is_offline passe à true. Fidélité : à 5000 points cumulés
    // utilisés, +50 points offerts et le compteur repart de zéro.
    return tx((db) => {
      const t = authTricycle(db, c);
      if (t.solde_points < 50) return fail("SOLDE_INSUFFISANT");
      const file = actives(db, t.id);
      if (file.some((x) => x.status === "EN_COURS")) return fail("DEJA_EN_COURS");
      const next = file.filter((x) => x.status === "EN_ATTENTE").sort((a, b) => a.position_file - b.position_file)[0];
      if (!next) return fail("FILE_VIDE");

      next.status = "EN_COURS";
      t.etat = "EN_ROUTE";
      t.solde_points -= 50;
      t.total_points_utilises += 50;

      let bonusFidelite = false;
      if (t.total_points_utilises >= 5000) {
        t.solde_points += 50;
        t.total_points_utilises = 0;
        bonusFidelite = true;
      }
      t.is_offline = t.solde_points < 50;

      return { bonusFidelite, soldePoints: t.solde_points };
    });
  },

  async chauffeurLivrer(c, commandeId) {
    tx((db) => {
      const t = authTricycle(db, c);
      const cmd = db.commandes.find((x) => x.id === commandeId && x.tricycle_id === t.id && x.status === "EN_COURS");
      if (!cmd) return fail("COMMANDE_INTROUVABLE");
      const pos = cmd.position_file;
      cmd.status = "LIVRE";
      cmd.position_file = 0;
      actives(db, t.id).forEach((x) => {
        if (x.position_file > pos) x.position_file -= 1;
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
        tricycles: db.tricycles.map(({ id, nom, telephone, source_id, status, etat, prix_1000, statut, cite_ids, solde_points, total_points_utilises, is_offline }) => ({
          id,
          nom,
          telephone,
          source_id,
          status,
          etat,
          prix_1000,
          statut,
          cite_ids,
          solde_points,
          total_points_utilises,
          is_offline,
        })),
        clients: db.clients.map(({ id, nom, telephone, cite_id, lot_numero, lat, long, statut, date_paiement, subscription_ends_at }) => ({
          id,
          nom,
          telephone,
          cite_id,
          lot_numero,
          lat,
          long,
          statut,
          date_paiement,
          subscription_ends_at,
        })),
        commandes: [...db.commandes].sort((a, b) => b.created_at.localeCompare(a.created_at)),
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
        };
        if (table === "tricycles") dropTricycles([id]);
        else if (table === "clients") {
          db.clients = db.clients.filter((cl) => cl.id !== id);
          db.commandes = db.commandes.filter((cm) => cm.client_id !== id);
        } else if (table === "sources") {
          dropTricycles(db.tricycles.filter((t) => t.source_id === id).map((t) => t.id));
          db.sources = db.sources.filter((s) => s.id !== id);
        } else {
          const sourceIds = db.sources.filter((s) => s.cite_id === id).map((s) => s.id);
          // Un chauffeur dont la SOURCE choisie appartient à cette cité est supprimé
          // (comme avant) ; un chauffeur seulement RATTACHÉ à cette cité (parmi
          // d'autres) la perd juste — il reste visible dans ses autres cités.
          dropTricycles(db.tricycles.filter((t) => t.source_id != null && sourceIds.includes(t.source_id)).map((t) => t.id));
          db.tricycles.forEach((t) => (t.cite_ids = t.cite_ids.filter((cid) => cid !== id)));
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
          if (!t) return fail("COMMANDE_INTROUVABLE");
          t!.statut = statut;
          if (statut === "BLOQUE") t!.status = "OFF"; // un tricycle bloqué ne peut pas rester visible des clients
        } else {
          const cl = db.clients.find((x) => x.id === id);
          if (!cl) return fail("COMMANDE_INTROUVABLE");
          cl!.statut = statut;
          if (statut === "PAYE") cl!.date_paiement = new Date().toISOString();
        }
      });
    },

    async prolongerAbonnement(c, clientId) {
      tx((db) => {
        authAdmin(db, c);
        const cl = db.clients.find((x) => x.id === clientId);
        if (!cl) return fail("COMMANDE_INTROUVABLE");
        const base = Math.max(new Date(cl.subscription_ends_at).getTime(), Date.now());
        cl.subscription_ends_at = new Date(base + 30 * 86400000).toISOString();
      });
    },

    async rechargerPoints(c, tricycleId, montant) {
      tx((db) => {
        authAdmin(db, c);
        if (!Number.isFinite(montant) || montant <= 0 || montant % 50 !== 0) return fail("MONTANT_INVALIDE");
        const t = db.tricycles.find((x) => x.id === tricycleId);
        if (!t) return fail("CHAUFFEUR_INTROUVABLE");
        t.solde_points += montant;
        if (t.solde_points >= 50) t.is_offline = false;
      });
    },

    async changerMotDePasse(c, nouveau) {
      tx((db) => {
        authAdmin(db, c);
        if (!nouveau || nouveau.length < 6) return fail("MDP_INVALIDE");
        db.admin.password = nouveau;
      });
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
