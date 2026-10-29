// Test du schéma Distribution Eau V3 sur un vrai PostgreSQL (PGlite / WASM), avec un
// environnement qui imite Supabase : rôles anon/authenticated, auth.uid(),
// auth.jwt(), en-têtes HTTP (IP).
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pgcrypto } });

await db.exec(`
  create schema if not exists extensions;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema extensions to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant execute on all functions in schema auth to anon, authenticated;
`);

// SCHEMA_AVANT=chemin : installe d'abord une ancienne version (test de mise à jour d'une base existante).
if (process.env.SCHEMA_AVANT) await db.exec(readFileSync(process.env.SCHEMA_AVANT, "utf8"));
await db.exec(schema);
await db.exec(schema); // relançable
console.log("✓ schéma appliqué 2 fois sans erreur");

let ok = 0, ko = 0;
const check = (cond, msg, extra) => {
  if (cond) { ok++; console.log("  ✓", msg); } else { ko++; console.log("  ✗", msg, extra !== undefined ? JSON.stringify(extra) : ""); }
};

const ADMIN = "11111111-1111-1111-1111-111111111111";
await db.exec(`insert into auth.users values ('${ADMIN}', 'admin@test.ci'); insert into public.admins values ('${ADMIN}', 'admin@test.ci');`);

