# Distribution Eau — Livraison d'eau par tricycle

Next.js 14 (App Router) · Tailwind · Framer Motion · Supabase (DB + Realtime) · Leaflet + OpenStreetMap (gratuit, aucune clé Google).

## Pages publiques : `/`, `/inscription`, `/login`

`/` est la vitrine complète : header (« Se connecter » → `/login`, « S'inscrire » → `/inscription`), hero, étapes client, section chauffeur (bonus d'inscription, recharge, fidélité — information seulement, **aucun bouton « devenir chauffeur »**), tarifs, FAQ, footer. Si une session existe déjà dans le navigateur, `/` redirige directement vers le bon tableau de bord. Les chiffres du programme de points viennent de `src/lib/format.ts`.

`/inscription` : inscription **client uniquement** (nom, téléphone, cité, lot, PIN).

`/login` : **un seul formulaire, sans choix de rôle** — téléphone + PIN à 4 chiffres. Le serveur (`auth_login('auto', …)`) reconnaît si le numéro est celui d'un client ou d'un chauffeur et renvoie vers le bon espace. L'admin ne peut **pas** se connecter ici.

### Liens secrets

Tous les chemins sont dans `.env.local` (voir [`.env.example`](.env.example)) ; les dossiers réels de `src/app` qu'ils servent répondent **404** en accès direct.

| Variable | Dossier servi | À quoi ça sert | Contrôle (middleware) |
|---|---|---|---|
| `DRIVER_SIGNUP_PATH` | `recrutement-chauffeur` | Formulaire d'inscription chauffeur, direct. **L'admin envoie ce lien** au chauffeur qu'il recrute. | Aucun compte requis (secret + `noindex`) |
| `ADMIN_LOGIN_PATH` | `acces-admin` | « Accès administrateur » : email + mot de passe. Ne le partage avec personne. | Toujours affichée (une session client/chauffeur ouverte est remplacée à la connexion) ; admin déjà connecté → cockpit |
| `DRIVER_PATH` | `chauffeur` | Espace chauffeur (le navigateur y est envoyé après connexion) | Pas de session → `/login` ; autre rôle → **404** |
| `ADMIN_PATH` | `admin` | Cockpit admin, `/statistiques`, `/parametres` | Pas de session → page d'accès admin ; autre rôle → **404** |

Aucun chemin ne doit en contenir un autre (sinon un chauffeur recruté devine une partie d'un lien admin). La session est un cookie `httpOnly` posé par [`/api/session`](src/app/api/session/route.ts) après chaque connexion ; le jeton est revérifié en base à chaque requête (`session_valide`). Les chemins ne sont jamais dans le JavaScript public. Pour en changer : modifie les variables puis redéploie (les anciens liens donnent alors 404).

| Route | Rôle | Accès |
|---|---|---|
| `/` | Tout le monde | Vitrine (hero, étapes, section chauffeur, tarifs, FAQ) |
| `/inscription` | Tout le monde | Inscription client |
| `/login` | Clients et chauffeurs | Connexion téléphone + PIN, sans choix de rôle |
| `/dashboard` | Client | Tableau de bord : tricycles de sa cité, commande, suivi, annulation |
| `/suivi/[id]` | Client | Lien direct de suivi (partageable, sans compte) |
| `/bloque` | Client | Solde insuffisant : recharge Wave (redirection automatique) |
| `/<DRIVER_SIGNUP_PATH>` | Chauffeur recruté | Inscription chauffeur |
| `/<DRIVER_PATH>` | Chauffeur | PAUSE/REPRENDRE, file d'attente, « J'arrive chez toi », prix, OFFLINE |
| `/<ADMIN_LOGIN_PATH>` | Admin | Connexion email + mot de passe |
| `/<ADMIN_PATH>` | Admin | Dashboard, cités, forages, chauffeurs, clients, commandes, sécurité |
| `/<ADMIN_PATH>/statistiques` | Admin | Statistiques annuelles |
| `/<ADMIN_PATH>/parametres` | Admin | Numéro de dépôt Wave |

## Thème et composants custom

Palette 100 % bleue via les tokens Tailwind `paper`/`ink`/`mist`/`azur`/`sky`/`danger` (fond `#F7FBFF`, bordures `#0A1931`, cartes `#EDF6FF`, bordure 2px, coins 24px, ombre dure `4px 4px 0px`) — appliquée partout, y compris les menus déroulants et les popups de confirmation.

**Aucun `<select>`, `alert()` ni `confirm()` natif du navigateur.** Deux composants custom les remplacent partout dans l'appli (formulaires d'inscription, panneaux admin) :
- [`CustomSelect`](src/components/CustomSelect.tsx) : menu déroulant en boutons (`onClick`, fiable sur mobile), forme pilule, options ou groupes d'options (ex. sources groupées par cité).
- [`CustomModal`](src/components/CustomModal.tsx) : modal thémée, plus un hook `useConfirm()` qui remplace `window.confirm()` par une popup `await confirm(message)`.

