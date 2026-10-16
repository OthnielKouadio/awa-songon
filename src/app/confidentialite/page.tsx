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
          <strong>Clients :</strong> nom, numéro de téléphone, cité et numéro de lot, position GPS du domicile (facultative, seulement si tu
          l&apos;autorises), historique des commandes et solde de points.
        </li>
        <li>
          <strong>Chauffeurs :</strong> nom, numéro de téléphone, cité, source d&apos;eau, prix pratiqué, solde de points, et position GPS
          pendant les livraisons.
        </li>
        <li>
          <strong>Code secret :</strong> jamais stocké en clair, uniquement sous forme chiffrée irréversible (empreinte).
        </li>
      </ul>

      <H2>3. Pourquoi</H2>
      <p>
        Ces données servent uniquement à faire fonctionner le service : créer ton compte, transmettre ta commande au chauffeur, le guider jusqu&apos;à
        ton lot, te montrer où il se trouve quand il arrive, gérer les points et assurer la sécurité des comptes. Le traitement repose sur
        l&apos;exécution du service que tu demandes.
      </p>

      <H2>4. Qui y a accès</H2>
      <p>
        Le chauffeur que tu choisis voit ton nom, ton numéro, ta cité, ton lot et ta position pour te livrer. L&apos;administrateur du service y
        accède pour la gestion des comptes et des paiements. <strong>Tes données ne sont jamais vendues ni louées</strong>, et ne sont pas utilisées
        pour de la publicité.
      </p>
      <p>
        Prestataires techniques : Supabase (base de données) et Vercel (hébergement du site), qui stockent les données pour notre compte ; Wave pour
        les paiements que tu effectues ; OpenStreetMap pour l&apos;affichage des cartes. Ces prestataires peuvent être situés hors de Côte
        d&apos;Ivoire.
      </p>

      <H2>5. Position GPS</H2>
      <p>
        La position en direct du chauffeur n&apos;est partagée qu&apos;avec le client concerné, pendant l&apos;approche de sa livraison, et est
        effacée au bout de 5 minutes. Un tracé simplifié du trajet est conservé avec la commande.
      </p>

      <H2>6. Durée de conservation</H2>
      <p>
        Les données de compte sont conservées tant que le compte est actif. À la suppression du compte, ses commandes et son historique sont
        supprimés avec lui.
      </p>

      <H2>7. Stockage sur ton appareil</H2>
      <p>
        L&apos;application garde ta session de connexion dans ton navigateur (stockage local et un cookie de session sécurisé) pour que tu
        n&apos;aies pas à te reconnecter à chaque visite. Ces éléments sont indispensables au service. Aucun cookie publicitaire n&apos;est
        utilisé ; une éventuelle mesure d&apos;audience n&apos;est activée qu&apos;avec ton accord.
      </p>

      <H2>8. Tes droits</H2>
      <p>
        Tu peux à tout moment demander l&apos;accès à tes données, leur rectification, leur suppression ou t&apos;opposer à leur traitement, en
        écrivant à {LEGAL.email}. Tu peux aussi saisir l&apos;ARTCI (Autorité de Régulation des Télécommunications/TIC de Côte d&apos;Ivoire).
      </p>
    </LegalPage>
  );
}