/** Exécute une requête sous un rôle donné (anon / admin aal1 / admin aal2), avec une IP. */
async function as(who, sql, params = [], ip = "1.1.1.1") {
  const claims = who === "anon" ? "" : JSON.stringify({ sub: ADMIN, aal: who === "admin" ? "aal2" : "aal1" });
  const role = who === "anon" ? "anon" : "authenticated";
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); select set_config('request.headers', '${JSON.stringify({ "cf-connecting-ip": ip })}', false); set role ${role};`);
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec("reset role");
  }
}
const val = (r) => (r.rows ? Object.values(r.rows[0])[0] : undefined);

console.log("\n— Accès direct aux tables / fonctions internes");
check((await as("anon", "select * from public.maisons")).error?.includes("permission denied"), "anon ne lit pas les maisons");
check((await as("anon", "select * from public.foyers")).error?.includes("permission denied"), "anon ne lit pas les foyers");
check((await as("anon", "select public._token_aleatoire(6)")).error?.includes("permission denied"), "anon n'exécute pas les fonctions internes");
check((await as("anon", "insert into public.cites (nom, code_court) values ('X','XX')")).error?.includes("permission denied"), "anon n'écrit pas");
check((await as("admin", "update public.maisons set statut='LIBRE'")).error?.includes("permission denied"), "admin n'écrit pas en direct (RPC uniquement)");
check((await as("admin1", "select public.admin_cites()")).error?.includes("ADMIN_REQUIS"), "admin sans 2FA (aal1) refusé");
check((await as("anon", "select public.admin_cites()")).error?.includes("permission denied"), "anon ne peut pas appeler les RPC admin");
check((await as("admin1", "select count(*) from public.maisons")).rows?.[0].count == 0, "admin aal1 : RLS ne renvoie rien");

console.log("\n— Cités et maisons");
const cite = val(await as("admin", "select public.admin_creer_cite('Promogim', 'promo')"));
check(!!cite, "création cité Promogim / PROMO");
check((await as("admin", "select public.admin_creer_cite('Autre', 'PROMO')")).error?.includes("CODE_COURT_PRIS"), "code court unique");
check((await as("admin", "select public.admin_enregistrer_parametres('javascript:alert(1)', 100, 50, null, null)")).error?.includes("SITE_URL_INVALIDE"), "réglage : URL du site validée");
// Essai terminé (date passée) : les débits de points sont testés d'abord, l'essai plus bas.
check(!(await as("admin", "select public.admin_enregistrer_parametres('https://Awa-Songon.vercel.app/', 100, 50, '0700000000', '2020-01-01')")).error, "réglages enregistrés (essai terminé)");
const lot = val(await as("admin", "select public.admin_generer_lot($1, 1, 300)", [cite]));
check(lot.maisons.length === 300, "lot 1→300 : 300 maisons", lot.maisons.length);
check(lot.maisons[11].code_affichage === "PROMO 012", "format PROMO 012", lot.maisons[11]);
check(/^https:\/\/awa-songon.vercel.app\/m\/[2-9A-HJ-NP-Z]{6}$/.test(lot.maisons[0].lien_qr), "lien_qr", lot.maisons[0].lien_qr);
const tokens = new Set(lot.maisons.map((m) => m.qr_token));
check(tokens.size === 300, "300 jetons uniques");
const lot2 = val(await as("admin", "select public.admin_generer_lot($1, 295, 305)", [cite]));
check(lot2.maisons.length === 5 && lot2.ignores.length === 6, "relance 295→305 : 5 créées, 6 ignorées", { c: lot2.maisons.length, i: lot2.ignores.length });
check((await as("admin", "select public.admin_creer_maison_unique($1, 12)", [cite])).error?.includes("MAISON_EXISTE"), "pas de doublon de numéro");
check((await as("admin", "select public.admin_modifier_cite($1, 'Promogim', 'PRM')", [cite])).error?.includes("CODE_COURT_VERROUILLE"), "code court verrouillé après impression");
check((await as("admin", "select public.admin_supprimer_cite($1)", [cite])).error?.includes("CITE_NON_VIDE"), "cité non vide non supprimable");
await db.exec(`update public.maisons set code_affichage = 'PROMO 999' where numero_sequentiel = 1`).then(
  () => check(false, "code_affichage immuable"),
  (e) => check(e.message.includes("MAISON_IMMUABLE"), "code_affichage immuable (même en SQL direct)"));

const m12 = lot.maisons[11];
console.log("\n— Scan QR + création du foyer (PROMO 012)");
const pub = val(await as("anon", "select public.m_maison($1)", [m12.qr_token.toLowerCase()]));
check(pub.statut === "LIBRE" && pub.code_affichage === "PROMO 012" && !("nom_famille" in pub), "m_maison (minuscules OK) : LIBRE, aucun nom", pub);
check(val(await as("anon", "select public.m_maison('ZZZZZZ')")).erreur === "INTROUVABLE", "jeton inconnu");
check((await as("anon", "select public.m_creer_foyer($1,'Famille Koffi','0701020304','Koffi','PAPA','4837', false)", [m12.qr_token])).error?.includes("CGV_NON_ACCEPTEES"), "case non remboursable obligatoire");
check((await as("anon", "select public.m_creer_foyer($1,'Famille Koffi','0701020304','Koffi','PAPA','1122', true)", [m12.qr_token])).error?.includes("CODE_TROP_SIMPLE"), "code 1122 refusé");
check((await as("anon", "select public.m_creer_foyer($1,'Famille Koffi','0701020304','Koffi','PAPA','5012', true)", [m12.qr_token])).error?.includes("CODE_TROP_SIMPLE"), "code contenant 012 refusé");
check((await as("anon", "select public.m_creer_foyer($1,'Famille Koffi','0601020304','Koffi','PAPA','4837', true)", [m12.qr_token])).error?.includes("TELEPHONE_INVALIDE"), "téléphone invalide refusé");
const cree = val(await as("anon", "select public.m_creer_foyer($1,'Famille Koffi','+225 07 01 02 03 04','Koffi','PAPA','4837', true)", [m12.qr_token]));
check(cree.ok && cree.jeton.length === 64, "foyer créé, jeton d'appareil", cree);
const papa = cree.jeton;
check(val(await as("anon", "select public.m_creer_foyer($1,'Squatteur','0705050505','X','PAPA','4938', true)", [m12.qr_token], "2.2.2.2")).erreur === "DEJA_OCCUPEE", "2e création refusée");
check(val(await as("anon", "select public.m_maison($1)", [m12.qr_token])).statut === "OCCUPEE", "maison OCCUPEE");
const esp = val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, papa]));
check(esp.foyer.solde_points === 0 && esp.foyer.nom_famille === "Famille Koffi", "espace : solde 0", esp.foyer);
check((await as("anon", "select public.m_espace($1,$2)", [lot.maisons[0].qr_token, papa])).error?.includes("SESSION"), "jeton refusé sur une AUTRE maison");
check((await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, "faux"])).error?.includes("SESSION"), "faux jeton refusé");

console.log("\n— Force brute du code maison");
const ouv = val(await as("anon", "select public.m_ouvrir($1,'4837','Awa','MAMAN',null)", [m12.qr_token], "3.3.3.3"));
check(ouv.ok, "Maman ouvre avec le bon code", ouv);
const maman = ouv.jeton;
let last;
for (let i = 0; i < 10; i++) last = val(await as("anon", "select public.m_ouvrir($1,$2,'Pirate','AUTRE',null)", [m12.qr_token, String(1000 + i * 7)], `9.9.9.${i}`));
check(last.erreur === "CODE_FAUX", "10 essais faux depuis 10 IP");
const verrou = val(await as("anon", "select public.m_ouvrir($1,'4837','Pirate','AUTRE',null)", [m12.qr_token], "9.9.9.99"));
check(verrou.erreur === "MAISON_VERROUILLEE", "11e essai (même avec le BON code) : maison verrouillée pour les nouveaux téléphones", verrou);
let ipLast;
for (let i = 0; i < 21; i++) await as("anon", "select public.m_creer_foyer($1,'Famille Test','0707070707','T','PAPA','5793', true)", [lot.maisons[50 + i].qr_token], `7.7.${i}.1`);
for (let i = 0; i < 21; i++) ipLast = val(await as("anon", "select public.m_ouvrir($1,$2,'Pirate','AUTRE',null)", [lot.maisons[50 + i].qr_token, "4938"], "8.8.8.8"));
check(ipLast.erreur === "TROP_DE_TENTATIVES", "une IP qui essaie un code sur 21 maisons est bloquée", ipLast);

console.log("\n— Commande");
const livreur = val(await as("admin", "select public.admin_enregistrer_livreur(null, $1, 'Kader', '0700000001', 2500)", [cite]));
check(!!livreur, "livreur créé");
check(val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, maman])).livreurs.length === 0, "livreur sans accès : invisible des clients");
const codeK = val(await as("admin", "select public.admin_code_livreur($1)", [livreur]));
check(/^\d{4}$/.test(codeK), "code d'accès livreur généré");
const conK = val(await as("anon", "select public.l_connexion('07 00 00 00 01', $1)", [codeK], "10.0.0.1"));
check(conK.ok && conK.code_provisoire, "connexion livreur (code provisoire)", conK);
const kader = conK.jeton;
check(val(await as("anon", "select public.l_espace($1)", [kader])).doit_changer_code === true, "code provisoire : doit le changer");
check((await as("anon", "select public.l_statut($1,'ACTIF')", [kader])).error?.includes("CODE_A_CHANGER"), "aucune action avant d'avoir changé le code");
check(val(await as("anon", "select public.l_changer_code($1,'0000','4938')", [kader])).erreur === "CODE_FAUX", "changement : ancien code vérifié");
check((await as("anon", "select public.l_changer_code($1,$2,'1234')", [kader, codeK])).error?.includes("CODE_TROP_SIMPLE"), "changement : code trop simple refusé");
check(val(await as("anon", "select public.l_changer_code($1,$2,'4938')", [kader, codeK])).ok, "code livreur changé");
check((await as("anon", "select public.l_statut($1,'ACTIF')", [kader])).error?.includes("SOLDE_INSUFFISANT_LIVREUR"), "après l'essai, 0 point : ne peut pas se mettre ACTIF");
check(val(await as("admin", "select public.admin_recharger_livreur($1, 500, 'WAVE-L1')", [livreur])) === 500, "recharge livreur 500");
check(!(await as("anon", "select public.l_statut($1,'ACTIF')", [kader])).error, "livreur ACTIF");
check(val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, maman])).livreurs.length === 1, "livreur visible des clients");
const c0 = val(await as("anon", "select public.m_commander($1,$2,'4837',$3)", [m12.qr_token, maman, livreur]));
check(c0.erreur === "SOLDE_INSUFFISANT", "solde 0 : commande refusée (famille connectée PAS bloquée par le verrou)", c0);
check(val(await as("anon", "select public.m_commander($1,$2,'0000',$3)", [m12.qr_token, maman, livreur])).erreur === "CODE_FAUX", "mauvais code à la commande");
check(val(await as("admin", "select public.admin_recharger($1, 1000, 'WAVE-123')", [m12.id])) === 1000, "recharge admin 1000");
const c1 = val(await as("anon", "select public.m_commander($1,$2,'4837',$3)", [m12.qr_token, maman, livreur]));
check(c1.ok && c1.position === 1, "commande OK, position 1", c1);
check(val(await as("anon", "select public.l_espace($1)", [kader])).profil.solde_points === 450, "livreur débité de 50");
check(val(await as("anon", "select public.m_commander($1,$2,'4837',$3)", [m12.qr_token, papa, livreur])).erreur === "COMMANDE_EN_COURS", "Papa ne peut pas commander en double");
const esp2 = val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, papa]));
check(esp2.commande?.commande_par === "Awa" && esp2.foyer.solde_points === 900, "Papa voit la commande de Maman, solde 900", esp2.commande);
check(val(await as("anon", "select public.m_annuler($1,$2,$3)", [m12.qr_token, papa, c1.commande_id])).ok, "annulation");
check(val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, papa])).foyer.solde_points === 1000, "points recrédités (crédit, pas d'argent)");
check(val(await as("anon", "select public.l_espace($1)", [kader])).profil.solde_points === 500, "livreur recrédité aussi");
const c2 = val(await as("anon", "select public.m_commander($1,$2,'4837',$3)", [m12.qr_token, papa, livreur]));
check(c2.ok, "nouvelle commande");
const cmds = val(await as("admin", "select public.admin_commandes(true)"));
check(cmds[0].code_affichage === "PROMO 012" && cmds[0].nom_famille === "Famille Koffi" && cmds[0].commande_par === "Koffi", "admin : « PROMO 012 – Famille Koffi – Koffi »", cmds[0]);
const fileK = val(await as("anon", "select public.l_espace($1)", [kader])).file;
check(fileK.length === 1 && fileK[0].code_affichage === "PROMO 012" && fileK[0].nom_famille === "Famille Koffi" && fileK[0].foyer_a_verifier, "file du livreur : PROMO 012 – Famille Koffi (à vérifier)", fileK[0]);
// Un 2e livreur ne peut pas toucher la commande de Kader
const autreL = val(await as("admin", "select public.admin_enregistrer_livreur(null, $1, 'Yao', '0500000002', 2000)", [cite]));
const codeY = val(await as("admin", "select public.admin_code_livreur($1)", [autreL]));
const yao = val(await as("anon", "select public.l_connexion('0500000002', $1)", [codeY], "10.0.0.2")).jeton;
await as("anon", "select public.l_changer_code($1,$2,'5827')", [yao, codeY]);
check((await as("anon", "select public.l_avancer($1,$2,'LIVREE')", [yao, c2.commande_id])).error?.includes("COMMANDE_INTROUVABLE"), "un autre livreur ne peut pas livrer cette commande");
check((await as("anon", "select public.l_position_maison($1,$2,5.36,-4.0)", [kader, c2.commande_id])).error?.includes("COMMANDE_INTROUVABLE"), "position : refusée avant « en route »");
check(!(await as("anon", "select public.l_avancer($1,$2,'EN_ROUTE')", [kader, c2.commande_id])).error, "livreur : en route");
check(val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, papa])).commande.statut === "EN_ROUTE", "le foyer voit « en route »");
check((await as("anon", "select public.l_position_maison($1,$2,48.85,2.35)", [kader, c2.commande_id])).error?.includes("POSITION_INVALIDE"), "position hors Côte d'Ivoire refusée");
check(val(await as("anon", "select public.l_position_maison($1,$2,5.3601,-4.0083)", [kader, c2.commande_id])).ok, "« je suis devant la maison » : position enregistrée");
check(val(await as("anon", "select public.l_position_maison($1,$2,5.4,-4.1)", [kader, c2.commande_id])).erreur === "POSITION_DEJA_CONNUE", "position déjà connue : pas écrasée par le livreur");
check(!(await as("anon", "select public.l_confirmer_foyer($1,$2)", [kader, c2.commande_id])).error, "livreur confirme la famille sur place");
check(!(await as("anon", "select public.l_avancer($1,$2,'LIVREE')", [kader, c2.commande_id])).error, "livreur : livrée");

console.log("\n— Avis");
const espL = val(await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, papa]));
check(espL.a_noter?.id === c2.commande_id, "bandeau « note ta livraison »");
check(val(await as("anon", "select public.m_noter_livreur($1,$2,$3,2,'Un peu en retard')", [m12.qr_token, maman, c1.commande_id])).erreur === "PAS_ENCORE_LIVREE", "commande annulée : pas d'avis");
// Un autre foyer ne peut pas noter la livraison de Koffi
const m13 = lot.maisons[12];
const autre = val(await as("anon", "select public.m_creer_foyer($1,'Famille Traoré','0505050505','Issa','PAPA','4938', true)", [m13.qr_token], "4.4.4.4"));
check(val(await as("anon", "select public.m_noter_livreur($1,$2,$3,1,'Nul')", [m13.qr_token, autre.jeton, c2.commande_id])).erreur === "COMMANDE_INTROUVABLE", "un autre foyer ne peut PAS noter cette livraison");
check(val(await as("anon", "select public.m_noter_livreur($1,$2,$3,2,'Un peu en retard')", [m12.qr_token, maman, c2.commande_id])).ok, "Maman note 2/5");
check(val(await as("anon", "select public.m_noter_livreur($1,$2,$3,5,null)", [m12.qr_token, papa, c2.commande_id])).erreur === "DEJA_NOTE", "une seule note par livraison");
const livs = val(await as("admin", "select public.admin_livreurs()"));
check(livs[0].note_moyenne == 2 && livs[0].total_avis === 1 && livs[0].alerte_note === true, "moyenne 2.00 par trigger + alerte < 3", livs[0]);
check((await as("admin", "update public.avis_livreurs set note = 5")).error, "avis non modifiable");
check(val(await as("anon", "select public.m_avis_plateforme($1,$2,5,'Top !')", [m12.qr_token, papa])).ok, "avis plateforme");
check(val(await as("anon", "select public.m_avis_plateforme($1,$2,1,'spam')", [m12.qr_token, maman])).erreur === "AVIS_RECENT", "1 avis plateforme / foyer / semaine");
const ap = val(await as("admin", "select public.admin_avis_plateforme()"));
check(ap.total === 1 && ap.repartition["5"] === 1, "admin avis plateforme", ap);

console.log("\n— Clôture du foyer (départ du locataire)");
const cl1 = val(await as("admin", "select public.admin_clore_foyer($1,'Départ fin de bail', false)", [m12.id]));
check(cl1.confirmation_requise && cl1.solde_points === 900, "alerte : 900 points seront perdus", cl1);
const cl2 = val(await as("admin", "select public.admin_clore_foyer($1,'Départ fin de bail', true)", [m12.id]));
check(cl2.ok && cl2.points_perdus === 900, "clôture confirmée");
check(val(await as("anon", "select public.m_maison($1)", [m12.qr_token])).statut === "LIBRE", "maison LIBRE, même QR");
check((await as("anon", "select public.m_espace($1,$2)", [m12.qr_token, papa])).error?.includes("SESSION"), "anciens téléphones déconnectés");
const tx = (await as("admin", "select type, montant, solde_apres from public.transactions_points order by created_at")).rows;
check(tx.at(-1).type === "PERTE_CLOTURE" && tx.at(-1).solde_apres === 0, "trace PERTE_CLOTURE", tx.at(-1));
await db.exec("delete from public.transactions_points").then(() => check(false, "transactions non supprimables"), (e) => check(e.message.includes("HISTORIQUE_NON_MODIFIABLE"), "transactions non supprimables (même en SQL direct)"));
const nouveau = val(await as("anon", "select public.m_creer_foyer($1,'Famille Bamba','0102030405','Ali','PAPA','5793', true)", [m12.qr_token], "5.5.5.5"));
check(nouveau.ok, "nouveau locataire crée son foyer sur le même QR");
const det = val(await as("admin", "select public.admin_maison_detail($1)", [m12.id]));
check(det.archives.length === 1 && det.foyer.nom_famille === "Famille Bamba" && !("code_maison_hash" in det.foyer), "historique archivé conservé, hash jamais exposé");
check(det.maison.lat === 5.3601 && det.maison.position_source === "LIVREUR", "la position de la maison reste après le changement de locataire");

console.log("\n— Saisie directe par le livreur");
const m20 = lot.maisons[19];
check((await as("anon", "select public.l_commande_manuelle($1,'PROMO 020',null,null,null)", [kader])).error?.includes("NOM_TEL_REQUIS"), "maison sans foyer : nom + numéro obligatoires");
check((await as("anon", "select public.l_commande_manuelle($1,'ARC 020','Mme Diallo','0708080808',null)", [kader])).error?.includes("MAISON_INTROUVABLE"), "maison d'une autre cité refusée");
const ch = val(await as("anon", "select public.l_chercher_maison($1,'promo20')", [kader]));
check(ch.code_affichage === "PROMO 020" && ch.nom_famille === null, "recherche « promo20 » → PROMO 020 (sans foyer)", ch);
const man = val(await as("anon", "select public.l_commande_manuelle($1,'promo20','Mme Diallo','0708080808','Portail bleu')", [kader]));
check(man.ok && man.code_affichage === "PROMO 020", "saisie directe sur maison sans foyer", man);
check((await as("anon", "select public.l_commande_manuelle($1,'20','X','0708080808',null)", [kader])).error?.includes("COMMANDE_EN_COURS"), "une seule commande en cours par maison");
const fm20 = val(await as("anon", "select public.m_creer_foyer($1,'Famille Diallo','0708080808','Awa','MAMAN','5829', true)", [m20.qr_token], "11.0.0.1"));
check(fm20.ok, "la famille crée son foyer pendant la commande du livreur");
check(val(await as("anon", "select public.m_espace($1,$2)", [m20.qr_token, fm20.jeton])).commande?.statut === "EN_ATTENTE", "…et voit la commande saisie par le livreur");
await as("admin", "select public.admin_recharger($1, 500, null)", [m20.id]);
check(val(await as("anon", "select public.m_commander($1,$2,'5829',$3)", [m20.qr_token, fm20.jeton, livreur])).erreur === "COMMANDE_EN_COURS", "pas de 2e commande pour la maison");
const fileM = val(await as("anon", "select public.l_espace($1)", [kader])).file;
check(fileM[0].source === "LIVREUR" && fileM[0].note === "Portail bleu", "file : saisie directe + note", fileM[0]);
const soldeK = (await as("admin", "select solde_points from public.livreurs where id = $1", [livreur])).rows[0].solde_points;
check(soldeK === 400, "saisie directe : livreur débité de 50, foyer rien", soldeK);

console.log("\n— Essai gratuit (date réglée par l'admin)");
const finEssai = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
check(!(await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, '0700000000', $1)", [finEssai])).error, `essai gratuit jusqu'au ${finEssai}`);
await as("anon", "select public.l_avancer($1,$2,'EN_ROUTE')", [kader, fileM[0].id]);
await as("anon", "select public.l_avancer($1,$2,'LIVREE')", [kader, fileM[0].id]);
const espE = val(await as("anon", "select public.m_espace($1,$2)", [m20.qr_token, fm20.jeton]));
check(espE.cout_points === 0 && espE.essai_fin === finEssai, "pendant l'essai : commande à 0 point, date affichée", { c: espE.cout_points, e: espE.essai_fin });
const cE = val(await as("anon", "select public.m_commander($1,$2,'5829',$3)", [m20.qr_token, fm20.jeton, livreur]));
check(cE.ok, "commande pendant l'essai", cE);
check(val(await as("anon", "select public.m_espace($1,$2)", [m20.qr_token, fm20.jeton])).foyer.solde_points === 500, "foyer non débité pendant l'essai");
check((await as("admin", "select solde_points from public.livreurs where id = $1", [livreur])).rows[0].solde_points === 400, "livreur non débité pendant l'essai");
await as("anon", "select public.m_annuler($1,$2,$3)", [m20.qr_token, fm20.jeton, cE.commande_id]);
check((await as("admin", "select count(*)::int as n from public.transactions_points where commande_id = $1", [cE.commande_id])).rows[0].n === 0, "annulation pendant l'essai : rien à rendre, rien d'inventé");
check((await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, null, '2999-01-01')")).error?.includes("ESSAI_TROP_LONG"), "essai limité à 2 ans");

console.log("\n— Mode pose, connexion et blocage du livreur");
check((await as("anon", "select public.admin_poser_maison($1, 5.35, -4.01)", [m13.qr_token])).error?.includes("permission denied"), "anon ne peut pas poser une maison");
const pose = val(await as("admin", "select public.admin_poser_maison($1, 5.35, -4.01)", [m13.qr_token]));
check(pose.code_affichage === "PROMO 013", "mode pose : position de PROMO 013 enregistrée");
check(val(await as("anon", "select public.l_connexion('0799999999','4938')", [], "12.0.0.1")).erreur === "IDENTIFIANTS", "numéro inconnu : même message qu'un code faux");
for (let i = 0; i < 5; i++) await as("anon", "select public.l_connexion('0500000002','1111')", [], `13.0.0.${i}`);
check(val(await as("anon", "select public.l_connexion('0500000002','5827')", [], "13.0.0.9")).erreur === "TROP_DE_TENTATIVES", "5 codes faux : livreur verrouillé 15 min (nouvelles connexions)");
check(!(await as("anon", "select public.l_espace($1)", [yao])).error, "…mais son téléphone déjà connecté continue de marcher");
await as("admin", "select public.admin_statut_livreur($1,'BLOQUE')", [livreur]);
check((await as("anon", "select public.l_espace($1)", [kader])).error?.includes("LIVREUR_BLOQUE"), "livreur bloqué par l'admin : plus d'accès");
check(val(await as("anon", "select public.m_espace($1,$2)", [m20.qr_token, fm20.jeton])).livreurs.every((l) => l.id !== livreur), "livreur bloqué : invisible des clients");
await as("admin", "select public.admin_statut_livreur($1,'PAUSE')", [livreur]);
await as("admin", "select public.admin_code_livreur($1)", [livreur]);
check((await as("anon", "select public.l_espace($1)", [kader])).error?.includes("SESSION"), "nouveau code : anciens téléphones déconnectés");

console.log("\n— Divers admin");
const reg = val(await as("admin", "select public.admin_regenerer_qr($1)", [m13.id]));
check(reg.qr_token !== m13.qr_token && val(await as("anon", "select public.m_maison($1)", [m13.qr_token])).erreur === "INTROUVABLE", "nouveau QR : l'ancien ne marche plus");
const code = val(await as("admin", "select public.admin_reinitialiser_code($1)", [m12.id]));
check(/^\d{4}$/.test(code), "code oublié : nouveau code " + code);
await as("admin", "select public.admin_bloquer_maison($1,'Impayé')", [m12.id]);
check(val(await as("anon", "select public.m_ouvrir($1,$2,'Ali','PAPA',null)", [m12.qr_token, code], "6.6.6.6")).erreur === "MAISON_BLOQUEE", "maison bloquée");
await as("admin", "select public.admin_debloquer_maison($1)", [m12.id]);
check(val(await as("anon", "select public.m_maison($1)", [m12.qr_token])).statut === "OCCUPEE", "débloquée → OCCUPEE");
check((await as("admin", "select public.admin_supprimer_maison($1)", [m12.id])).error?.includes("MAISON_A_HISTORIQUE"), "maison avec historique non supprimable");
check((await as("admin", "select public.admin_supprimer_maison($1)", [lot.maisons[299].id])).rows, "maison vierge supprimable");
const exp = val(await as("admin", "select public.admin_export_maisons($1, 1, 3, null)", [cite]));
check(exp.length === 3 && Object.keys(exp[0]).sort().join() === "cite,code_affichage,id,lien_qr,numero,qr_token", "export 1→3", exp[0]);
const j = (await as("admin", "select count(*) from public.journal_admin")).rows[0].count;
check(j > 10, `journal admin : ${j} actions tracées`);

// ═══════════════════════ Fonctionnalités V2 réintégrées ═══════════════════════
const espM = (qr, jeton) => as("anon", "select public.m_espace($1,$2)", [qr, jeton]);
const commander = (qr, jeton, code, liv, demain = false, ip = "1.1.1.1") =>
  as("anon", "select public.m_commander($1,$2,$3,$4,$5)", [qr, jeton, code, liv, demain], ip);
const statutCmd = async (id) => (await db.query(`select statut from public.commandes where id = '${id}'`)).rows[0].statut;

console.log("\n— V2 : aujourd'hui / demain, pause, hors ligne");
const arc = val(await as("admin", "select public.admin_creer_cite('Arc-en-Ciel','ARC')"));
const lotA = val(await as("admin", "select public.admin_generer_lot($1, 1, 12)", [arc])).maisons;
const sid = val(await as("admin", "select public.admin_enregistrer_livreur(null, $1, 'Seydou', '0101010101', 3000)", [arc]));
const codeS = val(await as("admin", "select public.admin_code_livreur($1)", [sid]));
const seydou = val(await as("anon", "select public.l_connexion('0101010101',$1)", [codeS], "20.0.0.1")).jeton;
await as("anon", "select public.l_changer_code($1,$2,'6283')", [seydou, codeS]);
const fa = [];
for (let i = 0; i < 7; i++)
  fa.push(val(await as("anon", "select public.m_creer_foyer($1,$2,$3,'Moi','PAPA','6829', true)", [lotA[i].qr_token, `Famille A${i}`, `07111111${10 + i}`], `21.0.${i}.1`)).jeton);
check(val(await espM(lotA[0].qr_token, fa[0])).livreurs.some((l) => l.id === sid && l.statut === "HORS_LIGNE"), "livreur hors ligne : reste visible (il ne refuse jamais)");
const cH = val(await commander(lotA[0].qr_token, fa[0], "6829", sid));
check(cH.ok && cH.statut === "PROGRAMMEE", "livreur hors ligne → commande programmée (prochain 8h)", cH);
await as("anon", "select public.l_statut($1,'PAUSE')", [seydou]);
const cP = val(await commander(lotA[1].qr_token, fa[1], "6829", sid));
check(cP.statut === "EN_PAUSE", "livreur en pause → livrée aujourd'hui (EN_PAUSE)", cP);
const cD = val(await commander(lotA[2].qr_token, fa[2], "6829", sid, true));
check(cD.statut === "PROGRAMMEE", "« Demain » → programmée", cD);
const espD = val(await espM(lotA[2].qr_token, fa[2]));
check(espD.commande.annulable_jusqua && espD.commande.programmee_pour, "demain : 8h prévue + annulable jusqu'à 18h la veille", espD.commande);
await db.exec(`update public.commandes set annulable_jusqua = now() - interval '1 minute' where id = '${cD.commande_id}'`);
check(val(await as("anon", "select public.m_annuler($1,$2,$3)", [lotA[2].qr_token, fa[2], cD.commande_id])).erreur === "ANNULATION_TARDIVE", "plus annulable après 18h la veille");
await as("anon", "select public.l_statut($1,'ACTIF')", [seydou]);
check((await statutCmd(cP.commande_id)) === "EN_ATTENTE", "REPRENDRE : la commande en pause entre dans sa file");

console.log("\n— V2 : tâches de 23h59 et minuit");
await as("anon", "select public.l_statut($1,'PAUSE')", [seydou]);
const cQ = val(await commander(lotA[3].qr_token, fa[3], "6829", sid));
await db.exec("select public.rollover_commandes()");
check((await statutCmd(cQ.commande_id)) === "PROGRAMMEE", "23h59 : commande en pause → programmée demain 8h");
await db.exec(`update public.commandes set scheduled_for = (now() at time zone 'Africa/Abidjan')::date where id = '${cQ.commande_id}'`);
await db.exec("select public.liberer_commandes_programmees()");
check((await statutCmd(cQ.commande_id)) === "EN_PAUSE", "minuit / 8h : la programmée du jour revient dans la file (livreur en pause)");

console.log("\n— V2 : ordre de la file, « J'arrive chez toi », GPS en direct");
await as("anon", "select public.l_statut($1,'ACTIF')", [seydou]);
const fileS = val(await as("anon", "select public.l_espace($1)", [seydou])).file.filter((c) => c.statut === "EN_ATTENTE");
const [premier, second] = fileS;
check((await as("anon", "select public.l_avancer($1,$2,'EN_ROUTE')", [seydou, second.id])).error?.includes("PAS_LE_PREMIER"), "« Je pars livrer » : dans l'ordre de la file");
check(!(await as("anon", "select public.l_avancer($1,$2,'EN_ROUTE')", [seydou, premier.id])).error, "je pars livrer (1er de la file)");
check((await as("anon", "select public.l_avancer($1,$2,'EN_ROUTE')", [seydou, second.id])).error?.includes("DEJA_EN_COURS"), "une seule livraison à la fois");
check(val(await as("anon", "select public.l_position($1,5.30,-4.02)", [seydou])).actif === false, "GPS refusé avant « J'arrive chez toi »");
await as("anon", "select public.l_avancer($1,$2,'ARRIVE')", [seydou, premier.id]);
check(val(await as("anon", "select public.l_position($1,5.30,-4.02)", [seydou])).actif === true, "GPS en direct pendant « J'arrive chez toi »");
const iP = lotA.findIndex((m) => m.code_affichage === premier.code_affichage);
const espLive = val(await espM(lotA[iP].qr_token, fa[iP]));
check(espLive.commande.statut === "ARRIVE" && espLive.commande.live?.lat === 5.3, "le foyer voit le livreur sur la carte", espLive.commande);
const suivi = val(await as("anon", "select public.suivi_commande($1)", [premier.id]));
check(suivi.live?.lat === 5.3 && !("nom_famille" in suivi) && !("telephone_contact" in suivi), "lien /suivi : position du livreur, aucune donnée du foyer", suivi);
await as("anon", "select public.l_avancer($1,$2,'LIVREE')", [seydou, premier.id]);
check(val(await as("anon", "select public.l_position($1,5.30,-4.02)", [seydou])).actif === false, "livré : partage GPS coupé");
check(val(await espM(lotA[iP].qr_token, fa[iP])).derniere_livraison?.id === premier.id, "écran « Livré ! »");
check(val(await as("anon", "select public.l_historique($1)", [seydou])).some((c) => c.reference === premier.reference), "historique du livreur");

console.log("\n— V2 : prix, fidélité, forage à 7 km");
check(!(await as("anon", "select public.l_prix($1,3500)", [seydou])).error, "le livreur change son prix");
check((await as("anon", "select public.l_prix($1,50)", [seydou])).error?.includes("PRIX_INVALIDE"), "prix absurde refusé");
check(val(await espM(lotA[4].qr_token, fa[4])).livreurs.find((l) => l.id === sid)?.prix_fcfa === 3500, "le client voit le nouveau prix");
await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, null, '2020-01-01')");
await as("admin", "select public.admin_recharger_livreur($1, 1000, null)", [sid]);
await as("admin", "select public.admin_recharger($1, 500, null)", [lotA[4].id]);
await db.exec(`update public.livreurs set total_points_utilises = 4970 where id = '${sid}'`);
const soldeAvant = (await db.query(`select solde_points from public.livreurs where id = '${sid}'`)).rows[0].solde_points;
const cF = val(await commander(lotA[4].qr_token, fa[4], "6829", sid));
const sF = (await db.query(`select solde_points, total_points_utilises, dernier_bonus_at from public.livreurs where id = '${sid}'`)).rows[0];
check(cF.ok && sF.solde_points === soldeAvant && sF.total_points_utilises === 20 && sF.dernier_bonus_at, "fidélité : 5000 points utilisés → +50 offerts", sF);
const src = val(await as("admin", "select public.admin_enregistrer_source(null, $1, 'Forage Nord', 5.30, -4.00)", [arc]));
check(!(await as("admin", "select public.admin_enregistrer_livreur($1, $2, 'Seydou', '0101010101', 3500, $3)", [sid, arc, src])).error, "forage rattaché au livreur");
await as("admin", "select public.admin_poser_maison($1, 5.40, -4.00)", [lotA[5].qr_token]);
await as("admin", "select public.admin_recharger($1, 500, null)", [lotA[5].id]);
const loin = val(await commander(lotA[5].qr_token, fa[5], "6829", sid));
check(loin.ok === true, "forage à 11 km de la maison : la commande passe quand même (même cité, pas de limite)", loin);
const sources = val(await as("admin", "select public.admin_sources()"));
check(sources.length === 1 && sources[0].livreurs === 1, "admin : liste des forages");

