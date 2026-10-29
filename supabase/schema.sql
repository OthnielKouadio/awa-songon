-- =============================================================================
--  DISTRIBUTION EAU V3 — Schéma Supabase complet (base VIDE)
-- =============================================================================
--  À lancer en entier dans Supabase → SQL Editor. Le script est relançable : il
--  ne détruit aucune donnée et remet toujours les droits à zéro à la fin (après
--  toute modification d'une fonction, relance-le EN ENTIER).
--
--  Modèle :
--    cites ──< maisons ──< foyers ──< utilisateurs_foyer
--                          │   ├──< appareils (téléphones reconnus)
--                          │   ├─── portefeuilles (1 par foyer)
--                          │   └──< transactions_points (append-only)
--    cites ──< livreurs ──< commandes >── foyers / maisons
--
--  Principes de sécurité :
--    1. Aucune table n'est accessible en écriture par l'API. Toute écriture passe
--       par une fonction RPC « security definer » qui valide tout elle-même.
--    2. RLS activé partout. Seul un ADMIN (Supabase Auth + 2FA, aal2) peut lire
--       les tables ; les visiteurs (anon) n'y ont aucun droit.
--    3. Le client (foyer) n'a pas de compte Supabase : il prouve qu'il habite la
--       maison avec le CODE MAISON (bcrypt), puis son téléphone reçoit un jeton
--       d'appareil aléatoire (seul son hash SHA-256 est stocké).
--    4. Anti-force-brute du code à 4 chiffres : limites par IP, par appareil et
--       par maison (10 échecs / 24 h → maison verrouillée pour les NOUVEAUX
--       téléphones uniquement : la famille déjà connectée continue de commander).
--    5. Les points sont des crédits de livraison NON REMBOURSABLES. Chaque
--       mouvement est tracé dans transactions_points, table non modifiable.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
--  0. ARCHIVAGE AUTOMATIQUE DE LA V2 (même projet Supabase)
-- =============================================================================
--  Si la base contient encore la V2 (tables tricycles / clients…), on la RANGE
--  dans le schéma archive_v2 avant d'installer la V3 :
--    · toutes les tables et vues V2 y sont DÉPLACÉES avec leurs données (rien
--      n'est supprimé) ; ce schéma n'est pas exposé par l'API, personne ne le lit ;
--    · les tâches pg_cron « awa-* » de la V2 sont arrêtées ;
--    · les tables V2 sont retirées du temps réel ;
--    · les fonctions V2 du schéma public sont supprimées (leur code reste dans
--      git : branche archive/v2, tag v2-final).
--  Sur une base neuve, ou une fois la V2 rangée, ce bloc ne fait rien.
do $$
declare
  r record;
  v_nb int := 0;
begin
  if to_regclass('public.tricycles') is null and to_regclass('public.clients') is null then
    return;                                       -- pas de V2 : rien à faire
  end if;
  create schema if not exists archive_v2;
  revoke all on schema archive_v2 from public, anon, authenticated;

  -- 1. Tâches planifiées de la V2.
  if to_regclass('cron.job') is not null then
    for r in execute $q$select jobname from cron.job where jobname like 'awa-%'$q$ loop
      perform cron.unschedule(r.jobname);
    end loop;
  end if;

  -- 2. Temps réel : la V2 y avait inscrit ses tables.
  for r in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' loop
    execute format('alter publication supabase_realtime drop table public.%I', r.tablename);
  end loop;

  -- 3. Fonctions V2 (sauf celles qui appartiennent à une extension).
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;

  -- 4. Tables puis vues V2 → archive_v2, avec leurs données (les séquences
  --    rattachées à une table la suivent automatiquement).
  for r in
    select c.relname, c.relkind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
     order by c.relkind in ('v', 'm')            -- tables d'abord
  loop
    if r.relkind in ('v', 'm') then
      execute format('alter %s public.%I set schema archive_v2', case r.relkind when 'v' then 'view' else 'materialized view' end, r.relname);
    else
      execute format('alter table public.%I set schema archive_v2', r.relname);
    end if;
    v_nb := v_nb + 1;
  end loop;
  execute 'revoke all on all tables in schema archive_v2 from anon, authenticated';

  raise notice 'V2 rangée dans le schéma archive_v2 (% tables/vues, données conservées). Installation de la V3…', v_nb;
end $$;

-- =============================================================================
--  1. TABLES
-- =============================================================================

-- Réglages globaux (une seule ligne).
create table if not exists public.parametres (
  id                   boolean primary key default true check (id),
  -- Base des liens imprimés dans les QR : https://mondomaine.com (sans / final).
  site_url             text not null default 'https://awa-songon.vercel.app'
                       check (site_url ~ '^https?://[a-z0-9.-]+(:[0-9]{2,5})?$'),
  -- Points débités par commande (1 point = 1 FCFA de crédit de livraison).
  cout_commande_points int  not null default 100 check (cout_commande_points between 0 and 100000),
  -- Points débités au livreur pour chaque commande reçue (app ou saisie directe).
  cout_livreur_points  int  not null default 50 check (cout_livreur_points between 0 and 100000),
  -- ESSAI GRATUIT pour tout le monde (foyers et livreurs) jusqu'à cette date
  -- INCLUSE (heure d'Abidjan) : aucun point débité. Réglable dans l'admin.
  -- NULL = pas d'essai.
  essai_fin            date default '2026-12-31',
  -- Numéro affiché aux clients pour recharger / demander de l'aide.
  telephone_service    text check (telephone_service ~ '^(01|05|07|21|25|27)[0-9]{8}$'),
  -- Version des conditions acceptées à la création d'un foyer.
  cgv_version          text not null default '2026-10-v3',
  -- Nom du marchand Wave affiché au client (il le vérifie sur l'écran Wave).
  -- Le LIEN de paiement, lui, est figé dans le code (src/lib/format.ts) : un
  -- admin piraté ne peut pas détourner les paiements.
  wave_marchand        text check (length(wave_marchand) <= 60),
  updated_at           timestamptz not null default now()
);
insert into public.parametres (id) values (true) on conflict (id) do nothing;

create table if not exists public.cites (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null check (length(btrim(nom)) between 2 and 60),
  -- PROMO, ARC, AKWA, STAR… : préfixe imprimé sur les autocollants.
  code_court text not null check (code_court ~ '^[A-Z]{2,5}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists cites_nom_key  on public.cites (lower(nom));
create unique index if not exists cites_code_key on public.cites (code_court);

-- FORAGES (sources d'eau) d'une cité. Position facultative : sert à placer les
-- livreurs sur la carte admin.
create table if not exists public.sources (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null check (length(btrim(nom)) between 2 and 60),
  cite_id    uuid not null references public.cites(id) on delete cascade,
  lat        double precision check (lat between -90 and 90),
  long       double precision check (long between -180 and 180),
  created_at timestamptz not null default now(),
  constraint sources_gps_pair check ((lat is null) = (long is null))
);
create index if not exists sources_cite_idx on public.sources (cite_id);

-- MAISON : physique, permanente. Ce qui est imprimé sur l'autocollant ne change
-- jamais (trigger _maison_immuable) ; seul le qr_token peut être régénéré si un
-- autocollant est arraché ou copié.
create table if not exists public.maisons (
  id                uuid primary key default gen_random_uuid(),
  cite_id           uuid not null references public.cites(id) on delete restrict,
  numero_sequentiel int  not null check (numero_sequentiel between 1 and 9999),
  code_affichage    text not null unique,                     -- « PROMO 012 »
  -- 6 caractères sans 0/O/1/I (lisibles) : 32^6 ≈ 1 milliard de possibilités.
  qr_token          text not null unique check (qr_token ~ '^[2-9A-HJ-NP-Z]{6}$'),
  lien_qr           text not null,                            -- lien imprimé dans le QR
  statut            text not null default 'LIBRE' check (statut in ('LIBRE', 'OCCUPEE', 'BLOQUEE')),
  motif_blocage     text,
  -- Position GPS du PORTAIL (jamais celle d'un client) : relevée à la pose de
  -- l'autocollant (admin, POSE) ou par le livreur à sa 1re livraison (LIVREUR).
  lat               double precision check (lat between -90 and 90),
  long              double precision check (long between -180 and 180),
  position_source   text check (position_source in ('POSE', 'LIVREUR')),
  position_maj      timestamptz,
  created_at        timestamptz not null default now(),
  unique (cite_id, numero_sequentiel),
  constraint maisons_position_complete check ((lat is null) = (long is null) and (lat is null) = (position_source is null))
);
create index if not exists maisons_cite_idx on public.maisons (cite_id, numero_sequentiel);

-- FOYER : les occupants actuels. Un seul foyer ACTIF par maison ; les anciens
-- restent en ARCHIVE (historique conservé, code effacé).
create table if not exists public.foyers (
  id                  uuid primary key default gen_random_uuid(),
  maison_id           uuid not null references public.maisons(id) on delete restrict,
  nom_famille         text not null check (length(nom_famille) between 2 and 60),
  telephone_principal text not null check (telephone_principal ~ '^(01|05|07|21|25|27)[0-9]{8}$'),
  -- Code maison à 4 chiffres, haché bcrypt. NULL une fois le foyer archivé.
  code_maison_hash    text,
  statut              text not null default 'ACTIF' check (statut in ('ACTIF', 'ARCHIVE')),
  date_debut          timestamptz not null default now(),
  date_fin            timestamptz,
  motif_fin           text,
  -- Contre l'« usurpation du premier scan » : l'admin, ou le livreur sur place,
  -- confirme que le foyer habite bien là.
  verifie_at          timestamptz,
  verifie_par         text check (verifie_par in ('ADMIN', 'LIVREUR')),
  -- Code donné par l'admin (oubli) : la famille doit en choisir un nouveau.
  code_provisoire     boolean not null default false,
  -- Statut de paiement, géré UNIQUEMENT par l'admin.
  statut_paiement     text not null default 'IMPAYE' check (statut_paiement in ('PAYE', 'IMPAYE')),
  date_paiement       timestamptz,
  -- Preuve de l'acceptation « crédits non remboursables ». NULL = pas encore
  -- acceptée : demandée à la fin de l'essai gratuit, avant la 1re commande payante.
  cgv_version         text,
  cgv_acceptees_at    timestamptz,
  constraint foyers_dates_coherentes check ((statut = 'ACTIF') = (date_fin is null)),
  constraint foyers_code_si_actif    check (statut = 'ARCHIVE' or code_maison_hash is not null)
);
create unique index if not exists foyers_un_actif_par_maison on public.foyers (maison_id) where statut = 'ACTIF';

-- Toutes les personnes du foyer (créées au 1er usage de chaque téléphone).
create table if not exists public.utilisateurs_foyer (
  id            uuid primary key default gen_random_uuid(),
  foyer_id      uuid not null references public.foyers(id) on delete cascade,
  nom           text not null check (length(nom) between 1 and 40),
  telephone     text check (telephone ~ '^(01|05|07|21|25|27)[0-9]{8}$'),
  role          text not null check (role in ('PAPA', 'MAMAN', 'ENFANT', 'AUTRE')),
  est_titulaire boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists utilisateurs_foyer_idx on public.utilisateurs_foyer (foyer_id);

-- Téléphones reconnus. Le jeton n'existe en clair QUE dans le navigateur.
create table if not exists public.appareils (
  id             uuid primary key default gen_random_uuid(),
  foyer_id       uuid not null references public.foyers(id) on delete cascade,
  utilisateur_id uuid not null references public.utilisateurs_foyer(id) on delete cascade,
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  dernier_usage  timestamptz,
  expire_at      timestamptz not null default now() + interval '180 days',
  revoque_at     timestamptz
);
create index if not exists appareils_foyer_idx on public.appareils (foyer_id) where revoque_at is null;

-- Portefeuille : 1 par foyer, jamais négatif.
create table if not exists public.portefeuilles (
  foyer_id     uuid primary key references public.foyers(id) on delete restrict,
  solde_points int  not null default 0 check (solde_points >= 0),
  updated_at   timestamptz not null default now()
);

create table if not exists public.livreurs (
  id         uuid primary key default gen_random_uuid(),
  cite_id    uuid not null references public.cites(id) on delete restrict,
  nom        text not null check (length(nom) between 2 and 40),
  telephone  text not null unique check (telephone ~ '^(01|05|07|21|25|27)[0-9]{8}$'),
  -- Prix de l'eau (FCFA, payé au livreur à la livraison), figé dans chaque commande.
  prix_fcfa  int  not null check (prix_fcfa between 100 and 50000),
  -- Choisi par le livreur — il ne refuse jamais, il reste visible :
  --   ACTIF       commande → EN_ATTENTE (dans sa file)
  --   PAUSE       garage, repas : commande → EN_PAUSE (livrée aujourd'hui)
  --   HORS_LIGNE  il dort : commande → PROGRAMMEE (prochain 8h)
  -- BLOQUE : uniquement par l'admin (invisible, plus d'accès).
  statut     text not null default 'HORS_LIGNE' check (statut in ('ACTIF', 'PAUSE', 'HORS_LIGNE', 'BLOQUE')),
  -- Forage habituel (facultatif), de SA cité.
  source_id  uuid references public.sources(id) on delete set null,
  -- Inscrit par le lien de recrutement : invisible tant que l'admin n'a pas validé.
  valide     boolean not null default true,
  statut_paiement text not null default 'IMPAYE' check (statut_paiement in ('PAYE', 'IMPAYE')),
  date_paiement   timestamptz,
  -- Fidélité : +50 points offerts chaque fois que 5000 points ont été utilisés.
  total_points_utilises int not null default 0 check (total_points_utilises >= 0),
  dernier_bonus_at      timestamptz,
  -- Code de connexion à 4 chiffres (bcrypt). Donné par l'admin (provisoire),
  -- le livreur doit le changer à sa 1re connexion. NULL = pas encore d'accès.
  code_hash       text,
  code_provisoire boolean not null default true,
  -- Points (après l'essai gratuit) : 50 par commande reçue, jamais négatif.
  solde_points    int not null default 0 check (solde_points >= 0),
  created_at timestamptz not null default now()
);
create index if not exists livreurs_cite_idx on public.livreurs (cite_id);

-- Sessions des livreurs (un jeton par téléphone, haché).
create table if not exists public.sessions_livreurs (
  id            uuid primary key default gen_random_uuid(),
  livreur_id    uuid not null references public.livreurs(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  dernier_usage timestamptz,
  expire_at     timestamptz not null default now() + interval '180 days',
  revoque_at    timestamptz
);
create index if not exists sessions_livreurs_idx on public.sessions_livreurs (livreur_id) where revoque_at is null;

-- COMMANDE : toujours livrée à la MAISON, jamais à la position GPS du
-- téléphone. code_affichage / nom_famille / commande_par sont des copies figées
-- (le livreur lit « PROMO 012 – Famille Koffi – commandé par Maman »).
-- source APP : passée par le foyer · LIVREUR : saisie directe par le livreur
-- (client qui l'appelle, famille sans smartphone) — foyer_id NULL si la maison
-- n'a pas encore de foyer inscrit.
create table if not exists public.commandes (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,                     -- « K7QX2P » (affichée)
  source            text not null default 'APP' check (source in ('APP', 'LIVREUR')),
  foyer_id          uuid references public.foyers(id) on delete restrict,
  maison_id         uuid not null references public.maisons(id) on delete restrict,
  cite_id           uuid not null references public.cites(id) on delete restrict,
  livreur_id        uuid not null references public.livreurs(id) on delete restrict,
  utilisateur_id    uuid references public.utilisateurs_foyer(id) on delete set null,
  appareil_id       uuid references public.appareils(id) on delete set null,
  code_affichage    text not null,
  nom_famille       text not null,
  commande_par      text not null,
  role_commande     text,
  telephone_contact text,
  note              text check (length(note) <= 280),
  prix_fcfa         int  not null,
  cout_points       int  not null check (cout_points >= 0),          -- débité au foyer
  cout_livreur_points int not null default 0 check (cout_livreur_points >= 0),  -- débité au livreur
  -- Cycle de vie :
  --   EN_ATTENTE  dans la file d'un livreur ACTIF
  --   EN_PAUSE    livreur en pause : livrée aujourd'hui, dès qu'il reprend
  --   PROGRAMMEE  « demain », ou livreur HORS_LIGNE : prochain 8h00
  --   EN_ROUTE    « Je pars livrer »
  --   ARRIVE      « J'arrive chez toi » : GPS en direct partagé 10 min
  --   LIVREE / ANNULEE
  statut            text not null default 'EN_ATTENTE'
                    check (statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE', 'LIVREE', 'ANNULEE')),
  -- Jour de livraison prévu (heure d'Abidjan) : aujourd'hui ou demain.
  scheduled_for     date not null default ((now() at time zone 'Africa/Abidjan')::date),
  programmee_pour   timestamptz,          -- PROGRAMMEE : 8h00 du jour prévu
  annulable_jusqua  timestamptz,          -- programmée pour demain : plus annulable après 18h la veille
  arriving_at       timestamptz,          -- début du partage GPS
  created_at        timestamptz not null default now(),
  en_route_at       timestamptz,
  livree_at         timestamptz,
  annulee_at        timestamptz,
  annulee_par       text check (annulee_par in ('CLIENT', 'ADMIN')),
  constraint commandes_foyer_si_app check (source = 'LIVREUR' or foyer_id is not null)
);
-- (Index « une seule commande en cours par maison » et file des livreurs :
--  créés plus bas, dans la mise à jour, une fois toutes les colonnes présentes.)

-- ─── GPS en direct (uniquement pendant ARRIVE) ───────────────────────────────
-- positions_live : cache (une ligne par livreur, écrasée, 5 min max, UNLOGGED).
create unlogged table if not exists public.positions_live (
  livreur_id  uuid primary key references public.livreurs(id) on delete cascade,
  commande_id uuid not null references public.commandes(id) on delete cascade,
  lat         double precision not null,
  long        double precision not null,
  maj         timestamptz not null default now()
);
-- Historique : au plus 1 point toutes les 2 min par commande.
create table if not exists public.positions_historique (
  id          uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  livreur_id  uuid not null references public.livreurs(id) on delete cascade,
  lat         double precision not null,
  long        double precision not null,
  created_at  timestamptz not null default now()
);
create index if not exists positions_historique_idx on public.positions_historique (commande_id, created_at desc);

-- Reprise des clients V2 (archive_v2.clients) : un client = un foyer.
create table if not exists public.reprise_v2 (
  client_v2_id uuid primary key,
  foyer_id     uuid not null references public.foyers(id) on delete cascade,
  repris_at    timestamptz not null default now()
);
create index if not exists commandes_foyer_idx on public.commandes (foyer_id, created_at desc);
create index if not exists commandes_date_idx  on public.commandes (created_at desc);

-- ─── Avis ────────────────────────────────────────────────────────────────────
-- Note moyenne du livreur, tenue à jour par trigger après chaque avis.
alter table public.livreurs add column if not exists note_moyenne numeric(3, 2);
alter table public.livreurs add column if not exists total_avis   int not null default 0;

-- Avis sur UNE livraison : un seul par commande (unique), uniquement par le
-- foyer livré (contrôlé par m_noter_livreur), dans les 7 jours.
create table if not exists public.avis_livreurs (
  id             uuid primary key default gen_random_uuid(),
  commande_id    uuid not null unique references public.commandes(id) on delete restrict,
  livreur_id     uuid not null references public.livreurs(id) on delete restrict,
  foyer_id       uuid not null references public.foyers(id) on delete restrict,
  utilisateur_id uuid references public.utilisateurs_foyer(id) on delete set null,
  note           smallint not null check (note between 1 and 5),
  commentaire    text check (length(commentaire) <= 500),
  created_at     timestamptz not null default now()
);
create index if not exists avis_livreurs_livreur_idx on public.avis_livreurs (livreur_id, created_at desc);
create index if not exists avis_livreurs_date_idx    on public.avis_livreurs (created_at desc);

-- Avis sur la plateforme : un par foyer et par semaine (anti-spam).
create table if not exists public.avis_plateforme (
  id             uuid primary key default gen_random_uuid(),
  foyer_id       uuid not null references public.foyers(id) on delete restrict,
  utilisateur_id uuid references public.utilisateurs_foyer(id) on delete set null,
  code_affichage text not null,
  note           smallint not null check (note between 1 and 5),
  commentaire    text check (length(commentaire) <= 500),
  created_at     timestamptz not null default now()
);
create index if not exists avis_plateforme_date_idx  on public.avis_plateforme (created_at desc);
create index if not exists avis_plateforme_foyer_idx on public.avis_plateforme (foyer_id, created_at desc);

-- Mouvements de points : append-only (trigger _interdit_modification).
--   RECHARGE (+) · COMMANDE (−) · ANNULATION (+, recrédit d'une commande annulée)
--   PERTE_CLOTURE (−, solde perdu à la clôture du foyer : non remboursable)
-- Titulaire : un foyer OU un livreur (exactement un des deux).
create table if not exists public.transactions_points (
  id          uuid primary key default gen_random_uuid(),
  foyer_id    uuid references public.foyers(id) on delete restrict,
  livreur_id  uuid references public.livreurs(id) on delete restrict,
  type        text not null check (type in ('RECHARGE', 'COMMANDE', 'ANNULATION', 'PERTE_CLOTURE', 'BONUS_FIDELITE')),
  montant     int  not null check (montant <> 0),
  solde_apres int  not null check (solde_apres >= 0),
  commande_id uuid references public.commandes(id) on delete restrict,
  reference   text check (length(reference) <= 80),          -- ex. référence Wave
  admin_id    uuid,
  created_at  timestamptz not null default now(),
  constraint transactions_un_titulaire check ((foyer_id is null) <> (livreur_id is null))
);
create index if not exists transactions_foyer_idx   on public.transactions_points (foyer_id, created_at desc);
create index if not exists transactions_livreur_idx on public.transactions_points (livreur_id, created_at desc);

-- Administrateurs = utilisateurs Supabase Auth listés ici (ajout à la main, voir README).
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- Journal des actions admin : append-only.
create table if not exists public.journal_admin (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid,
  action     text not null,
  cible_id   uuid,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists journal_admin_date_idx on public.journal_admin (created_at desc);

-- Compteurs anti-abus : '<type>:<ip|id>' + horodatage. Purgé au fil de l'eau.
create table if not exists public.anti_abus (
  cle        text not null,
  created_at timestamptz not null default now()
);
create index if not exists anti_abus_cle_idx on public.anti_abus (cle, created_at desc);

-- ─── Mise à jour d'une base V3 déjà installée ────────────────────────────────
-- « create table if not exists » ne touche pas une table existante : on ajoute
-- ici les colonnes et règles venues ensuite (fonctionnalités V2 réintégrées).
-- Sans effet sur une base neuve. Aucune donnée n'est modifiée ni supprimée.
alter table public.parametres add column if not exists wave_marchand text check (length(wave_marchand) <= 60);
-- Adresse imprimée dans les QR : celle du site en ligne. L'ancienne adresse
-- provisoire (akwaba.ci) est remplacée, ainsi que les liens des maisons déjà
-- créées avec elle (aucun autocollant n'a été imprimé avec cette adresse).
update public.parametres set site_url = 'https://awa-songon.vercel.app' where site_url = 'https://akwaba.ci';
update public.maisons set lien_qr = 'https://awa-songon.vercel.app/m/' || qr_token where lien_qr like 'https://akwaba.ci/%';

alter table public.foyers add column if not exists code_provisoire boolean not null default false;
alter table public.foyers alter column cgv_version drop not null;
alter table public.foyers alter column cgv_acceptees_at drop not null;
alter table public.foyers add column if not exists statut_paiement text not null default 'IMPAYE' check (statut_paiement in ('PAYE', 'IMPAYE'));
alter table public.foyers add column if not exists date_paiement   timestamptz;

alter table public.livreurs add column if not exists source_id uuid references public.sources(id) on delete set null;
alter table public.livreurs add column if not exists valide boolean not null default true;
alter table public.livreurs add column if not exists statut_paiement text not null default 'IMPAYE' check (statut_paiement in ('PAYE', 'IMPAYE'));
alter table public.livreurs add column if not exists date_paiement timestamptz;
alter table public.livreurs add column if not exists total_points_utilises int not null default 0 check (total_points_utilises >= 0);
alter table public.livreurs add column if not exists dernier_bonus_at timestamptz;
alter table public.livreurs drop constraint if exists livreurs_statut_check;
alter table public.livreurs add constraint livreurs_statut_check check (statut in ('ACTIF', 'PAUSE', 'HORS_LIGNE', 'BLOQUE'));
alter table public.livreurs alter column statut set default 'HORS_LIGNE';

alter table public.commandes add column if not exists scheduled_for date not null default ((now() at time zone 'Africa/Abidjan')::date);
alter table public.commandes add column if not exists programmee_pour  timestamptz;
alter table public.commandes add column if not exists annulable_jusqua timestamptz;
alter table public.commandes add column if not exists arriving_at      timestamptz;
alter table public.commandes drop constraint if exists commandes_statut_check;
alter table public.commandes add constraint commandes_statut_check
  check (statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE', 'LIVREE', 'ANNULEE'));

alter table public.transactions_points drop constraint if exists transactions_points_type_check;
alter table public.transactions_points add constraint transactions_points_type_check
  check (type in ('RECHARGE', 'COMMANDE', 'ANNULATION', 'PERTE_CLOTURE', 'BONUS_FIDELITE'));

-- Une seule commande en cours par MAISON (donc par foyer), quelle que soit la
-- source : filet de sécurité en base. Recréés à chaque passage (la liste des
-- statuts « en cours » a changé).
drop index if exists public.commandes_une_active_par_foyer;
drop index if exists public.commandes_une_active_par_maison;
create unique index commandes_une_active_par_maison on public.commandes (maison_id)
  where statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE');
drop index if exists public.commandes_file_livreur_idx;
create index commandes_file_livreur_idx on public.commandes (livreur_id, scheduled_for, created_at)
  where statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE');

-- =============================================================================
--  2. TRIGGERS D'INTÉGRITÉ
-- =============================================================================

-- Ce qui est imprimé sur l'autocollant ne peut pas changer.
create or replace function public._maison_immuable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.cite_id <> old.cite_id or new.numero_sequentiel <> old.numero_sequentiel
     or new.code_affichage <> old.code_affichage then
    raise exception 'MAISON_IMMUABLE';
  end if;
  return new;
end $$;
drop trigger if exists maisons_immuable on public.maisons;
create trigger maisons_immuable before update on public.maisons
  for each row execute function public._maison_immuable();

-- Historique financier et journal : ni modification, ni suppression.
create or replace function public._interdit_modification()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'HISTORIQUE_NON_MODIFIABLE';
end $$;
drop trigger if exists transactions_append_only on public.transactions_points;
create trigger transactions_append_only before update or delete on public.transactions_points
  for each row execute function public._interdit_modification();
drop trigger if exists journal_append_only on public.journal_admin;
create trigger journal_append_only before update or delete on public.journal_admin
  for each row execute function public._interdit_modification();
-- Un avis donné ne se modifie pas (ni par le foyer, ni en douce côté serveur).
drop trigger if exists avis_livreurs_append_only on public.avis_livreurs;
create trigger avis_livreurs_append_only before update or delete on public.avis_livreurs
  for each row execute function public._interdit_modification();

-- Moyenne et total recalculés depuis la table (exacts, même après une
-- correction manuelle) à chaque nouvel avis.
create or replace function public._maj_note_livreur()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.livreurs l
     set note_moyenne = s.moyenne, total_avis = s.total
    from (select round(avg(note)::numeric, 2) as moyenne, count(*)::int as total
            from public.avis_livreurs where livreur_id = new.livreur_id) s
   where l.id = new.livreur_id;
  return null;
end $$;
drop trigger if exists avis_livreurs_note on public.avis_livreurs;
create trigger avis_livreurs_note after insert on public.avis_livreurs
  for each row execute function public._maj_note_livreur();

-- =============================================================================
--  3. UTILITAIRES INTERNES (jamais exposés à l'API)
-- =============================================================================

-- Jeton aléatoire cryptographique (équivalent nanoid) sur un alphabet de 32
-- caractères lisibles. 256 est un multiple de 32 : « octet & 31 » ne crée
-- aucun biais.
create or replace function public._token_aleatoire(p_longueur int default 6)
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  octets bytea := extensions.gen_random_bytes(p_longueur);
  res text := '';
begin
  for i in 0 .. p_longueur - 1 loop
    res := res || substr(alphabet, (get_byte(octets, i) & 31) + 1, 1);
  end loop;
  return res;
end $$;

create or replace function public._nouveau_qr_token()
returns text language plpgsql volatile set search_path = '' as $$
declare v text;
begin
  loop
    v := public._token_aleatoire(6);
    exit when not exists (select 1 from public.maisons where qr_token = v);
  end loop;
  return v;
end $$;

create or replace function public._nouvelle_reference_commande()
returns text language plpgsql volatile set search_path = '' as $$
declare v text;
begin
  loop
    v := public._token_aleatoire(6);
    exit when not exists (select 1 from public.commandes where reference = v);
  end loop;
  return v;
end $$;

create or replace function public._hash_jeton(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

create or replace function public._hash_code(p text)
returns text language sql volatile set search_path = '' as $$
  select extensions.crypt(p, extensions.gen_salt('bf', 10))
$$;

-- Téléphone ivoirien → forme canonique 0XXXXXXXXX (identique à src/lib/phone.ts).
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare n text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if n like '+225%' then n := substr(n, 5);
  elsif n like '00225%' then n := substr(n, 6);
  elsif n like '225%' and length(n) > 10 then n := substr(n, 4);
  end if;
  n := replace(n, '+', '');
  if length(n) = 9 and left(n, 1) <> '0' then n := '0' || n; end if;
  return n;
end $$;

-- Numéro ivoirien valide → forme canonique, sinon NULL.
create or replace function public._phone_ci(p text)
returns text language sql immutable set search_path = '' as $$
  select case when n ~ '^(01|05|07|21|25|27)[0-9]{8}$' then n end
  from (select public.normalize_phone(p) as n) x
$$;

-- Codes devinés en premier (identique à src/lib/pin.ts) + tout code contenant
-- le numéro de la maison (« 0012 » pour PROMO 012 serait trop facile).
create or replace function public._code_trop_simple(p text, p_numero int default null)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^(\d)\1{3}$'
      or position(p in '0123456789') > 0
      or position(p in '9876543210') > 0
      or p in ('1212', '2121', '1122', '1313', '2580', '0852', '6969', '0007', '1004', '2000', '1984', '1990')
      or (p_numero is not null and position(lpad(p_numero::text, 3, '0') in p) > 0)
$$;

-- IP de l'appelant (Cloudflare devant l'API Supabase pose cf-connecting-ip et
-- écrase toute valeur forgée). NULL hors requête HTTP (SQL Editor).
create or replace function public._ip()
returns text language sql stable set search_path = '' as $$
  select nullif(btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(h->>'x-forwarded-for', ',', 1))), '')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- Au moins p_max évènements pour cette clé sur la fenêtre ? (clé NULL : non)
create or replace function public._limite(p_cle text, p_max int, p_fenetre interval)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_cle is not null
     and (select count(*) from (select 1 from public.anti_abus
                                 where cle = p_cle and created_at > now() - p_fenetre
                                 limit p_max) x) >= p_max
$$;

create or replace function public._noter(p_cle text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_cle is null then return; end if;
  insert into public.anti_abus (cle) values (p_cle);
  -- Purge au fil de l'eau (évite d'avoir besoin de pg_cron).
  if random() < 0.02 then
    delete from public.anti_abus where created_at < now() - interval '2 days';
  end if;
end $$;

-- Clé anti-abus liée à l'IP (NULL si IP inconnue → pas de limite IP).
create or replace function public._cle_ip(p_type text)
returns text language sql stable set search_path = '' as $$
  select p_type || ':' || public._ip() where public._ip() is not null
$$;

-- Vérifie un code maison. Renvoie NULL si bon, sinon un code d'erreur.
-- Les échecs sont comptés (IP, maison, appareil) ; l'appelant doit RENVOYER
-- l'erreur (pas lever d'exception) pour que le comptage soit enregistré.
--   · IP : 20 échecs / 15 min (large : beaucoup d'abonnés mobiles partagent une IP)
--   · appareil connu : 5 échecs / 15 min
--   · maison : 10 échecs / 24 h → verrouillée pour les NOUVEAUX téléphones
--     seulement (un attaquant ne peut pas empêcher la famille de commander).
--     4 chiffres = 10 000 codes : à 10 essais par jour, ~3 ans en moyenne.
create or replace function public._verifier_code(p_maison uuid, p_hash text, p_code text, p_appareil uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if p_code is null or p_code !~ '^[0-9]{4}$' then return 'CODE_FORMAT'; end if;
  if public._limite(public._cle_ip('code_ip'), 20, interval '15 minutes') then return 'TROP_DE_TENTATIVES'; end if;
  if p_appareil is not null then
    if public._limite('code_appareil:' || p_appareil, 5, interval '15 minutes') then return 'TROP_DE_TENTATIVES'; end if;
  elsif public._limite('code_maison:' || p_maison, 10, interval '24 hours') then
    return 'MAISON_VERROUILLEE';
  end if;
  if p_hash is not null and extensions.crypt(p_code, p_hash) = p_hash then return null; end if;
  perform public._noter(public._cle_ip('code_ip'));
  perform public._noter('code_maison:' || p_maison);
  if p_appareil is not null then perform public._noter('code_appareil:' || p_appareil); end if;
  return 'CODE_FAUX';
end $$;

-- Crée un appareil (jeton renvoyé en clair UNE fois, stocké haché).
create or replace function public._creer_appareil(p_foyer uuid, p_utilisateur uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_jeton text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  -- Au plus 20 téléphones actifs par foyer : on retire le moins utilisé.
  update public.appareils set revoque_at = now()
   where id in (select id from public.appareils
                 where foyer_id = p_foyer and revoque_at is null
                 order by coalesce(dernier_usage, created_at) desc offset 19);
  insert into public.appareils (foyer_id, utilisateur_id, token_hash, dernier_usage)
  values (p_foyer, p_utilisateur, public._hash_jeton(v_jeton), now());
  return v_jeton;
end $$;

-- Session d'un téléphone : jeton valide, non révoqué, non expiré, foyer ACTIF,
-- et bien lié à CETTE maison (le QR scanné). Prolonge la validité (glissante).
create or replace function public._session(p_qr text, p_jeton text)
returns public.appareils language plpgsql security definer set search_path = '' as $$
declare a public.appareils;
begin
  select ap.* into a
    from public.appareils ap
    join public.foyers f  on f.id = ap.foyer_id and f.statut = 'ACTIF'
    join public.maisons m on m.id = f.maison_id
   where ap.token_hash = public._hash_jeton(p_jeton)
     and ap.revoque_at is null and ap.expire_at > now()
     and m.qr_token = upper(btrim(coalesce(p_qr, '')));
  if a.id is null then raise exception 'SESSION'; end if;
  if a.dernier_usage is null or a.dernier_usage < now() - interval '1 hour' then
    update public.appareils set dernier_usage = now(), expire_at = now() + interval '180 days' where id = a.id;
  end if;
  return a;
end $$;

-- Position dans la file d'un livreur (1 = la prochaine livrée).
create or replace function public._position_file(p_commande uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.commandes o
    join public.commandes c on c.id = p_commande
   where o.livreur_id = c.livreur_id and o.scheduled_for = c.scheduled_for
     and o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE') and o.created_at <= c.created_at
$$;

-- Ajoute un mouvement de points et met le portefeuille à jour (verrouillé).
create or replace function public._mouvement_points(p_foyer uuid, p_type text, p_montant int, p_commande uuid, p_reference text, p_admin uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_solde int;
begin
  update public.portefeuilles set solde_points = solde_points + p_montant, updated_at = now()
   where foyer_id = p_foyer
   returning solde_points into v_solde;            -- CHECK >= 0 : jamais de solde négatif
  if v_solde is null then raise exception 'PORTEFEUILLE_INTROUVABLE'; end if;
  insert into public.transactions_points (foyer_id, type, montant, solde_apres, commande_id, reference, admin_id)
  values (p_foyer, p_type, p_montant, v_solde, p_commande, p_reference, p_admin);
  return v_solde;
end $$;

-- Même chose pour le solde d'un livreur.
create or replace function public._mouvement_points_livreur(p_livreur uuid, p_type text, p_montant int, p_commande uuid, p_reference text, p_admin uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_solde int;
  v_total int;
begin
  -- total_points_utilises : +50 par commande reçue, −50 si elle est annulée
  -- (pas de bonus « gagné » avec des commandes annulées).
  update public.livreurs
     set solde_points = solde_points + p_montant,
         total_points_utilises = case p_type
           when 'COMMANDE'   then total_points_utilises - p_montant
           when 'ANNULATION' then greatest(0, total_points_utilises - p_montant)
           else total_points_utilises end
   where id = p_livreur
   returning solde_points, total_points_utilises into v_solde, v_total;   -- CHECK solde >= 0
  if v_solde is null then raise exception 'LIVREUR_INTROUVABLE'; end if;
  insert into public.transactions_points (livreur_id, type, montant, solde_apres, commande_id, reference, admin_id)
  values (p_livreur, p_type, p_montant, v_solde, p_commande, p_reference, p_admin);
  -- FIDÉLITÉ : dès 5000 points utilisés, +50 offerts et le compteur repart.
  if p_type = 'COMMANDE' and v_total >= 5000 then
    update public.livreurs
       set solde_points = solde_points + 50, total_points_utilises = total_points_utilises - 5000, dernier_bonus_at = now()
     where id = p_livreur
     returning solde_points into v_solde;
    insert into public.transactions_points (livreur_id, type, montant, solde_apres, commande_id, reference)
    values (p_livreur, 'BONUS_FIDELITE', 50, v_solde, p_commande, 'Fidélité : 5000 points utilisés');
  end if;
  return v_solde;
end $$;

-- Essai gratuit en cours ? (date de fin INCLUSE, heure d'Abidjan)
create or replace function public._en_essai()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select essai_fin >= (now() at time zone 'Africa/Abidjan')::date from public.parametres where id), false)
$$;

-- Points réellement débités par commande, au foyer et au livreur (0 pendant l'essai).
create or replace function public._cout_foyer()
returns int language sql stable security definer set search_path = '' as $$
  select case when public._en_essai() then 0 else (select cout_commande_points from public.parametres where id) end
$$;
create or replace function public._cout_livreur()
returns int language sql stable security definer set search_path = '' as $$
  select case when public._en_essai() then 0 else (select cout_livreur_points from public.parametres where id) end
$$;

-- Un livreur peut recevoir des commandes : actif, accès créé, et assez de
-- points (après l'essai). Sinon il n'apparaît pas aux clients.
-- Conditions « crédits non remboursables » pas encore acceptées par ce foyer
-- (créé pendant l'essai gratuit, ou client repris de la V2).
create or replace function public._cgv_en_attente(f public.foyers)
returns boolean language sql immutable set search_path = '' as $$
  select f.cgv_acceptees_at is null or f.cgv_version = 'REPRISE_V2'
$$;

create or replace function public._livreur_disponible(l public.livreurs)
returns boolean language sql stable security definer set search_path = '' as $$
  -- Visible des clients dans TOUS ses statuts (il ne refuse jamais), sauf
  -- bloqué, pas encore validé, sans accès, ou sans points après l'essai.
  select l.statut <> 'BLOQUE' and l.valide and l.code_hash is not null and l.solde_points >= public._cout_livreur()
$$;

-- Jour d'Abidjan (UTC+0, pas d'heure d'été).
create or replace function public._today_abj()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Abidjan')::date
$$;

-- Prochain 8h00 d'Abidjan : aujourd'hui s'il n'est pas encore 8h, sinon demain.
create or replace function public._prochain_8h()
returns timestamptz language sql stable set search_path = '' as $$
  select (case when x.t < date_trunc('day', x.t) + interval '8 hours'
               then date_trunc('day', x.t) + interval '8 hours'
               else date_trunc('day', x.t) + interval '1 day 8 hours' end) at time zone 'Africa/Abidjan'
  from (select now() at time zone 'Africa/Abidjan' as t) x
$$;

-- Distance à vol d'oiseau (Haversine), en mètres.
create or replace function public._distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

-- Code aléatoire à 4 chiffres, jamais « trop simple ».
create or replace function public._code_aleatoire(p_numero int default null)
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_code text;
  b bytea;
begin
  loop
    b := extensions.gen_random_bytes(2);
    v_code := lpad(((get_byte(b, 0) * 256 + get_byte(b, 1)) % 10000)::text, 4, '0');
    exit when not public._code_trop_simple(v_code, p_numero);
  end loop;
  return v_code;
end $$;

-- Session d'un livreur : jeton valide, non révoqué, non expiré, compte non bloqué.
-- p_code_change_requis : refuse tant que le code provisoire n'a pas été changé.
create or replace function public._session_livreur(p_jeton text, p_code_change_requis boolean default true)
returns public.livreurs language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions_livreurs;
  l public.livreurs;
begin
  select * into s from public.sessions_livreurs
   where token_hash = public._hash_jeton(p_jeton) and revoque_at is null and expire_at > now();
  if s.id is null then raise exception 'SESSION'; end if;
  select * into l from public.livreurs where id = s.livreur_id;
  if l.statut = 'BLOQUE' then raise exception 'LIVREUR_BLOQUE'; end if;
  if p_code_change_requis and l.code_provisoire then raise exception 'CODE_A_CHANGER'; end if;
  if s.dernier_usage is null or s.dernier_usage < now() - interval '1 hour' then
    update public.sessions_livreurs set dernier_usage = now(), expire_at = now() + interval '180 days' where id = s.id;
  end if;
  return l;
end $$;

-- =============================================================================
--  4. ADMIN : identité, 2FA obligatoire, journal
-- =============================================================================

-- Admin = utilisateur listé dans public.admins ET connecté avec la 2FA (aal2).
-- Un mot de passe volé seul ne suffit donc pas.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
$$;

create or replace function public._exiger_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIS'; end if;
  return auth.uid();
end $$;

create or replace function public._journal(p_action text, p_cible uuid, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.journal_admin (admin_id, action, cible_id, details) values (auth.uid(), p_action, p_cible, coalesce(p_details, '{}'::jsonb))
$$;

-- État de connexion (sans exiger la 2FA : l'interface en a besoin pour savoir
-- quoi afficher — connexion, 2FA, ou « compte non administrateur »).
create or replace function public.admin_moi()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'connecte', auth.uid() is not null,
    'est_admin', exists (select 1 from public.admins where user_id = auth.uid()),
    'aal', auth.jwt() ->> 'aal')
$$;

-- =============================================================================
--  5. RPC CLIENT (visiteurs : rôle anon) — page /m/[qr_token]
-- =============================================================================

-- Infos publiques d'une maison : AUCUN nom de famille (un passant qui scanne
-- ne doit pas apprendre qui habite là).
create or replace function public.m_maison(p_qr text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.maisons;
  v_cite text;
  p public.parametres;
begin
  -- Anti-énumération : 30 liens inconnus par IP et par heure.
  if public._limite(public._cle_ip('qr_inconnu'), 30, interval '1 hour') then
    return jsonb_build_object('erreur', 'TROP_DE_TENTATIVES');
  end if;
  select * into m from public.maisons where qr_token = upper(btrim(coalesce(p_qr, '')));
  if m.id is null then
    perform public._noter(public._cle_ip('qr_inconnu'));
    return jsonb_build_object('erreur', 'INTROUVABLE');
  end if;
  select nom into v_cite from public.cites where id = m.cite_id;
  select * into p from public.parametres where id;
  return jsonb_build_object(
    'code_affichage', m.code_affichage, 'cite', v_cite, 'statut', m.statut,
    'cgv_version', p.cgv_version, 'telephone_service', p.telephone_service,
    -- Pendant l'essai gratuit, la case « non remboursable » n'est pas demandée à l'inscription.
    'essai', public._en_essai());
end $$;

-- Création du foyer par le 1er habitant qui scanne une maison LIBRE.
create or replace function public.m_creer_foyer(
  p_qr text, p_nom_famille text, p_telephone text, p_nom text, p_role text, p_code text, p_cgv_acceptees boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_famille text := btrim(regexp_replace(coalesce(p_nom_famille, ''), '\s+', ' ', 'g'));
  v_nom     text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_tel     text := public._phone_ci(p_telephone);
  m public.maisons;
  v_foyer uuid;
  v_user uuid;
  v_cgv text;
begin
  -- Validation (exceptions : rien n'est encore écrit).
  -- Case « non remboursable » : obligatoire hors essai. Pendant l'essai, elle sera
  -- demandée à la fin de l'essai, avant la 1re commande payante.
  if not coalesce(p_cgv_acceptees, false) and not public._en_essai() then raise exception 'CGV_NON_ACCEPTEES'; end if;
  if length(v_famille) not between 2 and 60 then raise exception 'NOM_FAMILLE_INVALIDE'; end if;
  if length(v_nom) not between 1 and 40 then raise exception 'NOM_INVALIDE'; end if;
  if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  if p_role is null or p_role not in ('PAPA', 'MAMAN', 'ENFANT', 'AUTRE') then raise exception 'ROLE_INVALIDE'; end if;
  if p_code is null or p_code !~ '^[0-9]{4}$' then raise exception 'CODE_FORMAT'; end if;

  -- Anti-robot : 5 créations par IP et par heure.
  if public._limite(public._cle_ip('foyer_ip'), 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;

  select * into m from public.maisons where qr_token = upper(btrim(coalesce(p_qr, ''))) for update;
  if m.id is null then return jsonb_build_object('ok', false, 'erreur', 'INTROUVABLE'); end if;
  if public._code_trop_simple(p_code, m.numero_sequentiel) then raise exception 'CODE_TROP_SIMPLE'; end if;
  if m.statut = 'BLOQUEE' then return jsonb_build_object('ok', false, 'erreur', 'MAISON_BLOQUEE'); end if;
  if m.statut <> 'LIBRE' or exists (select 1 from public.foyers where maison_id = m.id and statut = 'ACTIF') then
    return jsonb_build_object('ok', false, 'erreur', 'DEJA_OCCUPEE');
  end if;
  perform public._noter(public._cle_ip('foyer_ip'));

  select cgv_version into v_cgv from public.parametres where id;
  insert into public.foyers (maison_id, nom_famille, telephone_principal, code_maison_hash, cgv_version, cgv_acceptees_at)
  values (m.id, v_famille, v_tel, public._hash_code(p_code),
          case when coalesce(p_cgv_acceptees, false) then v_cgv end,
          case when coalesce(p_cgv_acceptees, false) then now() end)
  returning id into v_foyer;
  insert into public.portefeuilles (foyer_id, solde_points) values (v_foyer, 0);
  insert into public.utilisateurs_foyer (foyer_id, nom, telephone, role, est_titulaire)
  values (v_foyer, v_nom, v_tel, p_role, true)
  returning id into v_user;
  update public.maisons set statut = 'OCCUPEE' where id = m.id;

  return jsonb_build_object('ok', true, 'jeton', public._creer_appareil(v_foyer, v_user));
end $$;

-- Un autre membre de la famille ouvre l'accès sur SON téléphone avec le code.
create or replace function public.m_ouvrir(p_qr text, p_code text, p_nom text, p_role text, p_telephone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_tel text := nullif(btrim(coalesce(p_telephone, '')), '');
  m public.maisons;
  f public.foyers;
  v_err text;
  v_user uuid;
begin
  if length(v_nom) not between 1 and 40 then raise exception 'NOM_INVALIDE'; end if;
  if p_role is null or p_role not in ('PAPA', 'MAMAN', 'ENFANT', 'AUTRE') then raise exception 'ROLE_INVALIDE'; end if;
  if v_tel is not null then
    v_tel := public._phone_ci(v_tel);
    if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  end if;

  select * into m from public.maisons where qr_token = upper(btrim(coalesce(p_qr, '')));
  if m.id is null then return jsonb_build_object('ok', false, 'erreur', 'INTROUVABLE'); end if;
  if m.statut = 'BLOQUEE' then return jsonb_build_object('ok', false, 'erreur', 'MAISON_BLOQUEE'); end if;
  select * into f from public.foyers where maison_id = m.id and statut = 'ACTIF' for update;
  if f.id is null then return jsonb_build_object('ok', false, 'erreur', 'MAISON_LIBRE'); end if;

  v_err := public._verifier_code(m.id, f.code_maison_hash, p_code, null);
  if v_err is not null then return jsonb_build_object('ok', false, 'erreur', v_err); end if;

  -- Même personne (même nom + rôle) sur un nouveau téléphone : on la réutilise.
  select id into v_user from public.utilisateurs_foyer
   where foyer_id = f.id and lower(nom) = lower(v_nom) and role = p_role limit 1;
  if v_user is null then
    if (select count(*) from public.utilisateurs_foyer where foyer_id = f.id) >= 15 then
      return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_MEMBRES');
    end if;
    insert into public.utilisateurs_foyer (foyer_id, nom, telephone, role)
    values (f.id, v_nom, v_tel, p_role) returning id into v_user;
  elsif v_tel is not null then
    update public.utilisateurs_foyer set telephone = v_tel where id = v_user;
  end if;

  return jsonb_build_object('ok', true, 'jeton', public._creer_appareil(f.id, v_user));
end $$;

-- Espace du foyer (téléphone reconnu) : solde, commande en cours, livreurs.
create or replace function public.m_espace(p_qr text, p_jeton text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  f public.foyers;
  m public.maisons;
  u public.utilisateurs_foyer;
  v_cmd jsonb;
begin
  select * into f from public.foyers where id = a.foyer_id;
  select * into m from public.maisons where id = f.maison_id;
  select * into u from public.utilisateurs_foyer where id = a.utilisateur_id;

  -- Commande en cours de la MAISON (y compris une saisie directe du livreur).
  select jsonb_build_object(
           'id', c.id, 'reference', c.reference, 'statut', c.statut, 'source', c.source, 'created_at', c.created_at,
           'prix_fcfa', c.prix_fcfa, 'commande_par', c.commande_par,
           'scheduled_for', c.scheduled_for, 'programmee_pour', c.programmee_pour,
           'annulable_jusqua', c.annulable_jusqua, 'arriving_at', c.arriving_at,
           'livreur_nom', l.nom, 'livreur_telephone', l.telephone, 'livreur_statut', l.statut,
           'position', case when c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE') then public._position_file(c.id) end,
           -- GPS du livreur, seulement pendant « J'arrive chez toi » (5 min max).
           'live', (select jsonb_build_object('lat', p.lat, 'long', p.long, 'maj', p.maj) from public.positions_live p
                     where p.commande_id = c.id and p.maj > now() - interval '5 minutes'))
    into v_cmd
    from public.commandes c join public.livreurs l on l.id = c.livreur_id
   where c.maison_id = m.id and c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE');

  return jsonb_build_object(
    -- Canaux temps réel (pings sans donnée) : la page se recharge à chaque changement.
    'canaux', jsonb_build_object('maison', m.id, 'cite', m.cite_id),
    'maison', jsonb_build_object('code_affichage', m.code_affichage, 'statut', m.statut, 'lat', m.lat, 'long', m.long,
                                 'cite', (select nom from public.cites where id = m.cite_id)),
    'foyer', jsonb_build_object('nom_famille', f.nom_famille,
                                'solde_points', (select solde_points from public.portefeuilles where foyer_id = f.id),
                                'doit_changer_code', f.code_provisoire,
                                -- à accepter seulement une fois l'essai gratuit terminé
                                'cgv_a_accepter', public._cgv_en_attente(f) and not public._en_essai()),
    'moi', jsonb_build_object('nom', u.nom, 'role', u.role, 'est_titulaire', u.est_titulaire),
    'commande', v_cmd,
    -- Écran « Livré ! » : dernière livraison des 6 dernières heures.
    'derniere_livraison', (
      select jsonb_build_object('id', c.id, 'reference', c.reference, 'livree_at', c.livree_at, 'livreur_nom', l.nom)
        from public.commandes c join public.livreurs l on l.id = c.livreur_id
       where c.maison_id = m.id and c.statut = 'LIVREE' and c.livree_at > now() - interval '6 hours'
       order by c.livree_at desc limit 1),
    'cout_points', public._cout_foyer(),
    'essai_fin', case when public._en_essai() then (select essai_fin from public.parametres where id) end,
    'telephone_service', (select telephone_service from public.parametres where id),
    'wave_marchand', (select wave_marchand from public.parametres where id),
    'livreurs', coalesce((
      select jsonb_agg(x order by x.ordre, x.file, x.nom) from (
        select l.id, l.nom, l.prix_fcfa, l.note_moyenne, l.statut, s.nom as source_nom,
               case l.statut when 'ACTIF' then 0 when 'PAUSE' then 1 else 2 end as ordre,
               (select count(*) from public.commandes o where o.livreur_id = l.id and o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')) as file
          from public.livreurs l left join public.sources s on s.id = l.source_id
         where l.cite_id = m.cite_id and public._livreur_disponible(l)) x), '[]'::jsonb),
    -- Dernière livraison des 7 derniers jours pas encore notée → bandeau « Note ta livraison ».
    'a_noter', (
      select jsonb_build_object('id', c.id, 'reference', c.reference, 'livreur_nom', l.nom)
        from public.commandes c join public.livreurs l on l.id = c.livreur_id
       where c.foyer_id = f.id and c.statut = 'LIVREE' and c.livree_at > now() - interval '7 days'
         and not exists (select 1 from public.avis_livreurs v where v.commande_id = c.id)
       order by c.livree_at desc limit 1),
    'historique', coalesce((
      select jsonb_agg(h order by h.created_at desc) from (
        select c.reference, c.statut, c.created_at, c.commande_par
          from public.commandes c where c.foyer_id = f.id
         order by c.created_at desc limit 5) h), '[]'::jsonb));
end $$;

-- Texte libre saisi par un client : caractères de contrôle retirés, espaces
-- normalisés, tronqué. (L'affichage React échappe déjà le HTML.)
create or replace function public._texte_libre(p text, p_max int)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), p_max), '')
$$;

-- ─── Avis livreur (page /avis/[commande_id]) ─────────────────────────────────
-- Infos de la livraison à noter : uniquement si elle appartient au foyer de ce téléphone.
create or replace function public.m_avis_commande(p_qr text, p_jeton text, p_commande uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  c public.commandes;
  v_livreur text;
begin
  select * into c from public.commandes where id = p_commande and foyer_id = a.foyer_id;
  if c.id is null then return jsonb_build_object('erreur', 'COMMANDE_INTROUVABLE'); end if;
  select nom into v_livreur from public.livreurs where id = c.livreur_id;
  return jsonb_build_object(
    'reference', c.reference, 'statut', c.statut, 'livree_at', c.livree_at, 'code_affichage', c.code_affichage,
    'livreur_nom', v_livreur,
    'deja_note', exists (select 1 from public.avis_livreurs where commande_id = c.id),
    'expire', c.livree_at is not null and c.livree_at < now() - interval '7 days');
end $$;

-- Note 1 à 5 + commentaire facultatif. Une seule fois par livraison (contrainte
-- unique), seulement par le foyer livré, seulement si LIVREE depuis moins de 7 jours.
create or replace function public.m_noter_livreur(p_qr text, p_jeton text, p_commande uuid, p_note int, p_commentaire text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  c public.commandes;
begin
  if p_note is null or p_note not between 1 and 5 then raise exception 'NOTE_INVALIDE'; end if;
  select * into c from public.commandes where id = p_commande and foyer_id = a.foyer_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'erreur', 'COMMANDE_INTROUVABLE'); end if;
  if c.statut <> 'LIVREE' then return jsonb_build_object('ok', false, 'erreur', 'PAS_ENCORE_LIVREE'); end if;
  if c.livree_at < now() - interval '7 days' then return jsonb_build_object('ok', false, 'erreur', 'AVIS_EXPIRE'); end if;
  insert into public.avis_livreurs (commande_id, livreur_id, foyer_id, utilisateur_id, note, commentaire)
  values (c.id, c.livreur_id, c.foyer_id, a.utilisateur_id, p_note, public._texte_libre(p_commentaire, 500))
  on conflict (commande_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'DEJA_NOTE'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── Avis plateforme (page /avis-plateforme) ─────────────────────────────────
create or replace function public.m_avis_plateforme(p_qr text, p_jeton text, p_note int, p_commentaire text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  v_code text;
begin
  if p_note is null or p_note not between 1 and 5 then raise exception 'NOTE_INVALIDE'; end if;
  perform 1 from public.foyers where id = a.foyer_id for update;  -- deux envois simultanés : un seul passe
  if exists (select 1 from public.avis_plateforme where foyer_id = a.foyer_id and created_at > now() - interval '7 days') then
    return jsonb_build_object('ok', false, 'erreur', 'AVIS_RECENT');
  end if;
  select m.code_affichage into v_code from public.foyers f join public.maisons m on m.id = f.maison_id where f.id = a.foyer_id;
  insert into public.avis_plateforme (foyer_id, utilisateur_id, code_affichage, note, commentaire)
  values (a.foyer_id, a.utilisateur_id, v_code, p_note, public._texte_libre(p_commentaire, 500));
  return jsonb_build_object('ok', true);
end $$;

-- Commande : le CODE MAISON est redemandé à chaque commande (règle métier).
-- Livraison TOUJOURS à la maison du foyer, quel que soit l'endroit d'où l'on commande.
drop function if exists public.m_commander(text, text, text, uuid);
create or replace function public.m_commander(p_qr text, p_jeton text, p_code text, p_livreur uuid, p_demain boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  f public.foyers;
  m public.maisons;
  u public.utilisateurs_foyer;
  l public.livreurs;
  v_err text;
  v_cout int := public._cout_foyer();          -- 0 pendant l'essai gratuit
  v_cout_l int := public._cout_livreur();      -- idem
  v_solde int;
  v_id uuid;
  v_statut text;
  v_sched date := public._today_abj();
  v_prog timestamptz;
  v_annul timestamptz;
begin
  -- Verrou sur le foyer : deux membres qui commandent en même temps sont servis l'un après l'autre.
  select * into f from public.foyers where id = a.foyer_id for update;
  select * into m from public.maisons where id = f.maison_id;
  if m.statut = 'BLOQUEE' then return jsonb_build_object('ok', false, 'erreur', 'MAISON_BLOQUEE'); end if;
  if f.code_provisoire then return jsonb_build_object('ok', false, 'erreur', 'CODE_A_CHANGER'); end if;
  if public._cgv_en_attente(f) and not public._en_essai() then return jsonb_build_object('ok', false, 'erreur', 'CGV_NON_ACCEPTEES'); end if;

  v_err := public._verifier_code(m.id, f.code_maison_hash, p_code, a.id);
  if v_err is not null then return jsonb_build_object('ok', false, 'erreur', v_err); end if;

  if exists (select 1 from public.commandes where maison_id = m.id and statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')) then
    return jsonb_build_object('ok', false, 'erreur', 'COMMANDE_EN_COURS');
  end if;

  -- Verrou sur le livreur : son solde est débité ci-dessous.
  select * into l from public.livreurs where id = p_livreur for update;
  if l.id is null or l.cite_id <> m.cite_id or not public._livreur_disponible(l) then
    return jsonb_build_object('ok', false, 'erreur', 'LIVREUR_INDISPONIBLE');
  end if;
  -- Pas de limite de distance : un livreur de la même cité livre toutes ses maisons,
  -- où que soit son forage.

  select solde_points into v_solde from public.portefeuilles where foyer_id = f.id for update;
  if v_solde < v_cout then
    return jsonb_build_object('ok', false, 'erreur', 'SOLDE_INSUFFISANT', 'solde', v_solde, 'cout', v_cout);
  end if;

  -- Aujourd'hui ou demain. Le livreur ne refuse jamais :
  --   demain → PROGRAMMEE (demain 8h) ; aujourd'hui → ACTIF : EN_ATTENTE,
  --   PAUSE : EN_PAUSE (livrée aujourd'hui), HORS_LIGNE : PROGRAMMEE (prochain 8h).
  if coalesce(p_demain, false) then
    v_statut := 'PROGRAMMEE';
    v_sched := v_sched + 1;
    v_prog := (v_sched + time '08:00') at time zone 'Africa/Abidjan';
  else
    v_statut := case l.statut when 'ACTIF' then 'EN_ATTENTE' when 'PAUSE' then 'EN_PAUSE' else 'PROGRAMMEE' end;
    if v_statut = 'PROGRAMMEE' then
      v_prog := public._prochain_8h();
      v_sched := (v_prog at time zone 'Africa/Abidjan')::date;
    end if;
  end if;
  -- Programmée pour un jour suivant : plus annulable après 18h la veille.
  if v_sched > public._today_abj() then
    v_annul := ((v_sched - 1) + time '18:00') at time zone 'Africa/Abidjan';
  end if;

  select * into u from public.utilisateurs_foyer where id = a.utilisateur_id;
  insert into public.commandes (reference, source, foyer_id, maison_id, cite_id, livreur_id, utilisateur_id, appareil_id,
                                code_affichage, nom_famille, commande_par, role_commande, telephone_contact,
                                prix_fcfa, cout_points, cout_livreur_points,
                                statut, scheduled_for, programmee_pour, annulable_jusqua)
  values (public._nouvelle_reference_commande(), 'APP', f.id, m.id, m.cite_id, l.id, u.id, a.id,
          m.code_affichage, f.nom_famille, u.nom, u.role, coalesce(u.telephone, f.telephone_principal),
          l.prix_fcfa, v_cout, v_cout_l,
          v_statut, v_sched, v_prog, v_annul)
  returning id into v_id;
  if v_cout > 0 then
    perform public._mouvement_points(f.id, 'COMMANDE', -v_cout, v_id, null, null);
  end if;
  if v_cout_l > 0 then
    perform public._mouvement_points_livreur(l.id, 'COMMANDE', -v_cout_l, v_id, null, null);
  end if;

  return jsonb_build_object('ok', true, 'commande_id', v_id, 'statut', v_statut, 'position', public._position_file(v_id));
end $$;

-- Annule une commande et recrédite ce qui avait été débité (foyer ET livreur).
-- Crédit de points, jamais de l'argent.
create or replace function public._annuler_commande(p_commande uuid, p_par text, p_admin uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.commandes;
begin
  select * into c from public.commandes where id = p_commande for update;
  update public.commandes set statut = 'ANNULEE', annulee_at = now(), annulee_par = p_par where id = c.id;
  delete from public.positions_live where commande_id = c.id;
  if c.foyer_id is not null and c.cout_points > 0 then
    perform public._mouvement_points(c.foyer_id, 'ANNULATION', c.cout_points, c.id, null, p_admin);
  end if;
  if c.cout_livreur_points > 0 then
    perform public._mouvement_points_livreur(c.livreur_id, 'ANNULATION', c.cout_livreur_points, c.id, null, p_admin);
  end if;
end $$;

-- Annulation par le foyer, tant que le livreur n'est pas parti.
create or replace function public.m_annuler(p_qr text, p_jeton text, p_commande uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  c public.commandes;
begin
  select * into c from public.commandes where id = p_commande and foyer_id = a.foyer_id for update;
  if c.id is null then raise exception 'COMMANDE_INTROUVABLE'; end if;
  -- Annulable tant que le livreur n'est pas parti, et pas après 18h la veille d'une livraison programmée.
  if c.statut not in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE') then
    return jsonb_build_object('ok', false, 'erreur', 'ANNULATION_IMPOSSIBLE');
  end if;
  if c.annulable_jusqua is not null and now() > c.annulable_jusqua then
    return jsonb_build_object('ok', false, 'erreur', 'ANNULATION_TARDIVE');
  end if;
  perform public._annuler_commande(c.id, 'CLIENT', null);
  return jsonb_build_object('ok', true);
end $$;

-- Déconnexion de CE téléphone (jeton révoqué en base).
create or replace function public.m_deconnecter(p_qr text, p_jeton text)
returns void language sql security definer set search_path = '' as $$
  update public.appareils set revoque_at = now()
   where token_hash = public._hash_jeton(p_jeton) and revoque_at is null
$$;

-- Sonde de disponibilité (/api/health) : ne lit aucune donnée.
create or replace function public.sante()
returns boolean language sql stable set search_path = '' as $$ select true $$;

-- =============================================================================
--  5 bis. RPC LIVREUR (page /livreur) — téléphone + code, jeton de session
-- =============================================================================
--  Pas d'inscription libre : seul l'admin crée un livreur et lui donne un code
--  provisoire (admin_code_livreur), à changer à la 1re connexion.

-- Connexion. Limites : 20 échecs / 15 min par IP, 5 échecs / 15 min par livreur.
-- Les téléphones déjà connectés ne sont pas touchés par ces blocages.
create or replace function public.l_connexion(p_telephone text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._phone_ci(p_telephone);
  l public.livreurs;
  v_jeton text;
begin
  if public._limite(public._cle_ip('livreur_ip'), 20, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;
  if v_tel is not null then select * into l from public.livreurs where telephone = v_tel; end if;
  if l.id is not null and public._limite('livreur_echec:' || l.id, 5, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;
  if l.id is null or l.code_hash is null or p_code is null or p_code !~ '^[0-9]{4}$'
     or extensions.crypt(p_code, l.code_hash) <> l.code_hash then
    -- Même durée de calcul que pour un vrai compte : on ne révèle pas quels numéros existent.
    if l.code_hash is null then perform extensions.crypt(coalesce(p_code, ''), extensions.gen_salt('bf', 10)); end if;
    perform public._noter(public._cle_ip('livreur_ip'));
    if l.id is not null then perform public._noter('livreur_echec:' || l.id); end if;
    return jsonb_build_object('ok', false, 'erreur', 'IDENTIFIANTS');
  end if;
  if l.statut = 'BLOQUE' then return jsonb_build_object('ok', false, 'erreur', 'LIVREUR_BLOQUE'); end if;
  v_jeton := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessions_livreurs (livreur_id, token_hash, dernier_usage) values (l.id, public._hash_jeton(v_jeton), now());
  return jsonb_build_object('ok', true, 'jeton', v_jeton, 'code_provisoire', l.code_provisoire);
end $$;

-- Changer son code (obligatoire après un code provisoire). L'ancien code est
-- redemandé ; les autres téléphones connectés sont déconnectés.
create or replace function public.l_changer_code(p_jeton text, p_ancien text, p_nouveau text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.livreurs := public._session_livreur(p_jeton, false);
begin
  if p_nouveau is null or p_nouveau !~ '^[0-9]{4}$' then raise exception 'CODE_FORMAT'; end if;
  if public._code_trop_simple(p_nouveau) then raise exception 'CODE_TROP_SIMPLE'; end if;
  if public._limite('livreur_echec:' || l.id, 5, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;
  if p_ancien is null or extensions.crypt(p_ancien, l.code_hash) <> l.code_hash then
    perform public._noter('livreur_echec:' || l.id);
    return jsonb_build_object('ok', false, 'erreur', 'CODE_FAUX');
  end if;
  if p_nouveau = p_ancien then raise exception 'CODE_IDENTIQUE'; end if;
  update public.livreurs set code_hash = public._hash_code(p_nouveau), code_provisoire = false where id = l.id;
  update public.sessions_livreurs set revoque_at = now()
   where livreur_id = l.id and revoque_at is null and token_hash <> public._hash_jeton(p_jeton);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.l_deconnecter(p_jeton text)
returns void language sql security definer set search_path = '' as $$
  update public.sessions_livreurs set revoque_at = now()
   where token_hash = public._hash_jeton(p_jeton) and revoque_at is null
$$;

-- Tableau de bord du livreur : profil, essai/points, et SA file (ordre d'arrivée).
create or replace function public.l_espace(p_jeton text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton, false);
  c public.cites;
  v_cout int := public._cout_livreur();
begin
  if l.code_provisoire then
    return jsonb_build_object('doit_changer_code', true, 'nom', l.nom);
  end if;
  select * into c from public.cites where id = l.cite_id;
  return jsonb_build_object(
    'doit_changer_code', false,
    'profil', jsonb_build_object(
      'id', l.id, 'nom', l.nom, 'telephone', l.telephone, 'cite', c.nom, 'cite_id', c.id, 'code_court', c.code_court,
      'statut', l.statut, 'valide', l.valide, 'prix_fcfa', l.prix_fcfa, 'solde_points', l.solde_points,
      'total_points_utilises', l.total_points_utilises, 'dernier_bonus_at', l.dernier_bonus_at,
      'source_nom', (select nom from public.sources where id = l.source_id),
      'note_moyenne', l.note_moyenne, 'total_avis', l.total_avis,
      'essai_fin', case when public._en_essai() then (select essai_fin from public.parametres where id) end,
      'cout_points', v_cout,
      'points_insuffisants', l.solde_points < v_cout),
    'telephone_service', (select telephone_service from public.parametres where id),
    'wave_marchand', (select wave_marchand from public.parametres where id),
    'livrees_aujourdhui', (select count(*) from public.commandes
                            where livreur_id = l.id and statut = 'LIVREE'
                              and (livree_at at time zone 'Africa/Abidjan')::date = public._today_abj()),
    'gains_aujourdhui', (select coalesce(sum(prix_fcfa), 0) from public.commandes
                          where livreur_id = l.id and statut = 'LIVREE'
                            and (livree_at at time zone 'Africa/Abidjan')::date = public._today_abj()),
    'file', coalesce((
      select jsonb_agg(x order by x.scheduled_for, x.created_at) from (
        select o.id, o.reference, o.statut, o.source, o.created_at, o.scheduled_for, o.programmee_pour, o.arriving_at,
               o.code_affichage, o.nom_famille, o.commande_par, o.role_commande, o.telephone_contact, o.note, o.prix_fcfa,
               public._position_file(o.id) as position,
               m.lat, m.long,
               (o.foyer_id is not null and f.verifie_at is null) as foyer_a_verifier
          from public.commandes o
          join public.maisons m on m.id = o.maison_id
          left join public.foyers f on f.id = o.foyer_id
         where o.livreur_id = l.id and o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')) x), '[]'::jsonb));
end $$;

-- ACTIF (visible des clients) ou PAUSE. BLOQUE reste réservé à l'admin.
create or replace function public.l_statut(p_jeton text, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.livreurs := public._session_livreur(p_jeton);
begin
  if p_statut not in ('ACTIF', 'PAUSE', 'HORS_LIGNE') then raise exception 'STATUT_INVALIDE'; end if;
  if p_statut <> 'HORS_LIGNE' and not l.valide then raise exception 'COMPTE_EN_ATTENTE'; end if;
  if p_statut <> 'HORS_LIGNE' and l.solde_points < public._cout_livreur() then raise exception 'SOLDE_INSUFFISANT_LIVREUR'; end if;
  update public.livreurs set statut = p_statut where id = l.id;
  -- REPRENDRE : les commandes en pause et celles programmées pour aujourd'hui
  -- entrent dans sa file, dans l'ordre d'arrivée.
  if p_statut = 'ACTIF' then
    update public.commandes set statut = 'EN_ATTENTE', programmee_pour = null
     where livreur_id = l.id
       and (statut = 'EN_PAUSE' or (statut = 'PROGRAMMEE' and scheduled_for <= public._today_abj()));
  end if;
end $$;

-- « Je pars livrer » (EN_ROUTE) puis « Livré » (LIVREE) — uniquement SES commandes.
create or replace function public.l_avancer(p_jeton text, p_commande uuid, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton);
  c public.commandes;
begin
  perform 1 from public.livreurs where id = l.id for update;
  select * into c from public.commandes where id = p_commande and livreur_id = l.id for update;
  if c.id is null then raise exception 'COMMANDE_INTROUVABLE'; end if;
  if p_statut = 'EN_ROUTE' and c.statut = 'EN_ATTENTE' then
    -- Une livraison à la fois, dans l'ordre de la file.
    if exists (select 1 from public.commandes where livreur_id = l.id and statut in ('EN_ROUTE', 'ARRIVE')) then
      raise exception 'DEJA_EN_COURS';
    end if;
    if exists (select 1 from public.commandes o where o.livreur_id = l.id and o.statut = 'EN_ATTENTE'
                 and (o.scheduled_for, o.created_at) < (c.scheduled_for, c.created_at)) then
      raise exception 'PAS_LE_PREMIER';
    end if;
    update public.commandes set statut = 'EN_ROUTE', en_route_at = now() where id = c.id;
  elsif p_statut = 'ARRIVE' and c.statut = 'EN_ROUTE' then
    -- « J'arrive chez toi » : ouvre 10 min de partage GPS avec le foyer.
    update public.commandes set statut = 'ARRIVE', arriving_at = now() where id = c.id;
  elsif p_statut = 'LIVREE' and c.statut in ('EN_ROUTE', 'ARRIVE') then
    update public.commandes set statut = 'LIVREE', livree_at = now() where id = c.id;
    delete from public.positions_live where livreur_id = l.id;   -- fin du partage GPS
  else
    raise exception 'TRANSITION_INVALIDE';
  end if;
end $$;

-- GPS en direct — accepté UNIQUEMENT pendant ARRIVE, dans les 10 min qui
-- suivent « J'arrive chez toi ». Dernière position dans positions_live,
-- 1 point / 2 min dans positions_historique, diffusion sur suivi:<commande>
-- (seul le foyer de cette commande l'écoute). {actif:false} = le téléphone
-- arrête le GPS.
create or replace function public.l_position(p_jeton text, p_lat double precision, p_long double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton);
  v_cmd uuid;
begin
  if p_lat is null or p_long is null or p_lat not between -90 and 90 or p_long not between -180 and 180 then
    raise exception 'POSITION_INVALIDE';
  end if;
  select c.id into v_cmd from public.commandes c
   where c.livreur_id = l.id and c.statut = 'ARRIVE' and c.arriving_at > now() - interval '10 minutes'
   limit 1;
  if v_cmd is null then
    delete from public.positions_live where livreur_id = l.id;
    return jsonb_build_object('actif', false);
  end if;
  insert into public.positions_live (livreur_id, commande_id, lat, long, maj)
  values (l.id, v_cmd, p_lat, p_long, now())
  on conflict (livreur_id) do update set commande_id = excluded.commande_id, lat = excluded.lat, long = excluded.long, maj = excluded.maj;
  if not exists (select 1 from public.positions_historique where commande_id = v_cmd and created_at > now() - interval '2 minutes') then
    insert into public.positions_historique (commande_id, livreur_id, lat, long) values (v_cmd, l.id, p_lat, p_long);
  end if;
  begin
    perform realtime.send(jsonb_build_object('lat', p_lat, 'long', p_long, 'at', now()), 'position', 'suivi:' || v_cmd, false);
  exception when others then null;   -- le foyer retombe sur le rafraîchissement
  end;
  return jsonb_build_object('actif', true);
end $$;

-- Prix de l'eau (FCFA) fixé par le livreur, modifiable à tout moment. Figé dans
-- chaque commande : un changement n'affecte pas les commandes déjà passées.
create or replace function public.l_prix(p_jeton text, p_prix int)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.livreurs := public._session_livreur(p_jeton);
begin
  if p_prix is null or p_prix not between 100 and 50000 then raise exception 'PRIX_INVALIDE'; end if;
  update public.livreurs set prix_fcfa = p_prix where id = l.id;
end $$;

-- Historique du livreur (statistiques de son espace) : 300 dernières courses.
create or replace function public.l_historique(p_jeton text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.livreurs := public._session_livreur(p_jeton);
begin
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select reference, statut, source, code_affichage, nom_famille, prix_fcfa, created_at, livree_at
        from public.commandes where livreur_id = l.id and statut in ('LIVREE', 'ANNULEE')
       order by created_at desc limit 300) x), '[]'::jsonb);
end $$;

-- « Je suis devant la maison » : enregistre la position GPS du portail si elle
-- n'est pas encore connue. Seulement pour SA commande en cours (ou livrée
-- depuis moins d'1 h) : un livreur ne peut pas déplacer une maison au hasard.
create or replace function public.l_position_maison(p_jeton text, p_commande uuid, p_lat double precision, p_long double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton);
  c public.commandes;
begin
  -- Côte d'Ivoire (large) : refuse un GPS absurde ou falsifié grossièrement.
  if p_lat is null or p_long is null or p_lat not between 4 and 11 or p_long not between -9 and -2 then
    raise exception 'POSITION_INVALIDE';
  end if;
  select * into c from public.commandes where id = p_commande and livreur_id = l.id;
  if c.id is null or not (c.statut in ('EN_ROUTE', 'ARRIVE') or (c.statut = 'LIVREE' and c.livree_at > now() - interval '1 hour')) then
    raise exception 'COMMANDE_INTROUVABLE';
  end if;
  update public.maisons set lat = p_lat, long = p_long, position_source = 'LIVREUR', position_maj = now()
   where id = c.maison_id and lat is null;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'POSITION_DEJA_CONNUE'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Sur place : « C'est bien la Famille Koffi » → foyer vérifié (anti-usurpation).
create or replace function public.l_confirmer_foyer(p_jeton text, p_commande uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton);
  c public.commandes;
begin
  select * into c from public.commandes where id = p_commande and livreur_id = l.id;
  if c.id is null or c.foyer_id is null or c.statut not in ('EN_ROUTE', 'ARRIVE', 'LIVREE') then raise exception 'COMMANDE_INTROUVABLE'; end if;
  update public.foyers set verifie_at = now(), verifie_par = 'LIVREUR'
   where id = c.foyer_id and statut = 'ACTIF' and verifie_at is null;
end $$;

-- Retrouve une maison de SA cité depuis ce que tape le livreur : « PROMO 012 »,
-- « promo12 », « 12 ». NULL si introuvable ou d'une autre cité.
create or replace function public._maison_du_livreur(l public.livreurs, p_saisie text)
returns public.maisons language plpgsql stable security definer set search_path = '' as $$
declare
  v_lettres text := upper(regexp_replace(coalesce(p_saisie, ''), '[^A-Za-z]', '', 'g'));
  v_chiffres text := regexp_replace(coalesce(p_saisie, ''), '[^0-9]', '', 'g');
  v_code text;
  m public.maisons;
begin
  select code_court into v_code from public.cites where id = l.cite_id;
  if v_chiffres = '' or length(v_chiffres) > 4 or (v_lettres <> '' and v_lettres <> v_code) then return null; end if;
  select * into m from public.maisons where cite_id = l.cite_id and numero_sequentiel = v_chiffres::int;
  return m;
end $$;

-- Aperçu avant une saisie directe : la maison existe-t-elle, a-t-elle un foyer ?
create or replace function public.l_chercher_maison(p_jeton text, p_saisie text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton);
  m public.maisons := public._maison_du_livreur(l, p_saisie);
  f public.foyers;
begin
  if m.id is null then return jsonb_build_object('erreur', 'MAISON_INTROUVABLE'); end if;
  select * into f from public.foyers where maison_id = m.id and statut = 'ACTIF';
  return jsonb_build_object('code_affichage', m.code_affichage, 'statut', m.statut, 'nom_famille', f.nom_famille,
    'commande_en_cours', exists (select 1 from public.commandes where maison_id = m.id and statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')));
end $$;

-- SAISIE DIRECTE : le livreur enregistre la commande d'une maison de sa cité
-- (client qui l'appelle, famille sans smartphone). Rien n'est débité au foyer ;
-- le livreur paie ses points (après l'essai) comme pour une commande de l'appli.
create or replace function public.l_commande_manuelle(p_jeton text, p_maison text, p_nom text, p_telephone text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.livreurs := public._session_livreur(p_jeton);
  m public.maisons;
  f public.foyers;
  v_nom text := nullif(btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g')), '');
  v_tel text := nullif(btrim(coalesce(p_telephone, '')), '');
  v_cout_l int := public._cout_livreur();
  v_id uuid;
  v_ref text := public._nouvelle_reference_commande();
begin
  if v_nom is not null and length(v_nom) > 60 then raise exception 'NOM_INVALIDE'; end if;
  if v_tel is not null then
    v_tel := public._phone_ci(v_tel);
    if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  end if;
  select * into l from public.livreurs where id = l.id for update;   -- solde débité plus bas
  if not l.valide then raise exception 'COMPTE_EN_ATTENTE'; end if;
  if l.solde_points < v_cout_l then raise exception 'SOLDE_INSUFFISANT_LIVREUR'; end if;
  if (select count(*) from public.commandes where livreur_id = l.id and source = 'LIVREUR'
       and created_at > now() - interval '24 hours') >= 60 then
    raise exception 'LIMITE_JOUR';
  end if;

  m := public._maison_du_livreur(l, p_maison);
  if m.id is null then raise exception 'MAISON_INTROUVABLE'; end if;
  perform 1 from public.maisons where id = m.id for update;            -- une seule commande en cours par maison
  if m.statut = 'BLOQUEE' then raise exception 'MAISON_BLOQUEE'; end if;
  if exists (select 1 from public.commandes where maison_id = m.id and statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')) then
    raise exception 'COMMANDE_EN_COURS';
  end if;

  select * into f from public.foyers where maison_id = m.id and statut = 'ACTIF';
  if f.id is null and (v_nom is null or length(v_nom) < 2 or v_tel is null) then
    -- Maison sans foyer inscrit : nom et numéro obligatoires pour pouvoir livrer.
    raise exception 'NOM_TEL_REQUIS';
  end if;

  insert into public.commandes (reference, source, foyer_id, maison_id, cite_id, livreur_id,
                                code_affichage, nom_famille, commande_par, telephone_contact, note,
                                prix_fcfa, cout_points, cout_livreur_points)
  values (v_ref, 'LIVREUR', f.id, m.id, m.cite_id, l.id,
          m.code_affichage, coalesce(f.nom_famille, v_nom), coalesce(v_nom, 'Appel au livreur'),
          coalesce(v_tel, f.telephone_principal), public._texte_libre(p_note, 280),
          l.prix_fcfa, 0, v_cout_l)
  returning id into v_id;
  if v_cout_l > 0 then
    perform public._mouvement_points_livreur(l.id, 'COMMANDE', -v_cout_l, v_id, 'Saisie directe', null);
  end if;
  return jsonb_build_object('ok', true, 'reference', v_ref, 'code_affichage', m.code_affichage);
end $$;

-- =============================================================================
--  6. RPC ADMIN (Supabase Auth + 2FA) — toutes commencent par _exiger_admin()
-- =============================================================================

-- ─── Paramètres ──────────────────────────────────────────────────────────────
create or replace function public.admin_parametres()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return (select to_jsonb(p) - 'id' from public.parametres p where id);
end $$;

-- p_essai_fin : dernier jour d'essai gratuit (inclus), NULL = pas d'essai.
drop function if exists public.admin_enregistrer_parametres(text, int, text);
drop function if exists public.admin_enregistrer_parametres(text, int, int, text, date);
create or replace function public.admin_enregistrer_parametres(
  p_site_url text, p_cout int, p_cout_livreur int, p_telephone_service text, p_essai_fin date, p_wave_marchand text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tel  text := nullif(btrim(coalesce(p_telephone_service, '')), '');
  v_site text := rtrim(lower(btrim(coalesce(p_site_url, ''))), '/');
  v_wave text := nullif(btrim(coalesce(p_wave_marchand, '')), '');
begin
  perform public._exiger_admin();
  if v_site !~ '^https?://[a-z0-9.-]+(:[0-9]{2,5})?$' then raise exception 'SITE_URL_INVALIDE'; end if;
  if p_cout is null or p_cout not between 0 and 100000 then raise exception 'COUT_INVALIDE'; end if;
  if p_cout_livreur is null or p_cout_livreur not between 0 and 100000 then raise exception 'COUT_INVALIDE'; end if;
  if p_essai_fin is not null and p_essai_fin > public._today_abj() + 730 then raise exception 'ESSAI_TROP_LONG'; end if;
  if v_wave is not null and length(v_wave) > 60 then raise exception 'NOM_INVALIDE'; end if;
  if v_tel is not null then
    v_tel := public._phone_ci(v_tel);
    if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  end if;
  update public.parametres
     set site_url = v_site, cout_commande_points = p_cout, cout_livreur_points = p_cout_livreur,
         telephone_service = v_tel, essai_fin = p_essai_fin, wave_marchand = v_wave, updated_at = now()
   where id;
  perform public._journal('PARAMETRES', null,
    jsonb_build_object('site_url', v_site, 'cout', p_cout, 'cout_livreur', p_cout_livreur, 'essai_fin', p_essai_fin, 'wave_marchand', v_wave));
end $$;

-- ─── Cités ───────────────────────────────────────────────────────────────────
create or replace function public.admin_cites()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'nom', c.nom, 'code_court', c.code_court, 'created_at', c.created_at,
             'maisons', (select count(*) from public.maisons where cite_id = c.id),
             'occupees', (select count(*) from public.maisons where cite_id = c.id and statut = 'OCCUPEE'),
             'bloquees', (select count(*) from public.maisons where cite_id = c.id and statut = 'BLOQUEE'),
             'livreurs', (select count(*) from public.livreurs where cite_id = c.id),
             'dernier_numero', (select max(numero_sequentiel) from public.maisons where cite_id = c.id))
           order by c.nom)
      from public.cites c), '[]'::jsonb);
end $$;

create or replace function public.admin_creer_cite(p_nom text, p_code_court text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nom  text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_code text := upper(btrim(coalesce(p_code_court, '')));
  v_id uuid;
begin
  perform public._exiger_admin();
  if length(v_nom) not between 2 and 60 then raise exception 'NOM_INVALIDE'; end if;
  if v_code !~ '^[A-Z]{2,5}$' then raise exception 'CODE_COURT_INVALIDE'; end if;
  if exists (select 1 from public.cites where lower(nom) = lower(v_nom)) then raise exception 'CITE_EXISTE'; end if;
  if exists (select 1 from public.cites where code_court = v_code) then raise exception 'CODE_COURT_PRIS'; end if;
  insert into public.cites (nom, code_court) values (v_nom, v_code) returning id into v_id;
  perform public._journal('CREER_CITE', v_id, jsonb_build_object('nom', v_nom, 'code_court', v_code));
  return v_id;
end $$;

-- Le code court est imprimé sur les autocollants : il ne change plus dès
-- qu'une maison existe.
create or replace function public.admin_modifier_cite(p_id uuid, p_nom text, p_code_court text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nom  text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_code text := upper(btrim(coalesce(p_code_court, '')));
  c public.cites;
begin
  perform public._exiger_admin();
  select * into c from public.cites where id = p_id for update;
  if c.id is null then raise exception 'CITE_INTROUVABLE'; end if;
  if length(v_nom) not between 2 and 60 then raise exception 'NOM_INVALIDE'; end if;
  if v_code !~ '^[A-Z]{2,5}$' then raise exception 'CODE_COURT_INVALIDE'; end if;
  if exists (select 1 from public.cites where lower(nom) = lower(v_nom) and id <> p_id) then raise exception 'CITE_EXISTE'; end if;
  if exists (select 1 from public.cites where code_court = v_code and id <> p_id) then raise exception 'CODE_COURT_PRIS'; end if;
  if v_code <> c.code_court and exists (select 1 from public.maisons where cite_id = p_id) then
    raise exception 'CODE_COURT_VERROUILLE';
  end if;
  update public.cites set nom = v_nom, code_court = v_code where id = p_id;
  perform public._journal('MODIFIER_CITE', p_id, jsonb_build_object('nom', v_nom, 'code_court', v_code));
end $$;

create or replace function public.admin_supprimer_cite(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  if exists (select 1 from public.maisons where cite_id = p_id) or exists (select 1 from public.livreurs where cite_id = p_id) then
    raise exception 'CITE_NON_VIDE';
  end if;
  delete from public.cites where id = p_id;
  perform public._journal('SUPPRIMER_CITE', p_id);
end $$;

-- ─── Maisons ─────────────────────────────────────────────────────────────────
-- Ligne au format export imprimeur (+ id pour l'interface).
create or replace function public._maison_export(m public.maisons)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'code_affichage', m.code_affichage, 'qr_token', m.qr_token,
                            'lien_qr', m.lien_qr, 'cite', c.nom, 'numero', m.numero_sequentiel)
  from public.cites c where c.id = m.cite_id
$$;

create or replace function public._creer_maison(p_cite uuid, p_numero int)
returns public.maisons language plpgsql security definer set search_path = '' as $$
declare
  c public.cites;
  v_token text := public._nouveau_qr_token();
  v_site text;
  m public.maisons;
begin
  select * into c from public.cites where id = p_cite;
  if c.id is null then raise exception 'CITE_INTROUVABLE'; end if;
  if p_numero is null or p_numero not between 1 and 9999 then raise exception 'NUMERO_INVALIDE'; end if;
  select site_url into v_site from public.parametres where id;
  insert into public.maisons (cite_id, numero_sequentiel, code_affichage, qr_token, lien_qr)
  values (c.id, p_numero, c.code_court || ' ' || lpad(p_numero::text, 3, '0'), v_token, v_site || '/m/' || v_token)
  returning * into m;
  return m;
end $$;

create or replace function public.admin_creer_maison_unique(p_cite uuid, p_numero int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.maisons;
begin
  perform public._exiger_admin();
  if exists (select 1 from public.maisons where cite_id = p_cite and numero_sequentiel = p_numero) then
    raise exception 'MAISON_EXISTE';
  end if;
  m := public._creer_maison(p_cite, p_numero);
  perform public._journal('CREER_MAISON', m.id, jsonb_build_object('code', m.code_affichage));
  return public._maison_export(m);
end $$;

-- Génère un lot (ex. 301 → 400). Les numéros déjà existants sont ignorés (et
-- listés) : relancer le même lot ne crée jamais de doublon.
create or replace function public.admin_generer_lot(p_cite uuid, p_debut int, p_fin int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.maisons;
  v_crees jsonb := '[]'::jsonb;
  v_ignores int[] := '{}';
begin
  perform public._exiger_admin();
  if p_debut is null or p_fin is null or p_debut < 1 or p_fin > 9999 or p_fin < p_debut then raise exception 'PLAGE_INVALIDE'; end if;
  if p_fin - p_debut + 1 > 1000 then raise exception 'LOT_TROP_GRAND'; end if;
  if not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  -- Verrou : deux générations simultanées sur la même cité s'attendent.
  perform 1 from public.cites where id = p_cite for update;
  for i in p_debut .. p_fin loop
    if exists (select 1 from public.maisons where cite_id = p_cite and numero_sequentiel = i) then
      v_ignores := v_ignores || i;
    else
      m := public._creer_maison(p_cite, i);
      v_crees := v_crees || public._maison_export(m);
    end if;
  end loop;
  perform public._journal('GENERER_LOT', p_cite,
    jsonb_build_object('debut', p_debut, 'fin', p_fin, 'crees', jsonb_array_length(v_crees), 'ignores', cardinality(v_ignores)));
  return jsonb_build_object('maisons', v_crees, 'ignores', to_jsonb(v_ignores));
end $$;

-- Export CSV / impression : par cité (+ plage) ou par liste d'ids.
create or replace function public.admin_export_maisons(p_cite uuid default null, p_debut int default null, p_fin int default null, p_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(public._maison_export(m) order by c.nom, m.numero_sequentiel)
      from public.maisons m join public.cites c on c.id = m.cite_id
     where (p_ids is null or m.id = any(p_ids))
       and (p_cite is null or m.cite_id = p_cite)
       and (p_debut is null or m.numero_sequentiel >= p_debut)
       and (p_fin is null or m.numero_sequentiel <= p_fin)), '[]'::jsonb);
end $$;

-- Liste pour l'écran Maisons (recherche : code, nom de famille, téléphone, jeton).
create or replace function public.admin_maisons(p_cite uuid default null, p_statut text default null, p_recherche text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_recherche, ''))), '');
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(x order by x.cite, x.numero) from (
      select m.id, m.code_affichage, m.numero_sequentiel as numero, m.statut, m.qr_token, m.lien_qr,
             c.id as cite_id, c.nom as cite,
             f.nom_famille, f.telephone_principal, f.verifie_at, f.date_debut, p.solde_points,
             (m.lat is not null) as a_position,
             exists (select 1 from public.commandes o where o.foyer_id = f.id and o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')) as commande_en_cours
        from public.maisons m
        join public.cites c on c.id = m.cite_id
        left join public.foyers f on f.maison_id = m.id and f.statut = 'ACTIF'
        left join public.portefeuilles p on p.foyer_id = f.id
       where (p_cite is null or m.cite_id = p_cite)
         and (p_statut is null or m.statut = p_statut)
         and (v_q is null
              or lower(m.code_affichage) like '%' || v_q || '%'
              or replace(lower(m.code_affichage), ' ', '') like '%' || replace(v_q, ' ', '') || '%'
              or lower(m.qr_token) = v_q
              or lower(f.nom_famille) like '%' || v_q || '%'
              or f.telephone_principal like '%' || public.normalize_phone(v_q) || '%')
       limit 5000) x), '[]'::jsonb);
end $$;

create or replace function public.admin_maison_detail(p_maison uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.maisons;
  f public.foyers;
begin
  perform public._exiger_admin();
  select * into m from public.maisons where id = p_maison;
  if m.id is null then raise exception 'MAISON_INTROUVABLE'; end if;
  select * into f from public.foyers where maison_id = m.id and statut = 'ACTIF';
  return jsonb_build_object(
    'maison', to_jsonb(m) || jsonb_build_object('cite', (select nom from public.cites where id = m.cite_id)),
    'essais_rates_24h', (select count(*) from public.anti_abus where cle = 'code_maison:' || m.id and created_at > now() - interval '24 hours'),
    'foyer', case when f.id is null then null else
      (to_jsonb(f) - 'code_maison_hash') || jsonb_build_object(
        'solde_points', (select solde_points from public.portefeuilles where foyer_id = f.id),
        'appareils_actifs', (select count(*) from public.appareils where foyer_id = f.id and revoque_at is null and expire_at > now()),
        'membres', coalesce((select jsonb_agg(jsonb_build_object('nom', u.nom, 'role', u.role, 'telephone', u.telephone, 'est_titulaire', u.est_titulaire) order by u.created_at)
                              from public.utilisateurs_foyer u where u.foyer_id = f.id), '[]'::jsonb),
        'transactions', coalesce((select jsonb_agg(t order by t.created_at desc) from (
                              select type, montant, solde_apres, reference, created_at from public.transactions_points
                               where foyer_id = f.id order by created_at desc limit 20) t), '[]'::jsonb))
    end,
    'commandes', coalesce((select jsonb_agg(c order by c.created_at desc) from (
        select o.reference, o.statut, o.created_at, o.nom_famille, o.commande_par, l.nom as livreur
          from public.commandes o join public.livreurs l on l.id = o.livreur_id
         where o.maison_id = m.id order by o.created_at desc limit 10) c), '[]'::jsonb),
    'archives', coalesce((select jsonb_agg(a order by a.date_debut desc) from (
        select nom_famille, telephone_principal, date_debut, date_fin, motif_fin
          from public.foyers where maison_id = m.id and statut = 'ARCHIVE') a), '[]'::jsonb));
end $$;

-- Nouveau QR (autocollant arraché, photographié, copié…) : l'ancien lien cesse
-- de fonctionner immédiatement. Les téléphones devront retaper le code.
create or replace function public.admin_regenerer_qr(p_maison uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.maisons;
  v_token text := public._nouveau_qr_token();
  v_site text;
  v_ancien text;
begin
  perform public._exiger_admin();
  select site_url into v_site from public.parametres where id;
  select qr_token into v_ancien from public.maisons where id = p_maison for update;
  if v_ancien is null then raise exception 'MAISON_INTROUVABLE'; end if;
  update public.maisons set qr_token = v_token, lien_qr = v_site || '/m/' || v_token where id = p_maison returning * into m;
  perform public._journal('REGENERER_QR', p_maison, jsonb_build_object('ancien', v_ancien, 'nouveau', v_token));
  return public._maison_export(m);
end $$;

-- Départ des occupants. Points restants PERDUS (crédits non remboursables) :
-- 1er appel sans confirmation → renvoie le solde pour l'alerte ; 2e appel avec
-- p_confirmer_perte = true → clôture. La maison redevient LIBRE, le QR reste.
create or replace function public.admin_clore_foyer(p_maison uuid, p_motif text, p_confirmer_perte boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._exiger_admin();
  v_motif text := btrim(coalesce(p_motif, ''));
  m public.maisons;
  f public.foyers;
  v_solde int;
begin
  if length(v_motif) not between 3 and 200 then raise exception 'MOTIF_INVALIDE'; end if;
  select * into m from public.maisons where id = p_maison for update;
  if m.id is null then raise exception 'MAISON_INTROUVABLE'; end if;
  select * into f from public.foyers where maison_id = m.id and statut = 'ACTIF' for update;
  if f.id is null then raise exception 'AUCUN_FOYER'; end if;
  if exists (select 1 from public.commandes where foyer_id = f.id and statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')) then
    raise exception 'COMMANDE_EN_COURS';
  end if;

  select solde_points into v_solde from public.portefeuilles where foyer_id = f.id for update;
  if v_solde > 0 and not coalesce(p_confirmer_perte, false) then
    return jsonb_build_object('ok', false, 'confirmation_requise', true, 'solde_points', v_solde);
  end if;
  if v_solde > 0 then
    perform public._mouvement_points(f.id, 'PERTE_CLOTURE', -v_solde, null, left(v_motif, 80), v_admin);
  end if;

  update public.foyers set statut = 'ARCHIVE', date_fin = now(), motif_fin = v_motif, code_maison_hash = null where id = f.id;
  update public.appareils set revoque_at = now() where foyer_id = f.id and revoque_at is null;
  update public.maisons set statut = case when statut = 'BLOQUEE' then 'BLOQUEE' else 'LIBRE' end where id = m.id;
  delete from public.anti_abus where cle = 'code_maison:' || m.id;
  perform public._journal('CLORE_FOYER', m.id,
    jsonb_build_object('foyer', f.id, 'nom_famille', f.nom_famille, 'motif', v_motif, 'points_perdus', v_solde));
  return jsonb_build_object('ok', true, 'points_perdus', v_solde);
end $$;

create or replace function public.admin_bloquer_maison(p_maison uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  update public.maisons set statut = 'BLOQUEE', motif_blocage = nullif(btrim(coalesce(p_motif, '')), '') where id = p_maison;
  if not found then raise exception 'MAISON_INTROUVABLE'; end if;
  perform public._journal('BLOQUER_MAISON', p_maison, jsonb_build_object('motif', p_motif));
end $$;

create or replace function public.admin_debloquer_maison(p_maison uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  update public.maisons m
     set statut = case when exists (select 1 from public.foyers f where f.maison_id = m.id and f.statut = 'ACTIF') then 'OCCUPEE' else 'LIBRE' end,
         motif_blocage = null
   where id = p_maison and statut = 'BLOQUEE';
  if not found then raise exception 'MAISON_NON_BLOQUEE'; end if;
  perform public._journal('DEBLOQUER_MAISON', p_maison);
end $$;

-- Remet à zéro les essais de code ratés (maison verrouillée pour les nouveaux téléphones).
create or replace function public.admin_effacer_essais(p_maison uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  delete from public.anti_abus where cle = 'code_maison:' || p_maison;
  perform public._journal('EFFACER_ESSAIS', p_maison);
end $$;

-- Recharge après paiement (Wave…) reçu par l'admin. Achat définitif.
create or replace function public.admin_recharger(p_maison uuid, p_montant int, p_reference text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._exiger_admin();
  v_foyer uuid;
  v_solde int;
begin
  if p_montant is null or p_montant not between 100 and 1000000 then raise exception 'MONTANT_INVALIDE'; end if;
  select id into v_foyer from public.foyers where maison_id = p_maison and statut = 'ACTIF';
  if v_foyer is null then raise exception 'AUCUN_FOYER'; end if;
  -- Pas de crédit non remboursable avant que la famille ait accepté les conditions.
  if exists (select 1 from public.foyers f where f.id = v_foyer and public._cgv_en_attente(f)) then
    raise exception 'CGV_FOYER_EN_ATTENTE';
  end if;
  v_solde := public._mouvement_points(v_foyer, 'RECHARGE', p_montant, null, nullif(left(btrim(coalesce(p_reference, '')), 80), ''), v_admin);
  perform public._journal('RECHARGER', p_maison, jsonb_build_object('foyer', v_foyer, 'montant', p_montant, 'reference', p_reference));
  return v_solde;
end $$;

-- Code oublié / code qui a fuité : nouveau code aléatoire, affiché UNE fois à
-- l'admin (à dicter au titulaire après vérification). Tous les téléphones sont
-- déconnectés.
create or replace function public.admin_reinitialiser_code(p_maison uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  f public.foyers;
  v_num int;
  v_code text;
begin
  perform public._exiger_admin();
  select numero_sequentiel into v_num from public.maisons where id = p_maison;
  select * into f from public.foyers where maison_id = p_maison and statut = 'ACTIF' for update;
  if f.id is null then raise exception 'AUCUN_FOYER'; end if;
  loop
    v_code := lpad(((get_byte(extensions.gen_random_bytes(2), 0) * 256 + get_byte(extensions.gen_random_bytes(2), 1)) % 10000)::text, 4, '0');
    exit when not public._code_trop_simple(v_code, v_num);
  end loop;
  update public.foyers set code_maison_hash = public._hash_code(v_code), code_provisoire = true where id = f.id;
  update public.appareils set revoque_at = now() where foyer_id = f.id and revoque_at is null;
  delete from public.anti_abus where cle = 'code_maison:' || p_maison;
  perform public._journal('REINITIALISER_CODE', p_maison, jsonb_build_object('foyer', f.id));  -- jamais le code
  return v_code;
end $$;

create or replace function public.admin_verifier_foyer(p_maison uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  update public.foyers set verifie_at = now(), verifie_par = 'ADMIN' where maison_id = p_maison and statut = 'ACTIF' and verifie_at is null;
  if not found then raise exception 'AUCUN_FOYER'; end if;
  perform public._journal('VERIFIER_FOYER', p_maison);
end $$;

-- Suppression : seulement une maison qui n'a JAMAIS eu de foyer (erreur de
-- saisie). Sinon, l'historique doit rester : bloquer plutôt que supprimer.
create or replace function public.admin_supprimer_maison(p_maison uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  perform public._exiger_admin();
  if exists (select 1 from public.foyers where maison_id = p_maison) then raise exception 'MAISON_A_HISTORIQUE'; end if;
  delete from public.maisons where id = p_maison returning code_affichage into v_code;
  if v_code is null then raise exception 'MAISON_INTROUVABLE'; end if;
  perform public._journal('SUPPRIMER_MAISON', p_maison, jsonb_build_object('code', v_code));
end $$;

-- ─── Livreurs ────────────────────────────────────────────────────────────────
create or replace function public.admin_livreurs()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom, 'telephone', l.telephone, 'prix_fcfa', l.prix_fcfa,
             'statut', l.statut, 'cite_id', l.cite_id, 'cite', c.nom, 'source_id', l.source_id, 'source_nom', s.nom,
             'valide', l.valide, 'statut_paiement', l.statut_paiement, 'date_paiement', l.date_paiement,
             'solde_points', l.solde_points, 'total_points_utilises', l.total_points_utilises,
             'acces', l.code_hash is not null, 'code_provisoire', l.code_provisoire,
             'disponible', public._livreur_disponible(l),
             'note_moyenne', l.note_moyenne, 'total_avis', l.total_avis,
             'alerte_note', l.note_moyenne is not null and l.note_moyenne < 3,
             'file', (select count(*) from public.commandes o where o.livreur_id = l.id and o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')))
           order by l.valide, c.nom, l.nom)          -- à valider en tête
      from public.livreurs l join public.cites c on c.id = l.cite_id
      left join public.sources s on s.id = l.source_id), '[]'::jsonb);
end $$;

-- p_id NULL = création, sinon modification.
drop function if exists public.admin_enregistrer_livreur(uuid, uuid, text, text, int);
create or replace function public.admin_enregistrer_livreur(p_id uuid, p_cite uuid, p_nom text, p_telephone text, p_prix int, p_source uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_tel text := public._phone_ci(p_telephone);
  v_id uuid := p_id;
begin
  perform public._exiger_admin();
  if length(v_nom) not between 2 and 40 then raise exception 'NOM_INVALIDE'; end if;
  if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  if p_prix is null or p_prix not between 100 and 50000 then raise exception 'PRIX_INVALIDE'; end if;
  if not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if p_source is not null and not exists (select 1 from public.sources where id = p_source and cite_id = p_cite) then
    raise exception 'SOURCE_INTROUVABLE';
  end if;
  if exists (select 1 from public.livreurs where telephone = v_tel and id is distinct from p_id) then raise exception 'TELEPHONE_PRIS'; end if;
  if p_id is null then
    insert into public.livreurs (cite_id, nom, telephone, prix_fcfa, source_id) values (p_cite, v_nom, v_tel, p_prix, p_source) returning id into v_id;
  else
    update public.livreurs set cite_id = p_cite, nom = v_nom, telephone = v_tel, prix_fcfa = p_prix, source_id = p_source where id = p_id;
    if not found then raise exception 'LIVREUR_INTROUVABLE'; end if;
  end if;
  perform public._journal(case when p_id is null then 'CREER_LIVREUR' else 'MODIFIER_LIVREUR' end, v_id,
                          jsonb_build_object('nom', v_nom, 'prix', p_prix));
  return v_id;
end $$;

-- Code d'accès du livreur (création ou oubli) : affiché UNE fois à l'admin,
-- provisoire (à changer à la 1re connexion). Ses téléphones sont déconnectés.
create or replace function public.admin_code_livreur(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text := public._code_aleatoire();
begin
  perform public._exiger_admin();
  update public.livreurs set code_hash = public._hash_code(v_code), code_provisoire = true where id = p_id;
  if not found then raise exception 'LIVREUR_INTROUVABLE'; end if;
  update public.sessions_livreurs set revoque_at = now() where livreur_id = p_id and revoque_at is null;
  delete from public.anti_abus where cle = 'livreur_echec:' || p_id;
  perform public._journal('CODE_LIVREUR', p_id);   -- jamais le code lui-même
  return v_code;
end $$;

-- Recharge du livreur après paiement (Wave…). Achat définitif.
create or replace function public.admin_recharger_livreur(p_id uuid, p_montant int, p_reference text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._exiger_admin();
  v_solde int;
begin
  if p_montant is null or p_montant not between 50 and 1000000 then raise exception 'MONTANT_INVALIDE'; end if;
  v_solde := public._mouvement_points_livreur(p_id, 'RECHARGE', p_montant, null, nullif(left(btrim(coalesce(p_reference, '')), 80), ''), v_admin);
  perform public._journal('RECHARGER_LIVREUR', p_id, jsonb_build_object('montant', p_montant, 'reference', p_reference));
  return v_solde;
end $$;

-- MODE POSE : l'admin scanne l'autocollant qu'il vient de coller (page
-- /m/<jeton>) et enregistre la position GPS du portail. Remplace toute
-- position existante (la pose fait foi).
create or replace function public.admin_poser_maison(p_qr text, p_lat double precision, p_long double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.maisons;
begin
  perform public._exiger_admin();
  if p_lat is null or p_long is null or p_lat not between 4 and 11 or p_long not between -9 and -2 then
    raise exception 'POSITION_INVALIDE';
  end if;
  update public.maisons set lat = p_lat, long = p_long, position_source = 'POSE', position_maj = now()
   where qr_token = upper(btrim(coalesce(p_qr, ''))) returning * into m;
  if m.id is null then raise exception 'MAISON_INTROUVABLE'; end if;
  perform public._journal('POSER_MAISON', m.id, jsonb_build_object('lat', p_lat, 'long', p_long));
  return jsonb_build_object('code_affichage', m.code_affichage);
end $$;

-- Efface une position fausse : le livreur pourra la relever à la prochaine livraison.
create or replace function public.admin_effacer_position(p_maison uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  update public.maisons set lat = null, long = null, position_source = null, position_maj = null where id = p_maison;
  if not found then raise exception 'MAISON_INTROUVABLE'; end if;
  perform public._journal('EFFACER_POSITION', p_maison);
end $$;

create or replace function public.admin_statut_livreur(p_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  if p_statut not in ('ACTIF', 'PAUSE', 'HORS_LIGNE', 'BLOQUE') then raise exception 'STATUT_INVALIDE'; end if;
  update public.livreurs set statut = p_statut where id = p_id;
  if not found then raise exception 'LIVREUR_INTROUVABLE'; end if;
  perform public._journal('STATUT_LIVREUR', p_id, jsonb_build_object('statut', p_statut));
end $$;

-- ─── Avis ────────────────────────────────────────────────────────────────────
-- Avis livreurs récents (tous, ou ceux d'un livreur).
create or replace function public.admin_avis_livreurs(p_livreur uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select v.id, v.note, v.commentaire, v.created_at, l.id as livreur_id, l.nom as livreur,
             o.reference, o.code_affichage, o.nom_famille, u.nom as auteur
        from public.avis_livreurs v
        join public.livreurs l on l.id = v.livreur_id
        join public.commandes o on o.id = v.commande_id
        left join public.utilisateurs_foyer u on u.id = v.utilisateur_id
       where p_livreur is null or v.livreur_id = p_livreur
       order by v.created_at desc limit 200) x), '[]'::jsonb);
end $$;

create or replace function public.admin_avis_plateforme()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return jsonb_build_object(
    'moyenne', (select round(avg(note)::numeric, 2) from public.avis_plateforme),
    'total', (select count(*) from public.avis_plateforme),
    'repartition', (select jsonb_object_agg(n, (select count(*) from public.avis_plateforme where note = n))
                      from generate_series(1, 5) n),
    'avis', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select v.id, v.note, v.commentaire, v.created_at, v.code_affichage, f.nom_famille, u.nom as auteur
          from public.avis_plateforme v
          join public.foyers f on f.id = v.foyer_id
          left join public.utilisateurs_foyer u on u.id = v.utilisateur_id
         order by v.created_at desc limit 300) x), '[]'::jsonb));
end $$;

-- ─── Commandes ───────────────────────────────────────────────────────────────
-- p_actives = true : file en cours (ordre d'arrivée) ; false : 300 dernières.
create or replace function public.admin_commandes(p_actives boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(x order by case when p_actives then x.created_at end asc, x.created_at desc) from (
      select o.id, o.reference, o.statut, o.created_at, o.en_route_at, o.livree_at, o.code_affichage, o.nom_famille,
             o.commande_par, o.role_commande, o.telephone_contact, o.prix_fcfa, o.cout_points, o.source, o.note,
             l.nom as livreur, c.nom as cite,
             o.scheduled_for, o.programmee_pour,
             case when o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE') then public._position_file(o.id) end as position
        from public.commandes o
        join public.livreurs l on l.id = o.livreur_id
        join public.cites c on c.id = o.cite_id
       where (not p_actives or o.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE'))
       order by o.created_at desc
       limit 300) x), '[]'::jsonb);
end $$;

-- EN_ATTENTE → EN_ROUTE → LIVREE ; annulation tant que non livrée (points recrédités).
create or replace function public.admin_commande_statut(p_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._exiger_admin();
  c public.commandes;
begin
  select * into c from public.commandes where id = p_id for update;
  if c.id is null then raise exception 'COMMANDE_INTROUVABLE'; end if;
  if p_statut = 'EN_ROUTE' and c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE') then
    update public.commandes set statut = 'EN_ROUTE', en_route_at = now(), programmee_pour = null where id = p_id;
  elsif p_statut = 'LIVREE' and c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE') then
    update public.commandes set statut = 'LIVREE', livree_at = now(), en_route_at = coalesce(en_route_at, now()) where id = p_id;
    delete from public.positions_live where commande_id = p_id;
  elsif p_statut = 'ANNULEE' and c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE') then
    perform public._annuler_commande(p_id, 'ADMIN', v_admin);
  else
    raise exception 'TRANSITION_INVALIDE';
  end if;
  perform public._journal('STATUT_COMMANDE', p_id, jsonb_build_object('de', c.statut, 'vers', p_statut));
end $$;

-- =============================================================================
--  6 bis. FONCTIONNALITÉS V2 RÉINTÉGRÉES
-- =============================================================================

-- ─── Connexion unique /login : téléphone + code (familles ET livreurs) ──────
-- Essaie le compte livreur de ce numéro, puis les foyers où ce numéro est
-- inscrit (titulaire ou membre) avec leur CODE MAISON. Un client V2 pas encore
-- rattaché à une maison reçoit COMPTE_V2_EN_ATTENTE. Mêmes protections que le
-- reste : limites par IP, par livreur, par maison ; un numéro inconnu reçoit
-- la même réponse qu'un code faux.
create or replace function public.auth_connexion(p_telephone text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._phone_ci(p_telephone);
  l public.livreurs;
  r record;
  v_err text;
  v_jeton text;
  v_v2_id uuid;
  v_v2_hash text;
begin
  if public._limite(public._cle_ip('connexion_ip'), 30, interval '15 minutes') then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;
  if v_tel is null or p_code is null or p_code !~ '^[0-9]{4}$' then
    perform public._noter(public._cle_ip('connexion_ip'));
    return jsonb_build_object('ok', false, 'erreur', 'IDENTIFIANTS');
  end if;

  -- 1. Livreur
  select * into l from public.livreurs where telephone = v_tel;
  if l.id is not null and l.code_hash is not null
     and not public._limite('livreur_echec:' || l.id, 5, interval '15 minutes')
     and extensions.crypt(p_code, l.code_hash) = l.code_hash then
    if l.statut = 'BLOQUE' then return jsonb_build_object('ok', false, 'erreur', 'LIVREUR_BLOQUE'); end if;
    v_jeton := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.sessions_livreurs (livreur_id, token_hash, dernier_usage) values (l.id, public._hash_jeton(v_jeton), now());
    return jsonb_build_object('ok', true, 'role', 'livreur', 'jeton', v_jeton, 'code_provisoire', l.code_provisoire);
  end if;

  -- 2. Foyers où ce numéro est inscrit
  for r in
    select distinct on (f.id) f.id as foyer_id, f.code_maison_hash, m.id as maison_id, m.qr_token, m.code_affichage,
           m.statut as maison_statut, u.id as utilisateur_id
      from public.utilisateurs_foyer u
      join public.foyers f on f.id = u.foyer_id and f.statut = 'ACTIF'
      join public.maisons m on m.id = f.maison_id
     where u.telephone = v_tel
     order by f.id, u.est_titulaire desc, u.created_at
  loop
    v_err := public._verifier_code(r.maison_id, r.code_maison_hash, p_code, null);
    if v_err is null then
      if r.maison_statut = 'BLOQUEE' then return jsonb_build_object('ok', false, 'erreur', 'MAISON_BLOQUEE'); end if;
      return jsonb_build_object('ok', true, 'role', 'foyer', 'qr', r.qr_token, 'code_affichage', r.code_affichage,
                                'jeton', public._creer_appareil(r.foyer_id, r.utilisateur_id));
    elsif v_err = 'TROP_DE_TENTATIVES' then
      return jsonb_build_object('ok', false, 'erreur', v_err);
    end if;
  end loop;

  -- 3. Client V2 (porte-à-porte) pas encore rattaché à une maison
  if to_regclass('archive_v2.clients') is not null then
    execute 'select c.id, c.pin_hash from archive_v2.clients c
              where c.telephone = $1 and not coalesce(c.is_temporary, false)
                and not exists (select 1 from public.reprise_v2 r where r.client_v2_id = c.id)
              limit 1'
       into v_v2_id, v_v2_hash using v_tel;
    if v_v2_id is not null and v_v2_hash like '$2%' and extensions.crypt(p_code, v_v2_hash) = v_v2_hash then
      return jsonb_build_object('ok', false, 'erreur', 'COMPTE_V2_EN_ATTENTE');
    end if;
  end if;

  perform public._noter(public._cle_ip('connexion_ip'));
  if l.id is not null then perform public._noter('livreur_echec:' || l.id); end if;
  return jsonb_build_object('ok', false, 'erreur', 'IDENTIFIANTS');
end $$;

-- ─── Foyer : changer le code maison, conditions, historique, consommation ──

-- Changer le code maison (obligatoire après un code donné par l'admin).
-- Les téléphones déjà connectés le restent ; le nouveau code sert aux commandes.
create or replace function public.m_changer_code(p_qr text, p_jeton text, p_ancien text, p_nouveau text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appareils := public._session(p_qr, p_jeton);
  f public.foyers;
  m public.maisons;
  v_err text;
begin
  select * into f from public.foyers where id = a.foyer_id for update;
  select * into m from public.maisons where id = f.maison_id;
  if p_nouveau is null or p_nouveau !~ '^[0-9]{4}$' then raise exception 'CODE_FORMAT'; end if;
  if public._code_trop_simple(p_nouveau, m.numero_sequentiel) then raise exception 'CODE_TROP_SIMPLE'; end if;
  v_err := public._verifier_code(m.id, f.code_maison_hash, p_ancien, a.id);
  if v_err is not null then return jsonb_build_object('ok', false, 'erreur', v_err); end if;
  if p_nouveau = p_ancien then raise exception 'CODE_IDENTIQUE'; end if;
  update public.foyers set code_maison_hash = public._hash_code(p_nouveau), code_provisoire = false where id = f.id;
  return jsonb_build_object('ok', true);
end $$;

-- Clause « crédits non remboursables » acceptée à la fin de l'essai gratuit (foyers
-- créés pendant l'essai, clients repris de la V2) : avant, aucune commande payante.
create or replace function public.m_accepter_cgv(p_qr text, p_jeton text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appareils := public._session(p_qr, p_jeton);
begin
  update public.foyers set cgv_version = (select cgv_version from public.parametres where id), cgv_acceptees_at = now()
   where id = a.foyer_id and (cgv_acceptees_at is null or cgv_version = 'REPRISE_V2');
end $$;

create or replace function public.m_historique(p_qr text, p_jeton text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.appareils := public._session(p_qr, p_jeton);
begin
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select c.id, c.reference, c.statut, c.created_at, c.livree_at, c.commande_par, c.prix_fcfa, l.nom as livreur
        from public.commandes c join public.livreurs l on l.id = c.livreur_id
       where c.maison_id = (select maison_id from public.foyers where id = a.foyer_id)
         and c.created_at >= (select date_debut from public.foyers where id = a.foyer_id)
       order by c.created_at desc limit 100) x), '[]'::jsonb);
end $$;

-- Consommation par mois (12 derniers mois) : livraisons et dépense en eau.
create or replace function public.m_consommation(p_qr text, p_jeton text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.appareils := public._session(p_qr, p_jeton);
begin
  return coalesce((
    select jsonb_agg(x order by x.mois) from (
      select to_char(date_trunc('month', c.livree_at at time zone 'Africa/Abidjan'), 'YYYY-MM') as mois,
             count(*)::int as livraisons, sum(c.prix_fcfa)::int as total_fcfa
        from public.commandes c
       where c.foyer_id = a.foyer_id and c.statut = 'LIVREE' and c.livree_at > now() - interval '12 months'
       group by 1) x), '[]'::jsonb);
end $$;

-- ─── Suivi partageable /suivi/<id> (sans compte) ─────────────────────────────
-- L'identifiant de commande (uuid aléatoire) sert de clé : seul celui qui a le
-- lien voit le suivi. Aucune donnée du foyer (ni nom, ni téléphone).
create or replace function public.suivi_commande(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'reference', c.reference, 'statut', c.statut, 'code_affichage', c.code_affichage,
           'created_at', c.created_at, 'scheduled_for', c.scheduled_for, 'programmee_pour', c.programmee_pour,
           'arriving_at', c.arriving_at, 'livree_at', c.livree_at,
           'livreur_nom', l.nom, 'livreur_telephone', l.telephone, 'livreur_statut', l.statut,
           'position', case when c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE') then public._position_file(c.id) end,
           'maison', case when m.lat is not null then jsonb_build_object('lat', m.lat, 'long', m.long) end,
           'live', (select jsonb_build_object('lat', p.lat, 'long', p.long, 'maj', p.maj) from public.positions_live p
                     where p.commande_id = c.id and p.maj > now() - interval '5 minutes'))
    from public.commandes c
    join public.livreurs l on l.id = c.livreur_id
    join public.maisons m on m.id = c.maison_id
   where c.id = p_id
     and (c.statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')
          or coalesce(c.livree_at, c.annulee_at, c.created_at) > now() - interval '1 day')
$$;

-- Infos publiques de la vitrine (contact, essai en cours, tarifs) : aucune donnée personnelle.
create or replace function public.public_infos()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'telephone_service', p.telephone_service,
    'essai_fin', case when public._en_essai() then p.essai_fin end,
    'cout_commande_points', p.cout_commande_points,
    'cout_livreur_points', p.cout_livreur_points)
  from public.parametres p where p.id
$$;

-- ─── Recrutement des livreurs (lien secret) ──────────────────────────────────

-- Cités et forages pour le formulaire de recrutement (aucune donnée personnelle).
create or replace function public.public_cites()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cites', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom) order by nom) from public.cites), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'cite_id', cite_id) order by nom) from public.sources), '[]'::jsonb))
$$;

-- Inscription d'un livreur recruté : compte INVISIBLE tant que l'admin ne l'a
-- pas validé (admin_valider_livreur). Anti-robot : 5 / h par IP, 50 / h au total.
create or replace function public.l_inscription(p_nom text, p_telephone text, p_cite uuid, p_source uuid, p_code text, p_prix int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_tel text := public._phone_ci(p_telephone);
  v_id uuid;
  v_jeton text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if length(v_nom) not between 2 and 40 then raise exception 'NOM_INVALIDE'; end if;
  if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  if p_code is null or p_code !~ '^[0-9]{4}$' then raise exception 'CODE_FORMAT'; end if;
  if public._code_trop_simple(p_code) then raise exception 'CODE_TROP_SIMPLE'; end if;
  if p_prix is null or p_prix not between 100 and 50000 then raise exception 'PRIX_INVALIDE'; end if;
  if p_cite is null or not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if p_source is not null and not exists (select 1 from public.sources where id = p_source and cite_id = p_cite) then
    raise exception 'SOURCE_INTROUVABLE';
  end if;
  if public._limite(public._cle_ip('inscription_livreur'), 5, interval '1 hour')
     or (select count(*) from public.livreurs where created_at > now() - interval '1 hour') >= 50 then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;
  perform public._noter(public._cle_ip('inscription_livreur'));
  if exists (select 1 from public.livreurs where telephone = v_tel) then
    return jsonb_build_object('ok', false, 'erreur', 'DEJA_INSCRIT');
  end if;
  insert into public.livreurs (cite_id, nom, telephone, prix_fcfa, source_id, valide, code_hash, code_provisoire, statut)
  values (p_cite, v_nom, v_tel, p_prix, p_source, false, public._hash_code(p_code), false, 'HORS_LIGNE')
  returning id into v_id;
  insert into public.sessions_livreurs (livreur_id, token_hash, dernier_usage) values (v_id, public._hash_jeton(v_jeton), now());
  return jsonb_build_object('ok', true, 'jeton', v_jeton);
end $$;

-- ─── Admin : dashboard, forages, validation, paiements, reprise V2 ──────────

-- Cockpit : compteurs du jour + carte (positions des livreurs : GPS en direct,
-- sinon la maison qu'il livre, sinon son forage).
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_jour date := public._today_abj();
begin
  perform public._exiger_admin();
  return jsonb_build_object(
    'maisons', (select count(*) from public.maisons),
    'foyers', (select count(*) from public.foyers where statut = 'ACTIF'),
    'livreurs', (select count(*) from public.livreurs where valide and statut <> 'BLOQUE'),
    'livreurs_actifs', (select count(*) from public.livreurs where statut = 'ACTIF'),
    'livreurs_a_valider', (select count(*) from public.livreurs where not valide),
    'foyers_a_verifier', (select count(*) from public.foyers where statut = 'ACTIF' and verifie_at is null),
    'commandes_jour', (select count(*) from public.commandes where (created_at at time zone 'Africa/Abidjan')::date = v_jour),
    'livrees_jour', (select count(*) from public.commandes where statut = 'LIVREE' and (livree_at at time zone 'Africa/Abidjan')::date = v_jour),
    'en_cours', (select count(*) from public.commandes where statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')),
    'ca_jour', (select coalesce(sum(prix_fcfa), 0) from public.commandes where statut = 'LIVREE' and (livree_at at time zone 'Africa/Abidjan')::date = v_jour),
    'essai_fin', case when public._en_essai() then (select essai_fin from public.parametres where id) end,
    'carte_livreurs', coalesce((
      select jsonb_agg(x) from (
        select l.id, l.nom, l.statut, pos.lat, pos.long, pos.origine
          from public.livreurs l
          cross join lateral (
            select p.lat, p.long, 'GPS' as origine from public.positions_live p
             where p.livreur_id = l.id and p.maj > now() - interval '5 minutes'
            union all
            select m.lat, m.long, 'LIVRAISON' from public.commandes c join public.maisons m on m.id = c.maison_id
             where c.livreur_id = l.id and c.statut in ('EN_ROUTE', 'ARRIVE') and m.lat is not null
            union all
            select s.lat, s.long, 'FORAGE' from public.sources s where s.id = l.source_id and s.lat is not null
            limit 1) pos
         where l.valide and l.statut <> 'BLOQUE') x), '[]'::jsonb),
    'carte_maisons', coalesce((
      select jsonb_agg(jsonb_build_object('code', code_affichage, 'lat', lat, 'long', long, 'statut', statut))
        from (select * from public.maisons where lat is not null limit 3000) m), '[]'::jsonb));
end $$;

create or replace function public.admin_sources()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'cite_id', s.cite_id, 'cite', c.nom, 'lat', s.lat, 'long', s.long,
             'livreurs', (select count(*) from public.livreurs where source_id = s.id))
           order by c.nom, s.nom)
      from public.sources s join public.cites c on c.id = s.cite_id), '[]'::jsonb);
end $$;

-- p_id NULL = création. La position est facultative.
create or replace function public.admin_enregistrer_source(p_id uuid, p_cite uuid, p_nom text, p_lat double precision, p_long double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_id uuid := p_id;
begin
  perform public._exiger_admin();
  if length(v_nom) not between 2 and 60 then raise exception 'NOM_INVALIDE'; end if;
  if not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if (p_lat is null) <> (p_long is null) or (p_lat is not null and (p_lat not between 4 and 11 or p_long not between -9 and -2)) then
    raise exception 'POSITION_INVALIDE';
  end if;
  if p_id is null then
    insert into public.sources (nom, cite_id, lat, long) values (v_nom, p_cite, p_lat, p_long) returning id into v_id;
  else
    update public.sources set nom = v_nom, cite_id = p_cite, lat = p_lat, long = p_long where id = p_id;
    if not found then raise exception 'SOURCE_INTROUVABLE'; end if;
    -- Un livreur garde un forage de SA cité.
    update public.livreurs set source_id = null where source_id = p_id and cite_id <> p_cite;
  end if;
  perform public._journal(case when p_id is null then 'CREER_FORAGE' else 'MODIFIER_FORAGE' end, v_id, jsonb_build_object('nom', v_nom));
  return v_id;
end $$;

create or replace function public.admin_supprimer_source(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  delete from public.sources where id = p_id;          -- les livreurs concernés passent « sans forage »
  if not found then raise exception 'SOURCE_INTROUVABLE'; end if;
  perform public._journal('SUPPRIMER_FORAGE', p_id);
end $$;

create or replace function public.admin_valider_livreur(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  update public.livreurs set valide = true where id = p_id and not valide;
  if not found then raise exception 'LIVREUR_INTROUVABLE'; end if;
  perform public._journal('VALIDER_LIVREUR', p_id);
end $$;

-- Statut de paiement PAYE / IMPAYE (géré uniquement par l'admin).
-- p_type FOYER : p_id = id de la MAISON (foyer actif) · LIVREUR : id du livreur.
create or replace function public.admin_paiement(p_type text, p_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exiger_admin();
  if p_statut not in ('PAYE', 'IMPAYE') then raise exception 'STATUT_INVALIDE'; end if;
  if p_type = 'FOYER' then
    update public.foyers set statut_paiement = p_statut, date_paiement = case when p_statut = 'PAYE' then now() end
     where maison_id = p_id and statut = 'ACTIF';
  elsif p_type = 'LIVREUR' then
    update public.livreurs set statut_paiement = p_statut, date_paiement = case when p_statut = 'PAYE' then now() end
     where id = p_id;
  else
    raise exception 'STATUT_INVALIDE';
  end if;
  if not found then raise exception 'INTROUVABLE'; end if;
  perform public._journal('PAIEMENT_' || p_type, p_id, jsonb_build_object('statut', p_statut));
end $$;

-- Clients V2 (porte-à-porte) pas encore rattachés à une maison.
create or replace function public.admin_clients_v2()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public._exiger_admin();
  if to_regclass('archive_v2.clients') is null then return '[]'::jsonb; end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nom', c.nom, 'telephone', c.telephone, 'cite', ci.nom, 'lot', c.lot_numero,
             'solde_points', c.solde_points, 'created_at', c.created_at, 'code_reutilisable', c.pin_hash like '$2%')
           order by ci.nom, c.lot_numero), '[]'::jsonb)
      from archive_v2.clients c
      left join archive_v2.cites ci on ci.id = c.cite_id
     where not coalesce(c.is_temporary, false)
       and not exists (select 1 from public.reprise_v2 r where r.client_v2_id = c.id)
  $q$ into v;
  return v;
end $$;

-- Rattache un client V2 à une maison LIBRE : il devient titulaire du foyer,
-- garde son numéro et son code (PIN V2 = code maison). Si son ancien code
-- n'est pas réutilisable, un code provisoire est créé et renvoyé UNE fois.
-- Points V2 non repris (règle V3) : l'admin recharge à la main si besoin.
create or replace function public.admin_rattacher_client_v2(p_client uuid, p_maison uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nom text;
  v_tel text;
  v_hash text;
  m public.maisons;
  v_foyer uuid;
  v_code text;
begin
  perform public._exiger_admin();
  if to_regclass('archive_v2.clients') is null then raise exception 'CLIENT_INTROUVABLE'; end if;
  if exists (select 1 from public.reprise_v2 where client_v2_id = p_client) then raise exception 'DEJA_REPRIS'; end if;
  execute 'select nom, telephone, pin_hash from archive_v2.clients where id = $1' into v_nom, v_tel, v_hash using p_client;
  if v_tel is null then raise exception 'CLIENT_INTROUVABLE'; end if;
  v_tel := public._phone_ci(v_tel);
  if v_tel is null then raise exception 'TELEPHONE_INVALIDE'; end if;
  v_nom := btrim(coalesce(v_nom, ''));
  if length(v_nom) < 2 then v_nom := 'Famille ' || v_nom; end if;

  select * into m from public.maisons where id = p_maison for update;
  if m.id is null then raise exception 'MAISON_INTROUVABLE'; end if;
  if m.statut = 'BLOQUEE' then raise exception 'MAISON_BLOQUEE'; end if;
  if m.statut <> 'LIBRE' or exists (select 1 from public.foyers where maison_id = m.id and statut = 'ACTIF') then
    raise exception 'DEJA_OCCUPEE';
  end if;

  if v_hash is null or v_hash not like '$2%' then
    v_code := public._code_aleatoire(m.numero_sequentiel);
    v_hash := public._hash_code(v_code);
  end if;
  -- cgv_version REPRISE_V2 : la clause « non remboursable » sera acceptée par
  -- le client à sa 1re visite (m_accepter_cgv) ; aucune commande avant.
  insert into public.foyers (maison_id, nom_famille, telephone_principal, code_maison_hash, code_provisoire,
                             cgv_version, cgv_acceptees_at, verifie_at, verifie_par)
  values (m.id, left(v_nom, 60), v_tel, v_hash, v_code is not null, 'REPRISE_V2', null, now(), 'ADMIN')
  returning id into v_foyer;
  insert into public.portefeuilles (foyer_id, solde_points) values (v_foyer, 0);
  insert into public.utilisateurs_foyer (foyer_id, nom, telephone, role, est_titulaire)
  values (v_foyer, left(v_nom, 40), v_tel, 'AUTRE', true);
  update public.maisons set statut = 'OCCUPEE' where id = m.id;
  insert into public.reprise_v2 (client_v2_id, foyer_id) values (p_client, v_foyer);
  perform public._journal('REPRISE_CLIENT_V2', m.id, jsonb_build_object('client_v2', p_client, 'foyer', v_foyer));
  return jsonb_build_object('ok', true, 'code_affichage', m.code_affichage, 'code_provisoire', v_code);
end $$;

-- ─── Statistiques annuelles (V2) ─────────────────────────────────────────────
-- Une seule requête pour toute la page /admin/statistiques. Mois = mois de la
-- date de commande, heure d'Abidjan. « Client » = foyer (ou la maison, pour une
-- saisie directe sans foyer inscrit).
--   ca     : frais d'appli réellement débités sur les commandes LIVRÉES
--            (foyer + livreur), moins les livraisons offertes (fidélité)
--   eau    : valeur de l'eau livrée (prix payés aux livreurs)
--   echecs : commande encore ouverte après son jour de livraison prévu
create or replace function public.admin_stats_annuelles(p_annee int, p_cite uuid default null, p_livreur uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public._exiger_admin();
  if p_annee is null or p_annee not between 2020 and 2100 then raise exception 'ANNEE_INVALIDE'; end if;
  with clients as (
    select coalesce(c.foyer_id::text, 'm:' || c.maison_id) as client, min(c.created_at) as premiere
      from public.commandes c group by 1
  ),
  base as (
    select c.*, coalesce(c.foyer_id::text, 'm:' || c.maison_id) as client, k.premiere,
           exists (select 1 from public.transactions_points t where t.commande_id = c.id and t.type = 'BONUS_FIDELITE') as bonus,
           extract(year  from c.created_at at time zone 'Africa/Abidjan')::int as an,
           extract(month from c.created_at at time zone 'Africa/Abidjan')::int as mois,
           extract(year  from k.premiere at time zone 'Africa/Abidjan')::int as an_premiere,
           extract(month from k.premiere at time zone 'Africa/Abidjan')::int as mois_premiere
      from public.commandes c
      join clients k on k.client = coalesce(c.foyer_id::text, 'm:' || c.maison_id)
     where (p_cite is null or c.cite_id = p_cite)
       and (p_livreur is null or c.livreur_id = p_livreur)
       and c.created_at >= make_timestamptz(p_annee - 1, 1, 1, 0, 0, 0, 'Africa/Abidjan')
       and c.created_at <  make_timestamptz(p_annee + 1, 1, 1, 0, 0, 0, 'Africa/Abidjan')
  ),
  cur as (select * from base where an = p_annee),
  rembs as (
    select b.mois, sum(t.montant)::int as montant, count(*)::int as nb
      from public.transactions_points t join cur b on b.id = t.commande_id
     where t.type = 'ANNULATION' and t.foyer_id is not null
     group by b.mois
  ),
  plus3 as (
    select mois, count(*)::int as nb from (select mois, client from cur group by mois, client having count(*) > 3) x group by mois
  ),
  agg as (
    select mois,
           count(*)::int as total,
           count(*) filter (where source = 'APP')::int as app,
           count(*) filter (where source = 'LIVREUR')::int as manual,
           count(*) filter (where statut = 'LIVREE')::int as livrees,
           count(*) filter (where statut = 'ANNULEE')::int as annulees,
           count(*) filter (where statut in ('EN_ATTENTE', 'EN_PAUSE', 'PROGRAMMEE', 'EN_ROUTE', 'ARRIVE')
                              and scheduled_for < public._today_abj())::int as echecs,
           coalesce(sum(cout_points + cout_livreur_points) filter (where statut = 'LIVREE'), 0)::bigint as ca_brut,
           count(*) filter (where statut = 'LIVREE' and bonus)::int as bonus,
           (coalesce(sum(cout_points + cout_livreur_points) filter (where statut = 'LIVREE'), 0)
            - 50 * count(*) filter (where statut = 'LIVREE' and bonus))::bigint as ca,
           coalesce(sum(prix_fcfa) filter (where statut = 'LIVREE'), 0)::bigint as eau,
           count(distinct client)::int as clients_uniques,
           count(distinct client) filter (where an_premiere = an and mois_premiere = mois)::int as nouveaux,
           count(distinct client) filter (where not (an_premiere = an and mois_premiere = mois))::int as recurrents,
           round(avg(extract(epoch from livree_at - created_at) / 60) filter (where statut = 'LIVREE' and livree_at is not null))::int as temps_moyen_min
      from cur group by mois
  ),
  mois_complets as (
    select m.mois,
           coalesce(a.total, 0) total, coalesce(a.app, 0) app, coalesce(a.manual, 0) manual,
           coalesce(a.livrees, 0) livrees, coalesce(a.annulees, 0) annulees, coalesce(a.echecs, 0) echecs,
           coalesce(a.ca, 0) ca, coalesce(a.ca_brut, 0) ca_brut, coalesce(a.bonus, 0) bonus, coalesce(a.eau, 0) eau,
           coalesce(a.clients_uniques, 0) clients_uniques, coalesce(a.nouveaux, 0) nouveaux, coalesce(a.recurrents, 0) recurrents,
           coalesce(p3.nb, 0) clients_plus_3, a.temps_moyen_min,
           coalesce(rb.montant, 0) remboursements_montant, coalesce(rb.nb, 0) remboursements_nb,
           (select count(*)::int from base b where b.an = p_annee - 1 and b.mois = m.mois) total_annee_precedente
      from generate_series(1, 12) m(mois)
      left join agg a on a.mois = m.mois
      left join rembs rb on rb.mois = m.mois
      left join plus3 p3 on p3.mois = m.mois
  )
  select jsonb_build_object(
    'annee', p_annee,
    'mois', (select jsonb_agg(to_jsonb(mc) order by mc.mois) from mois_complets mc),
    'synthese', jsonb_build_object(
      'clients_actifs', (select count(distinct client) from cur),
      'nouveaux', (select count(distinct client) from cur where an_premiere = p_annee),
      'clients_plus_3', (select count(*) from (select client from cur group by client having count(*) > 3) x),
      'temps_moyen_min', (select round(avg(extract(epoch from livree_at - created_at) / 60))::int from cur where statut = 'LIVREE' and livree_at is not null),
      'recharges', (select coalesce(sum(t.montant), 0) from public.transactions_points t
                     where t.type = 'RECHARGE' and extract(year from t.created_at at time zone 'Africa/Abidjan')::int = p_annee)),
    'livreurs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.livreur_id, 'nom', x.nom, 'mois', x.mois, 'livraisons', x.n)), '[]'::jsonb)
                   from (select b.livreur_id, l.nom, b.mois, count(*)::int n
                           from cur b join public.livreurs l on l.id = b.livreur_id
                          where b.statut = 'LIVREE' group by 1, 2, 3) x),
    'cites', (select coalesce(jsonb_agg(jsonb_build_object('cite_id', x.cite_id, 'cite', x.nom, 'mois', x.mois, 'total', x.n)), '[]'::jsonb)
                from (select b.cite_id, ci.nom, b.mois, count(*)::int n
                        from cur b join public.cites ci on ci.id = b.cite_id group by 1, 2, 3) x),
    'options', jsonb_build_object(
      'cites', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom) order by nom), '[]'::jsonb) from public.cites),
      'livreurs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'cite_id', cite_id) order by nom), '[]'::jsonb) from public.livreurs))
  ) into r;
  return r;
end $$;

-- ─── Tâches planifiées (pg_cron) ─────────────────────────────────────────────

-- 23h59 : les commandes EN_PAUSE non livrées passent PROGRAMMEE pour demain 8h.
create or replace function public.rollover_commandes()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.commandes
     set statut = 'PROGRAMMEE', programmee_pour = public._prochain_8h(),
         scheduled_for = (public._prochain_8h() at time zone 'Africa/Abidjan')::date
   where statut = 'EN_PAUSE';
  get diagnostics n = row_count;
  return n;
end $$;

-- 00h00 (et 8h00 en rattrapage) : les PROGRAMMEE du jour entrent dans la file —
-- EN_ATTENTE si le livreur est ACTIF, sinon EN_PAUSE (assignées quand il reprend).
create or replace function public.liberer_commandes_programmees()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.commandes c
     set statut = case when l.statut = 'ACTIF' then 'EN_ATTENTE' else 'EN_PAUSE' end, programmee_pour = null
    from public.livreurs l
   where l.id = c.livreur_id and c.statut = 'PROGRAMMEE' and c.scheduled_for <= public._today_abj();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.purger_positions_live()
returns void language sql security definer set search_path = '' as $$
  delete from public.positions_live where maj < now() - interval '5 minutes'
$$;

-- pg_cron tourne en UTC sur Supabase = heure d'Abidjan. Sans pg_cron
-- (Database → Extensions), le script passe avec un avertissement.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('eau-rollover',          '59 23 * * *', 'select public.rollover_commandes()');
  perform cron.schedule('eau-programmees-minuit', '0 0 * * *',  'select public.liberer_commandes_programmees()');
  perform cron.schedule('eau-programmees-8h',     '0 8 * * *',  'select public.liberer_commandes_programmees()');
  perform cron.schedule('eau-purge-positions',    '*/5 * * * *', 'select public.purger_positions_live()');
exception when others then
  raise warning 'pg_cron indisponible (%). Active l''extension pg_cron puis relance ce script.', sqlerrm;
end $$;

-- ─── Temps réel : pings SANS donnée, puis rechargement via RPC ───────────────
-- Canaux : livreur:<id> (sa file), maison:<id> (le foyer), cite:<id> (liste des
-- livreurs), admin. Aucune donnée ne circule : il faut un jeton pour relire.
create or replace function public._ping_commande()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'livreur:' || new.livreur_id, false);
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'maison:' || new.maison_id, false);
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'admin', false);
  exception when others then null;     -- sans Realtime, les pages se rafraîchissent seules
  end;
  return null;
end $$;
drop trigger if exists commandes_ping on public.commandes;
create trigger commandes_ping after insert or update on public.commandes
  for each row execute function public._ping_commande();

create or replace function public._ping_livreur()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'cite:' || new.cite_id, false);
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'livreur:' || new.id, false);
  exception when others then null;
  end;
  return null;
end $$;
drop trigger if exists livreurs_ping on public.livreurs;
create trigger livreurs_ping after update of statut, prix_fcfa, valide, solde_points on public.livreurs
  for each row execute function public._ping_livreur();

-- =============================================================================
--  7. RLS + DROITS — toujours en fin de script
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['parametres', 'cites', 'maisons', 'foyers', 'utilisateurs_foyer', 'appareils', 'portefeuilles',
                           'livreurs', 'commandes', 'transactions_points', 'admins', 'journal_admin', 'anti_abus',
                           'avis_livreurs', 'avis_plateforme', 'sessions_livreurs',
                           'sources', 'positions_live', 'positions_historique', 'reprise_v2']
  loop
    -- (pas de FORCE : les fonctions security definer, propriété de postgres,
    -- doivent pouvoir lire/écrire ; anon et authenticated restent soumis au RLS.)
    execute format('alter table public.%I enable row level security', t);
    -- Aucun droit direct pour les visiteurs ni les comptes connectés…
    execute format('revoke all on public.%I from anon, authenticated', t);
    -- …sauf la LECTURE pour un admin (RLS : is_admin(), donc 2FA exigée).
    execute format('drop policy if exists admin_lecture on public.%I', t);
    if t not in ('appareils', 'anti_abus', 'sessions_livreurs') then  -- jetons hachés et IP : jamais exposés, même à l'admin
      execute format('grant select on public.%I to authenticated', t);
      execute format('create policy admin_lecture on public.%I for select to authenticated using ((select public.is_admin()))', t);
    end if;
  end loop;
end $$;

-- Fonctions : tout fermé par défaut (Supabase accorde EXECUTE à anon et
-- authenticated sur toute nouvelle fonction), puis ouverture explicite.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Visiteurs (page QR) :
grant execute on function public.m_maison(text)                                            to anon, authenticated;
grant execute on function public.m_creer_foyer(text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.m_ouvrir(text, text, text, text, text)                     to anon, authenticated;
grant execute on function public.m_espace(text, text)                                       to anon, authenticated;
grant execute on function public.m_commander(text, text, text, uuid, boolean)               to anon, authenticated;
grant execute on function public.m_annuler(text, text, uuid)                                to anon, authenticated;
grant execute on function public.m_deconnecter(text, text)                                  to anon, authenticated;
grant execute on function public.m_avis_commande(text, text, uuid)                          to anon, authenticated;
grant execute on function public.m_noter_livreur(text, text, uuid, int, text)               to anon, authenticated;
grant execute on function public.m_avis_plateforme(text, text, int, text)                   to anon, authenticated;
grant execute on function public.sante()                                                    to anon, authenticated;
grant execute on function public.auth_connexion(text, text)                                 to anon, authenticated;
grant execute on function public.m_changer_code(text, text, text, text)                     to anon, authenticated;
grant execute on function public.m_accepter_cgv(text, text)                                 to anon, authenticated;
grant execute on function public.m_historique(text, text)                                   to anon, authenticated;
grant execute on function public.m_consommation(text, text)                                 to anon, authenticated;
grant execute on function public.suivi_commande(uuid)                                       to anon, authenticated;
grant execute on function public.public_cites()                                             to anon, authenticated;
grant execute on function public.public_infos()                                             to anon, authenticated;
grant execute on function public.l_inscription(text, text, uuid, uuid, text, int)           to anon, authenticated;
grant execute on function public.l_position(text, double precision, double precision)       to anon, authenticated;
grant execute on function public.l_prix(text, int)                                          to anon, authenticated;
grant execute on function public.l_historique(text)                                         to anon, authenticated;

-- Livreurs (page /livreur, jeton de session) :
grant execute on function public.l_connexion(text, text)                                    to anon, authenticated;
grant execute on function public.l_changer_code(text, text, text)                           to anon, authenticated;
grant execute on function public.l_deconnecter(text)                                        to anon, authenticated;
grant execute on function public.l_espace(text)                                             to anon, authenticated;
grant execute on function public.l_statut(text, text)                                       to anon, authenticated;
grant execute on function public.l_avancer(text, uuid, text)                                to anon, authenticated;
grant execute on function public.l_position_maison(text, uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.l_confirmer_foyer(text, uuid)                              to anon, authenticated;
grant execute on function public.l_chercher_maison(text, text)                              to anon, authenticated;
grant execute on function public.l_commande_manuelle(text, text, text, text, text)          to anon, authenticated;

-- Admin (chaque fonction revérifie is_admin() elle-même) :
grant execute on function public.is_admin()                                                 to authenticated;
grant execute on function public.admin_moi()                                                to authenticated;
grant execute on function public.admin_parametres()                                         to authenticated;
grant execute on function public.admin_enregistrer_parametres(text, int, int, text, date, text) to authenticated;
grant execute on function public.admin_cites()                                              to authenticated;
grant execute on function public.admin_creer_cite(text, text)                               to authenticated;
grant execute on function public.admin_modifier_cite(uuid, text, text)                      to authenticated;
grant execute on function public.admin_supprimer_cite(uuid)                                 to authenticated;
grant execute on function public.admin_creer_maison_unique(uuid, int)                       to authenticated;
grant execute on function public.admin_generer_lot(uuid, int, int)                          to authenticated;
grant execute on function public.admin_export_maisons(uuid, int, int, uuid[])               to authenticated;
grant execute on function public.admin_maisons(uuid, text, text)                            to authenticated;
grant execute on function public.admin_maison_detail(uuid)                                  to authenticated;
grant execute on function public.admin_regenerer_qr(uuid)                                   to authenticated;
grant execute on function public.admin_clore_foyer(uuid, text, boolean)                     to authenticated;
grant execute on function public.admin_bloquer_maison(uuid, text)                           to authenticated;
grant execute on function public.admin_debloquer_maison(uuid)                               to authenticated;
grant execute on function public.admin_effacer_essais(uuid)                                 to authenticated;
grant execute on function public.admin_recharger(uuid, int, text)                           to authenticated;
grant execute on function public.admin_reinitialiser_code(uuid)                             to authenticated;
grant execute on function public.admin_verifier_foyer(uuid)                                 to authenticated;
grant execute on function public.admin_supprimer_maison(uuid)                               to authenticated;
grant execute on function public.admin_livreurs()                                           to authenticated;
grant execute on function public.admin_enregistrer_livreur(uuid, uuid, text, text, int, uuid) to authenticated;
grant execute on function public.admin_statut_livreur(uuid, text)                           to authenticated;
grant execute on function public.admin_code_livreur(uuid)                                   to authenticated;
grant execute on function public.admin_recharger_livreur(uuid, int, text)                   to authenticated;
grant execute on function public.admin_poser_maison(text, double precision, double precision) to authenticated;
grant execute on function public.admin_effacer_position(uuid)                               to authenticated;
grant execute on function public.admin_avis_livreurs(uuid)                                  to authenticated;
grant execute on function public.admin_avis_plateforme()                                    to authenticated;
grant execute on function public.admin_commandes(boolean)                                   to authenticated;
grant execute on function public.admin_dashboard()                                          to authenticated;
grant execute on function public.admin_sources()                                            to authenticated;
grant execute on function public.admin_enregistrer_source(uuid, uuid, text, double precision, double precision) to authenticated;
grant execute on function public.admin_supprimer_source(uuid)                               to authenticated;
grant execute on function public.admin_valider_livreur(uuid)                                to authenticated;
grant execute on function public.admin_paiement(text, uuid, text)                           to authenticated;
grant execute on function public.admin_clients_v2()                                         to authenticated;
grant execute on function public.admin_rattacher_client_v2(uuid, uuid)                      to authenticated;
grant execute on function public.admin_stats_annuelles(int, uuid, uuid)                 to authenticated;
grant execute on function public.admin_commande_statut(uuid, text)                          to authenticated;

-- =============================================================================
--  8. ADMIN
-- =============================================================================
--  Venant de la V2 (même projet) : crée dans Authentication → Users → « Add
--  user » un utilisateur avec le MÊME EMAIL que ton admin V2, case « Auto
--  Confirm User » cochée, puis relance ce script : il est reconnu admin
--  automatiquement (bloc ci-dessous). Seul un email CONFIRMÉ compte.
--
--  Base neuve : crée l'utilisateur de la même façon, puis :
--       insert into public.admins (user_id, email)
--       select id, email from auth.users where email = 'toi@exemple.com';
--
--  Ensuite : connexion sur /admin → activation imposée de la 2FA (Google
--  Authenticator). Et dans Authentication → Sign In / Providers, DÉSACTIVE
--  « Allow new users to sign up ».
do $$
begin
  if to_regclass('archive_v2.admins') is null then return; end if;
  execute $q$
    insert into public.admins (user_id, email)
    select u.id, u.email
      from auth.users u
     where u.email_confirmed_at is not null
       and lower(u.email) in (select lower(a.email) from archive_v2.admins a
                               where a.email is not null and a.password_hash not like '!%')
    on conflict (user_id) do nothing
  $q$;
end $$;
