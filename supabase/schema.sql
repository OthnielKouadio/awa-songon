-- ============================================================================
--  AWA SONGON — schéma Supabase v4 (à coller dans SQL Editor puis "Run")
--  Idempotent : peut être relancé sans casser les données.
--
--  v4 : authentification unifiée (client / chauffeur / admin) par téléphone +
--  code, SANS Supabase Auth — un jeton de session (comme avant pour les
--  chauffeurs) protège désormais aussi les clients et l'admin. Les clients ont
--  un compte (cité + lot fixés à l'inscription) et un statut PAYE/IMPAYE/BLOQUE
--  géré uniquement par l'admin. ⚠ Si tu viens d'une version antérieure à la v4
--  (Supabase Auth pour l'admin), repars d'un projet vide : le modèle change trop.
-- ============================================================================

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
  source_id  uuid not null references public.sources(id) on delete cascade,
  status     text not null default 'OFF'         check (status in ('DISPO', 'OFF')),
  etat       text not null default 'A_LA_SOURCE' check (etat in ('A_LA_SOURCE', 'EN_ROUTE')),
  -- Prix (FCFA) que le chauffeur fixe lui-même pour 1000 L.
  prix_1000  int  not null default 2500 check (prix_1000 between 100 and 50000),
  -- Statut de compte, géré UNIQUEMENT par l'admin (jamais par le chauffeur).
  statut     text not null default 'IMPAYE' check (statut in ('PAYE', 'IMPAYE', 'BLOQUE')),
  -- Le PIN est CHOISI PAR LE CHAUFFEUR à l'inscription. Stocké haché ; la session
  -- utilise ensuite un jeton aléatoire (haché aussi) — le PIN ne circule qu'au login.
  pin_hash          text not null,
  session_hash      text,
  pin_essais        int not null default 0,
  pin_bloque_jusqua timestamptz,
  created_at        timestamptz not null default now()
);

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
  pin_hash          text not null,
  session_hash      text,
  pin_essais        int not null default 0,
  pin_bloque_jusqua timestamptz,
  created_at        timestamptz not null default now(),
  constraint clients_gps_pair check ((lat is null) = (long is null))
);

-- Un seul enregistrement en pratique, mais une table plutôt qu'un singleton codé
-- en dur : ça permet plusieurs comptes admin plus tard sans migration.
create table if not exists public.admins (
  id        uuid primary key default gen_random_uuid(),
  telephone text not null unique,
  password_hash     text not null,
  session_hash      text,
  essais            int not null default 0,
  bloque_jusqua     timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.commandes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  tricycle_id   uuid not null references public.tricycles(id) on delete cascade,
  cite_id       uuid not null references public.cites(id) on delete cascade,
  lot_numero    text not null,
  position_file int  not null,
  status        text not null default 'EN_ATTENTE' check (status in ('EN_ATTENTE', 'EN_COURS', 'LIVRE')),
  -- Prix figé à la commande (FCFA) : si le chauffeur change son tarif ensuite, ça ne bouge pas.
  prix          int  not null,
  lat           double precision,
  long          double precision,
  created_at    timestamptz not null default now(),
  constraint commandes_gps_pair check ((lat is null) = (long is null))
);

create index if not exists commandes_tricycle_status_idx on public.commandes (tricycle_id, status);
create index if not exists commandes_client_status_idx   on public.commandes (client_id, status);
create index if not exists commandes_cite_idx            on public.commandes (cite_id);
create index if not exists commandes_created_idx         on public.commandes (created_at desc);
create index if not exists tricycles_source_idx          on public.tricycles (source_id);
create index if not exists clients_cite_idx              on public.clients (cite_id);
create index if not exists sources_cite_idx              on public.sources (cite_id);

-- ─── Normalisation des téléphones ──────────────────────────────────────────

create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g')
$$;

create or replace function public.trg_normalize_phone()
returns trigger language plpgsql as $$
begin
  new.telephone := public.normalize_phone(new.telephone);
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