console.log("\n— V2 : recrutement + validation");
await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, null, $1)", [finEssai]);
const pc = val(await as("anon", "select public.public_cites()"));
check(pc.cites.some((c) => c.id === arc) && pc.sources.some((x) => x.id === src), "formulaire de recrutement : cités et forages");
const rec = val(await as("anon", "select public.l_inscription('Moussa','0102020202',$1,$2,'7391',2000)", [arc, src], "22.0.0.1"));
check(rec.ok, "inscription par le lien de recrutement", rec);
check(val(await as("anon", "select public.l_espace($1)", [rec.jeton])).profil.valide === false, "compte en attente de validation");
check((await as("anon", "select public.l_statut($1,'ACTIF')", [rec.jeton])).error?.includes("COMPTE_EN_ATTENTE"), "pas de service avant validation");
const mid = (await db.query("select id from public.livreurs where telephone = '0102020202'")).rows[0].id;
check(!val(await espM(lotA[6].qr_token, fa[6])).livreurs.some((l) => l.id === mid), "invisible des clients avant validation");
check(val(await as("anon", "select public.l_inscription('Intrus','0102020202',$1,null,'7391',2000)", [arc], "22.0.0.2")).erreur === "DEJA_INSCRIT", "numéro déjà inscrit");
await as("admin", "select public.admin_valider_livreur($1)", [mid]);
check(val(await espM(lotA[6].qr_token, fa[6])).livreurs.some((l) => l.id === mid), "validé par l'admin : visible");

