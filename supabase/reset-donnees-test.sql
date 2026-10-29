-- =============================================================================
--  Distribution Eau — EFFACER LES DONNÉES DE TEST
-- =============================================================================
--  À lancer dans Supabase → SQL Editor quand tu as fini tes essais.
--  L'appli continue de marcher normalement : seules les données sont vidées.
--
--  EFFACE : toutes les maisons et leurs QR (ex. ORB 001), les familles, leurs
--           téléphones connectés et soldes, les commandes, les livreurs, les
--           avis, les mouvements de points, les positions GPS, le journal admin.
--           Les anciens clients V2 rattachés redeviennent « à rattacher ».
--
--  GARDE  : tes CITÉS (Oribat, Promogim…) et leurs FORAGES, ton compte admin,
--           tes réglages (essai, coûts, Wave, adresse) et les données de la V2.
--
--  ⚠ Une fois les VRAIS autocollants collés sur les portails, ne lance plus ce
--  script : les maisons effacées rendraient ces autocollants inutilisables.
--
--  TRUNCATE (et non DELETE) : l'historique des points et des avis refuse toute
--  suppression ligne par ligne (protection anti-fraude) ; seul ce vidage
--  complet, lancé volontairement par toi, le remet à zéro.
-- =============================================================================

truncate table
  public.avis_livreurs,
  public.avis_plateforme,
  public.transactions_points,
  public.positions_live,
  public.positions_historique,
  public.commandes,
  public.appareils,
  public.utilisateurs_foyer,
  public.portefeuilles,
  public.reprise_v2,
  public.foyers,
  public.maisons,
  public.sessions_livreurs,
  public.livreurs,
  public.journal_admin,
  public.anti_abus;

-- Vérification : maisons, foyers, livreurs et commandes à 0 ; cités et admin gardés.
select
  (select count(*) from public.maisons)   as maisons,
  (select count(*) from public.foyers)    as foyers,
  (select count(*) from public.livreurs)  as livreurs,
  (select count(*) from public.commandes) as commandes,
  (select count(*) from public.cites)     as cites_gardees,
  (select count(*) from public.admins)    as admins_gardes;