-- ─── Row Level Security ────────────────────────────────────────────────────
-- cites / sources : lecture publique (nécessaire pour les selects d'inscription).
-- tricycles / clients / commandes / admins : AUCUN accès direct, même authentifié —
--   il n'y a plus de session Supabase Auth dans cette appli. Tout passe par les
--   fonctions RPC security definer ci-dessous, qui vérifient nos propres jetons.

alter table public.cites     enable row level security;
alter table public.sources   enable row level security;
alter table public.tricycles enable row level security;
alter table public.clients   enable row level security;
alter table public.commandes enable row level security;
alter table public.admins    enable row level security;

drop policy if exists "cites lecture publique"   on public.cites;
drop policy if exists "sources lecture publique" on public.sources;
create policy "cites lecture publique"   on public.cites   for select using (true);
create policy "sources lecture publique" on public.sources for select using (true);
-- (aucune policy sur tricycles/clients/commandes/admins : accès refusé par défaut)

-- ─── Temps réel (ping + refetch, sans dépendre de RLS/postgres_changes) ────
-- Les canaux broadcast ne transportent aucune donnée : le client recharge
-- ensuite via une RPC. cite:<id> et tricycle:<id> pour client/chauffeur,
-- client:<id> pour le suivi de commande, "admin" pour le cockpit.

do $$ begin alter publication supabase_realtime add table public.commandes; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tricycles; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.clients;   exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.sources;   exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.cites;     exception when others then null; end $$;

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
    select s.cite_id into v_cite from public.sources s where s.id = (j ->> 'source_id')::uuid;
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

create or replace function public._new_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

create or replace function public._chauffeur_profil(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'nom', t.nom, 'telephone', t.telephone, 'status', t.status, 'etat', t.etat,
    'prix_1000', t.prix_1000, 'statut', t.statut,
    'source_nom', s.nom, 'cite_id', ci.id, 'cite_nom', ci.nom)
  from public.tricycles t
  join public.sources s  on s.id  = t.source_id
  join public.cites   ci on ci.id = s.cite_id
  where t.id = p_id
$$;

create or replace function public._client_profil(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone,
    'cite_id', ci.id, 'cite_nom', ci.nom, 'lot_numero', cl.lot_numero, 'statut', cl.statut)
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
  select a.id into v from public.admins a
   where a.telephone = public.normalize_phone(p_tel) and a.session_hash is not null and a.session_hash = public._hash_token(p_token);
  if v is null then raise exception 'REFUSE'; end if;
  return v;
end $$;

-- Admin par défaut (idempotent) : téléphone 0566036825, mot de passe admin123.
-- ⚠ Change ce mot de passe dès la première connexion (Admin → Sécurité).
-- L'id est fixé une seule fois dans le CTE et réutilisé pour le hash : le hash
-- doit porter sur le MÊME id que celui réellement inséré (le sel du hachage).
with new_admin as (select gen_random_uuid() as id)
insert into public.admins (id, telephone, password_hash)
select id, '0566036825', public._hash_secret(id, 'admin123') from new_admin
where not exists (select 1 from public.admins);

-- Migration : si le schéma a déjà été lancé avec l'ancien numéro par défaut
-- (0700000000) et que personne ne l'a encore changé, on le met à jour ici.
update public.admins set telephone = '0566036825'
 where telephone = '0700000000' and password_hash = public._hash_secret(id, 'admin123');

-- ─── RPC : connexion unifiée ────────────────────────────────────────────────
-- Le même formulaire sert aux 3 rôles : l'admin est reconnu par son téléphone
-- quel que soit l'onglet choisi côté client (aucun lien /admin visible).

create or replace function public.auth_login(p_role text, p_tel text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tel   text := public.normalize_phone(p_tel);
  v_token text := public._new_token();
  a public.admins%rowtype;
  t public.tricycles%rowtype;
  cl public.clients%rowtype;
  v_lock boolean;
begin
  -- 1) Admin (indépendant de l'onglet choisi)
  select * into a from public.admins where telephone = v_tel for update;
  if found then
    if a.bloque_jusqua is not null and a.bloque_jusqua > now() then
      return jsonb_build_object('ok', false, 'error', 'BLOQUE');
    end if;
    if a.password_hash <> public._hash_secret(a.id, p_pin) then
      v_lock := a.essais + 1 >= 5;
      update public.admins set essais = case when v_lock then 0 else essais + 1 end,
             bloque_jusqua = case when v_lock then now() + interval '15 minutes' else null end
       where id = a.id;
      return jsonb_build_object('ok', false, 'error', case when v_lock then 'BLOQUE' else 'AUTH' end);
    end if;
    update public.admins set essais = 0, bloque_jusqua = null, session_hash = public._hash_token(v_token) where id = a.id;
    return jsonb_build_object('ok', true, 'role', 'admin', 'token', v_token, 'profile', jsonb_build_object('telephone', v_tel));
  end if;

  -- 2) Client
  if p_role = 'client' then
    select * into cl from public.clients where telephone = v_tel for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'AUTH'); end if;
    if cl.pin_bloque_jusqua is not null and cl.pin_bloque_jusqua > now() then
      return jsonb_build_object('ok', false, 'error', 'BLOQUE');
    end if;
    if cl.pin_hash <> public._hash_secret(cl.id, p_pin) then
      v_lock := cl.pin_essais + 1 >= 5;
      update public.clients set pin_essais = case when v_lock then 0 else pin_essais + 1 end,
             pin_bloque_jusqua = case when v_lock then now() + interval '15 minutes' else null end
       where id = cl.id;
      return jsonb_build_object('ok', false, 'error', case when v_lock then 'BLOQUE' else 'AUTH' end);
    end if;
    update public.clients set pin_essais = 0, pin_bloque_jusqua = null, session_hash = public._hash_token(v_token) where id = cl.id;
    return jsonb_build_object('ok', true, 'role', 'client', 'token', v_token, 'profile', public._client_profil(cl.id));
  end if;

  -- 3) Chauffeur
  select * into t from public.tricycles where telephone = v_tel for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'AUTH'); end if;
  if t.pin_bloque_jusqua is not null and t.pin_bloque_jusqua > now() then
    return jsonb_build_object('ok', false, 'error', 'BLOQUE');
  end if;
  if t.pin_hash <> public._hash_secret(t.id, p_pin) then
    v_lock := t.pin_essais + 1 >= 5;
    update public.tricycles set pin_essais = case when v_lock then 0 else pin_essais + 1 end,
           pin_bloque_jusqua = case when v_lock then now() + interval '15 minutes' else null end
     where id = t.id;
    return jsonb_build_object('ok', false, 'error', case when v_lock then 'BLOQUE' else 'AUTH' end);
  end if;
  update public.tricycles set pin_essais = 0, pin_bloque_jusqua = null, session_hash = public._hash_token(v_token) where id = t.id;
  return jsonb_build_object('ok', true, 'role', 'chauffeur', 'token', v_token, 'profile', public._chauffeur_profil(t.id));
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
  if length(v_tel) < 8 or length(v_tel) > 16 then raise exception 'TEL_INVALIDE'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_INVALIDE'; end if;
  if v_lot = '' or length(v_lot) > 20 then raise exception 'LOT_INVALIDE'; end if;
  if not exists (select 1 from public.cites where id = p_cite) then raise exception 'CITE_INTROUVABLE'; end if;
  if exists (select 1 from public.admins where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;
  if exists (select 1 from public.clients where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;

  if p_lat is null or p_long is null or p_lat not between -90 and 90 or p_long not between -180 and 180 then
    p_lat := null; p_long := null;
  end if;

  insert into public.clients (id, nom, telephone, cite_id, lot_numero, lat, long, statut, pin_hash, session_hash)
  values (v_id, v_nom, v_tel, p_cite, v_lot, p_lat, p_long, 'IMPAYE', public._hash_secret(v_id, p_pin), public._hash_token(v_token));

  return jsonb_build_object('token', v_token, 'profile', public._client_profil(v_id));
end $$;

create or replace function public.inscrire_chauffeur(p_nom text, p_tel text, p_source uuid, p_pin text, p_prix int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text := public.normalize_phone(p_tel);
  v_id  uuid := gen_random_uuid();
  v_token text := public._new_token();
begin
  if v_nom = '' or length(v_nom) > 40 then raise exception 'NOM_INVALIDE'; end if;
  if length(v_tel) < 8 or length(v_tel) > 16 then raise exception 'TEL_INVALIDE'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN_INVALIDE'; end if;
  if p_prix is null or p_prix not between 100 and 50000 then raise exception 'PRIX_INVALIDE'; end if;
  if not exists (select 1 from public.sources where id = p_source) then raise exception 'SOURCE_INTROUVABLE'; end if;
  if exists (select 1 from public.admins where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;
  if exists (select 1 from public.tricycles where telephone = v_tel) then raise exception 'DEJA_INSCRIT'; end if;

  insert into public.tricycles (id, nom, telephone, source_id, prix_1000, statut, pin_hash, session_hash)
  values (v_id, v_nom, v_tel, p_source, p_prix, 'IMPAYE', public._hash_secret(v_id, p_pin), public._hash_token(v_token));

  return jsonb_build_object('token', v_token, 'profile', public._chauffeur_profil(v_id));
end $$;

-- ─── RPC : client ───────────────────────────────────────────────────────────

create or replace function public.client_profil(p_tel text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._client_profil(public._auth_client(p_tel, p_token))
$$;

drop function if exists public.tricycles_dispo(uuid);
create or replace function public.tricycles_dispo(p_cite uuid)
returns table (id uuid, nom text, source_id uuid, source_nom text, etat text, file_count int, prix_1000 int)
language sql stable security definer set search_path = public as $$
  select t.id, t.nom, s.id, s.nom, t.etat,
         (select count(*)::int from public.commandes c where c.tricycle_id = t.id and c.status in ('EN_ATTENTE', 'EN_COURS')),
         t.prix_1000
  from public.tricycles t
  join public.sources s on s.id = t.source_id
  where s.cite_id = p_cite and t.status = 'DISPO' and t.statut <> 'BLOQUE'
  order by 6, t.nom
$$;

-- Une commande = un voyage = 1000 L, au prix du chauffeur (figé). Le client doit
-- être authentifié : on ne fait plus confiance à un numéro déclaré librement.
create or replace function public.creer_commande(
  p_tricycle uuid, p_tel text, p_token text,
  p_lat double precision default null, p_long double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid := public._auth_client(p_tel, p_token);
  v_client public.clients%rowtype;
  v_t public.tricycles%rowtype;
  v_pos int;
  v_id  uuid;
  v_lat double precision;
  v_long double precision;
begin
  select * into v_client from public.clients where id = v_client_id;
  if v_client.statut = 'BLOQUE' then raise exception 'COMPTE_BLOQUE'; end if;

  select * into v_t from public.tricycles where id = p_tricycle for update;
  if not found or v_t.status <> 'DISPO' or v_t.statut = 'BLOQUE' then raise exception 'TRICYCLE_INDISPONIBLE'; end if;

  if exists (select 1 from public.commandes where client_id = v_client_id and status in ('EN_ATTENTE', 'EN_COURS')) then
    raise exception 'TROP_DE_COMMANDES';
  end if;

  if p_lat is null or p_long is null or p_lat not between -90 and 90 or p_long not between -180 and 180 then
    v_lat := v_client.lat; v_long := v_client.long; -- pas de GPS frais fourni : on retombe sur celui du profil
  else
    v_lat := p_lat; v_long := p_long;
  end if;

  select count(*) + 1 into v_pos from public.commandes where tricycle_id = p_tricycle and status in ('EN_ATTENTE', 'EN_COURS');

  insert into public.commandes (client_id, tricycle_id, cite_id, lot_numero, position_file, prix, lat, long)
  values (v_client_id, p_tricycle, v_client.cite_id, v_client.lot_numero, v_pos, v_t.prix_1000, v_lat, v_long)
  returning id into v_id;

  return v_id;
end $$;

drop function if exists public.suivi_commande(uuid);
create or replace function public.suivi_commande(p_id uuid)
returns table (
  id uuid, status text, position_file int, prix int, lot_numero text,
  lat double precision, long double precision, created_at timestamptz,
  tricycle_id uuid, chauffeur_nom text, chauffeur_tel text, etat text,
  cite_nom text, source_nom text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.status, c.position_file, c.prix, c.lot_numero,
         c.lat, c.long, c.created_at,
         t.id, t.nom, t.telephone, t.etat,
         ci.nom, s.nom
  from public.commandes c
  join public.tricycles t on t.id = c.tricycle_id
  join public.sources   s on s.id = t.source_id
  join public.cites    ci on ci.id = c.cite_id
  where c.id = p_id
$$;

-- Commande active du client connecté (pour son tableau de bord, sans lien secret).
create or replace function public.client_commande_active(p_tel text, p_token text)
returns table (
  id uuid, status text, position_file int, prix int, lot_numero text,
  lat double precision, long double precision, created_at timestamptz,
  tricycle_id uuid, chauffeur_nom text, chauffeur_tel text, etat text,
  cite_nom text, source_nom text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.status, c.position_file, c.prix, c.lot_numero,
         c.lat, c.long, c.created_at,
         t.id, t.nom, t.telephone, t.etat,
         ci.nom, s.nom
  from public.commandes c
  join public.tricycles t on t.id = c.tricycle_id
  join public.sources   s on s.id = t.source_id
  join public.cites    ci on ci.id = c.cite_id
  where c.client_id = public._auth_client(p_tel, p_token) and c.status in ('EN_ATTENTE', 'EN_COURS')
  order by c.created_at desc limit 1
$$;

-- ─── RPC : chauffeur ────────────────────────────────────────────────────────

create or replace function public.chauffeur_profil(p_tel text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._chauffeur_profil(public._auth_tricycle(p_tel, p_token))
$$;

create or replace function public.chauffeur_file(p_tel text, p_token text)
returns table (
  id uuid, lot_numero text, position_file int, status text,
  lat double precision, long double precision, created_at timestamptz,
  client_nom text, client_tel text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.lot_numero, c.position_file, c.status, c.lat, c.long, c.created_at, cl.nom, cl.telephone
  from public.commandes c
  join public.clients cl on cl.id = c.client_id
  where c.tricycle_id = public._auth_tricycle(p_tel, p_token) and c.status in ('EN_ATTENTE', 'EN_COURS')
  order by c.position_file
$$;

create or replace function public.chauffeur_set_status(p_tel text, p_token text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_tricycle(p_tel, p_token);
begin
  if p_status not in ('DISPO', 'OFF') then raise exception 'STATUT_INVALIDE'; end if;
  if p_status = 'DISPO' and (select statut from public.tricycles where id = v) = 'BLOQUE' then
    raise exception 'COMPTE_BLOQUE';
  end if;
  update public.tricycles set status = p_status where id = v;
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

create or replace function public.chauffeur_partir(p_tel text, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v     uuid := public._auth_tricycle(p_tel, p_token);
  v_cmd uuid;
begin
  perform 1 from public.tricycles where id = v for update;
  if exists (select 1 from public.commandes where tricycle_id = v and status = 'EN_COURS') then
    raise exception 'DEJA_EN_COURS';
  end if;
  select c.id into v_cmd from public.commandes c where c.tricycle_id = v and c.status = 'EN_ATTENTE' order by c.position_file limit 1;
  if v_cmd is null then raise exception 'FILE_VIDE'; end if;
  update public.commandes set status = 'EN_COURS' where id = v_cmd;
  update public.tricycles set etat = 'EN_ROUTE' where id = v;
end $$;

create or replace function public.chauffeur_livrer(p_tel text, p_token text, p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v     uuid := public._auth_tricycle(p_tel, p_token);
  v_pos int;
begin
  perform 1 from public.tricycles where id = v for update;
  select c.position_file into v_pos from public.commandes c where c.id = p_commande and c.tricycle_id = v and c.status = 'EN_COURS';
  if v_pos is null then raise exception 'COMMANDE_INTROUVABLE'; end if;
  update public.commandes set status = 'LIVRE', position_file = 0 where id = p_commande;
  update public.commandes set position_file = position_file - 1
   where tricycle_id = v and status in ('EN_ATTENTE', 'EN_COURS') and position_file > v_pos;
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
    'commandes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from public.commandes x)
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
    update public.tricycles set statut = p_statut, status = (case when p_statut = 'BLOQUE' then 'OFF' else status end) where id = p_id;
  elsif p_table = 'clients' then
    update public.clients set statut = p_statut, date_paiement = (case when p_statut = 'PAYE' then now() else date_paiement end) where id = p_id;
  else raise exception 'TABLE_INVALIDE';
  end if;
end $$;

create or replace function public.admin_change_password(p_tel text, p_token text, p_nouveau text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public._auth_admin(p_tel, p_token);
begin
  if p_nouveau is null or length(p_nouveau) < 6 then raise exception 'MDP_INVALIDE'; end if;
  update public.admins set password_hash = public._hash_secret(id, p_nouveau) where id = v;
end $$;

-- ─── Droits d'exécution ────────────────────────────────────────────────────
-- Les fonctions publiques (auth_login, inscrire_*, tricycles_dispo, creer_commande,
-- suivi_commande, chauffeur_*, client_*, admin_*) restent exécutables par anon :
-- elles vérifient elles-mêmes le jeton. Seuls les utilitaires internes sont bloqués.

revoke execute on function public._hash_secret(uuid, text)   from public, anon, authenticated;
revoke execute on function public._hash_token(text)          from public, anon, authenticated;
revoke execute on function public._new_token()                from public, anon, authenticated;
revoke execute on function public._chauffeur_profil(uuid)    from public, anon, authenticated;
revoke execute on function public._client_profil(uuid)       from public, anon, authenticated;
revoke execute on function public._auth_tricycle(text, text) from public, anon, authenticated;
revoke execute on function public._auth_client(text, text)   from public, anon, authenticated;
revoke execute on function public._auth_admin(text, text)    from public, anon, authenticated;
revoke execute on function public.notify_change()             from public, anon, authenticated;