console.log("\n— V2 : connexion /login par téléphone + code");
check(val(await as("anon", "select public.auth_connexion('01 01 01 01 01','6283')", [], "23.0.0.1")).role === "livreur", "/login : livreur reconnu");
const cx = val(await as("anon", "select public.auth_connexion('0711111110','6829')", [], "23.0.0.2"));
check(cx.role === "foyer" && cx.qr === lotA[0].qr_token && cx.jeton, "/login : famille reconnue (numéro + code maison) → sa maison", cx);
check(val(await as("anon", "select public.auth_connexion('0711111110','1357')", [], "23.0.0.3")).erreur === "IDENTIFIANTS", "/login : mauvais code");
check(val(await as("anon", "select public.auth_connexion('0799999998','6829')", [], "23.0.0.4")).erreur === "IDENTIFIANTS", "/login : numéro inconnu → même message");

console.log("\n— V2 : code provisoire (oubli) à changer");
const cpro = val(await as("admin", "select public.admin_reinitialiser_code($1)", [lotA[0].id]));
const fo = val(await as("anon", "select public.m_ouvrir($1,$2,'Moi','PAPA',null)", [lotA[0].qr_token, cpro], "24.0.0.1")).jeton;
check(val(await espM(lotA[0].qr_token, fo)).foyer.doit_changer_code === true, "code provisoire : la famille doit en choisir un");
check(val(await commander(lotA[0].qr_token, fo, cpro, sid)).erreur === "CODE_A_CHANGER", "pas de commande avec le code provisoire");
check(val(await as("anon", "select public.m_changer_code($1,$2,$3,'7264')", [lotA[0].qr_token, fo, cpro])).ok, "nouveau code choisi");
check(val(await espM(lotA[0].qr_token, fo)).foyer.doit_changer_code === false, "code provisoire levé");

