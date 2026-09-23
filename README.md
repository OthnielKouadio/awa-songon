# Distribution Eau — Livraison d'eau par tricycle

Next.js 14 (App Router) · Tailwind · Framer Motion · Supabase (DB + Realtime) · Leaflet + OpenStreetMap (gratuit, aucune clé Google).

## Pages publiques : `/`, `/inscription`, `/login`

`/` est la vitrine complète : header (« Se connecter » / « S'inscrire » → popup de choix de rôle), hero, étapes client, section chauffeur (bonus d'inscription, recharge, fidélité), tarifs, blocage automatique, FAQ, footer. Les CTA renvoient vers `/inscription?role=client|chauffeur` ; le popup du header peut aussi renvoyer vers `/login?role=client|chauffeur` (le rôle est alors pré-sélectionné, pas besoin de le rechoisir). Si une session existe déjà dans le navigateur, `/` redirige directement vers le bon tableau de bord. Les chiffres du programme de points (2500 offerts, 50/livraison, seuil de fidélité à 5000) viennent de `src/lib/format.ts`, pas de texte codé en dur — ils restent cohérents avec la logique réelle.

`/inscription?role=...` porte le formulaire d'inscription dédié (nom, téléphone, cité/source, PIN) pour le rôle choisi. `/login` reste l'entrée unique pour se **connecter** (et garde aussi ses propres onglets Connexion/Inscription, pour qui y arrive directement) : on y choisit **« Je suis client »** ou **« Je suis chauffeur »**, puis on se connecte avec son téléphone + son code à 4 chiffres.

L'admin **n'a pas d'écran dédié** : il se connecte avec **son numéro + son mot de passe**, sur `/login`, sur n'importe lequel des deux onglets (client ou chauffeur) — le compte est reconnu par son numéro et redirige automatiquement vers `/admin`. Aucun lien `/admin` n'est jamais affiché.

| Route | Rôle | Accès |
|---|---|---|
| `/` | Tout le monde | Vitrine complète (hero, étapes, section chauffeur, tarifs, FAQ) — popup de rôle vers `/inscription` ou `/login` |
| `/inscription?role=client\|chauffeur` | Tout le monde | Formulaire d'inscription dédié au rôle choisi |
| `/login` | Tout le monde | Connexion (et inscription en secours) — choix client/chauffeur |
| `/dashboard` | Client | Tableau de bord : tricycles DISPO de sa cité, commande, suivi |
| `/suivi/[id]` | Client | Lien direct de suivi (partageable, sans compte) |
| `/bloque` | Client | Abonnement expiré : paiement + WhatsApp (redirection automatique) |
| `/chauffeur` | Chauffeur | File d'attente, DISPO/OFF, prix, livraisons |
| `/admin` | Admin | Dashboard, cités, forages, chauffeurs, clients, commandes, sécurité |

## Thème et composants custom

Palette 100 % bleue via les tokens Tailwind `paper`/`ink`/`mist`/`azur`/`sky`/`danger` (fond `#F7FBFF`, bordures `#0A1931`, cartes `#EDF6FF`, bordure 2px, coins 24px, ombre dure `4px 4px 0px`) — appliquée partout, y compris les menus déroulants et les popups de confirmation.

**Aucun `<select>`, `alert()` ni `confirm()` natif du navigateur.** Deux composants custom les remplacent partout dans l'appli (formulaires d'inscription, panneaux admin) :
- [`CustomSelect`](src/components/CustomSelect.tsx) : menu déroulant en boutons (`onClick`, fiable sur mobile), forme pilule, options ou groupes d'options (ex. sources groupées par cité).
- [`CustomModal`](src/components/CustomModal.tsx) : modal thémée, plus un hook `useConfirm()` qui remplace `window.confirm()` par une popup `await confirm(message)`.

**Admin par défaut (démo et Supabase) : téléphone `0566036825`, mot de passe `admin123`.**
Change-le dès la première connexion, onglet **Sécurité** de `/admin`.

## Lancer

```bash
npm install
npm run dev
```

**Ça marche tout de suite, sans `.env`** : sans variables Supabase, l'app tourne en **mode démo**, données dans le `localStorage` du navigateur. Ouvre plusieurs onglets du même navigateur pour voir client/chauffeur/admin interagir en temps réel (les données ne sont **pas partagées entre navigateurs différents** en mode démo — c'est un vrai backend qu'il faut pour ça, voir plus bas).

Comptes de démo (PIN `1234`) :
- Chauffeurs : Kader `0700000001` (Cité 1 + Cité 2, 2 500 FCFA), Yao `0700000002` (Cité 1, 2 500 FCFA), Moussa `0700000003` (Cité 2, 3 000 FCFA), Koffi `0700000004` (Cité 3, OFF, solde de points épuisé — démo de la page bloquante).
- Clients : Fatou `0701020304` (Cité 1, lot 12, payé), Issa `0705060708` (Cité 1, lot 7, impayé), Aya `0709101112` (Cité 1, lot 21, payé).
- Admin : `0566036825` / `admin123`.

