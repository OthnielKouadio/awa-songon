import type { Metadata } from "next";
import { H2, LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Politique de confidentialité — ${LEGAL.service}`,
  description: `Données personnelles collectées par ${LEGAL.service} et droits des utilisateurs (loi ivoirienne n°2013-450).`,
  alternates: { canonical: "/confidentialite" },
};

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        Cette politique explique quelles données {LEGAL.service} collecte, pourquoi, et quels sont tes droits, conformément à la loi n°2013-450
        du 19 juin 2013 relative à la protection des données à caractère personnel.
      </p>

      <H2>1. Responsable du traitement</H2>
      <p>
        {LEGAL.editeur}, {LEGAL.adresse}. Contact : {LEGAL.email}. Déclaration auprès de l&apos;ARTCI : {LEGAL.artci}.
      </p>

      <H2>2. Données collectées</H2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Foyer :</strong> nom de famille, numéro de téléphone principal, maison occupée (ex. PROMO 012), date d&apos;arrivée, solde et
          mouvements de points, commandes.
        </li>
        <li>
          <strong>Membres du foyer :</strong> prénom, rôle (Papa, Maman…) et, s&apos;ils le souhaitent, numéro de téléphone.
        </li>
        <li>
          <strong>Avis :</strong> notes et commentaires laissés sur les livraisons et sur le service.
        </li>
        <li>
          <strong>Livreurs :</strong> nom, numéro de téléphone, cité, prix pratiqué, solde de points, notes reçues, livraisons effectuées.
        </li>
        <li>
          <strong>Code maison :</strong> jamais stocké en clair, uniquement sous forme chiffrée irréversible (empreinte bcrypt).
        </li>
        <li>
          <strong>Sécurité :</strong> adresse IP des tentatives de code, conservée 48 heures maximum pour bloquer les essais en masse.
        </li>
      </ul>
      <p>
        <strong>Position :</strong> seule la position GPS du <strong>portail de la maison</strong> est enregistrée (à la pose de l&apos;autocollant, ou
        par le livreur devant la porte), pour le guider. La position de ton téléphone n&apos;est jamais demandée ni enregistrée : tu peux commander
        d&apos;où tu veux, la livraison se fait toujours à la maison.
      </p>

      <H2>3. Pourquoi</H2>
      <p>
        Ces données servent uniquement à faire fonctionner le service : créer le foyer, transmettre la commande au livreur, gérer les points, améliorer
        la qualité des livraisons (avis) et protéger les comptes. Le traitement repose sur l&apos;exécution du service que tu demandes.
      </p>

      <H2>4. Qui y a accès</H2>
      <p>
        Le livreur choisi voit le code de la maison, le nom de famille, le prénom de la personne qui a commandé et un numéro à appeler.
        L&apos;administrateur du service accède aux données pour la gestion des maisons, des recharges et des avis.{" "}
        <strong>Tes données ne sont jamais vendues ni louées</strong>, et ne sont pas utilisées pour de la publicité. Une personne qui scanne le QR
        d&apos;une maison sans connaître le code ne voit aucun nom.
      </p>
      <p>
        Prestataires techniques : Supabase (base de données) et Vercel (hébergement du site), qui stockent les données pour notre compte ; Wave pour
        les paiements que tu effectues. Ces prestataires peuvent être situés hors de Côte d&apos;Ivoire.
      </p>

      <H2>5. Durée de conservation</H2>
      <p>
        Les données du foyer sont conservées tant qu&apos;il occupe la maison. À sa clôture (départ), le foyer est archivé : les téléphones sont
        déconnectés et le code effacé ; l&apos;historique des commandes et des points est conservé pour la comptabilité.
      </p>

      <H2>6. Stockage sur ton appareil</H2>
      <p>
        Pour que tu n&apos;aies pas à tout ressaisir, ton téléphone garde un jeton de connexion propre à la maison (stockage local du navigateur).
        Ce jeton est indispensable au service ; « Déconnecter ce téléphone » l&apos;efface. Aucun cookie publicitaire n&apos;est utilisé ; une
        éventuelle mesure d&apos;audience n&apos;est activée qu&apos;avec ton accord.
      </p>

      <H2>7. Tes droits</H2>
      <p>
        Tu peux à tout moment demander l&apos;accès à tes données, leur rectification, leur suppression ou t&apos;opposer à leur traitement, en
        écrivant à {LEGAL.email}. Tu peux aussi saisir l&apos;ARTCI (Autorité de Régulation des Télécommunications/TIC de Côte d&apos;Ivoire).
      </p>
    </LegalPage>
  );
}