**Aucun compte admin par défaut** (ni en démo, ni sur Supabase) : voir « Créer le compte admin » plus bas.

## Lancer

```bash
npm install
npm run dev
```

Il faut un `.env.local` (copie de [`.env.example`](.env.example)) avec au minimum `DRIVER_SIGNUP_PATH`, `ADMIN_LOGIN_PATH`, `DRIVER_PATH` et `ADMIN_PATH`.

**Mode démo** : `NEXT_PUBLIC_DEMO_MODE=true` → données dans le `localStorage` du navigateur, sans Supabase. C'est le **même code métier** : tout passe par [`src/lib/data-provider.ts`](src/lib/data-provider.ts), qui choisit une seule fois entre `remote.ts` (Supabase) et `mock.ts` (démo) ; hors démo, `mock.ts` n'est même pas inclus dans le build. Un build de production avec `NEXT_PUBLIC_DEMO_MODE=true` échoue (sauf `ALLOW_DEMO_BUILD=true` pour un site de démo assumé), et `?demo=…` est retiré de l'URL hors démo. Sans variables Supabase et sans mode démo, l'app affiche une erreur claire : elle ne bascule plus jamais toute seule en démo. Ouvre plusieurs onglets du même navigateur pour voir client/chauffeur/admin interagir en temps réel (les données ne sont **pas partagées entre navigateurs différents** en mode démo — c'est un vrai backend qu'il faut pour ça, voir plus bas).