L'onglet **Sécurité** de `/admin` affiche un bouton pour réinitialiser les données de démo.

## Passer sur Supabase (données partagées entre appareils)

1. Crée un projet Supabase, puis **SQL Editor** → lance [`supabase/schema.sql`](supabase/schema.sql) (idempotent, crée aussi l'admin par défaut).
2. Facultatif : [`supabase/seed.sql`](supabase/seed.sql) (3 cités + 3 sources — clients et chauffeurs s'inscrivent eux-mêmes).
3. `cp .env.example .env.local` et renseigne `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
4. Vercel : mêmes 2 variables d'environnement, puis déploie.

> ⚠️ Ce schéma (v4) **n'utilise plus Supabase Auth du tout** — l'admin se connecte par téléphone + mot de passe comme les autres rôles, via des fonctions RPC. Si tu viens d'une version antérieure, repars d'un projet Supabase vide : le modèle de données change trop pour migrer.

## Règles métier

- **Comptes obligatoires** pour client et chauffeur (nom, téléphone, PIN à 4 chiffres qu'ils choisissent). Cité et lot sont fixés à l'inscription du client — plus besoin de les ressaisir à chaque commande.
- Un client d'une cité ne voit **que** les tricycles DISPO de **sa** cité.
- **Un chauffeur choisit une ou plusieurs cités à l'inscription** (relation plusieurs-à-plusieurs, table `tricycle_cites`) : il est visible par les clients de chacune. La **source (le forage) est facultative** — un chauffeur qui n'en fixe pas puise "un peu partout" dans ses cités ; s'il en choisit une, elle doit appartenir à l'une de ses cités.
- Un tricycle reste visible et commandable **même EN_ROUTE** ; il ne disparaît que s'il passe OFF (ou si l'admin le bloque).
- **Une seule quantité : 1000 L.** 1 commande = 1 voyage = 1000 L.
- **Prix** : chaque chauffeur fixe son prix pour 1000 L (100 à 50 000 FCFA), modifiable à tout moment. Le prix est **figé dans la commande** : un changement de tarif n'affecte pas les commandes déjà passées.
- **Un client ne peut avoir qu'une seule commande active à la fois.**
- Temps estimé = position dans la file × 35 min.
- « Livré » sort la commande de la file, fait remonter les suivants d'un cran, et le client voit un écran **« Livré ! »** qu'il ferme lui-même (bouton « Commander à nouveau ») avant de repasser en mode commande.
- **Appel direct uniquement — aucun bouton WhatsApp** nulle part : `tel:` pour client → chauffeur (via son suivi) et chauffeur → client (dans sa file, avec le nom du client).
- GPS optionnel : pop-up custom → `getCurrentPosition()`. Accepté à l'inscription (client) et ré-actualisable à chaque commande ; refusé ou indisponible → la commande part avec la position déjà enregistrée, ou sans GPS.
- « Naviguer » ouvre `https://www.google.com/maps/dir/?api=1&destination=lat,long` (lien simple, aucune API payante).

## Statuts de compte — PAYE / IMPAYE / BLOQUE

Gérés **uniquement par l'admin**, jamais par le titulaire du compte.

- **Client BLOQUÉ** : ne peut plus commander (écran « Compte bloqué, contacte l'administrateur »). Une commande déjà en cours reste livrable normalement.
- **Chauffeur BLOQUÉ** : repasse OFF automatiquement, disparaît de la liste publique, et ne peut plus se remettre DISPO lui-même tant que l'admin ne le débloque pas.
- Marquer un client **PAYÉ** enregistre la date de paiement (visible dans l'onglet Clients).

## Abonnement client — 30 jours, indépendant du statut ci-dessus

Chaque client a une date d'expiration (`subscription_ends_at`), distincte du statut PAYE/IMPAYE/BLOQUE :

- **30 jours offerts à l'inscription.** Aucune action requise.
- Le tableau de bord client (`/dashboard`) vérifie cette date à chaque chargement ; si elle est dépassée, redirection automatique vers **`/bloque`** — message de blocage + montant à payer (1000 FCFA au numéro admin) + bouton WhatsApp pré-rempli + bouton « Réessayer ».
- Badge discret en haut du tableau de bord : **« Il te reste X jours »** — vert au-delà de 3 jours, orange à 3 jours ou moins.
- Onglet **Clients** de l'admin : colonnes « Expire le » et « Jours restants » (rouge si expiré), bouton **+30 jours** sur chaque ligne — prolonge à partir de `max(date actuelle, maintenant) + 30 jours` (un renouvellement anticipé s'ajoute à la fin de l'abonnement en cours, il ne le remplace pas) et débloque automatiquement le client à son prochain chargement.
- Une commande déjà en cours au moment de l'expiration reste visible et livrable normalement (le blocage empêche seulement une nouvelle visite du tableau de bord tant que l'abonnement n'est pas renouvelé).
- Ce mécanisme ne s'applique qu'aux **clients** ; les chauffeurs restent uniquement sur le statut PAYE/IMPAYE/BLOQUE géré manuellement par l'admin, sans date d'expiration.

## Points chauffeur — 1 FCFA = 1 point, indépendant du statut PAYE/IMPAYE/BLOQUE

Chaque chauffeur a un solde de points (`solde_points`), distinct du statut PAYE/IMPAYE/BLOQUE et de l'abonnement client ci-dessus :

- **2500 points offerts à l'inscription** (= 50 livraisons gratuites). Aucune action requise. Ensuite, le chauffeur paie (recharge Wave, via l'admin).
- **Accepter une livraison** (bouton « Je pars livrer ») coûte **50 points** (1 citerne = 1000 L = la seule quantité de cette appli). Refusé si le solde est déjà sous 50 (`SOLDE_INSUFFISANT`).
- **Sous 50 points**, `is_offline` passe à `true` : le chauffeur disparaît de `tricycles_dispo` (invisible des clients, même s'il est encore marqué DISPO) et ne peut plus repasser DISPO lui-même. Son tableau de bord (`/chauffeur`) affiche alors une page bloquante : « Solde épuisé — Rechargez par Wave au 0566036825 pour continuer. Minimum 1000F (1000 points) » + son solde actuel + bouton d'appel direct.
- **Fidélité** : chaque déduction incrémente `total_points_utilises` ; dès qu'il atteint **5000**, +50 points sont offerts automatiquement, le compteur repart à 0, et un toast « Bravo ! 1 livraison gratuite offerte (+50 pts) » s'affiche côté chauffeur.
- **Recharge manuelle** : onglet **Recharges** de l'admin — liste des chauffeurs avec leur solde, champ pour ajouter des points (montant obligatoirement multiple de 50), débloque automatiquement le chauffeur si le solde repasse ≥ 50. Chaque recharge (et chaque déduction/bonus) est loguée dans `points_transactions` — aucune interface ne l'affiche pour l'instant, c'est une traçabilité interne.
- Pas d'agrégateur de paiement : la recharge Wave est reçue manuellement par l'admin, qui l'enregistre lui-même dans l'appli.

## Super admin — le cockpit

- **Dashboard** : nombre de clients, de chauffeurs, commandes du jour, CA estimé du jour, carte globale temps réel.
- **Cités** / **Forages** : CRUD complet (ajout, renommage, suppression avec confirmation, cascade).
- **Chauffeurs** : liste avec cités, prix, statut DISPO/OFF, statut PAYE/IMPAYE/BLOQUE, bouton « Commandes » pour voir son historique, suppression définitive.
- **Recharges** : liste des chauffeurs avec leur solde de points, recharge manuelle après paiement Wave.
- **Clients** : liste avec cité/lot, statut, date de paiement, date d'expiration + jours restants, bouton **+30 jours**, mêmes actions.
- **Commandes** : flux temps réel de toutes les commandes, filtrable par statut.
- **Sécurité** : changer le mot de passe admin.

## Sécurité

- Aucune table sensible (`clients`, `tricycles`, `commandes`, `admins`) n'est lisible directement, même par un compte Supabase authentifié classique — tout passe par des fonctions RPC `security definer` qui vérifient elles-mêmes un jeton de session (comme pour les chauffeurs dans les versions précédentes, désormais généralisé aux 3 rôles).
- PIN/mot de passe **hachés** (jamais stockés en clair) ; connexion = nouveau jeton à chaque fois (une reconnexion invalide l'ancien jeton — se connecter ailleurs déconnecte l'appareil précédent).
- 5 échecs de code → compte bloqué 15 minutes (sinon un PIN à 4 chiffres se devine en quelques minutes).
- Temps réel : pings broadcast sans donnée (`cite:<id>`, `tricycle:<id>`, `client:<id>`, `admin`), puis rechargement via RPC ; polling de secours (8–15 s) si le WebSocket tombe.
- Mot de passe admin par défaut connu (`admin123`) : **change-le dès le déploiement**, onglet Sécurité.

## Notes

- Les tricycles n'émettent pas de GPS réel : sur la carte admin, leur position est **estimée** (à la source, ou vers le lot en cours de livraison).
- Tuiles : serveur public OpenStreetMap (usage modéré). Pour un fort trafic, prends un fournisseur de tuiles dédié.
- Polices : Clash Display (Fontshare) avec Sora en repli, Space Grotesk pour le corps.
- Palette 100 % bleue (`#F7FBFF` / `#0A1931` / `#0096FF` / `#E0F2FF` / `#EDF6FF`) — aucune trace de jaune.
