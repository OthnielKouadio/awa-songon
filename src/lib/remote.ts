/** Backend Supabase : tout passe par des RPC security definer (aucune session Supabase
 *  Auth — l'app authentifie elle-même client/chauffeur/admin par téléphone + code). */
import { AppError, toAppError } from "./errors";
import { requireSupabase } from "./supabase";
import type {
  AdminData,
  AdminTable,
  Backend,
  ChauffeurCommande,
  ChauffeurProfile,
  Cite,
  ClientProfile,
  CompteStatut,
  Creds,
  LoginResult,
  Source,
  Suivi,
} from "./types";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw toAppError(error.message, error.code);
  return data as T;
}

type AuthResult =
  | { ok: true; role: "client"; token: string; profile: ClientProfile }
  | { ok: true; role: "chauffeur"; token: string; profile: ChauffeurProfile }
  | { ok: true; role: "admin"; token: string; profile: { telephone: string } }
  | { ok: false; error: string };

const auth = (c: Creds) => ({ p_tel: c.tel, p_token: c.token });

export const remote: Backend = {
  async fetchCites() {
    const { data, error } = await requireSupabase().from("cites").select("id, nom");
    if (error) throw toAppError(error.message, error.code);
    return data as Cite[];
  },
  async fetchSources() {
    const { data, error } = await requireSupabase().from("sources").select("id, nom, cite_id, lat, long");
    if (error) throw toAppError(error.message, error.code);
    return data as Source[];
  },

  fetchTricyclesDispo: (citeId) => rpc("tricycles_dispo", { p_cite: citeId }),

  creerCommande: (c, creds) =>
    rpc<string>("creer_commande", { p_tricycle: c.tricycleId, ...auth(creds), p_lat: c.gps?.lat ?? null, p_long: c.gps?.long ?? null }),

  async fetchSuivi(id) {
    const rows = await rpc<Suivi[]>("suivi_commande", { p_id: id });
    return rows[0] ?? null;
  },

  async login(roleDemande, tel, pin): Promise<LoginResult> {
    const r = await rpc<AuthResult>("auth_login", { p_role: roleDemande, p_tel: tel, p_pin: pin });
    if (!r.ok) throw new AppError(r.error);
    const creds: Creds = { role: r.role, tel: r.profile.telephone, token: r.token };
    if (r.role === "admin") return { role: "admin", session: { creds, profile: r.profile } };
    if (r.role === "client") return { role: "client", session: { creds, profile: r.profile } };
    return { role: "chauffeur", session: { creds, profile: r.profile } };
  },

  async inscrireClient(i) {
    const r = await rpc<{ token: string; profile: ClientProfile }>("inscrire_client", {
      p_nom: i.nom,
      p_tel: i.tel,
      p_cite: i.citeId,
      p_lot: i.lot,
      p_pin: i.pin,
      p_lat: i.gps?.lat ?? null,
      p_long: i.gps?.long ?? null,
    });
    return { creds: { role: "client", tel: r.profile.telephone, token: r.token }, profile: r.profile };
  },

  async inscrireChauffeur(i) {
    const r = await rpc<{ token: string; profile: ChauffeurProfile }>("inscrire_chauffeur", {
      p_nom: i.nom,
      p_tel: i.tel,
      p_cites: i.citeIds,
      p_source: i.sourceId,
      p_pin: i.pin,
      p_prix: i.prix,
    });
    return { creds: { role: "chauffeur", tel: r.profile.telephone, token: r.token }, profile: r.profile };
  },

  clientProfil: (c) => rpc("client_profil", auth(c)),
  async clientCommandeActive(c) {
    const rows = await rpc<Suivi[]>("client_commande_active", auth(c));
    return rows[0] ?? null;
  },

  chauffeurProfil: (c) => rpc("chauffeur_profil", auth(c)),
  chauffeurFile: (c) => rpc<ChauffeurCommande[]>("chauffeur_file", auth(c)),
  chauffeurSetStatus: (c, status) => rpc("chauffeur_set_status", { ...auth(c), p_status: status }),
  chauffeurSetEtat: (c, etat) => rpc("chauffeur_set_etat", { ...auth(c), p_etat: etat }),
  chauffeurSetPrix: (c, prix) => rpc("chauffeur_set_prix", { ...auth(c), p_prix: prix }),
  chauffeurPartir: (c) => rpc("chauffeur_partir", auth(c)),
  chauffeurLivrer: (c, id) => rpc("chauffeur_livrer", { ...auth(c), p_commande: id }),

  admin: {
    load: (c) => rpc<AdminData>("admin_load", auth(c)),

    async save(c, table: AdminTable, id, row) {
      if (table === "cites") {
        await rpc("admin_save_cite", { ...auth(c), p_id: id, p_nom: row.nom });
      } else if (table === "sources") {
        await rpc("admin_save_source", {
          ...auth(c),
          p_id: id,
          p_nom: row.nom,
          p_cite: row.cite_id,
          p_lat: row.lat ?? null,
          p_long: row.long ?? null,
        });
      } else {
        throw new AppError("REFUSE");
      }
    },

    remove: (c, table, id) => rpc("admin_remove", { ...auth(c), p_table: table, p_id: id }),
    setStatut: (c, table, id, statut: CompteStatut) => rpc("admin_set_statut", { ...auth(c), p_table: table, p_id: id, p_statut: statut }),
    prolongerAbonnement: (c, clientId) => rpc("admin_prolonger_abonnement", { ...auth(c), p_client: clientId }),
    changerMotDePasse: (c, nouveau) => rpc("admin_change_password", { ...auth(c), p_nouveau: nouveau }),

    subscribe(onChange, onStatus) {
      const sb = requireSupabase();
      const ch = sb.channel("admin").on("broadcast", { event: "changed" }, onChange);
      ch.subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
      return () => {
        void sb.removeChannel(ch);
      };
    },
  },
};
