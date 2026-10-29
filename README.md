# Distribution Eau V3 — Livraison d'eau dans les cités, par QR code de maison

Next.js 15 (App Router) · Tailwind · Supabase (Postgres + Auth + RLS).

Chaque maison d'une cité fermée (Promogim, Arc-en-Ciel…) porte un autocollant 5 × 5 cm :

```
        PROMO 012          ← ce que le livreur lit
      ┌───────────┐
      │  QR code  │        ← https://awa-songon.vercel.app/m/K7QX2P
      └───────────┘
   awa-songon.vercel.app/m/K7QX2P      ← à taper si le QR est abîmé
```

Le client scanne : 1er scan → il crée le **foyer** ; ensuite, toute la famille utilise le **code maison** à 4 chiffres. Une commande est **toujours livrée à la maison**, d'où qu'on commande.

> Toutes les fonctionnalités de la V2 sont reprises (connexion téléphone + code, aujourd'hui/demain, statuts pause/hors ligne, « J'arrive chez toi » + GPS en direct, forages, fidélité, recrutement, statistiques, Wave, liens secrets…), adaptées aux maisons. Le code V2 d'origine reste dans la branche `archive/v2` (tag `v2-final`) ; ses données sont rangées dans le schéma `archive_v2`.

## Pages

| Route | Qui | Rôle |
|---|---|---|
| `/` | Public | Vitrine (hero, étapes, section chauffeur, tarifs, FAQ) + « mes maisons » + code sous le QR |
| `/login` | Familles et livreurs | **Une seule connexion** : numéro + code (code maison pour une famille), sans choisir son rôle |
| `/inscription` | Public | Comment inscrire sa maison (QR du portail, ou code imprimé dessous) |
| `/m/[qr_token]` | Lien du QR | Maison LIBRE → créer le foyer · OCCUPÉE → code maison → commander (aujourd'hui / demain), suivre en direct, « Livré ! », menu (historique, consommation, partager le suivi, changer le code, recharger via Wave) |
| `/suivi/[id]` | Lien partagé | Suivi d'une commande sans compte (statut, file, carte en direct) — aucune donnée du foyer |
| `/avis/[commande_id]` | Foyer livré uniquement | Noter le livreur (5 étoiles + commentaire), une seule fois, 7 jours max |
| `/avis-plateforme` | Foyer connecté | Avis sur le service (1 par foyer et par semaine) |
| `/<DRIVER_PATH>` | Livreurs | PAUSE / REPRENDRE / OFFLINE, file, « Je pars livrer » → « J'arrive chez toi » (GPS) → « Livré », prix, statistiques, fidélité, saisie directe |
| `/<DRIVER_SIGNUP_PATH>` | Chauffeur recruté | Inscription (invisible jusqu'à validation par l'admin) |
| `/<ADMIN_PATH>/dashboard` | Admin (2FA) | Compteurs du jour, CA, alertes, carte des livreurs et des maisons |
| `…/commandes` · `…/maisons` · `…/livreurs` · `…/cites` | Admin | Flux temps réel · maisons, QR, impression · livreurs (validation, codes, recharges, payé/impayé, avis) · cités, **forages** et réglages (essai, coûts, Wave) |
| `…/statistiques` · `…/anciens-clients` · `…/avis-plateforme` · `…/securite` | Admin | Stats annuelles + CSV/Excel · rattacher les clients V2 à leur maison · avis · mot de passe |

**Liens secrets (V2)** : `ADMIN_PATH`, `DRIVER_PATH` et `DRIVER_SIGNUP_PATH` dans `.env.local` (8 à 64 caractères, lettres/chiffres/-/_). Les dossiers réels (`/admin`, `/livreur`, `/recrutement-chauffeur`) répondent 404 dès qu'un secret est défini. La vraie protection reste en base (2FA admin, jetons, codes).

## Installation (base vide)

1. **Supabase** : crée un projet → **SQL Editor** → colle et lance [`supabase/schema.sql`](supabase/schema.sql) en entier (relançable).
2. **Variables** : `cp .env.example .env.local` et renseigne `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **Premier admin** :
   - Supabase → **Authentication → Users → Add user** (email + mot de passe long et unique).
   - SQL Editor :
     ```sql
     insert into public.admins (user_id, email)
     select id, email from auth.users where email = 'toi@exemple.com';
     ```
   - Ouvre `/admin` : l'appli impose d'activer la **double authentification** (Google Authenticator / Authy) avant tout accès.
4. **Verrouiller Supabase Auth** : *Authentication → Sign In / Providers* → **désactive « Allow new users to sign up »**. (Même sans ça, un inscrit n'aurait accès à rien, mais autant fermer la porte.)
5. **Réglages** (`/admin/cites`, en bas) : mets **ton vrai domaine** *avant* de générer les maisons — il est imprimé dans chaque QR — et la **date de fin de l'essai gratuit**.
6. `npm install && npm run dev`. En production : Vercel avec les mêmes variables.

## Créer et imprimer les autocollants

1. `/admin/cites` → **Nouvelle cité** : `Promogim` / `PROMO`.
2. `/admin/maisons` → **Générer un lot** : Promogim, 1 → 300. Chaque maison reçoit un jeton aléatoire unique. Relancer un lot ne crée jamais de doublon (numéros existants ignorés).
3. Pour l'imprimeur, au choix :
   - **CSV** : `code_affichage,qr_token,lien_qr,cite,numero` (impression de données variables) ;
   - **PDF prêt à imprimer** : *Voir / imprimer les autocollants* → *Imprimer / PDF* (A4, échelle 100 %). Vectoriel, net à toutes les tailles.

Les QR sont générés dans le navigateur ([`PrettyQr`](src/components/PrettyQr.tsx)) : modules arrondis reliés, yeux bleus, goutte au centre, correction d'erreur **H (30 %)**. Lisibilité testée avec un décodeur (jsQR) jusqu'à 130 px et avec flou.

## Livreurs

Pas d'inscription libre : **seuls les livreurs que l'admin crée peuvent se connecter**.

1. `/admin/livreurs` → **Nouveau livreur** (cité, nom, numéro, prix de l'eau).
2. **Créer l'accès** : un code à 4 chiffres s'affiche **une seule fois**, avec un message prêt à envoyer (WhatsApp ou copier) : lien `…/livreur`, numéro, code.
3. Le livreur ouvre le lien, se connecte, et **choisit son propre code** (obligatoire avant toute action). Il ajoute l'appli à son écran d'accueil.
4. Il passe **En service** : il devient visible des clients de sa cité. En **pause**, il disparaît de la liste.
5. Code oublié → **Nouveau code** (ses téléphones sont déconnectés). Problème → statut **Bloqué**.

Dans sa file : « **PROMO 012** – Famille Koffi – commandé par Maman », Appeler, **Itinéraire** (si la position est connue), **Je pars livrer**, puis **Je suis devant la maison** (enregistre la position si elle manque), **Confirmer la famille** (foyer « à vérifier »), **Livré**. Le téléphone vibre quand une commande arrive (rafraîchi toutes les 15 s).

**Saisie directe** : pour un client qui appelle ou une famille sans smartphone, le livreur tape le numéro de la maison (`12`, `PROMO 012`…). Maison sans foyer inscrit → nom + numéro obligatoires. Rien n'est débité au foyer.

## Position des maisons

- **Mode pose** : connecté en admin (2FA) sur ton téléphone, colle l'autocollant, scanne-le : la page de la maison affiche **« Enregistrer la position ici »**. La pose fait foi (remplace toute position).
- **Par le livreur** : si la maison n'a pas de position, « Je suis devant la maison » l'enregistre (uniquement pour sa propre commande en cours, jamais pour écraser une position existante).
- Fiche maison (admin) : voir sur la carte / effacer. Seul le **portail** est localisé, jamais le téléphone d'un client.

## Essai gratuit

Une **date de fin d'essai** pour tout le monde, réglée dans `/admin/cites` → Réglages (2 ans maximum, vide = pas d'essai). Jusqu'à cette date incluse : **aucun point débité**, ni aux foyers ni aux livreurs, et la date est affichée dans leurs écrans. Ensuite : 100 points par commande pour le foyer, 50 pour le livreur (réglables). Un livreur sous 50 points devient invisible et ne peut plus se remettre en service tant qu'il n'est pas rechargé.

## Règles métier

- **Maison ≠ foyer.** La maison (`PROMO 012`, QR, lien) ne change jamais (trigger `MAISON_IMMUABLE`). Le foyer (nom, code, solde) part avec les occupants.
- **Code maison** : 4 chiffres, bcrypt, refusé s'il est trop simple (`1234`, `0000`, `1122`…) ou s'il contient le numéro de la maison. Redemandé **à chaque commande**.
- **Une commande en cours par foyer** (verrou + index unique) : si Maman a commandé, Papa voit sa commande au lieu d'en créer une 2e.
- **Points = crédits de livraison NON REMBOURSABLES.** Case obligatoire à la création du foyer (date et version enregistrées), mention « Crédit non remboursable » sous chaque bouton de recharge. Une recharge est un achat définitif. Annulation avant départ du livreur → points **recrédités** sur le portefeuille (jamais d'argent).
- **Coût d'une commande** : réglable (`/admin/cites` → Réglages, 100 points par défaut). Le prix de l'eau (fixé par livreur) est payé au livreur.
- **Clôture du foyer** (départ du locataire) : s'il reste des points → alerte « Ce foyer a X points. Ils seront perdus définitivement car non remboursable. Confirmer ? ». Puis foyer ARCHIVE, téléphones déconnectés, code effacé, solde à 0 (trace `PERTE_CLOTURE`), maison LIBRE, **même QR**. Refusée s'il y a une commande en cours.
- **Recharge** : le client paie par Wave puis appelle le service ; l'admin crédite dans la fiche maison (référence Wave facultative).

## Sécurité

| Menace | Protection |
|---|---|
| Deviner les QR des voisins (`?m=001`, `?m=002`…) | Jeton aléatoire cryptographique de 6 caractères (32⁶ ≈ 1 milliard), 30 jetons inconnus max par IP et par heure |
| Passant qui scanne un autocollant | Ne voit **aucun nom** : seulement « PROMO 012 – déjà inscrite » |
| Force brute du code à 4 chiffres | 10 codes faux / 24 h par maison → **verrouillée pour les nouveaux téléphones seulement** (la famille déjà connectée continue de commander) ; 20 échecs / 15 min par IP ; 5 / 15 min par téléphone. 10 000 codes à 10 essais/jour ≈ 3 ans |
| Bloquer une famille en tapant des faux codes | Impossible : le verrou ne touche pas les téléphones déjà connectés |
| 1er scan par un usurpateur | Badge « À vérifier » dans l'admin, « Marquer vérifié », clôture du foyer en un clic |
| QR arraché / copié | « Nouveau QR » : l'ancien lien meurt immédiatement |
| Code qui a fuité / oublié | « Code oublié » : nouveau code affiché une fois à l'admin, tous les téléphones déconnectés |
| Vol d'un téléphone de la famille | Le code maison reste demandé à chaque commande |
| Lecture/écriture directe des tables | RLS sur toutes les tables, **aucun** droit pour `anon`/`authenticated` ; lecture réservée à l'admin 2FA ; écritures uniquement via fonctions `security definer` qui valident tout |
| Mot de passe admin volé | **2FA obligatoire** : chaque fonction admin exige `aal2` (`is_admin()`) |
| Faux livreur | Aucune inscription libre ; code provisoire à changer à la 1re connexion ; 5 codes faux → 15 min de blocage (les téléphones déjà connectés continuent) ; un numéro inconnu reçoit la même réponse qu'un code faux |
| Livreur qui touche les commandes d'un autre / déplace une maison | Chaque action vérifie que la commande est **la sienne** ; position acceptée seulement pour sa commande en cours, en Côte d'Ivoire, et jamais par-dessus une position existante |
| Falsifier l'historique des points | `transactions_points`, `journal_admin` et `avis_livreurs` : modification et suppression interdites par trigger, même en SQL |
| Faire livrer ailleurs / noter la livraison d'un autre | Maison et foyer déduits du jeton côté serveur, jamais d'un paramètre envoyé par le téléphone |
| Injection de formule dans le CSV | Cellules `= + - @` neutralisées |
| XSS / fuite de jeton | CSP stricte (scripts et connexions limités au site et à Supabase), aucun HTML injecté, `no-referrer` sur `/m`, `/avis`, `/admin` |

Toutes les actions admin sont tracées dans `journal_admin` (jamais le code maison).

## Tests

```bash
npm test          # téléphones, codes trop simples, CSV
npm run test:sql  # 185 scénarios sur un vrai PostgreSQL (PGlite) : droits, force brute, livreurs, fonctions V2,
                  # essai gratuit, saisie directe, double commande, clôture, avis…
npm run typecheck && npm run lint && npm run build
```

## Reste à faire

- Paiement Wave automatique (aujourd'hui : recharge manuelle par l'admin).
- Notifications push / SMS (aujourd'hui : rafraîchissement toutes les 15 s + vibration côté livreur).
