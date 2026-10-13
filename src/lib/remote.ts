/** Backend Supabase : tout passe par des RPC security definer (aucune session Supabase
 *  Auth — l'app authentifie elle-même client/chauffeur/admin par téléphone + code). */
import { AppError, toAppError } from "./errors";
import { requireSupabase } from "./supabase";
import type {
  AdminData,
  AdminProfile,
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
  YearlyStats,
} from "./types";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw toAppError(error.message, error.code);
  return data as T;
}

type AuthResult =
  | { ok: true; role: "client"; token: string; profile: ClientProfile }
  | { ok: true; role: "chauffeur"; token: string; profile: ChauffeurProfile }
  | { ok: false; error: string };
type AdminAuthResult = { ok: true; role: "admin"; token: string; profile: AdminProfile } | { ok: false; error: string };

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
    rpc<string>("creer_commande", {
      p_tricycle: c.tricycleId,
      ...auth(creds),
      p_lat: c.gps?.lat ?? null,
      p_long: c.gps?.long ?? null,
      p_demain: c.demain ?? false,
    }),

  subscribeTopics(topics, onChange) {
    const sb = requireSupabase();
    const channels = topics.map((name) => sb.channel(name).on("broadcast", { event: "changed" }, onChange).subscribe());
    return () => channels.forEach((c) => void sb.removeChannel(c));
  },

  fetchDepotPhone: () => rpc<string>("get_depot_phone"),
  fetchEssaiFin: () => rpc<string>("get_essai_fin"),

  async fetchSuivi(id) {
    const rows = await rpc<Suivi[]>("suivi_commande", { p_id: id });
    return rows[0] ?? null;
  },

  async login(tel, pin): Promise<LoginResult> {
    const r = await rpc<AuthResult>("auth_login", { p_role: "auto", p_tel: tel, p_pin: pin });
    if (!r.ok) throw new AppError(r.error);
    const creds: Creds = { role: r.role, tel: r.profile.telephone, token: r.token };
    if (r.role === "client") return { role: "client", session: { creds, profile: r.profile } };
    return { role: "chauffeur", session: { creds, profile: r.profile } };
  },

  async loginAdmin(email, password) {
    const r = await rpc<AdminAuthResult>("auth_admin_login", { p_email: email, p_password: password });
    if (!r.ok) throw new AppError(r.error);
    return { creds: { role: "admin", tel: r.profile.email, token: r.token }, profile: r.profile };
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
      p_cite: i.citeId,
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
  clientAnnulerCommande: (c, id) => rpc("client_annuler_commande", { ...auth(c), p_commande: id }),
  clientChangerPin: (c, nouveau) => rpc("client_changer_pin", { ...auth(c), p_nouveau: nouveau }),

  // Position live : le serveur la diffuse avec ses coordonnées sur suivi:<id>
  // (aucun rechargement RPC nécessaire, contrairement aux pings "changed").
  subscribePosition(commandeId, onPosition) {
    const sb = requireSupabase();
    const ch = sb
      .channel(`suivi:${commandeId}`)
      .on("broadcast", { event: "position" }, ({ payload }) => {
        const p = payload as { lat?: number; long?: number; at?: string };
        if (typeof p.lat === "number" && typeof p.long === "number") onPosition({ lat: p.lat, long: p.long, at: p.at ?? new Date().toISOString() });
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  },

  chauffeurProfil: (c) => rpc("chauffeur_profil", auth(c)),
  chauffeurFile: (c) => rpc<ChauffeurCommande[]>("chauffeur_file", auth(c)),
  chauffeurCommandeManuelle: (c, m) =>
    rpc<string>("chauffeur_commande_manuelle", {
      ...auth(c),
      p_nom: m.nom,
      p_client_tel: m.tel,
      p_lot: m.lot,
      p_quantite: m.quantiteBidons,
      p_note: m.note || null,
    }),
  async chauffeurLots(c) {
    const rows = await rpc<{ lot_numero: string }[]>("chauffeur_lots", auth(c));
    return rows.map((r) => r.lot_numero);
  },
  chauffeurSetStatus: (c, status) => rpc("chauffeur_set_status", { ...auth(c), p_status: status }),
  chauffeurSetEtat: (c, etat) => rpc("chauffeur_set_etat", { ...auth(c), p_etat: etat }),
  chauffeurSetPrix: (c, prix) => rpc("chauffeur_set_prix", { ...auth(c), p_prix: prix }),
  chauffeurSetPosition: (c, lat, long) => rpc<{ actif: boolean }>("chauffeur_set_position", { ...auth(c), p_lat: lat, p_long: long }),
  chauffeurArriver: (c, id) => rpc("chauffeur_arriver", { ...auth(c), p_commande: id }),
  async chauffeurPartir(c) {
    const r = await rpc<{ bonus_fidelite: boolean; solde_points: number }>("chauffeur_partir", auth(c));
    return { bonusFidelite: r.bonus_fidelite, soldePoints: r.solde_points };
  },
  chauffeurLivrer: (c, id) => rpc("chauffeur_livrer", { ...auth(c), p_commande: id }),
  chauffeurChangerPin: (c, nouveau) => rpc("chauffeur_changer_pin", { ...auth(c), p_nouveau: nouveau }),

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
    rechargerPoints: (c, table, id, montant) => rpc("admin_recharger_points", { ...auth(c), p_table: table, p_id: id, p_montant: montant }),
    changerMotDePasse: (c, nouveau) => rpc("admin_change_password", { ...auth(c), p_nouveau: nouveau }),
    setDepotPhone: (c, tel) => rpc("admin_set_depot_phone", { ...auth(c), p_depot: tel }),
    reinitialiserPin: (c, table, id) => rpc<string>("admin_reinitialiser_pin", { ...auth(c), p_table: table, p_id: id }),
    validerChauffeur: (c, id) => rpc("admin_valider_chauffeur", { ...auth(c), p_id: id }),
    statsAnnuelles: (c, annee, citeId, tricycleId) =>
      rpc<YearlyStats>("get_yearly_stats", { ...auth(c), year_param: annee, p_cite: citeId, p_tricycle: tricycleId }),

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