Comptes de démo (PIN `1234`) :
- Chauffeurs : Kader `0700000001` (Cité 1, actif, 2 500 FCFA), Yao `0700000002` (Cité 1, actif, en livraison), Seydou `0700000005` (Cité 1, hors ligne — démo des commandes programmées), Moussa `0700000003` (Cité 2, en pause — démo des commandes QUEUED), Koffi `0700000004` (Cité 3, solde de points épuisé — démo de la page bloquante).
- Clients : Fatou `0701020304` (Cité 1, lot 12, payé), Issa `0705060708` (Cité 1, lot 7, impayé), Aya `0709101112` (Cité 1, lot 21, payé).
- Admin : uniquement si tu définis `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` et `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD` dans ton `.env.local` (rien n'est codé en dur).

L'onglet **Sécurité** de l'espace admin affiche un bouton pour réinitialiser les données de démo.

## Passer sur Supabase (données partagées entre appareils)

1. Crée un projet Supabase, puis **SQL Editor** → lance [`supabase/schema.sql`](supabase/schema.sql) (idempotent).
2. Facultatif : [`supabase/seed.sql`](supabase/seed.sql) (3 cités + 3 sources — clients et chauffeurs s'inscrivent eux-mêmes).
3. `cp .env.example .env.local` et renseigne `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API), `NEXT_PUBLIC_DEMO_MODE=false`, et les quatre chemins secrets **aléatoires** (`DRIVER_SIGNUP_PATH`, `ADMIN_LOGIN_PATH`, `DRIVER_PATH`, `ADMIN_PATH`).
4. Vercel : les mêmes variables d'environnement, puis déploie.
5. **Database → Extensions → active `pg_cron`**, puis relance `schema.sql` : il programme les tâches de 23h59 (commandes en pause → demain 8h), 8h00 (commandes programmées → file du jour) et la purge des positions GPS toutes les 5 min. Sans pg_cron, le script passe quand même mais affiche un avertissement et ces tâches ne tournent pas.

### Créer le compte admin

Dans **SQL Editor** (jamais depuis l'appli : la fonction est interdite à l'API) :

```sql
select public.admin_definir('toi@exemple.com', 'un-mot-de-passe-long-et-unique');
```

Connexion ensuite sur `/<ADMIN_LOGIN_PATH>` avec cet email et ce mot de passe. La même commande réinitialise le mot de passe d'un admin existant (sessions coupées). Le mot de passe passe alors par l'historique du SQL Editor : change-le ensuite dans l'onglet **Sécurité** (10 caractères minimum).

> **Migration v7** : si l'ancien mot de passe admin par défaut n'avait jamais été changé, `schema.sql` **désactive** ce compte (il était public) — recrée-le avec `admin_definir`. **v8** : l'admin se connecte par email ; un ancien admin sans email doit être recréé avec `admin_definir('email', …)`. Les PIN et mots de passe existants restent valides : ils passent en bcrypt au prochain login réussi. Les comptes en double (`07…` / `+225…` / `00225…`) sont fusionnés (le plus ancien est gardé, commandes et points rattachés, soldes additionnés, détail dans `journal_actions` → `FUSION_DOUBLON_TELEPHONE`).

> ⚠️ Ce schéma **n'utilise pas Supabase Auth** — les 3 rôles se connectent par téléphone + code via des fonctions RPC. Une base **v4** est migrée automatiquement par `schema.sql` (cités multiples → une seule, DISPO/OFF → ACTIVE/OFFLINE, EN_ATTENTE → ASSIGNED, LIVRE → LIVREE). Pour une version antérieure à la v4, repars d'un projet vide.

## Règles métier

- **Comptes obligatoires** pour client et chauffeur (nom, téléphone, PIN à 4 chiffres qu'ils choisissent). Cité et lot sont fixés à l'inscription du client — plus besoin de les ressaisir à chaque commande.
- **Verrouillage par cité** : 1 client = 1 cité, 1 chauffeur = 1 cité (`tricycles.cite_id`), choisies à l'inscription et **non modifiables** (affichées en badge grisé : « Tu commandes à Cité 1 » / « Tu livres à Cité 1 »). Un client ne voit **que** les tricycles de **sa** cité, et `creer_commande` refuse côté serveur toute commande hors zone (HTTP 403 `HORS_ZONE`, « Ce tricycle ne livre pas dans ta cité »), même via un appel forgé. Si le forage du chauffeur est à plus de 7 km de la position du client : « Aucun tricycle disponible » (`TROP_LOIN` ; contrôle ignoré si l'une des deux positions est inconnue).
- La **source (le forage) est facultative** — un chauffeur qui n'en fixe pas puise "un peu partout" dans sa cité ; s'il en choisit une, elle doit appartenir à sa cité.
- **Le chauffeur ne refuse jamais** : il reste visible et commandable quel que soit son statut. Il ne disparaît que si l'admin le bloque ou si son solde de points est épuisé.
- **Une seule quantité : 1000 L.** 1 commande = 1 voyage = 1000 L.
- **Prix** : chaque chauffeur fixe son prix pour 1000 L (100 à 50 000 FCFA), modifiable à tout moment. Le prix est **figé dans la commande** : un changement de tarif n'affecte pas les commandes déjà passées.
- **Règle Attiéké — une seule commande active à la fois** (QUEUED, ASSIGNED, PROGRAMMED, EN_COURS ou ARRIVING) : sinon HTTP 403 « Tu as déjà une commande en cours (#A1B2C3). Sois livré ou annule avant d'en repasser une autre ».
- **Annulation** : le client peut annuler tant que le chauffeur n'est pas parti (QUEUED / ASSIGNED / PROGRAMMED). La file remonte d'un cran et les points sont rendus des deux côtés (`REMBOURSEMENT` dans `points_transactions`).
- Temps estimé = position dans la file × 35 min.
- « Livré » sort la commande de la file, fait remonter les suivants d'un cran, et le client voit un écran **« Livré ! »** qu'il ferme lui-même (bouton « Commander à nouveau ») avant de repasser en mode commande.
- **Appel direct uniquement — aucun bouton WhatsApp** nulle part : `tel:` pour client → chauffeur (via son suivi) et chauffeur → client (dans sa file, avec le nom du client).
- GPS optionnel (client) : pop-up custom → `getCurrentPosition()`. Accepté à l'inscription et ré-actualisable à chaque commande ; refusé ou indisponible → la commande part avec la position déjà enregistrée, ou sans GPS.
- « Naviguer » ouvre `https://www.google.com/maps/dir/?api=1&destination=lat,long` (lien simple, aucune API payante).
## Statuts chauffeur et file d'attente

Le tableau de bord chauffeur (`/chauffeur`) : en haut, un gros bouton orange **PAUSE** (‖) qui devient vert **REPRENDRE** ; au centre, **« Commandes en file d'attente (X) »** ; tout en bas, un petit bouton gris **OFFLINE** avec confirmation (« Sûr de vouloir passer hors ligne ? »).

| Statut chauffeur | Nouvelle commande | Message client |
|---|---|---|
| `ACTIVE` | `ASSIGNED` (dans sa file) | « Tu es N°x chez Kader » |
| `PAUSED` (garage, repas) | `QUEUED`, livrée aujourd'hui (FIFO) | « Chauffeur en pause, tu seras livré aujourd'hui - Position n » |
| `OFFLINE` (il dort) | `PROGRAMMED` pour le prochain 8h00 | « Chauffeur hors ligne, commande programmée demain 8h » |

- **REPRENDRE** (→ `ACTIVE`) : toutes ses commandes `QUEUED` lui sont assignées d'un coup, dans l'ordre de la file.
- **Cron 23h59** (`rollover_queued_orders`) : les `QUEUED` non livrées passent `PROGRAMMED` pour demain 8h ; le client voit le nouveau message tout seul (ping `client:<id>`).
- **Cron 00h00, rattrapage à 8h00** (`release_programmed_orders`) : les `PROGRAMMED` dont le jour est arrivé deviennent `ASSIGNED` si le chauffeur est déjà actif, sinon `QUEUED`.
- Cycle d'une livraison : `ASSIGNED` → « Je pars livrer » → `EN_COURS` (client : « Chauffeur en route - 15 min », sans carte) → **« J'ARRIVE CHEZ TOI »** → `ARRIVING` → « Livré » → `LIVREE`.

## Saisie directe par le chauffeur

- Bouton **« Nouvelle commande - Saisie directe »** sur `/chauffeur` : nom complet, téléphone ivoirien (10 chiffres, 01/05/07/21/25/27, `+225` accepté), quartier / secteur (lots connus de sa cité, ou saisie libre), quantité de bidons et note facultatives.
- Le client est retrouvé par son numéro ; sinon il est créé en **client temporaire** (`clients.is_temporary`). S'il s'inscrit plus tard avec ce numéro, il récupère ce compte et son historique.
- La commande entre directement dans la file (`ASSIGNED`) avec `source = 'manual'` et `added_by_driver_id`, et coûte 50 points au chauffeur comme une commande normale (rien côté client). L'action est tracée dans `journal_actions` (`COMMANDE_MANUELLE`).
- Les mêmes règles s'appliquent : même cité uniquement (`HORS_ZONE`), une seule commande active par client.
- Dans les files chauffeur et admin : badge **APPLICATION** (plein, point vert) ou **MANUEL** (contour, point orange), mention « Ajouté par [chauffeur] à [heure] », et filtre **Tous | Application | Manuel**.

## Livraison aujourd'hui ou demain

- À la commande, le client choisit **Aujourd'hui** ou **Demain**, aucune autre date (`commandes.scheduled_for`). Demain : commande `PROGRAMMED` pour demain 8h.
- **Cron 00h00** (et rattrapage à 8h00) : les commandes dont le jour est arrivé entrent dans la file.
- Une commande programmée pour un jour suivant **n'est plus annulable après 18h la veille** (`annulable_jusqua`, refus `ANNULATION_TARDIVE`).

## Statistiques — `/admin/statistiques`

Lien « Statistiques » dans la barre du cockpit admin. Toute la page vient d'**un seul appel** à la fonction RPC `get_yearly_stats(p_tel, p_token, year_param, p_cite, p_tricycle)` (admin uniquement). Les mois sont ceux de la date de commande, heure d'Abidjan.

- **Filtres** (barre collante) : année, mois, zone (cité), chauffeur. Export CSV (`;`, compatible Excel FR) et Excel (`.xlsx`, 3 feuilles : récap mensuel, indicateurs, chauffeurs).
- **12 indicateurs** : volumes, chiffre d'affaires, clients et qualité. Pour l'année en cours, la variation est comparée à la **même période** de l'an dernier.
- **6 graphiques** (Recharts) et un **récapitulatif mensuel** avec recherche, pagination et ligne Total.
- Définitions :
  - CA et panier moyen : commandes **livrées** uniquement.
  - Échec : commande encore ouverte après son jour de livraison prévu.
  - Bidons : quantité déclarée lors des saisies manuelles.
  - Remboursements : points rendus aux clients sur annulation (1 point = 1 FCFA).
  - Temps moyen : `livree_at − created_at`, connu seulement pour les livraisons faites depuis cette version.

## Période d'essai et facturation

- Table `settings` (une ligne) : `trial_ends_at = 2026-12-31`. L'admin affiche un bandeau « Période d'essai jusqu'au 31 décembre 2026 ».
- Chaque livraison est journalisée dans `journal_actions` (`FACTURATION`) avec son montant, son origine et `facturable = false` pendant l'essai. Rien n'est bloqué ni débité pour l'instant.

## GPS live — uniquement pendant ARRIVING

Le GPS du chauffeur **n'est plus actif en permanence** : il ne démarre qu'au clic sur « J'ARRIVE CHEZ TOI » et se coupe tout seul après **10 min** ou à la livraison.

- **Téléphone du chauffeur** ([useGeoWatch](src/lib/useGeoWatch.ts)) : envoie toutes les 10 s s'il bouge (≥ 15 m), toutes les 30 s pour un petit déplacement (5–15 m), **rien à l'arrêt**.
- **Serveur** (`chauffeur_set_position`) : refuse toute position hors `ARRIVING` / hors fenêtre de 10 min (`{actif:false}` → le téléphone coupe le GPS). Sinon, il écrase la dernière position dans `positions_live` (table `UNLOGGED`, TTL 5 min, purgée par cron — rôle d'un cache type Redis), garde **1 point toutes les 2 min** dans `positions_historique`, et diffuse la position **directement sur `suivi:<commande_id>`**, que seul le client concerné écoute. Aucune table surveillée n'est touchée : plus de rechargement de toute la cité ni de l'admin à chaque position.
- **Client** : la carte live (sa position + le tricycle + distance) ne s'affiche que si la commande est `ARRIVING`.

## Statuts de compte — PAYE / IMPAYE / BLOQUE

Gérés **uniquement par l'admin**, jamais par le titulaire du compte.

- **Client BLOQUÉ** : ne peut plus commander (écran « Compte bloqué, contacte l'administrateur »). Une commande déjà en cours reste livrable normalement.
- **Chauffeur BLOQUÉ** : repasse OFFLINE automatiquement, disparaît de la liste publique, et ne peut plus se remettre actif ou en pause lui-même tant que l'admin ne le débloque pas.
- Marquer un client **PAYÉ** enregistre la date de paiement (visible dans l'onglet Clients).

## Points client — 1 FCFA = 1 point

- **1200 points offerts à l'inscription** (≈ 12 commandes). Chaque commande coûte **100 points**, déduits à la création (rendus si le client annule).
- Sous 100 points, le tableau de bord redirige vers **`/bloque`** (recharge Wave via l'admin, onglet Recharges).

## Points chauffeur — 1 FCFA = 1 point, indépendant du statut PAYE/IMPAYE/BLOQUE

Chaque chauffeur a un solde de points (`solde_points`), distinct du statut PAYE/IMPAYE/BLOQUE :

- **2500 points offerts à l'inscription** (= 50 livraisons gratuites). Aucune action requise. Ensuite, le chauffeur paie (recharge Wave, via l'admin).
- **Chaque commande reçue** coûte **50 points**, déduits à sa création (1 citerne = 1000 L = la seule quantité de cette appli), rendus si le client annule.
- **Sous 50 points**, `is_offline` passe à `true` : le chauffeur disparaît de `tricycles_dispo` (invisible des clients, quel que soit son statut) et ne peut plus se remettre actif ou en pause lui-même. Son tableau de bord (`/chauffeur`) affiche alors une page bloquante : « Solde épuisé — Rechargez par Wave au <numéro de dépôt> pour continuer. Minimum 1000F (1000 points) » + son solde actuel + bouton d'appel direct.
- **Fidélité** : chaque déduction incrémente `total_points_utilises` ; dès qu'il atteint **5000**, +50 points sont offerts automatiquement, le compteur repart à 0, et un toast « Bravo ! 1 livraison gratuite offerte (+50 pts) » s'affiche côté chauffeur.
- **Recharge manuelle** : onglet **Recharges** de l'admin — liste des chauffeurs avec leur solde, champ pour ajouter des points (montant obligatoirement multiple de 50), débloque automatiquement le chauffeur si le solde repasse ≥ 50. Chaque recharge (et chaque déduction/bonus) est loguée dans `points_transactions` — aucune interface ne l'affiche pour l'instant, c'est une traçabilité interne.
- Pas d'agrégateur de paiement : la recharge Wave est reçue manuellement par l'admin, qui l'enregistre lui-même dans l'appli.

## Super admin — le cockpit

- **Dashboard** : nombre de clients, de chauffeurs, commandes du jour, CA estimé du jour, carte globale temps réel.
- **Cités** / **Forages** : CRUD complet (ajout, renommage, suppression avec confirmation, cascade).
- **Chauffeurs** : liste avec cité, prix, statut actif / en pause / hors ligne, statut PAYE/IMPAYE/BLOQUE, bouton « Commandes » pour voir son historique, suppression définitive.
- **Recharges** : liste des chauffeurs avec leur solde de points, recharge manuelle après paiement Wave.
- **Clients** : liste avec cité/lot, statut, date de paiement, date d'expiration + jours restants, bouton **+30 jours**, mêmes actions.
- **Commandes** : flux temps réel de toutes les commandes, filtrable par statut.
- **Sécurité** : changer le mot de passe admin.
- **Paramètres** (`/<ADMIN_PATH>/parametres`) : numéro de dépôt Wave (`settings.depot_phone`, `0789855418` par défaut). C'est la **seule** source du numéro affiché (accueil, page « Solde insuffisant », espace chauffeur, affiché `07 89 85 54 18`) : aucun numéro n'est codé en dur dans le front.

## Téléphones — une seule forme

[`src/lib/phone.ts`](src/lib/phone.ts) (et `public.normalize_phone` côté SQL, identique) ramène tout numéro à `0XXXXXXXXX` : `0789855418`, `07 89 85 54 18`, `+225789855418`, `+2250789855418`, `00225789855418` = **le même compte**. Appliqué à l'inscription, au login, à la saisie manuelle chauffeur et au numéro de dépôt. En base, `clients.phone_normalized` et `tricycles.phone_normalized` sont `UNIQUE`. Le `0` n'est ajouté qu'aux numéros à 9 chiffres : les fixes (`27 21 …`) font déjà 10 chiffres. Tests : `npm test`.

## Sécurité

- Aucune table sensible (`clients`, `tricycles`, `commandes`, `admins`) n'est lisible directement, même par un compte Supabase authentifié classique — tout passe par des fonctions RPC `security definer` qui vérifient elles-mêmes un jeton de session (comme pour les chauffeurs dans les versions précédentes, désormais généralisé aux 3 rôles).
- PIN/mot de passe **hachés en bcrypt** (pgcrypto, jamais stockés en clair) ; connexion = nouveau jeton à chaque fois (une reconnexion invalide l'ancien jeton — se connecter ailleurs déconnecte l'appareil précédent).
- 5 échecs de code → compte bloqué 15 minutes (sinon un PIN à 4 chiffres se devine en quelques minutes).
- Temps réel : pings broadcast sans donnée (`cite:<id>`, `tricycle:<id>`, `client:<id>`, `admin`), puis rechargement via RPC ; polling de secours (8–15 s) si le WebSocket tombe.
- Aucun identifiant admin en dur, ni dans le front ni dans le SQL. Compte admin créé à la main (`admin_definir`), mot de passe de 10 caractères minimum.
- `anon` / `authenticated` n'ont **aucun droit SQL** sur les tables sensibles (en plus de RLS sans policy) : seules les RPC, qui contrôlent le jeton et filtrent sur l'id de l'appelant, y accèdent. C'est l'équivalent, sans Supabase Auth, de « le chauffeur ne voit que ses lignes, l'admin voit tout, anon rien ».
- Espaces admin/chauffeur sur URL secrètes, gardées par le middleware (voir plus haut), avec `noindex` et `Referrer-Policy: strict-origin` : les tuiles de carte et les polices ne reçoivent que le nom du site, jamais le chemin secret (OpenStreetMap exige ce Referer, sans lui la carte affiche « Access blocked »).

## Notes

- Le GPS live n'est partagé qu'avec le client, pendant `ARRIVING` (voir « GPS live » plus haut). La carte **admin** continue d'**estimer** la position des tricycles (à la source, ou vers le lot en cours de livraison). Pour un suivi admin, lire `positions_historique` plutôt que de réactiver un GPS permanent.
- Tuiles : serveur public OpenStreetMap (usage modéré). Pour un fort trafic, prends un fournisseur de tuiles dédié.
- Polices : Clash Display (Fontshare) avec Sora en repli, Space Grotesk pour le corps.
- Palette 100 % bleue (`#F7FBFF` / `#0A1931` / `#0096FF` / `#E0F2FF` / `#EDF6FF`) — aucune trace de jaune.
