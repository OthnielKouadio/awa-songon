-- ============================================================================
--  AWA SONGON — schéma Supabase v6 (à coller dans SQL Editor puis "Run")
--  Idempotent : peut être relancé sans casser les données.
--
--  v7 (sécurité) : plus AUCUN mot de passe admin par défaut (l'ancien admin
--  par défaut est désactivé s'il n'a jamais été changé — voir admin_definir),
--  secrets hachés en bcrypt (pgcrypto, migration transparente au prochain
--  login), téléphones normalisés en 0XXXXXXXXX (+225 / 00225 / 225 retirés)
--  avec fusion des doublons existants et colonne phone_normalized UNIQUE,
--  settings.depot_phone (numéro de dépôt Wave modifiable par l'admin),
--  session_valide() pour le middleware Next.js, aucun droit direct sur les
--  tables sensibles pour anon/authenticated.
--
--  v8 (accès) : l'admin se connecte par EMAIL + mot de passe, uniquement sur
--  sa page secrète (auth_admin_login) — auth_login ne connecte plus jamais
--  l'admin. auth_login('auto', …) reconnaît seul un client ou un chauffeur
--  (page /login sans choix de rôle).
--
--  v9 (essai & comptes) : essai gratuit PAR COMPTE (settings.essai_mois, 2 mois
--  par défaut, depuis l'inscription) — points illimités pendant l'essai, rien
--  n'est débité ; ensuite recharge obligatoire (solde de départ 0). Code PIN
--  oublié : l'admin donne un code provisoire, changé à la connexion suivante.
--  Anti-intrusion : un chauffeur inscrit reste invisible tant que l'admin ne
--  l'a pas validé (tricycles.valide).
--
--  v6 : saisie directe par le chauffeur (commandes.source, clients temporaires,
--  journal_actions), livraison aujourd'hui/demain (scheduled_for, cron 00h00,
--  annulation fermée à 18h la veille), période d'essai (settings.trial_ends_at)
--  et journalisation de la facturation à chaque livraison. Statistiques :
--  get_yearly_stats, commandes.livree_at, points_transactions.commande_id.
--
--  v5 : une seule cité par chauffeur (tricycles.cite_id, verrouillage côté
--  serveur), statuts chauffeur ACTIVE/PAUSED/OFFLINE (il ne refuse jamais :
--  commandes QUEUED / PROGRAMMED), GPS live uniquement après « J'arrive chez
--  toi » (positions_live + diffusion directe au seul client concerné), crons
--  pg_cron (23h59 / 8h00 / purge GPS). Migre automatiquement une base v4.
--
--  v4 : authentification unifiée (client / chauffeur / admin) par téléphone +
--  code, SANS Supabase Auth — un jeton de session (comme avant pour les
--  chauffeurs) protège désormais aussi les clients et l'admin. Les clients ont
--  un compte (cité + lot fixés à l'inscription) et un statut PAYE/IMPAYE/BLOQUE
--  géré uniquement par l'admin. ⚠ Si tu viens d'une version antérieure à la v4
--  (Supabase Auth pour l'admin), repars d'un projet vide : le modèle change trop.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ─── Tables ────────────────────────────────────────────────────────────────

create table if not exists public.cites (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.sources (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  cite_id    uuid not null references public.cites(id) on delete cascade,
  -- Position du forage (facultative) : sert à placer les tricycles sur la carte admin.
  lat        double precision,
  long       double precision,
  created_at timestamptz not null default now(),
  constraint sources_gps_pair check ((lat is null) = (long is null))
);

create table if not exists public.tricycles (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  telephone  text not null unique,
  -- UNE seule cité, fixée à l'inscription : c'est elle qui décide quels
  -- clients le voient et peuvent le commander (verrouillage par cité).
  cite_id    uuid references public.cites(id) on delete cascade,
  -- La source précise (le forage) est facultative : un chauffeur qui n'en
  -- choisit pas puise "un peu partout" dans sa cité.
  source_id  uuid references public.sources(id) on delete cascade,
  -- ACTIVE : livre normalement · PAUSED : au garage / mange, les nouvelles
  -- commandes partent en QUEUED (livrées aujourd'hui) · OFFLINE : dort, les
  -- nouvelles commandes partent en PROGRAMMED (demain 8h). Dans les 3 cas il
  -- reste visible et commandable : il ne refuse jamais.
  status     text not null default 'OFFLINE',
  etat       text not null default 'A_LA_SOURCE' check (etat in ('A_LA_SOURCE', 'EN_ROUTE')),
  -- Prix (FCFA) que le chauffeur fixe lui-même pour 1000 L.
  prix_1000  int  not null default 2500 check (prix_1000 between 100 and 50000),
  -- Statut de compte, géré UNIQUEMENT par l'admin (jamais par le chauffeur).
  statut     text not null default 'IMPAYE' check (statut in ('PAYE', 'IMPAYE', 'BLOQUE')),
  -- Points (1 FCFA = 1 point) : 2500 offerts à l'inscription (= 50 livraisons
  -- gratuites), -50 points par livraison acceptée (chauffeur_partir). En dessous
  -- de 50, is_offline passe à true (indépendant de statut/status ci-dessus) —
  -- le chauffeur n'est plus visible des clients tant qu'il n'est pas rechargé.
  solde_points          int not null default 2500,
  total_points_utilises int not null default 0,
  is_offline            boolean not null default false,
  -- Le PIN est CHOISI PAR LE CHAUFFEUR à l'inscription. Stocké haché ; la session
  -- utilise ensuite un jeton aléatoire (haché aussi) — le PIN ne circule qu'au login.
  pin_hash          text not null,
  session_hash      text,
  pin_essais        int not null default 0,
  pin_bloque_jusqua timestamptz,
  created_at        timestamptz not null default now()
);

-- Migration (sans effet sur une base neuve, où les colonnes existent déjà
-- ci-dessus) : les chauffeurs déjà inscrits reçoivent aussi le solde de départ.
alter table public.tricycles add column if not exists solde_points          int not null default 2500;
alter table public.tricycles add column if not exists total_points_utilises int not null default 0;
alter table public.tricycles add column if not exists is_offline            boolean not null default false;
alter table public.tricycles add column if not exists cite_id               uuid references public.cites(id) on delete cascade;

-- Migration : la position GPS ne vit plus sur tricycles (elle déclenchait un
-- ping temps réel vers toute la cité toutes les 5 s). Elle passe dans
-- positions_live (dernière position, 5 min max) + positions_historique.
alter table public.tricycles drop constraint if exists tricycles_gps_pair;
alter table public.tricycles drop column if exists lat;
alter table public.tricycles drop column if exists long;
alter table public.tricycles drop column if exists position_maj;

-- Migration : statut DISPO/OFF → ACTIVE/PAUSED/OFFLINE.
alter table public.tricycles drop constraint if exists tricycles_status_check;
update public.tricycles set status = 'ACTIVE'  where status = 'DISPO';
update public.tricycles set status = 'OFFLINE' where status = 'OFF';
alter table public.tricycles alter column status set default 'OFFLINE';
alter table public.tricycles add constraint tricycles_status_check check (status in ('ACTIVE', 'PAUSED', 'OFFLINE'));

-- Historique des recharges/déductions de points (chauffeurs ET clients depuis
-- le passage au système 100% recharge) — utilisé uniquement pour la
-- traçabilité, aucune UI ne le liste pour l'instant. tricycle_id/client_id :
-- exactement un des deux est rempli selon le titulaire du compte (contrainte
-- ajoutée plus bas, une fois la table clients définie).
create table if not exists public.points_transactions (
  id          uuid primary key default gen_random_uuid(),
  tricycle_id uuid references public.tricycles(id) on delete cascade,
  montant     int  not null,
  type        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists points_transactions_tricycle_idx on public.points_transactions (tricycle_id);
-- REMBOURSEMENT : points rendus quand le client annule sa commande.
alter table public.points_transactions drop constraint if exists points_transactions_type_check;
alter table public.points_transactions add constraint points_transactions_type_check
  check (type in ('RECHARGE', 'DEDUCTION', 'BONUS_FIDELITE', 'REMBOURSEMENT'));
-- Migration : la colonne tricycle_id était NOT NULL avant que les clients
-- aient aussi des points — on la rend facultative (client_id la remplace
-- alors, colonne ajoutée juste après la table clients ci-dessous).
alter table public.points_transactions alter column tricycle_id drop not null;

create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  telephone  text not null unique,
  cite_id    uuid not null references public.cites(id) on delete cascade,
  lot_numero text not null,
  lat        double precision,
  long       double precision,
  -- Statut de compte, géré UNIQUEMENT par l'admin (jamais par le client).
  statut        text not null default 'IMPAYE' check (statut in ('PAYE', 'IMPAYE', 'BLOQUE')),
  date_paiement timestamptz,
  -- Points (1 FCFA = 1 point) : 1200 offerts à l'inscription, -100 points par
  -- commande créée (déduits immédiatement, en même temps que les points du
  -- chauffeur — voir creer_commande). Système 100% recharge, plus d'abonnement
  -- basé sur une date d'expiration.
  solde_points int not null default 1200,
  pin_hash          text not null,
  session_hash      text,
  pin_essais        int not null default 0,
  pin_bloque_jusqua timestamptz,
  created_at        timestamptz not null default now(),
  constraint clients_gps_pair check ((lat is null) = (long is null))
);

-- Migration (sans effet sur une base neuve, où la colonne existe déjà ci-dessus) :
-- les clients déjà inscrits reçoivent aussi le solde de départ.
alter table public.clients add column if not exists solde_points int not null default 1200;
-- Client créé par un chauffeur lors d'une saisie directe : sans PIN utilisable,
-- il devient un compte normal s'il s'inscrit ensuite avec le même numéro.
alter table public.clients add column if not exists is_temporary boolean not null default false;

-- points_transactions peut maintenant référencer un client (la table clients
-- vient d'être définie) ; exactement un des deux titulaires doit être rempli.
alter table public.points_transactions add column if not exists client_id uuid references public.clients(id) on delete cascade;
do $$ begin
  alter table public.points_transactions
    add constraint points_transactions_titulaire_chk check ((tricycle_id is not null) <> (client_id is not null));
exception when duplicate_object then null;
end $$;
-- (client_id, created_at desc) : sert aussi les recherches par client_id seul.
drop index if exists public.points_transactions_client_idx;
create index if not exists points_transactions_client_date_idx on public.points_transactions (client_id, created_at desc);

-- Migration : un chauffeur n'a plus qu'UNE cité (tricycles.cite_id). L'ancienne
-- table plusieurs-à-plusieurs tricycle_cites est reprise une dernière fois
-- (on garde la première cité par ordre alphabétique), puis supprimée. À défaut,
-- on prend la cité de sa source.
alter table public.tricycles alter column source_id drop not null;
do $$ begin
  if to_regclass('public.tricycle_cites') is not null then
    update public.tricycles t
       set cite_id = (select tc.cite_id from public.tricycle_cites tc join public.cites c on c.id = tc.cite_id
                       where tc.tricycle_id = t.id order by c.nom limit 1)
     where t.cite_id is null;
  end if;
end $$;
update public.tricycles t set cite_id = s.cite_id from public.sources s where s.id = t.source_id and t.cite_id is null;
drop table if exists public.tricycle_cites cascade;
-- La source (facultative) doit appartenir à SA cité.
update public.tricycles t set source_id = null
 where t.source_id is not null and not exists (select 1 from public.sources s where s.id = t.source_id and s.cite_id = t.cite_id);
alter table public.tricycles alter column cite_id set not null;
create index if not exists tricycles_cite_idx on public.tricycles (cite_id);

-- Un seul enregistrement en pratique, mais une table plutôt qu'un singleton codé
-- en dur : ça permet plusieurs comptes admin plus tard sans migration.
create table if not exists public.admins (
  id        uuid primary key default gen_random_uuid(),
  telephone text unique,
  password_hash     text not null,
  session_hash      text,
  essais            int not null default 0,
  bloque_jusqua     timestamptz,
  created_at        timestamptz not null default now()
);
-- v8 : identifiant admin = email (en minuscules). Le téléphone devient facultatif
-- (anciens comptes) : un admin sans email ne peut plus se connecter, le
-- recréer avec admin_definir('email', 'mot de passe').
alter table public.admins add column if not exists email text;
alter table public.admins alter column telephone drop not null;
create unique index if not exists admins_email_key on public.admins (email);

create table if not exists public.commandes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  tricycle_id   uuid not null references public.tricycles(id) on delete cascade,
  cite_id       uuid not null references public.cites(id) on delete cascade,
  lot_numero    text not null,
  position_file int  not null,
  -- Cycle de vie (voir creer_commande / chauffeur_set_status) :
  --   QUEUED      chauffeur en PAUSE : livrée aujourd'hui, dès qu'il reprend
  --   PROGRAMMED  chauffeur OFFLINE (ou QUEUED non livrée à 23h59) : demain 8h
  --   ASSIGNED    dans la file active du chauffeur
  --   EN_COURS    il est parti livrer
  --   ARRIVING    « J'arrive chez toi » : GPS live partagé avec le client (10 min max)
  --   LIVREE / ANNULEE
  status        text not null default 'ASSIGNED',
  -- Prix figé à la commande (FCFA) : si le chauffeur change son tarif ensuite, ça ne bouge pas.
  prix          int  not null,
  lat           double precision,
  long          double precision,
  -- PROGRAMMED : date/heure de livraison prévue (prochain 8h00, heure d'Abidjan).
  programmee_pour timestamptz,
  -- ARRIVING : début du partage GPS (coupé automatiquement 10 min après).
  arriving_at   timestamptz,
  -- Jour de livraison prévu (heure d'Abidjan) : aujourd'hui ou demain, jamais au-delà.
  scheduled_for date not null default ((now() at time zone 'Africa/Abidjan')::date),
  -- Commande programmée pour un jour suivant : plus annulable après 18h la veille.
  annulable_jusqua timestamptz,
  -- 'app' : passée par le client · 'manual' : saisie par le chauffeur (appel, passage).
  source        text not null default 'app' check (source in ('app', 'manual')),
  added_by_driver_id  uuid references public.tricycles(id) on delete set null,
  is_temporary_client boolean not null default false,
  quantite_bidons int check (quantite_bidons between 1 and 200),
  note          text check (length(note) <= 280),
  created_at    timestamptz not null default now(),
  constraint commandes_gps_pair check ((lat is null) = (long is null))
);

alter table public.commandes add column if not exists programmee_pour timestamptz;
alter table public.commandes add column if not exists arriving_at     timestamptz;
alter table public.commandes add column if not exists scheduled_for   date;
alter table public.commandes add column if not exists annulable_jusqua timestamptz;
alter table public.commandes add column if not exists source          text not null default 'app' check (source in ('app', 'manual'));
alter table public.commandes add column if not exists added_by_driver_id  uuid references public.tricycles(id) on delete set null;
alter table public.commandes add column if not exists is_temporary_client boolean not null default false;
alter table public.commandes add column if not exists quantite_bidons int check (quantite_bidons between 1 and 200);
alter table public.commandes add column if not exists note            text check (length(note) <= 280);
-- Heure de livraison effective (temps moyen de livraison, statistiques).
alter table public.commandes add column if not exists livree_at timestamptz;
-- Remboursement, débit et bonus fidélité rattachés à leur commande (statistiques, chiffre d'affaires).
alter table public.points_transactions add column if not exists commande_id uuid references public.commandes(id) on delete set null;
create index if not exists points_transactions_commande_idx on public.points_transactions (commande_id);
update public.commandes set scheduled_for = (coalesce(programmee_pour, created_at) at time zone 'Africa/Abidjan')::date
 where scheduled_for is null;
alter table public.commandes alter column scheduled_for set default ((now() at time zone 'Africa/Abidjan')::date);
alter table public.commandes alter column scheduled_for set not null;

-- Migration : EN_ATTENTE → ASSIGNED, LIVRE → LIVREE (+ nouveaux statuts).
alter table public.commandes drop constraint if exists commandes_status_check;
update public.commandes set status = 'ASSIGNED' where status = 'EN_ATTENTE';
update public.commandes set status = 'LIVREE'   where status = 'LIVRE';
alter table public.commandes alter column status set default 'ASSIGNED';
alter table public.commandes add constraint commandes_status_check
  check (status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'ARRIVING', 'EN_COURS', 'LIVREE', 'ANNULEE'));

-- ─── Positions GPS (uniquement pendant ARRIVING) ───────────────────────────
-- positions_live joue le rôle d'un cache type Redis : UNE ligne par tricycle,
-- écrasée à chaque envoi, ignorée au-delà de 5 min (TTL) et purgée par cron.
-- UNLOGGED : pas de WAL, écriture rapide — on accepte de la perdre en cas de
-- crash, ce n'est qu'une position temporaire.
create unlogged table if not exists public.positions_live (
  tricycle_id uuid primary key references public.tricycles(id) on delete cascade,
  commande_id uuid not null references public.commandes(id) on delete cascade,
  lat         double precision not null,
  long        double precision not null,
  maj         timestamptz not null default now()
);

-- Historique : au plus 1 point toutes les 2 min par commande.
create table if not exists public.positions_historique (
  id          uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  tricycle_id uuid not null references public.tricycles(id) on delete cascade,
  lat         double precision not null,
  long        double precision not null,
  created_at  timestamptz not null default now()
);
create index if not exists positions_historique_commande_idx on public.positions_historique (commande_id, created_at desc);

-- Journal des actions (saisies manuelles, facturation…) : traçabilité interne.
create table if not exists public.journal_actions (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  acteur_type text not null check (acteur_type in ('chauffeur', 'client', 'admin', 'systeme')),
  acteur_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists journal_actions_action_idx on public.journal_actions (action, created_at desc);

-- Paramètres globaux : une seule ligne.
create table if not exists public.settings (
  id            boolean primary key default true check (id),
  trial_ends_at date not null default '2026-12-31',
  updated_at    timestamptz not null default now()
);
insert into public.settings (id) values (true) on conflict (id) do nothing;
-- Numéro de dépôt Wave (forme canonique 0XXXXXXXXX), modifiable dans
-- Admin → Paramètres (admin_set_depot_phone). Seule source pour l'affichage.
alter table public.settings add column if not exists depot_phone text not null default '0789855418';
-- Nom du marchand Wave que le client vérifie sur l'écran de paiement, modifiable
-- dans Admin → Paramètres. Le LIEN de paiement, lui, est fixé dans le code
-- (src/lib/format.ts) et n'est jamais modifiable depuis l'appli.
alter table public.settings add column if not exists wave_marchand text not null default 'Jeune roi hub';
-- Durée de l'essai gratuit offert à chaque nouveau compte (client ET chauffeur).
alter table public.settings add column if not exists essai_mois int not null default 2 check (essai_mois between 0 and 24);

-- v9 : fin d'essai PAR COMPTE. Comptes existants : 2 mois après leur inscription.
alter table public.clients   add column if not exists essai_fin timestamptz;
alter table public.tricycles add column if not exists essai_fin timestamptz;
update public.clients   set essai_fin = created_at + interval '2 months' where essai_fin is null;
update public.tricycles set essai_fin = created_at + interval '2 months' where essai_fin is null;
-- Code provisoire donné par l'admin (code oublié) : à changer à la connexion suivante.
alter table public.clients   add column if not exists pin_provisoire boolean not null default false;
alter table public.tricycles add column if not exists pin_provisoire boolean not null default false;
-- Anti-intrusion : un nouveau chauffeur est invisible tant que l'admin ne l'a pas
-- validé. Les chauffeurs déjà inscrits sont considérés validés.
alter table public.tricycles add column if not exists valide boolean;
update public.tricycles set valide = true where valide is null;
alter table public.tricycles alter column valide set default false;
alter table public.tricycles alter column valide set not null;
-- Points réellement débités pour cette commande (rien pendant l'essai) : seuls
-- ceux-là sont rendus à l'annulation. Commandes existantes : débitées.
alter table public.commandes add column if not exists client_debite    boolean not null default true;
alter table public.commandes add column if not exists chauffeur_debite boolean not null default true;

create index if not exists commandes_tricycle_status_idx on public.commandes (tricycle_id, status);
create index if not exists commandes_client_status_idx   on public.commandes (client_id, status);
create index if not exists commandes_cite_idx            on public.commandes (cite_id);
create index if not exists commandes_created_idx         on public.commandes (created_at desc);
create index if not exists tricycles_source_idx          on public.tricycles (source_id);
create index if not exists clients_cite_idx              on public.clients (cite_id);
create index if not exists sources_cite_idx              on public.sources (cite_id);

-- ─── Normalisation des téléphones ──────────────────────────────────────────

-- Forme canonique UNIQUE : 0789855418 = +225789855418 = 00225789855418 =
-- +2250789855418 = "07 89 85 54 18". ⚠ Identique à normalizePhone() dans
-- src/lib/phone.ts. Le 0 initial n'est rajouté qu'à un numéro de 9 chiffres :
-- les fixes (21, 25, 27…) font déjà 10 chiffres sans commencer par 0.
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
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

create or replace function public.trg_normalize_phone()
returns trigger language plpgsql as $$
begin
  if new.telephone is not null then new.telephone := public.normalize_phone(new.telephone); end if;
  return new;
end $$;

drop trigger if exists tricycles_normalize_phone on public.tricycles;
create trigger tricycles_normalize_phone before insert or update on public.tricycles
  for each row execute function public.trg_normalize_phone();

drop trigger if exists clients_normalize_phone on public.clients;
create trigger clients_normalize_phone before insert or update on public.clients
  for each row execute function public.trg_normalize_phone();

drop trigger if exists admins_normalize_phone on public.admins;
create trigger admins_normalize_phone before insert or update on public.admins
  for each row execute function public.trg_normalize_phone();

-- Migration v7 : fusion des comptes en double (même numéro écrit 07… / +225…).
-- On garde le compte réel le plus ancien, on lui rattache commandes, points et
-- historique, et on additionne les soldes (aucun point payé n'est perdu ; le
-- détail est dans journal_actions 'FUSION_DOUBLON_TELEPHONE' pour correction
-- éventuelle). Sans effet quand il n'y a pas de doublon : relançable.
do $$
declare
  g record;
  v_keep uuid;
  v_autres uuid[];
begin
  for g in
    select public.normalize_phone(telephone) as tel, array_agg(id order by is_temporary, created_at) as ids
      from public.clients group by 1 having count(*) > 1
  loop
    v_keep := g.ids[1];
    v_autres := g.ids[2:];
    insert into public.journal_actions (action, acteur_type, details)
    select 'FUSION_DOUBLON_TELEPHONE', 'systeme',
           jsonb_build_object('table', 'clients', 'telephone', g.tel, 'conserve', v_keep,
                              'comptes', jsonb_agg(jsonb_build_object('id', id, 'telephone', telephone, 'solde_points', solde_points, 'is_temporary', is_temporary)))
      from public.clients where id = any(g.ids);
    update public.commandes set client_id = v_keep where client_id = any(v_autres);
    update public.points_transactions set client_id = v_keep where client_id = any(v_autres);
    update public.clients k set solde_points = s.total
      from (select sum(solde_points)::int as total from public.clients where id = any(g.ids)) s
     where k.id = v_keep;
    delete from public.clients where id = any(v_autres);
  end loop;

  for g in
    select public.normalize_phone(telephone) as tel, array_agg(id order by created_at) as ids
      from public.tricycles group by 1 having count(*) > 1
  loop
    v_keep := g.ids[1];
    v_autres := g.ids[2:];
    insert into public.journal_actions (action, acteur_type, details)
    select 'FUSION_DOUBLON_TELEPHONE', 'systeme',
           jsonb_build_object('table', 'tricycles', 'telephone', g.tel, 'conserve', v_keep,
                              'comptes', jsonb_agg(jsonb_build_object('id', id, 'telephone', telephone, 'solde_points', solde_points)))
      from public.tricycles where id = any(g.ids);
    delete from public.positions_live where tricycle_id = any(v_autres);
    update public.commandes set tricycle_id = v_keep where tricycle_id = any(v_autres);
    update public.commandes set added_by_driver_id = v_keep where added_by_driver_id = any(v_autres);
    update public.points_transactions set tricycle_id = v_keep where tricycle_id = any(v_autres);
    update public.positions_historique set tricycle_id = v_keep where tricycle_id = any(v_autres);
    update public.tricycles k set solde_points = s.sp, total_points_utilises = s.tpu
      from (select sum(solde_points)::int as sp, sum(total_points_utilises)::int as tpu from public.tricycles where id = any(g.ids)) s
     where k.id = v_keep;
    -- Les deux files fusionnées : renumérotation continue 1, 2, 3…
    update public.commandes c set position_file = r.rn
      from (select id, row_number() over (order by position_file, created_at)::int as rn
              from public.commandes where tricycle_id = v_keep and position_file > 0) r
     where c.id = r.id;
    delete from public.tricycles where id = any(v_autres);
  end loop;

  delete from public.admins a
   where exists (select 1 from public.admins b
                  where public.normalize_phone(b.telephone) = public.normalize_phone(a.telephone)
                    and (b.created_at, b.id) < (a.created_at, a.id));

  update public.clients   set telephone = public.normalize_phone(telephone) where telephone <> public.normalize_phone(telephone);
  update public.tricycles set telephone = public.normalize_phone(telephone) where telephone <> public.normalize_phone(telephone);
  update public.admins    set telephone = public.normalize_phone(telephone) where telephone <> public.normalize_phone(telephone);
end $$;

-- Garde-fou en base : deux écritures d'un même numéro ne peuvent plus coexister,
-- même si un futur code oubliait de normaliser.
alter table public.clients   add column if not exists phone_normalized text generated always as (public.normalize_phone(telephone)) stored;
alter table public.tricycles add column if not exists phone_normalized text generated always as (public.normalize_phone(telephone)) stored;
create unique index if not exists clients_phone_normalized_key   on public.clients (phone_normalized);
create unique index if not exists tricycles_phone_normalized_key on public.tricycles (phone_normalized);

-- ─── Row Level Security ────────────────────────────────────────────────────
-- cites / sources : lecture publique (nécessaire pour les selects d'inscription).
-- tricycles / clients / commandes / admins : AUCUN accès direct, même authentifié —
--   il n'y a plus de session Supabase Auth dans cette appli. Tout passe par les
--   fonctions RPC security definer ci-dessous, qui vérifient nos propres jetons.

alter table public.cites               enable row level security;
alter table public.sources             enable row level security;
alter table public.tricycles           enable row level security;
alter table public.points_transactions enable row level security;
alter table public.positions_live      enable row level security;
alter table public.positions_historique enable row level security;
alter table public.journal_actions     enable row level security;
alter table public.settings            enable row level security;
alter table public.clients             enable row level security;
alter table public.commandes           enable row level security;
alter table public.admins              enable row level security;

drop policy if exists "cites lecture publique"   on public.cites;
drop policy if exists "sources lecture publique" on public.sources;
create policy "cites lecture publique"   on public.cites   for select using (true);
create policy "sources lecture publique" on public.sources for select using (true);
-- (aucune policy sur tricycles/points_transactions/positions_*/clients/commandes/admins : accès refusé par défaut)
--
-- Équivalent des règles « chauffeur : uniquement ses lignes / admin : tout /
-- anon : rien » sans Supabase Auth : aucun rôle API ne touche ces tables ; les
-- RPC ci-dessous identifient l'appelant par son jeton (_auth_tricycle,
-- _auth_client, _auth_admin) et filtrent sur SON id (where tricycle_id = v…).
-- En plus de RLS, on retire les droits SQL eux-mêmes (défense en profondeur :
-- une policy ajoutée par erreur ne suffirait pas à ouvrir l'accès).
revoke all on public.tricycles, public.clients, public.commandes, public.admins, public.settings,
              public.points_transactions, public.positions_live, public.positions_historique,
              public.journal_actions
  from anon, authenticated;
revoke insert, update, delete, truncate on public.cites, public.sources from anon, authenticated;

-- ─── Temps réel (ping + refetch, sans dépendre de RLS/postgres_changes) ────
-- Les canaux broadcast ne transportent aucune donnée : le client recharge
-- ensuite via une RPC. cite:<id> et tricycle:<id> pour client/chauffeur,
-- client:<id> pour le suivi de commande, "admin" pour le cockpit.
-- Exception : la position GPS live part directement (avec ses coordonnées) sur
-- suivi:<commande_id>, que seul le client de cette commande écoute — voir
-- chauffeur_set_position. Elle ne touche aucune table surveillée ici.

do $$ begin alter publication supabase_realtime add table public.commandes;      exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tricycles;      exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.clients;        exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.sources;        exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.cites;          exception when others then null; end $$;

create or replace function public.notify_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_tricycle uuid;
  v_client   uuid;
  v_cite     uuid;
begin
  if tg_table_name = 'commandes' then
    v_tricycle := (j ->> 'tricycle_id')::uuid;
    v_client   := (j ->> 'client_id')::uuid;
    v_cite     := (j ->> 'cite_id')::uuid;
  elsif tg_table_name = 'tricycles' then
    v_tricycle := (j ->> 'id')::uuid;
    v_cite     := (j ->> 'cite_id')::uuid; -- une seule cité par chauffeur
  elsif tg_table_name = 'clients' then
    v_client := (j ->> 'id')::uuid;
  end if;

  begin
    if v_tricycle is not null then perform realtime.send(jsonb_build_object('at', now()), 'changed', 'tricycle:' || v_tricycle, false); end if;
    if v_client   is not null then perform realtime.send(jsonb_build_object('at', now()), 'changed', 'client:'   || v_client,   false); end if;
    if v_cite     is not null then perform realtime.send(jsonb_build_object('at', now()), 'changed', 'cite:'     || v_cite,     false); end if;
    perform realtime.send(jsonb_build_object('at', now()), 'changed', 'admin', false);
  exception when others then
    null; -- le temps réel ne doit jamais bloquer une écriture (polling de secours côté client)
  end;
  return null;
end $$;

drop trigger if exists commandes_notify on public.commandes;
create trigger commandes_notify after insert or update or delete on public.commandes
  for each row execute function public.notify_change();
drop trigger if exists tricycles_notify on public.tricycles;
create trigger tricycles_notify after insert or update or delete on public.tricycles
  for each row execute function public.notify_change();
drop trigger if exists clients_notify on public.clients;
create trigger clients_notify after insert or update or delete on public.clients
  for each row execute function public.notify_change();

-- ─── Auth : hachage, jetons, blocage anti-devinette ────────────────────────
-- Même schéma pour les 3 rôles : secret haché avec l'id (sel), 5 échecs → 15 min
-- de blocage, connexion = nouveau jeton de session (haché aussi, stocké en base).

create or replace function public._hash_secret(p_id uuid, p_secret text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_id::text || ':' || coalesce(p_secret, ''), 'UTF8')), 'hex')
$$;

create or replace function public._hash_token(p text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;

-- v7 : bcrypt (pgcrypto). Les anciens hachages SHA-256 (_hash_secret) restent
-- acceptés une dernière fois puis sont remplacés au login réussi (_secret_ok +
-- auth_login) : aucune réinitialisation de PIN ni de mot de passe à prévoir.
create or replace function public._hash_pin(p_secret text)
returns text language sql volatile as $$
  select extensions.crypt(coalesce(p_secret, ''), extensions.gen_salt('bf', 10))
$$;

create or replace function public._secret_ok(p_id uuid, p_secret text, p_hash text)
returns boolean language sql stable as $$
  select case
    when p_hash is null or p_hash like '!%' then false           -- compte sans secret utilisable
    when p_hash like '$2%' then extensions.crypt(coalesce(p_secret, ''), p_hash) = p_hash
    else p_hash = public._hash_secret(p_id, p_secret)              -- ancien format
  end
$$;

create or replace function public._new_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- Essai gratuit en cours pour ce compte ?
create or replace function public._en_essai(p_fin timestamptz)
returns boolean language sql stable as $$
  select p_fin is not null and now() < p_fin
$$;

-- Fin d'essai d'un compte qui s'inscrit maintenant.
create or replace function public._fin_essai_nouveau()
returns timestamptz language sql stable security definer set search_path = public as $$
  select now() + make_interval(months => coalesce((select essai_mois from public.settings where id), 2))
$$;

create or replace function public._chauffeur_profil(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'nom', t.nom, 'telephone', t.telephone, 'status', t.status, 'etat', t.etat,
    'prix_1000', t.prix_1000, 'statut', t.statut, 'source_nom', s.nom,
    'solde_points', t.solde_points, 'total_points_utilises', t.total_points_utilises,
    'is_offline', (not public._en_essai(t.essai_fin) and (t.is_offline or t.solde_points < 50)),
    'essai_fin', t.essai_fin, 'valide', t.valide, 'pin_provisoire', t.pin_provisoire,
    'cite_id', ci.id, 'cite_nom', ci.nom)
  from public.tricycles t
  join public.cites ci on ci.id = t.cite_id
  left join public.sources s on s.id = t.source_id
  where t.id = p_id
$$;

create or replace function public._client_profil(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone,
    'cite_id', ci.id, 'cite_nom', ci.nom, 'lot_numero', cl.lot_numero, 'statut', cl.statut,
    'solde_points', cl.solde_points, 'essai_fin', cl.essai_fin, 'pin_provisoire', cl.pin_provisoire)
  from public.clients cl
  join public.cites ci on ci.id = cl.cite_id
  where cl.id = p_id
$$;

create or replace function public._auth_tricycle(p_tel text, p_token text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select t.id into v from public.tricycles t
   where t.telephone = public.normalize_phone(p_tel) and t.session_hash is not null and t.session_hash = public._hash_token(p_token);
  if v is null then raise exception 'AUTH'; end if;
  return v;
end $$;

create or replace function public._auth_client(p_tel text, p_token text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select cl.id into v from public.clients cl
   where cl.telephone = public.normalize_phone(p_tel) and cl.session_hash is not null and cl.session_hash = public._hash_token(p_token);
  if v is null then raise exception 'AUTH'; end if;
  return v;
end $$;

create or replace function public._auth_admin(p_tel text, p_token text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  -- p_tel porte l'email de l'admin (même champ « identifiant » que les autres rôles).
  select a.id into v from public.admins a
   where a.email = lower(btrim(p_tel)) and a.session_hash is not null and a.session_hash = public._hash_token(p_token);
  if v is null then raise exception 'REFUSE'; end if;
  return v;
end $$;

-- Aucun admin par défaut. Création / réinitialisation, depuis le SQL Editor
-- de Supabase UNIQUEMENT (fonction interdite à l'API) :
--   select public.admin_definir('toi@exemple.com', 'un-mot-de-passe-long');
-- Le mot de passe passe alors par l'historique du SQL Editor : change-le
-- ensuite depuis Admin → Sécurité.
-- drop obligatoire : le nom du 1er paramètre change (p_tel → p_email).
drop function if exists public.admin_definir(text, text);
create or replace function public.admin_definir(p_email text, p_password text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL_INVALIDE'; end if;
  if p_password is null or length(p_password) < 10 then raise exception 'MDP_INVALIDE'; end if;
  insert into public.admins (email, password_hash) values (v_email, public._hash_pin(p_password))
  on conflict (email) do update
    set password_hash = excluded.password_hash, session_hash = null, essais = 0, bloque_jusqua = null;
end $$;

-- Migration v7 : l'ancien admin par défaut avait un mot de passe public (écrit
-- dans ce fichier et le README). S'il n'a jamais été changé, le compte est
-- désactivé et ses sessions coupées : le réactiver avec admin_definir().
-- (On compare au hachage de l'ancienne valeur, ce n'est pas un identifiant.)
update public.admins
   set password_hash = '!desactive-v7', session_hash = null
 where password_hash = public._hash_secret(id, 'admin' || '123');

-- ─── RPC : connexion ────────────────────────────────────────────────────────
-- Admin : UNIQUEMENT auth_admin_login (email + mot de passe), appelée depuis sa
-- page secrète. auth_login ne connecte jamais un admin.
create or replace function public.auth_admin_login(p_email text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := public._new_token();
  a public.admins%rowtype;
  v_lock boolean;
begin
  select * into a from public.admins where email = v_email for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'AUTH_ADMIN'); end if;
  if a.bloque_jusqua is not null and a.bloque_jusqua > now() then
    return jsonb_build_object('ok', false, 'error', 'BLOQUE');
  end if;
  if not public._secret_ok(a.id, p_password, a.password_hash) then
    v_lock := a.essais + 1 >= 5;
    update public.admins set essais = case when v_lock then 0 else essais + 1 end,
           bloque_jusqua = case when v_lock then now() + interval '15 minutes' else null end
     where id = a.id;
    return jsonb_build_object('ok', false, 'error', case when v_lock then 'BLOQUE' else 'AUTH_ADMIN' end);
  end if;
  update public.admins set essais = 0, bloque_jusqua = null, session_hash = public._hash_token(v_token),
         password_hash = case when a.password_hash like '$2%' then a.password_hash else public._hash_pin(p_password) end
   where id = a.id;
  return jsonb_build_object('ok', true, 'role', 'admin', 'token', v_token, 'profile', jsonb_build_object('email', v_email));
end $$;

-- Client / chauffeur par téléphone + PIN. p_role = 'auto' (page /login sans
-- choix de rôle) : on essaie le compte client puis le compte chauffeur de ce
-- numéro ; un échec compte un essai sur chacun (5 échecs → 15 min de blocage).
create or replace function public.auth_login(p_role text, p_tel text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tel   text := public.normalize_phone(p_tel);
  v_token text := public._new_token();
  t  public.tricycles%rowtype;
  cl public.clients%rowtype;
  v_cl boolean := false;
  v_t  boolean := false;
  v_bloque boolean := false;
  v_lock boolean;
begin
  if p_role in ('client', 'auto') then
    select * into cl from public.clients where telephone = v_tel and not is_temporary for update;
    v_cl := found;
  end if;
  if p_role in ('chauffeur', 'auto') then
    select * into t from public.tricycles where telephone = v_tel for update;
    v_t := found;
  end if;
  if not v_cl and not v_t then return jsonb_build_object('ok', false, 'error', 'AUTH'); end if;

  if v_cl and (cl.pin_bloque_jusqua is null or cl.pin_bloque_jusqua <= now()) and public._secret_ok(cl.id, p_pin, cl.pin_hash) then
    update public.clients set pin_essais = 0, pin_bloque_jusqua = null, session_hash = public._hash_token(v_token),
           pin_hash = case when cl.pin_hash like '$2%' then cl.pin_hash else public._hash_pin(p_pin) end
     where id = cl.id;
    return jsonb_build_object('ok', true, 'role', 'client', 'token', v_token, 'profile', public._client_profil(cl.id));
  end if;

  if v_t and (t.pin_bloque_jusqua is null or t.pin_bloque_jusqua <= now()) and public._secret_ok(t.id, p_pin, t.pin_hash) then
    update public.tricycles set pin_essais = 0, pin_bloque_jusqua = null, session_hash = public._hash_token(v_token),
           pin_hash = case when t.pin_hash like '$2%' then t.pin_hash else public._hash_pin(p_pin) end
     where id = t.id;
    return jsonb_build_object('ok', true, 'role', 'chauffeur', 'token', v_token, 'profile', public._chauffeur_profil(t.id));
  end if;

  -- Échec : un essai de plus sur chaque compte de ce numéro.
  if v_cl then
    if cl.pin_bloque_jusqua is not null and cl.pin_bloque_jusqua > now() then
      v_bloque := true;
    else
      v_lock := cl.pin_essais + 1 >= 5;
      update public.clients set pin_essais = case when v_lock then 0 else pin_essais + 1 end,
             pin_bloque_jusqua = case when v_lock then now() + interval '15 minutes' else null end
       where id = cl.id;
      v_bloque := v_bloque or v_lock;
    end if;
  end if;
  if v_t then
    if t.pin_bloque_jusqua is not null and t.pin_bloque_jusqua > now() then
      v_bloque := true;
    else
      v_lock := t.pin_essais + 1 >= 5;
      update public.tricycles set pin_essais = case when v_lock then 0 else pin_essais + 1 end,
             pin_bloque_jusqua = case when v_lock then now() + interval '15 minutes' else null end
       where id = t.id;
      v_bloque := v_bloque or v_lock;
    end if;
  end if;
  return jsonb_build_object('ok', false, 'error', case when v_bloque then 'BLOQUE' else 'AUTH' end);
end $$;

-- ─── RPC : inscription ──────────────────────────────────────────────────────

create or replace function public.inscrire_client(
  p_nom text, p_tel text, p_cite uuid, p_lot text, p_pin text,
  p_lat double precision default null, p_long double precision default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text := public.normalize_phone(p_tel);
  v_lot text := btrim(coalesce(p_lot, ''));
  v_id  uuid := gen_random_uuid();
  v_token text := public._new_token();
begin
  if v_nom = '' or length(v_nom) > 40 then raise exception 'NOM_INVALIDE'; end if;
  if public._phone_ci(v_tel) is null then raise exception 'TEL_INVALIDE_CI'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_INVALIDE'; end if;
  if v_lot = '' or length(v_lot) > 20 then raise exception 'LOT_INVALIDE'; end if;
  if not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if exists (select 1 from public.admins where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;
  if exists (select 1 from public.clients where telephone = v_tel and not is_temporary) then raise exception 'DEJA_INSCRIT'; end if;

  if p_lat is null or p_long is null or p_lat not between -90 and 90 or p_long not between -180 and 180 then
    p_lat := null; p_long := null;
  end if;

  -- Client temporaire (saisi par un chauffeur) : il récupère son compte et son historique.
  select id into v_id from public.clients where telephone = v_tel and is_temporary;
  if found then
    update public.clients
       set nom = v_nom, cite_id = p_cite, lot_numero = v_lot, lat = p_lat, long = p_long,
           pin_hash = public._hash_pin(p_pin), session_hash = public._hash_token(v_token),
           solde_points = 0, essai_fin = public._fin_essai_nouveau(), pin_provisoire = false, is_temporary = false
     where id = v_id;
    return jsonb_build_object('token', v_token, 'profile', public._client_profil(v_id));
  end if;
  v_id := gen_random_uuid();

  insert into public.clients (id, nom, telephone, cite_id, lot_numero, lat, long, statut, pin_hash, session_hash, solde_points, essai_fin)
  values (v_id, v_nom, v_tel, p_cite, v_lot, p_lat, p_long, 'IMPAYE', public._hash_pin(p_pin), public._hash_token(v_token),
          0, public._fin_essai_nouveau());

  return jsonb_build_object('token', v_token, 'profile', public._client_profil(v_id));
end $$;

-- p_cite : UNE cité obligatoire, définitive (c'est ce qui détermine quels
-- clients le voient). p_source est facultatif (NULL) mais doit appartenir à
-- cette cité.
-- drop obligatoire : les anciennes signatures (source seule, puis tableau de
-- cités) resteraient sinon en base comme fonctions surchargées orphelines.
drop function if exists public.inscrire_chauffeur(text, text, uuid, text, int);
drop function if exists public.inscrire_chauffeur(text, text, uuid[], uuid, text, int);
create or replace function public.inscrire_chauffeur(p_nom text, p_tel text, p_cite uuid, p_source uuid, p_pin text, p_prix int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text := public.normalize_phone(p_tel);
  v_id  uuid := gen_random_uuid();
  v_token text := public._new_token();
begin
  if v_nom = '' or length(v_nom) > 40 then raise exception 'NOM_INVALIDE'; end if;
  if public._phone_ci(v_tel) is null then raise exception 'TEL_INVALIDE_CI'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_INVALIDE'; end if;
  if p_prix is null or p_prix not between 100 and 50000 then raise exception 'PRIX_INVALIDE'; end if;
  if p_cite is null or not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if p_source is not null and not exists (select 1 from public.sources where id = p_source and cite_id = p_cite) then
    raise exception 'SOURCE_INTROUVABLE';
  end if;
  if exists (select 1 from public.admins where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;
  if exists (select 1 from public.tricycles where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;

  insert into public.tricycles (id, nom, telephone, cite_id, source_id, prix_1000, statut, pin_hash, session_hash,
                                solde_points, essai_fin, valide)
  values (v_id, v_nom, v_tel, p_cite, p_source, p_prix, 'IMPAYE', public._hash_pin(p_pin), public._hash_token(v_token),
          0, public._fin_essai_nouveau(), false);

  return jsonb_build_object('token', v_token, 'profile', public._chauffeur_profil(v_id));
end $$;

-- ─── RPC : client ───────────────────────────────────────────────────────────

create or replace function public.client_profil(p_tel text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._client_profil(public._auth_client(p_tel, p_token))
$$;

-- Tous les chauffeurs de LA cité du client restent visibles et commandables,
-- quel que soit leur statut (ACTIVE / PAUSED / OFFLINE) : le chauffeur ne
-- refuse jamais, le client voit juste quand il sera livré. Seuls les comptes
-- bloqués (admin) ou à solde épuisé disparaissent.
drop function if exists public.tricycles_dispo(uuid);
create or replace function public.tricycles_dispo(p_cite uuid)
returns table (id uuid, nom text, source_id uuid, source_nom text, etat text, file_count int, prix_1000 int, status text)
language sql stable security definer set search_path = public as $$
  select t.id, t.nom, s.id, s.nom, t.etat,
         (select count(*)::int from public.commandes c
           where c.tricycle_id = t.id and c.status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING')),
         t.prix_1000, t.status
  from public.tricycles t
  left join public.sources s on s.id = t.source_id
  where t.cite_id = p_cite and t.statut <> 'BLOQUE' and t.valide
    and (public._en_essai(t.essai_fin) or (not t.is_offline and t.solde_points >= 50))
  order by case t.status when 'ACTIVE' then 0 when 'PAUSED' then 1 else 2 end, 6, t.nom
$$;

-- Prochain 8h00 heure d'Abidjan (UTC+0, pas d'heure d'été) : aujourd'hui s'il
-- n'est pas encore 8h, sinon demain.
create or replace function public._prochain_8h()
returns timestamptz language sql stable as $$
  select (case when x.local_now < date_trunc('day', x.local_now) + interval '8 hours'
               then date_trunc('day', x.local_now) + interval '8 hours'
               else date_trunc('day', x.local_now) + interval '1 day 8 hours' end) at time zone 'Africa/Abidjan'
  from (select now() at time zone 'Africa/Abidjan' as local_now) x
$$;

-- Distance à vol d'oiseau (Haversine), en mètres.
create or replace function public._distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

create or replace function public._today_abj()
returns date language sql stable as $$
  select (now() at time zone 'Africa/Abidjan')::date
$$;

-- Numéro ivoirien à 10 chiffres (01, 05, 07 mobiles ; 21, 25, 27 fixes),
-- indicatif +225 / 00225 accepté. Renvoie la forme canonique, ou NULL si invalide.
create or replace function public._phone_ci(p text)
returns text language sql immutable as $$
  select case when n ~ '^(01|05|07|21|25|27)[0-9]{8}$' then n end
  from (select public.normalize_phone(p) as n) x
$$;

-- -50 points au chauffeur pour une commande reçue, bonus fidélité dès 5000
-- utilisés, passage is_offline sous 50. Le tricycle doit déjà être verrouillé.
-- Pendant son essai gratuit : rien n'est débité. Renvoie true si débité.
-- Le bonus est rattaché à la commande qui l'a déclenché (commande_id) : cette
-- livraison est « offerte » au chauffeur et retirée du chiffre d'affaires.
-- drop obligatoire : le type de retour (void → boolean) puis la signature ont changé.
drop function if exists public._debiter_chauffeur(uuid);
drop function if exists public._debiter_chauffeur(uuid, uuid);
create or replace function public._debiter_chauffeur(p_tricycle uuid, p_commande uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_solde int;
  v_utilise int;
begin
  if (select public._en_essai(essai_fin) from public.tricycles where id = p_tricycle) then return false; end if;
  select solde_points - 50, total_points_utilises + 50 into v_solde, v_utilise from public.tricycles where id = p_tricycle;
  insert into public.points_transactions (tricycle_id, montant, type, commande_id) values (p_tricycle, -50, 'DEDUCTION', p_commande);
  if v_utilise >= 5000 then
    v_solde := v_solde + 50;
    v_utilise := 0;
    insert into public.points_transactions (tricycle_id, montant, type, commande_id) values (p_tricycle, 50, 'BONUS_FIDELITE', p_commande);
  end if;
  update public.tricycles set solde_points = v_solde, total_points_utilises = v_utilise, is_offline = (v_solde < 50)
   where id = p_tricycle;
  return true;
end $$;

-- Une commande = un voyage = 1000 L, au prix du chauffeur (figé). Le client doit
-- être authentifié : on ne fait plus confiance à un numéro déclaré librement.
--
-- Contrôles, dans l'ordre :
--   1. Règle Attiéké : déjà une commande active → 403 TROP_DE_COMMANDES:<id>
--   2. Verrouillage par cité : tricycle d'une autre cité → 403 HORS_ZONE
--   3. Forage du chauffeur à plus de 7 km de la position du client → TROP_LOIN
-- (403 = SQLSTATE PT403, que PostgREST renvoie tel quel comme statut HTTP.)
--
-- Jour de livraison (p_demain) : aujourd'hui ou demain uniquement.
--   Demain → PROGRAMMED pour demain 8h, quel que soit le chauffeur.
--   Aujourd'hui, selon le chauffeur (il ne refuse jamais) :
--     ACTIVE → ASSIGNED · PAUSED → QUEUED · OFFLINE → PROGRAMMED (prochain 8h)
-- Une commande programmée pour un jour suivant n'est plus annulable après 18h la veille.
--
-- Points (1 FCFA = 1 point), déduits à la création, rendus si le client annule :
--   client -100 (min 100) ; chauffeur -50 (min 50) + fidélité dès 5000 utilisés ;
--   sous 50, le chauffeur passe is_offline.
drop function if exists public.creer_commande(uuid, text, text, double precision, double precision);
create or replace function public.creer_commande(
  p_tricycle uuid, p_tel text, p_token text,
  p_lat double precision default null, p_long double precision default null,
  p_demain boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid := public._auth_client(p_tel, p_token);
  v_client public.clients%rowtype;
  v_t public.tricycles%rowtype;
  v_src public.sources%rowtype;
  v_active uuid;
  v_status text;
  v_prog timestamptz;
  v_sched date := public._today_abj();
  v_pos int;
  v_id  uuid;
  v_lat double precision;
  v_long double precision;
  v_client_essai boolean;
begin
  select * into v_client from public.clients where id = v_client_id for update;
  if v_client.statut = 'BLOQUE' then raise exception 'COMPTE_BLOQUE'; end if;
  v_client_essai := public._en_essai(v_client.essai_fin);

  select c.id into v_active from public.commandes c
   where c.client_id = v_client_id and c.status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING')
   order by c.created_at desc limit 1;
  if v_active is not null then
    raise exception using errcode = 'PT403', message = 'TROP_DE_COMMANDES:' || upper(left(v_active::text, 6));
  end if;

  if not v_client_essai and v_client.solde_points < 100 then raise exception 'SOLDE_INSUFFISANT_CLIENT'; end if;

  select * into v_t from public.tricycles where id = p_tricycle for update;
  if not found or v_t.statut = 'BLOQUE' or not v_t.valide
     or (not public._en_essai(v_t.essai_fin) and (v_t.is_offline or v_t.solde_points < 50)) then
    raise exception 'TRICYCLE_INDISPONIBLE';
  end if;

  if v_t.cite_id <> v_client.cite_id then
    raise exception using errcode = 'PT403', message = 'HORS_ZONE';
  end if;

  if p_lat is null or p_long is null or p_lat not between -90 and 90 or p_long not between -180 and 180 then
    v_lat := v_client.lat; v_long := v_client.long; -- pas de GPS frais fourni : on retombe sur celui du profil
  else
    v_lat := p_lat; v_long := p_long;
  end if;

  -- Garde-fou distance : seulement si on connaît les 2 positions (client + forage).
  if v_t.source_id is not null and v_lat is not null then
    select * into v_src from public.sources where id = v_t.source_id;
    if v_src.lat is not null and public._distance_m(v_src.lat, v_src.long, v_lat, v_long) > 7000 then
      raise exception 'TROP_LOIN';
    end if;
  end if;

  if coalesce(p_demain, false) then
    v_status := 'PROGRAMMED';
    v_sched := v_sched + 1;
    v_prog := (v_sched + time '08:00') at time zone 'Africa/Abidjan';
  else
    v_status := case v_t.status when 'ACTIVE' then 'ASSIGNED' when 'PAUSED' then 'QUEUED' else 'PROGRAMMED' end;
    if v_status = 'PROGRAMMED' then
      v_prog := public._prochain_8h();
      v_sched := (v_prog at time zone 'Africa/Abidjan')::date;
    end if;
  end if;

  select count(*) + 1 into v_pos from public.commandes
   where tricycle_id = p_tricycle and status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING');

  insert into public.commandes (client_id, tricycle_id, cite_id, lot_numero, position_file, status, prix, lat, long,
                                programmee_pour, scheduled_for, annulable_jusqua)
  values (v_client_id, p_tricycle, v_client.cite_id, v_client.lot_numero, v_pos, v_status, v_t.prix_1000, v_lat, v_long,
          v_prog, v_sched,
          case when v_sched > public._today_abj() then ((v_sched - 1) + time '18:00') at time zone 'Africa/Abidjan' end)
  returning id into v_id;

  -- Points : rien pendant l'essai gratuit (de chacun) ; ce qui est débité est noté
  -- sur la commande pour ne rendre que ça en cas d'annulation.
  if not v_client_essai then
    update public.clients set solde_points = solde_points - 100 where id = v_client_id;
    insert into public.points_transactions (client_id, montant, type, commande_id) values (v_client_id, -100, 'DEDUCTION', v_id);
  end if;
  update public.commandes set client_debite = not v_client_essai, chauffeur_debite = public._debiter_chauffeur(p_tricycle, v_id)
   where id = v_id;

  return v_id;
end $$;

-- Saisie directe par le chauffeur (appel, client sur place). Le client est
-- retrouvé par son numéro, ou créé en client temporaire. La commande entre
-- directement dans sa file (ASSIGNED), sans débit de points côté client.
create or replace function public.chauffeur_commande_manuelle(
  p_tel text, p_token text, p_nom text, p_client_tel text, p_lot text,
  p_quantite int default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v       uuid := public._auth_tricycle(p_tel, p_token);
  v_t     public.tricycles%rowtype;
  v_cl    public.clients%rowtype;
  v_nom   text := btrim(coalesce(p_nom, ''));
  v_ctel  text := public._phone_ci(p_client_tel);
  v_lot   text := btrim(coalesce(p_lot, ''));
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_temp  boolean := false;
  v_active uuid;
  v_pos   int;
  v_id    uuid;
begin
  if v_nom = '' or length(v_nom) > 40 then raise exception 'NOM_INVALIDE'; end if;
  if v_ctel is null then raise exception 'TEL_INVALIDE_CI'; end if;
  if v_lot = '' or length(v_lot) > 20 then raise exception 'LOT_INVALIDE'; end if;
  if p_quantite is not null and p_quantite not between 1 and 200 then raise exception 'QUANTITE_INVALIDE'; end if;
  if v_note is not null and length(v_note) > 280 then raise exception 'NOTE_INVALIDE'; end if;

  select * into v_t from public.tricycles where id = v for update;
  if v_t.statut = 'BLOQUE' then raise exception 'COMPTE_BLOQUE'; end if;
  if not v_t.valide then raise exception 'COMPTE_EN_ATTENTE'; end if;
  if not public._en_essai(v_t.essai_fin) and (v_t.is_offline or v_t.solde_points < 50) then raise exception 'SOLDE_INSUFFISANT'; end if;

  select * into v_cl from public.clients
   where telephone = v_ctel
   order by is_temporary limit 1
   for update;
  if found then
    if v_cl.cite_id <> v_t.cite_id then raise exception using errcode = 'PT403', message = 'HORS_ZONE'; end if;
    if v_cl.statut = 'BLOQUE' then raise exception 'CLIENT_BLOQUE'; end if;
    select c.id into v_active from public.commandes c
     where c.client_id = v_cl.id and c.status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING')
     order by c.created_at desc limit 1;
    if v_active is not null then
      raise exception using errcode = 'PT403', message = 'TROP_DE_COMMANDES:' || upper(left(v_active::text, 6));
    end if;
    v_temp := v_cl.is_temporary;
  else
    v_cl.id := gen_random_uuid();
    insert into public.clients (id, nom, telephone, cite_id, lot_numero, statut, solde_points, is_temporary, pin_hash)
    values (v_cl.id, v_nom, v_ctel, v_t.cite_id, v_lot, 'IMPAYE', 0, true, '!' || public._new_token());
    v_temp := true;
  end if;

  select count(*) + 1 into v_pos from public.commandes
   where tricycle_id = v and status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING');

  insert into public.commandes (client_id, tricycle_id, cite_id, lot_numero, position_file, status, prix, lat, long,
                                source, added_by_driver_id, is_temporary_client, quantite_bidons, note)
  values (v_cl.id, v, v_t.cite_id, v_lot, v_pos, 'ASSIGNED', v_t.prix_1000, v_cl.lat, v_cl.long,
          'manual', v, v_temp, p_quantite, v_note)
  returning id into v_id;

  update public.commandes set client_debite = false, chauffeur_debite = public._debiter_chauffeur(v, v_id) where id = v_id;

  insert into public.journal_actions (action, acteur_type, acteur_id, details)
  values ('COMMANDE_MANUELLE', 'chauffeur', v,
          jsonb_build_object('commande_id', v_id, 'client_id', v_cl.id, 'client_temporaire', v_temp, 'chauffeur_nom', v_t.nom));

  return v_id;
end $$;

-- Lots déjà connus dans la cité du chauffeur (liste de la saisie directe).
create or replace function public.chauffeur_lots(p_tel text, p_token text)
returns table (lot_numero text)
language sql stable security definer set search_path = public as $$
  select distinct cl.lot_numero from public.clients cl
  join public.tricycles t on t.cite_id = cl.cite_id
  where t.id = public._auth_tricycle(p_tel, p_token)
  order by 1
$$;

-- Le client annule tant que le chauffeur n'est pas parti (QUEUED / ASSIGNED /
-- PROGRAMMED) : la file remonte d'un cran et les points sont rendus des 2 côtés.
create or replace function public.client_annuler_commande(p_tel text, p_token text, p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public._auth_client(p_tel, p_token);
  v_cmd public.commandes%rowtype;
  v_solde int;
begin
  -- Même ordre de verrous que creer_commande (client puis tricycle).
  perform 1 from public.clients where id = v_client for update;
  select * into v_cmd from public.commandes where id = p_commande and client_id = v_client;
  if not found or v_cmd.status not in ('QUEUED', 'ASSIGNED', 'PROGRAMMED') then raise exception 'ANNULATION_IMPOSSIBLE'; end if;
  if v_cmd.annulable_jusqua is not null and now() >= v_cmd.annulable_jusqua then raise exception 'ANNULATION_TARDIVE'; end if;
  perform 1 from public.tricycles where id = v_cmd.tricycle_id for update;

  update public.commandes set status = 'ANNULEE', position_file = 0, programmee_pour = null where id = p_commande;
  update public.commandes set position_file = position_file - 1
   where tricycle_id = v_cmd.tricycle_id and position_file > v_cmd.position_file
     and status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING');

  -- Seuls les points réellement débités sont rendus (rien pendant l'essai gratuit).
  if v_cmd.source = 'app' and v_cmd.client_debite then
    update public.clients set solde_points = solde_points + 100 where id = v_client;
    insert into public.points_transactions (client_id, montant, type, commande_id) values (v_client, 100, 'REMBOURSEMENT', p_commande);
  end if;
  if v_cmd.chauffeur_debite then
    update public.tricycles set solde_points = solde_points + 50 where id = v_cmd.tricycle_id returning solde_points into v_solde;
    if v_solde >= 50 then update public.tricycles set is_offline = false where id = v_cmd.tricycle_id; end if;
    insert into public.points_transactions (tricycle_id, montant, type, commande_id) values (v_cmd.tricycle_id, 50, 'REMBOURSEMENT', p_commande);
  end if;
end $$;

-- Vue interne du suivi d'une commande (jamais exposée : droits retirés plus bas,
-- lue uniquement par les 2 RPC qui suivent). La position live du tricycle n'est
-- remplie que pendant ARRIVING, dans les 10 min qui suivent « J'arrive chez
-- toi », et si elle a moins de 5 min (TTL de positions_live).
drop function if exists public.suivi_commande(uuid);
drop function if exists public.client_commande_active(text, text);
drop view if exists public.v_suivi;
create view public.v_suivi as
  select c.id, c.status, c.position_file, c.prix, c.lot_numero,
         c.lat, c.long, c.created_at, c.programmee_pour, c.arriving_at,
         c.scheduled_for, c.annulable_jusqua, c.source,
         t.id as tricycle_id, t.nom as chauffeur_nom, t.telephone as chauffeur_tel, t.etat, t.status as chauffeur_status,
         ci.nom as cite_nom, s.nom as source_nom,
         p.lat as tricycle_lat, p.long as tricycle_long, p.maj as tricycle_position_maj
  from public.commandes c
  join public.tricycles t on t.id = c.tricycle_id
  left join public.sources s on s.id = t.source_id
  join public.cites ci on ci.id = c.cite_id
  left join public.positions_live p
         on p.commande_id = c.id
        and c.status = 'ARRIVING'
        and c.arriving_at > now() - interval '10 minutes'
        and p.maj > now() - interval '5 minutes';
revoke all on public.v_suivi from public, anon, authenticated;

create or replace function public.suivi_commande(p_id uuid)
returns setof public.v_suivi
language sql stable security definer set search_path = public as $$
  select * from public.v_suivi where id = p_id
$$;

-- Commande active du client connecté (pour son tableau de bord, sans lien secret).
create or replace function public.client_commande_active(p_tel text, p_token text)
returns setof public.v_suivi
language sql stable security definer set search_path = public as $$
  select v.* from public.v_suivi v
  join public.commandes c on c.id = v.id
  where c.client_id = public._auth_client(p_tel, p_token)
    and c.status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING')
  order by c.created_at desc limit 1
$$;

-- Historique du client connecté (menu « Historique » + résumé du mois) : ses
-- commandes des 12 derniers mois, regroupées par mois côté appli.
drop function if exists public.client_historique(text, text);
create or replace function public.client_historique(p_tel text, p_token text)
returns table (
  id uuid, status text, prix int, source text, created_at timestamptz,
  livree_at timestamptz, scheduled_for date, chauffeur_nom text, client_debite boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.status, c.prix, c.source, c.created_at, c.livree_at, c.scheduled_for, t.nom, c.client_debite
  from public.commandes c
  join public.tricycles t on t.id = c.tricycle_id
  where c.client_id = public._auth_client(p_tel, p_token)
    and c.created_at > now() - interval '12 months'
  order by c.created_at desc
$$;

-- ─── RPC : chauffeur ────────────────────────────────────────────────────────

create or replace function public.chauffeur_profil(p_tel text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._chauffeur_profil(public._auth_tricycle(p_tel, p_token))
$$;

drop function if exists public.chauffeur_file(text, text);
create or replace function public.chauffeur_file(p_tel text, p_token text)
returns table (
  id uuid, lot_numero text, position_file int, status text,
  lat double precision, long double precision, created_at timestamptz,
  programmee_pour timestamptz, arriving_at timestamptz,
  client_nom text, client_tel text,
  scheduled_for date, source text, added_by_nom text, is_temporary_client boolean,
  quantite_bidons int, note text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.lot_numero, c.position_file, c.status, c.lat, c.long, c.created_at,
         c.programmee_pour, c.arriving_at, cl.nom, cl.telephone,
         c.scheduled_for, c.source, d.nom, c.is_temporary_client, c.quantite_bidons, c.note
  from public.commandes c
  join public.clients cl on cl.id = c.client_id
  left join public.tricycles d on d.id = c.added_by_driver_id
  where c.tricycle_id = public._auth_tricycle(p_tel, p_token)
    and c.status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING')
  order by c.position_file
$$;

-- Historique du chauffeur connecté (menu « Mes statistiques ») : ses commandes
-- des 12 derniers mois, regroupées par mois côté appli.
drop function if exists public.chauffeur_historique(text, text);
create or replace function public.chauffeur_historique(p_tel text, p_token text)
returns table (
  id uuid, status text, prix int, source text, created_at timestamptz, livree_at timestamptz,
  lot_numero text, client_nom text, quantite_bidons int, chauffeur_debite boolean, chauffeur_bonus boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.status, c.prix, c.source, c.created_at, c.livree_at, c.lot_numero, cl.nom, c.quantite_bidons,
         c.chauffeur_debite,
         exists (select 1 from public.points_transactions pt
                  where pt.commande_id = c.id and pt.type = 'BONUS_FIDELITE')
  from public.commandes c
  join public.clients cl on cl.id = c.client_id
  where c.tricycle_id = public._auth_tricycle(p_tel, p_token)
    and c.created_at > now() - interval '12 months'
  order by c.created_at desc
$$;

-- ACTIVE / PAUSED / OFFLINE. Repasser ACTIVE assigne d'un coup, dans l'ordre
-- de la file (FIFO), toutes ses commandes QUEUED — et les PROGRAMMED dont
-- l'heure est déjà passée.
create or replace function public.chauffeur_set_status(p_tel text, p_token text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v uuid := public._auth_tricycle(p_tel, p_token);
  t public.tricycles%rowtype;
begin
  if p_status not in ('ACTIVE', 'PAUSED', 'OFFLINE') then raise exception 'STATUT_INVALIDE'; end if;
  select * into t from public.tricycles where id = v for update;
  if p_status <> 'OFFLINE' and t.statut = 'BLOQUE' then raise exception 'COMPTE_BLOQUE'; end if;
  if p_status <> 'OFFLINE' and not t.valide then raise exception 'COMPTE_EN_ATTENTE'; end if;
  if p_status <> 'OFFLINE' and not public._en_essai(t.essai_fin) and (t.is_offline or t.solde_points < 50) then
    raise exception 'SOLDE_INSUFFISANT';
  end if;

  update public.tricycles set status = p_status where id = v;

  if p_status = 'ACTIVE' then
    update public.commandes set status = 'ASSIGNED', programmee_pour = null
     where tricycle_id = v
       and (status = 'QUEUED' or (status = 'PROGRAMMED' and scheduled_for <= public._today_abj()));
  end if;
end $$;

create or replace function public.chauffeur_set_prix(p_tel text, p_token text, p_prix int)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_tricycle(p_tel, p_token);
begin
  if p_prix is null or p_prix not between 100 and 50000 then raise exception 'PRIX_INVALIDE'; end if;
  update public.tricycles set prix_1000 = p_prix where id = v;
end $$;

create or replace function public.chauffeur_set_etat(p_tel text, p_token text, p_etat text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_tricycle(p_tel, p_token);
begin
  if p_etat not in ('A_LA_SOURCE', 'EN_ROUTE') then raise exception 'ETAT_INVALIDE'; end if;
  update public.tricycles set etat = p_etat where id = v;
end $$;

-- Position GPS live — acceptée UNIQUEMENT pendant ARRIVING, dans les 10 min
-- qui suivent « J'arrive chez toi ». Le throttle (10 s / 30 s / rien à l'arrêt)
-- est fait côté téléphone ; ici :
--   1. dernière position écrasée dans positions_live (cache, TTL 5 min) ;
--   2. 1 point d'historique toutes les 2 min max dans positions_historique ;
--   3. diffusion directe sur suivi:<commande_id> — SEUL le client de cette
--      commande l'écoute. Aucune table surveillée n'est modifiée : pas de
--      rechargement de la cité ni de l'admin.
-- Renvoie {actif:false} quand le partage est terminé : le téléphone arrête le GPS.
drop function if exists public.chauffeur_set_position(text, text, double precision, double precision);
create or replace function public.chauffeur_set_position(p_tel text, p_token text, p_lat double precision, p_long double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v     uuid := public._auth_tricycle(p_tel, p_token);
  v_cmd uuid;
begin
  if p_lat is null or p_long is null or p_lat not between -90 and 90 or p_long not between -180 and 180 then
    raise exception 'POSITION_INVALIDE';
  end if;

  select c.id into v_cmd from public.commandes c
   where c.tricycle_id = v and c.status = 'ARRIVING' and c.arriving_at > now() - interval '10 minutes'
   limit 1;
  if v_cmd is null then
    delete from public.positions_live where tricycle_id = v;
    return jsonb_build_object('actif', false);
  end if;

  insert into public.positions_live (tricycle_id, commande_id, lat, long, maj)
  values (v, v_cmd, p_lat, p_long, now())
  on conflict (tricycle_id) do update set commande_id = excluded.commande_id, lat = excluded.lat, long = excluded.long, maj = excluded.maj;

  if not exists (select 1 from public.positions_historique
                  where commande_id = v_cmd and created_at > now() - interval '2 minutes') then
    insert into public.positions_historique (commande_id, tricycle_id, lat, long) values (v_cmd, v, p_lat, p_long);
  end if;

  begin
    perform realtime.send(jsonb_build_object('lat', p_lat, 'long', p_long, 'at', now()), 'position', 'suivi:' || v_cmd, false);
  exception when others then
    null; -- le client retombe sur le polling de suivi_commande
  end;

  return jsonb_build_object('actif', true);
end $$;

-- « Je pars livrer » : la première commande ASSIGNED de la file passe EN_COURS.
-- Les points ont déjà été déduits à la création de la commande. Renvoie quand
-- même jsonb (bonus_fidelite toujours false) pour garder le contrat frontend.
create or replace function public.chauffeur_partir(p_tel text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v     uuid := public._auth_tricycle(p_tel, p_token);
  v_cmd uuid;
  v_solde int;
begin
  select solde_points into v_solde from public.tricycles where id = v for update;
  if exists (select 1 from public.commandes where tricycle_id = v and status in ('EN_COURS', 'ARRIVING')) then
    raise exception 'DEJA_EN_COURS';
  end if;
  select c.id into v_cmd from public.commandes c where c.tricycle_id = v and c.status = 'ASSIGNED' order by c.position_file limit 1;
  if v_cmd is null then raise exception 'FILE_VIDE'; end if;

  update public.commandes set status = 'EN_COURS' where id = v_cmd;
  update public.tricycles set etat = 'EN_ROUTE' where id = v;

  return jsonb_build_object('bonus_fidelite', false, 'solde_points', v_solde);
end $$;

-- « J'arrive chez toi » : EN_COURS → ARRIVING. Ouvre la fenêtre de 10 min
-- pendant laquelle chauffeur_set_position accepte et diffuse le GPS.
create or replace function public.chauffeur_arriver(p_tel text, p_token text, p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_tricycle(p_tel, p_token);
begin
  update public.commandes set status = 'ARRIVING', arriving_at = now()
   where id = p_commande and tricycle_id = v and status = 'EN_COURS';
  if not found then raise exception 'COMMANDE_INTROUVABLE'; end if;
end $$;

create or replace function public.chauffeur_livrer(p_tel text, p_token text, p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v     uuid := public._auth_tricycle(p_tel, p_token);
  v_pos int;
begin
  perform 1 from public.tricycles where id = v for update;
  select c.position_file into v_pos from public.commandes c
   where c.id = p_commande and c.tricycle_id = v and c.status in ('EN_COURS', 'ARRIVING');
  if v_pos is null then raise exception 'COMMANDE_INTROUVABLE'; end if;
  update public.commandes set status = 'LIVREE', position_file = 0, livree_at = now() where id = p_commande;
  update public.commandes set position_file = position_file - 1
   where tricycle_id = v and position_file > v_pos
     and status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING');
  -- Fin de course : le partage GPS s'arrête immédiatement.
  delete from public.positions_live where tricycle_id = v;
  perform public._journaliser_facturation(p_commande);
end $$;

-- Facturation (préparation) : chaque livraison est journalisée avec son
-- montant et son caractère facturable. Rien n'est bloqué ni débité pendant
-- la période d'essai (settings.trial_ends_at).
create or replace function public._journaliser_facturation(p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fin  date;
  v_essai boolean;
begin
  select trial_ends_at into v_fin from public.settings where id;
  v_essai := v_fin is null or public._today_abj() <= v_fin;
  insert into public.journal_actions (action, acteur_type, acteur_id, details)
  select 'FACTURATION', 'systeme', c.tricycle_id,
         jsonb_build_object('commande_id', c.id, 'prix', c.prix, 'source', c.source,
                            'periode_essai', v_essai, 'facturable', not v_essai, 'trial_ends_at', v_fin)
  from public.commandes c where c.id = p_commande;
end $$;

-- ─── Tâches planifiées (pg_cron) ───────────────────────────────────────────

-- 23h59 : les commandes QUEUED non livrées du jour passent PROGRAMMED pour
-- demain 8h. Le trigger notify_change ping client:<id> : le client voit le
-- nouveau message (« programmée demain 8h ») sans recharger.
create or replace function public.rollover_queued_orders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.commandes
     set status = 'PROGRAMMED', programmee_pour = public._prochain_8h(),
         scheduled_for = (public._prochain_8h() at time zone 'Africa/Abidjan')::date
   where status = 'QUEUED';
  get diagnostics n = row_count;
  return n;
end $$;

-- 00h00 (et 8h00 en rattrapage) : les commandes PROGRAMMED dont le jour est
-- arrivé entrent dans la file du jour — ASSIGNED si le chauffeur est déjà
-- ACTIVE, sinon QUEUED (elles lui seront assignées dès qu'il passe ACTIVE).
create or replace function public.release_programmed_orders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.commandes c
     set status = case when t.status = 'ACTIVE' then 'ASSIGNED' else 'QUEUED' end,
         programmee_pour = null
    from public.tricycles t
   where t.id = c.tricycle_id and c.status = 'PROGRAMMED' and c.scheduled_for <= public._today_abj();
  get diagnostics n = row_count;
  return n;
end $$;

-- TTL de positions_live : purge des positions de plus de 5 min.
create or replace function public.purge_positions_live()
returns void language sql security definer set search_path = public as $$
  delete from public.positions_live where maj < now() - interval '5 minutes'
$$;

-- pg_cron tourne en UTC sur Supabase = heure d'Abidjan. cron.schedule(nom, …)
-- met à jour le job s'il existe déjà (idempotent). Si pg_cron n'est pas
-- activé (Database → Extensions), le schéma passe quand même, avec un avertissement.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('awa-rollover-queued',   '59 23 * * *', 'select public.rollover_queued_orders()');
  perform cron.schedule('awa-release-programmed', '0 0 * * *',  'select public.release_programmed_orders()');
  perform cron.schedule('awa-release-8h',        '0 8 * * *',  'select public.release_programmed_orders()');
  perform cron.schedule('awa-purge-positions',   '*/5 * * * *', 'select public.purge_positions_live()');
exception when others then
  raise warning 'pg_cron indisponible (%). Active l''extension pg_cron puis relance ce script.', sqlerrm;
end $$;

-- ─── RPC : admin (cockpit total) ────────────────────────────────────────────

create or replace function public.admin_load(p_tel text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token);
begin
  return jsonb_build_object(
    'cites', (select coalesce(jsonb_agg(to_jsonb(x) order by x.nom), '[]'::jsonb) from public.cites x),
    'sources', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.sources x),
    'tricycles', (select coalesce(jsonb_agg(to_jsonb(x) - 'pin_hash' - 'session_hash' - 'pin_essais' - 'pin_bloque_jusqua' - 'created_at'), '[]'::jsonb)
                  from public.tricycles x),
    'clients', (select coalesce(jsonb_agg(to_jsonb(x) - 'pin_hash' - 'session_hash' - 'pin_essais' - 'pin_bloque_jusqua' - 'created_at'), '[]'::jsonb)
                from public.clients x),
    'commandes', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('chauffeur_bonus', exists (
                    select 1 from public.points_transactions pt where pt.commande_id = x.id and pt.type = 'BONUS_FIDELITE'))
                  order by x.created_at desc), '[]'::jsonb) from public.commandes x),
    'settings', (select to_jsonb(s) - 'id' from public.settings s where s.id)
  );
end $$;

create or replace function public.admin_save_cite(p_tel text, p_token text, p_id uuid, p_nom text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token); v_nom text := btrim(coalesce(p_nom, ''));
begin
  if v_nom = '' then raise exception 'NOM_INVALIDE'; end if;
  if p_id is null then insert into public.cites (nom) values (v_nom);
  else update public.cites set nom = v_nom where id = p_id; end if;
end $$;

create or replace function public.admin_save_source(
  p_tel text, p_token text, p_id uuid, p_nom text, p_cite uuid,
  p_lat double precision default null, p_long double precision default null
) returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token); v_nom text := btrim(coalesce(p_nom, ''));
begin
  if v_nom = '' then raise exception 'NOM_INVALIDE'; end if;
  if not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if p_id is null then insert into public.sources (nom, cite_id, lat, long) values (v_nom, p_cite, p_lat, p_long);
  else update public.sources set nom = v_nom, cite_id = p_cite, lat = p_lat, long = p_long where id = p_id; end if;
end $$;

create or replace function public.admin_remove(p_tel text, p_token text, p_table text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token);
begin
  if p_table = 'cites' then delete from public.cites where id = p_id;
  elsif p_table = 'sources' then delete from public.sources where id = p_id;
  elsif p_table = 'tricycles' then delete from public.tricycles where id = p_id;
  elsif p_table = 'clients' then delete from public.clients where id = p_id;
  else raise exception 'TABLE_INVALIDE';
  end if;
end $$;

create or replace function public.admin_set_statut(p_tel text, p_token text, p_table text, p_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token);
begin
  if p_statut not in ('PAYE', 'IMPAYE', 'BLOQUE') then raise exception 'STATUT_INVALIDE'; end if;
  if p_table = 'tricycles' then
    update public.tricycles set statut = p_statut, status = (case when p_statut = 'BLOQUE' then 'OFFLINE' else status end) where id = p_id;
  elsif p_table = 'clients' then
    update public.clients set statut = p_statut, date_paiement = (case when p_statut = 'PAYE' then now() else date_paiement end) where id = p_id;
  else raise exception 'TABLE_INVALIDE';
  end if;
end $$;

-- Nettoyage : abonnement client remplacé par le système de points ci-dessous,
-- cette fonction n'a plus de raison d'exister (sinon elle traîne, orpheline,
-- sur les bases déjà migrées).
drop function if exists public.admin_prolonger_abonnement(text, text, uuid);

-- Recharge manuelle de points (l'admin l'appelle après avoir reçu le paiement
-- Wave) — clients ET chauffeurs, système 100% recharge : montant multiple de
-- 50 obligatoire (100 pour un client), débloque automatiquement le compte si son solde repasse à
-- 50 ou plus (uniquement pertinent pour les chauffeurs : is_offline), et
-- logue la transaction.
-- drop obligatoire : la signature change (p_table en 3e position, remplace
-- l'ancien p_tricycle) — CREATE OR REPLACE seul créerait une 2e fonction
-- surchargée orpheline plutôt que de remplacer l'ancienne.
drop function if exists public.admin_recharger_points(text, text, uuid, int);
create or replace function public.admin_recharger_points(p_tel text, p_token text, p_table text, p_id uuid, p_montant int)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token); v_solde int;
begin
  if p_montant is null or p_montant <= 0 or p_montant % 50 <> 0 then raise exception 'MONTANT_INVALIDE'; end if;
  -- Client : multiple de 100 (= 1 commande), pour un solde toujours en commandes entières.
  if p_table = 'clients' and p_montant % 100 <> 0 then raise exception 'MONTANT_INVALIDE_CLIENT'; end if;
  if p_table = 'tricycles' then
    update public.tricycles set solde_points = solde_points + p_montant where id = p_id returning solde_points into v_solde;
    if v_solde is null then raise exception 'CHAUFFEUR_INTROUVABLE'; end if;
    if v_solde >= 50 then update public.tricycles set is_offline = false where id = p_id; end if;
    insert into public.points_transactions (tricycle_id, montant, type) values (p_id, p_montant, 'RECHARGE');
  elsif p_table = 'clients' then
    update public.clients set solde_points = solde_points + p_montant where id = p_id returning solde_points into v_solde;
    if v_solde is null then raise exception 'CLIENT_INTROUVABLE'; end if;
    insert into public.points_transactions (client_id, montant, type) values (p_id, p_montant, 'RECHARGE');
  else
    raise exception 'TABLE_INVALIDE';
  end if;
end $$;

create or replace function public.admin_change_password(p_tel text, p_token text, p_nouveau text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token);
begin
  if p_nouveau is null or length(p_nouveau) < 10 then raise exception 'MDP_INVALIDE'; end if;
  update public.admins set password_hash = public._hash_pin(p_nouveau) where id = v;
end $$;

-- ─── RPC : code PIN oublié ──────────────────────────────────────────────────
-- Pas de SMS : le client/chauffeur appelle l'admin, qui vérifie son identité au
-- téléphone puis génère ici un code provisoire à 4 chiffres (affiché une seule
-- fois). Les sessions en cours sont coupées ; à la connexion suivante, l'appli
-- impose de choisir un nouveau code (pin_provisoire).
create or replace function public.admin_reinitialiser_pin(p_tel text, p_token text, p_table text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v uuid := public._auth_admin(p_tel, p_token);
  v_pin text := lpad(((('x' || encode(extensions.gen_random_bytes(2), 'hex'))::bit(16)::int) % 10000)::text, 4, '0');
begin
  if p_table = 'clients' then
    update public.clients set pin_hash = public._hash_pin(v_pin), pin_provisoire = true, session_hash = null,
           pin_essais = 0, pin_bloque_jusqua = null
     where id = p_id and not is_temporary;
  elsif p_table = 'tricycles' then
    update public.tricycles set pin_hash = public._hash_pin(v_pin), pin_provisoire = true, session_hash = null,
           pin_essais = 0, pin_bloque_jusqua = null
     where id = p_id;
  else
    raise exception 'TABLE_INVALIDE';
  end if;
  if not found then raise exception 'COMPTE_INTROUVABLE'; end if;
  insert into public.journal_actions (action, acteur_type, acteur_id, details)
  values ('PIN_REINITIALISE', 'admin', v, jsonb_build_object('table', p_table, 'compte_id', p_id));
  return v_pin;
end $$;

create or replace function public.client_changer_pin(p_tel text, p_token text, p_nouveau text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_client(p_tel, p_token);
begin
  if p_nouveau is null or p_nouveau !~ '^[0-9]{4}$' then raise exception 'PIN_INVALIDE'; end if;
  update public.clients set pin_hash = public._hash_pin(p_nouveau), pin_provisoire = false where id = v;
end $$;

create or replace function public.chauffeur_changer_pin(p_tel text, p_token text, p_nouveau text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_tricycle(p_tel, p_token);
begin
  if p_nouveau is null or p_nouveau !~ '^[0-9]{4}$' then raise exception 'PIN_INVALIDE'; end if;
  update public.tricycles set pin_hash = public._hash_pin(p_nouveau), pin_provisoire = false where id = v;
end $$;

-- ─── RPC : validation des chauffeurs (anti-intrusion) ───────────────────────
-- Un chauffeur inscrit par le lien de recrutement n'apparaît aux clients
-- qu'après validation par l'admin (vérification d'identité, de son tricycle…).
create or replace function public.admin_valider_chauffeur(p_tel text, p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token);
begin
  update public.tricycles set valide = true where id = p_id;
  if not found then raise exception 'CHAUFFEUR_INTROUVABLE'; end if;
  insert into public.journal_actions (action, acteur_type, acteur_id, details)
  values ('CHAUFFEUR_VALIDE', 'admin', v, jsonb_build_object('tricycle_id', p_id));
end $$;

-- ─── RPC : paramètres ───────────────────────────────────────────────────────

-- Lecture publique (page d'accueil, écran « Solde insuffisant ») : seul le
-- numéro de dépôt sort, pas le reste de settings.
create or replace function public.get_depot_phone()
returns text language sql stable security definer set search_path = public as $$
  select depot_phone from public.settings where id
$$;

-- Fin de la période d'essai (lecture publique) : pendant l'essai, clients et
-- chauffeurs voient « Essai gratuit » au lieu de leur statut et de leur solde.
create or replace function public.get_essai_fin()
returns date language sql stable security definer set search_path = public as $$
  select trial_ends_at from public.settings where id
$$;

create or replace function public.admin_set_depot_phone(p_tel text, p_token text, p_depot text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v uuid := public._auth_admin(p_tel, p_token);
  v_depot text := public._phone_ci(p_depot);
  v_ancien text;
begin
  if v_depot is null then raise exception 'TEL_INVALIDE_CI'; end if;
  select depot_phone into v_ancien from public.settings where id;
  update public.settings set depot_phone = v_depot, updated_at = now() where id;
  insert into public.journal_actions (action, acteur_type, acteur_id, details)
  values ('DEPOT_PHONE', 'admin', v, jsonb_build_object('ancien', v_ancien, 'nouveau', v_depot));
end $$;

-- Nom du marchand Wave (lecture publique : affiché sur les écrans de recharge).
create or replace function public.get_wave_marchand()
returns text language sql stable security definer set search_path = public as $$
  select wave_marchand from public.settings where id
$$;

create or replace function public.admin_set_wave_marchand(p_tel text, p_token text, p_nom text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v uuid := public._auth_admin(p_tel, p_token);
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_ancien text;
begin
  if length(v_nom) not between 2 and 60 or v_nom ~ '[[:cntrl:]<>]' then raise exception 'NOM_MARCHAND_INVALIDE'; end if;
  select wave_marchand into v_ancien from public.settings where id;
  update public.settings set wave_marchand = v_nom, updated_at = now() where id;
  insert into public.journal_actions (action, acteur_type, acteur_id, details)
  values ('WAVE_MARCHAND', 'admin', v, jsonb_build_object('ancien', v_ancien, 'nouveau', v_nom));
end $$;

-- ─── RPC : vérification de session (middleware Next.js) ─────────────────────
-- Appelée côté serveur avant de servir un espace privé : le jeton est-il
-- toujours celui de la dernière connexion pour ce rôle ? Ne renvoie qu'un booléen.
create or replace function public.session_valide(p_role text, p_tel text, p_token text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_tel  text := public.normalize_phone(p_tel);
  v_hash text := public._hash_token(p_token);
begin
  if p_token is null or length(p_token) < 16 then return false; end if;
  if p_role = 'admin' then
    return exists (select 1 from public.admins where email = lower(btrim(p_tel)) and session_hash = v_hash);
  elsif p_role = 'chauffeur' then
    return exists (select 1 from public.tricycles where telephone = v_tel and session_hash = v_hash);
  elsif p_role = 'client' then
    return exists (select 1 from public.clients where telephone = v_tel and session_hash = v_hash);
  end if;
  return false;
end $$;

-- ─── RPC : statistiques annuelles (admin) ──────────────────────────────────
-- Une seule requête pour toute la page /admin/statistiques. Les mois sont ceux
-- de la date de commande (heure d'Abidjan). Filtres facultatifs : cité, chauffeur.
--   ca_brut         revenu plateforme des commandes LIVREE : 100 par client débité
--                   + 50 par chauffeur débité (rien pendant les essais, 50 seulement
--                   pour une saisie manuelle : le client n'y paie pas)
--   bonus           livraisons LIVREE offertes au chauffeur (bonus fidélité)
--   ca              ca_brut - 50 × bonus
--   echecs          commandes encore actives dont le jour prévu est passé
--   nouveaux        clients dont la toute première commande tombe dans le mois
--   recurrents      clients ayant déjà commandé avant ce mois
--   clients_plus_3  clients ayant passé plus de 3 commandes sur la période
--   remboursements  points rendus aux clients (1 point = 1 FCFA) sur annulation
create or replace function public.get_yearly_stats(
  p_tel text, p_token text, year_param int,
  p_cite uuid default null, p_tricycle uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := public._auth_admin(p_tel, p_token);
  r jsonb;
begin
  with premiere as (
    select client_id, min(created_at) as premiere from public.commandes group by client_id
  ),
  base as (
    select c.id, c.client_id, c.tricycle_id, c.cite_id, c.lot_numero, c.status, c.source, c.prix,
           c.quantite_bidons, c.scheduled_for, c.created_at, c.livree_at, p.premiere,
           c.client_debite, c.chauffeur_debite,
           exists (select 1 from public.points_transactions pt
                    where pt.commande_id = c.id and pt.type = 'BONUS_FIDELITE') as chauffeur_bonus,
           extract(year  from c.created_at at time zone 'Africa/Abidjan')::int as an,
           extract(month from c.created_at at time zone 'Africa/Abidjan')::int as mois,
           extract(month from p.premiere at time zone 'Africa/Abidjan')::int as mois_premiere,
           extract(year  from p.premiere at time zone 'Africa/Abidjan')::int as an_premiere
    from public.commandes c
    join premiere p on p.client_id = c.client_id
    where (p_cite is null or c.cite_id = p_cite)
      and (p_tricycle is null or c.tricycle_id = p_tricycle)
      and c.created_at >= make_timestamptz(year_param - 1, 1, 1, 0, 0, 0, 'Africa/Abidjan')
      and c.created_at <  make_timestamptz(year_param + 1, 1, 1, 0, 0, 0, 'Africa/Abidjan')
  ),
  cur as (select * from base where an = year_param),
  rembs as (
    select b.mois, sum(pt.montant)::int as montant, count(*)::int as nb
    from public.points_transactions pt
    join cur b on b.id = pt.commande_id
    where pt.type = 'REMBOURSEMENT' and pt.client_id is not null
    group by b.mois
  ),
  plus3 as (
    select mois, count(*)::int as nb from (
      select mois, client_id from cur group by mois, client_id having count(*) > 3
    ) x group by mois
  ),
  agg as (
    select mois,
           count(*)::int as total,
           count(*) filter (where source = 'app')::int as app,
           count(*) filter (where source = 'manual')::int as manual,
           count(*) filter (where status = 'LIVREE')::int as livrees,
           count(*) filter (where status = 'ANNULEE')::int as annulees,
           count(*) filter (where status in ('QUEUED', 'ASSIGNED', 'PROGRAMMED', 'EN_COURS', 'ARRIVING')
                              and scheduled_for < public._today_abj())::int as echecs,
           coalesce(sum(quantite_bidons) filter (where status = 'LIVREE'), 0)::int as bidons,
           (100 * count(*) filter (where status = 'LIVREE' and client_debite)
            + 50 * count(*) filter (where status = 'LIVREE' and chauffeur_debite))::bigint as ca_brut,
           count(*) filter (where status = 'LIVREE' and chauffeur_bonus)::int as bonus,
           (100 * count(*) filter (where status = 'LIVREE' and client_debite)
            + 50 * count(*) filter (where status = 'LIVREE' and chauffeur_debite)
            - 50 * count(*) filter (where status = 'LIVREE' and chauffeur_bonus))::bigint as ca,
           count(distinct client_id)::int as clients_uniques,
           count(distinct client_id) filter (where an_premiere = an and mois_premiere = mois)::int as nouveaux,
           count(distinct client_id) filter (where not (an_premiere = an and mois_premiere = mois))::int as recurrents,
           round(avg(extract(epoch from livree_at - created_at) / 60)
                 filter (where status = 'LIVREE' and livree_at is not null))::int as temps_moyen_min,
           count(*) filter (where status = 'LIVREE' and livree_at is not null)::int as livrees_chronometrees
    from cur group by mois
  ),
  mois_complets as (
    select m.mois,
           coalesce(a.total, 0) total, coalesce(a.app, 0) app, coalesce(a.manual, 0) manual,
           coalesce(a.livrees, 0) livrees, coalesce(a.annulees, 0) annulees, coalesce(a.echecs, 0) echecs,
           coalesce(a.bidons, 0) bidons, coalesce(a.ca, 0) ca, coalesce(a.ca_brut, 0) ca_brut, coalesce(a.bonus, 0) bonus,
           coalesce(a.clients_uniques, 0) clients_uniques, coalesce(a.nouveaux, 0) nouveaux, coalesce(a.recurrents, 0) recurrents,
           coalesce(p3.nb, 0) clients_plus_3,
           a.temps_moyen_min, coalesce(a.livrees_chronometrees, 0) livrees_chronometrees,
           coalesce(rb.montant, 0) remboursements_montant, coalesce(rb.nb, 0) remboursements_nb,
           (select count(*)::int from base b where b.an = year_param - 1 and b.mois = m.mois) total_annee_precedente
    from generate_series(1, 12) m(mois)
    left join agg a on a.mois = m.mois
    left join rembs rb on rb.mois = m.mois
    left join plus3 p3 on p3.mois = m.mois
  )
  select jsonb_build_object(
    'annee', year_param,
    'mois', (select jsonb_agg(to_jsonb(mc) order by mc.mois) from mois_complets mc),
    'synthese', jsonb_build_object(
      'clients_actifs', (select count(distinct client_id) from cur),
      'nouveaux', (select count(distinct client_id) from cur where an_premiere = year_param),
      'clients_plus_3', (select count(*) from (select client_id from cur group by client_id having count(*) > 3) x),
      'temps_moyen_min', (select round(avg(extract(epoch from livree_at - created_at) / 60))::int
                            from cur where status = 'LIVREE' and livree_at is not null)
    ),
    'chauffeurs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.tricycle_id, 'nom', x.nom, 'mois', x.mois, 'livraisons', x.n)), '[]'::jsonb)
                   from (select b.tricycle_id, coalesce(t.nom, 'Chauffeur supprimé') nom, b.mois, count(*)::int n
                           from cur b left join public.tricycles t on t.id = b.tricycle_id
                          where b.status = 'LIVREE' group by 1, 2, 3) x),
    'zones', (select coalesce(jsonb_agg(jsonb_build_object('cite_id', x.cite_id, 'cite_nom', x.nom, 'lot', x.lot_numero, 'mois', x.mois, 'total', x.n)), '[]'::jsonb)
              from (select b.cite_id, ci.nom, b.lot_numero, b.mois, count(*)::int n
                      from cur b join public.cites ci on ci.id = b.cite_id group by 1, 2, 3, 4) x),
    'options', jsonb_build_object(
      'cites', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom) order by nom), '[]'::jsonb) from public.cites),
      'chauffeurs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'cite_id', cite_id) order by nom), '[]'::jsonb) from public.tricycles)
    )
  ) into r;
  return r;
end $$;

-- ─── Droits d'exécution ────────────────────────────────────────────────────
-- Les fonctions publiques (auth_login, inscrire_*, tricycles_dispo, creer_commande,
-- suivi_commande, chauffeur_*, client_*, admin_*) restent exécutables par anon :
-- elles vérifient elles-mêmes le jeton. Seuls les utilitaires internes sont bloqués.

revoke execute on function public._hash_secret(uuid, text)   from public, anon, authenticated;
revoke execute on function public._hash_token(text)          from public, anon, authenticated;
revoke execute on function public._hash_pin(text)             from public, anon, authenticated;
revoke execute on function public._secret_ok(uuid, text, text) from public, anon, authenticated;
-- Création d'admin : SQL Editor uniquement, jamais depuis l'appli.
revoke execute on function public.admin_definir(text, text)   from public, anon, authenticated;
revoke execute on function public._new_token()                from public, anon, authenticated;
revoke execute on function public._chauffeur_profil(uuid)    from public, anon, authenticated;
revoke execute on function public._client_profil(uuid)       from public, anon, authenticated;
revoke execute on function public._auth_tricycle(text, text) from public, anon, authenticated;
revoke execute on function public._auth_client(text, text)   from public, anon, authenticated;
revoke execute on function public._auth_admin(text, text)    from public, anon, authenticated;
revoke execute on function public.notify_change()             from public, anon, authenticated;
revoke execute on function public._prochain_8h()              from public, anon, authenticated;
revoke execute on function public._distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
-- Tâches cron : jamais appelables depuis l'appli (sinon n'importe qui pourrait
-- reprogrammer toutes les commandes du jour).
revoke execute on function public.rollover_queued_orders()    from public, anon, authenticated;
revoke execute on function public.release_programmed_orders() from public, anon, authenticated;
revoke execute on function public.purge_positions_live()      from public, anon, authenticated;
revoke execute on function public._today_abj()                from public, anon, authenticated;
revoke execute on function public._phone_ci(text)             from public, anon, authenticated;
revoke execute on function public._debiter_chauffeur(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._en_essai(timestamptz)       from public, anon, authenticated;
revoke execute on function public._fin_essai_nouveau()         from public, anon, authenticated;
revoke execute on function public._journaliser_facturation(uuid) from public, anon, authenticated;