console.log("\n— V2 : paiements, dashboard, consommation");
await as("admin", "select public.admin_paiement('FOYER', $1, 'PAYE')", [lotA[0].id]);
check(val(await as("admin", "select public.admin_maison_detail($1)", [lotA[0].id])).foyer.statut_paiement === "PAYE", "foyer marqué PAYÉ");
await as("admin", "select public.admin_paiement('LIVREUR', $1, 'PAYE')", [sid]);
check(val(await as("admin", "select public.admin_livreurs()")).find((l) => l.id === sid).statut_paiement === "PAYE", "livreur marqué PAYÉ");
const dash = val(await as("admin", "select public.admin_dashboard()"));
check(dash.maisons > 300 && typeof dash.ca_jour === "number" && dash.carte_livreurs.some((l) => l.id === sid && l.origine === "FORAGE"), "dashboard : compteurs + carte (livreur à son forage)", dash.carte_livreurs);
check(Array.isArray(val(await as("anon", "select public.m_consommation($1,$2)", [lotA[iP].qr_token, fa[iP]]))), "consommation par mois");
check(val(await as("anon", "select public.m_historique($1,$2)", [lotA[iP].qr_token, fa[iP]])).length >= 1, "historique complet du foyer");

console.log("\n— V2 : reprise des anciens clients");
await db.exec(`
  create schema if not exists archive_v2;
  create table archive_v2.cites (id uuid primary key, nom text);
  create table archive_v2.clients (id uuid primary key default gen_random_uuid(), nom text, telephone text, cite_id uuid,
    lot_numero text, pin_hash text, is_temporary boolean default false, solde_points int default 0, created_at timestamptz default now());
  insert into archive_v2.cites values ('00000000-0000-0000-0000-0000000000c1', 'Cité 1');
  insert into archive_v2.clients (nom, telephone, cite_id, lot_numero, pin_hash)
    values ('Fatou', '0701020399', '00000000-0000-0000-0000-0000000000c1', '12', extensions.crypt('5917', extensions.gen_salt('bf', 8))),
           ('Issa',  '0705060799', '00000000-0000-0000-0000-0000000000c1', '7',  'ancien-format');
`);
check(val(await as("anon", "select public.auth_connexion('0701020399','5917')", [], "25.0.0.1")).erreur === "COMPTE_V2_EN_ATTENTE", "ancien client pas encore rattaché : message clair");
const v2c = val(await as("admin", "select public.admin_clients_v2()"));
check(v2c.length === 2 && v2c.find((c) => c.nom === "Fatou").code_reutilisable === true, "admin : liste des anciens clients à rattacher", v2c);
const fat = v2c.find((c) => c.nom === "Fatou");
const issa = v2c.find((c) => c.nom === "Issa");
const rat = val(await as("admin", "select public.admin_rattacher_client_v2($1,$2)", [fat.id, lotA[8].id]));
check(rat.ok && rat.code_provisoire === null && rat.code_affichage === "ARC 009", "Fatou rattachée à ARC 009 avec son ancien code", rat);
const cxF = val(await as("anon", "select public.auth_connexion('0701020399','5917')", [], "25.0.0.2"));
check(cxF.role === "foyer" && cxF.code_affichage === "ARC 009", "Fatou se connecte avec son numéro + son ancien PIN", cxF);
check(val(await espM(cxF.qr, cxF.jeton)).foyer.cgv_a_accepter === false, "pendant l'essai : rien à accepter");
await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, null, '2020-01-01')");
check(val(await espM(cxF.qr, cxF.jeton)).foyer.cgv_a_accepter === true, "essai terminé : elle doit d'abord accepter « crédits non remboursables »");
check((await as("admin", "select public.admin_recharger($1, 500, null)", [lotA[8].id])).error?.includes("CGV_FOYER_EN_ATTENTE"), "pas de recharge avant acceptation");
check(val(await commander(cxF.qr, cxF.jeton, "5917", sid)).erreur === "CGV_NON_ACCEPTEES", "aucune commande avant acceptation");
await as("anon", "select public.m_accepter_cgv($1,$2)", [cxF.qr, cxF.jeton]);
check(val(await espM(cxF.qr, cxF.jeton)).foyer.cgv_a_accepter === false, "conditions acceptées");
const ratI = val(await as("admin", "select public.admin_rattacher_client_v2($1,$2)", [issa.id, lotA[9].id]));
check(/^\d{4}$/.test(ratI.code_provisoire ?? ""), "ancien code non réutilisable → code provisoire donné à l'admin", ratI);
check(val(await as("admin", "select public.admin_clients_v2()")).length === 0, "plus personne à rattacher");
check((await as("admin", "select public.admin_rattacher_client_v2($1,$2)", [fat.id, lotA[10].id])).error?.includes("DEJA_REPRIS"), "un client V2 n'est repris qu'une fois");
check((await as("anon", "select public.admin_clients_v2()")).error?.includes("permission denied"), "anon ne voit pas les anciens clients");

