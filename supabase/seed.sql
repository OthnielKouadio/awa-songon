-- Données de démo (facultatif) — à lancer APRÈS schema.sql.
-- Clients et chauffeurs s'inscrivent eux-mêmes depuis /login (compte + PIN qu'ils
-- choisissent) : ce seed ne crée que les cités et sources, pas de comptes.
--
-- L'admin par défaut est créé automatiquement par schema.sql :
--   téléphone 0566036825, mot de passe admin123 — CHANGE-LE dès la première
--   connexion (onglet Sécurité de /admin).

insert into public.cites (nom) values ('Cité 1'), ('Cité 2'), ('Cité 3') on conflict do nothing;

insert into public.sources (nom, cite_id, lat, long)
select 'Forage Nord', id, 5.3861, -4.2712 from public.cites where nom = 'Cité 1'
union all
select 'Forage Centre', id, 5.3802, -4.2650 from public.cites where nom = 'Cité 2'
union all
select 'Forage Sud', id, 5.3745, -4.2698 from public.cites where nom = 'Cité 3';