console.log("\n— Case « non remboursable » : demandée à la fin de l'essai");
await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, null, $1)", [finEssai]);
check(val(await as("anon", "select public.m_maison($1)", [lotA[11].qr_token])).essai === true, "le formulaire sait que l'essai est en cours");
const fEssai = val(await as("anon", "select public.m_creer_foyer($1,'Famille Essai','0711112233','Ali','PAPA','6829', false)", [lotA[11].qr_token], "26.0.0.1"));
check(fEssai.ok, "pendant l'essai : foyer créé sans cocher la case", fEssai);
check(val(await espM(lotA[11].qr_token, fEssai.jeton)).foyer.cgv_a_accepter === false, "pendant l'essai : aucune demande");
check(val(await commander(lotA[11].qr_token, fEssai.jeton, "6829", sid)).ok, "pendant l'essai : commande possible");
await as("admin", "select public.admin_enregistrer_parametres('https://awa-songon.vercel.app', 100, 50, null, '2020-01-01')");
check(val(await espM(lotA[11].qr_token, fEssai.jeton)).foyer.cgv_a_accepter === true, "essai terminé : la case est demandée");
await as("anon", "select public.m_accepter_cgv($1,$2)", [lotA[11].qr_token, fEssai.jeton]);
check(!(await as("admin", "select public.admin_recharger($1, 500, null)", [lotA[11].id])).error, "acceptée : recharge possible");
check((await as("anon", "select public.m_creer_foyer($1,'Famille Hors','0711114455','Ali','PAPA','6829', false)", [lotA[10].qr_token], "26.0.0.2")).error?.includes("CGV_NON_ACCEPTEES"), "hors essai : la case reste obligatoire à l'inscription");

console.log("\n— V2 : statistiques annuelles");
const an = new Date().getFullYear();
const st = val(await as("admin", "select public.admin_stats_annuelles($1)", [an]));
const tot = st.mois.reduce((x, m) => x + m.total, 0);
check(st.mois.length === 12 && tot > 0 && st.mois.some((m) => m.livrees > 0 && m.eau > 0), "12 mois, commandes et livraisons comptées", { tot });
check(st.livreurs.some((l) => l.nom === "Seydou") && st.options.cites.length >= 2, "par livreur + options de filtres");
const stArc = val(await as("admin", "select public.admin_stats_annuelles($1, $2)", [an, arc]));
check(stArc.mois.reduce((x, m) => x + m.total, 0) < tot, "filtre par cité");
check((await as("anon", "select public.admin_stats_annuelles($1)", [an])).error?.includes("permission denied"), "statistiques réservées à l'admin");

console.log(`\n${ok} OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
