import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage } from "@/components/LegalPage";
import { COUT_COMMANDE_CLIENT, ESSAI_MOIS, HEURE_LIMITE_ANNULATION, QUANTITE_L, RECHARGE_MULTIPLE_CLIENT } from "@/lib/format";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Conditions générales d'utilisation — ${LEGAL.service}`,
  description: `Règles d'utilisation du service ${LEGAL.service} de livraison d'eau par tricycle à Songon.`,
  alternates: { canonical: "/cgu" },
};

export default function CguPage() {
  return (
    <LegalPage title="Conditions générales d'utilisation">
      <p>
        Les présentes conditions encadrent l&apos;utilisation du service {LEGAL.service} (site et application), qui met en relation des habitants de
        Songon avec des chauffeurs de tricycle livrant de l&apos;eau. En créant un compte, tu les acceptes.
      </p>

      <H2>1. Éditeur du service</H2>
      <p>
        {LEGAL.editeur} — {LEGAL.rccm} — {LEGAL.adresse}. Contact : {LEGAL.email}.
      </p>

      <H2>2. Le service</H2>
      <p>
        {LEGAL.service} permet de commander une livraison d&apos;eau de {QUANTITE_L} litres auprès d&apos;un chauffeur de ta cité, de suivre sa
        position pendant la livraison et de consulter ton historique. {LEGAL.service} est un intermédiaire : la livraison est assurée par le chauffeur
        choisi.
      </p>

      <H2>3. Compte</H2>
      <p>
        L&apos;inscription demande un nom, un numéro de téléphone ivoirien, ta cité et ton numéro de lot, ainsi qu&apos;un code secret. Tu t&apos;engages à
        fournir des informations exactes et à garder ton code confidentiel : toute commande passée avec ton numéro et ton code est réputée faite par
        toi. L&apos;éditeur peut suspendre un compte en cas d&apos;abus (fausses commandes, informations erronées, comportement envers un chauffeur).
      </p>

      <H2>4. Prix, points et paiement</H2>
      <p>
        Le prix de l&apos;eau est fixé par chaque chauffeur et affiché avant la commande ; il est réglé directement au chauffeur. L&apos;utilisation
        de l&apos;application fonctionne avec des points (1 FCFA = 1 point) : chaque commande coûte {COUT_COMMANDE_CLIENT} points. Les points
        s&apos;achètent par paiement Wave, par multiples de {RECHARGE_MULTIPLE_CLIENT} FCFA, et sont crédités après vérification du paiement.
        Les nouveaux comptes bénéficient d&apos;un essai gratuit de {ESSAI_MOIS} mois. Les points ne sont ni remboursables en argent ni
        transférables.
      </p>

      <H2>5. Commandes et annulation</H2>
      <p>
        Une commande peut être annulée depuis l&apos;application tant que le chauffeur n&apos;est pas parti la livrer ; une livraison programmée
        pour le lendemain n&apos;est plus annulable après {HEURE_LIMITE_ANNULATION}h la veille. Les points d&apos;une commande annulée sont
        rendus. Les délais affichés sont des estimations, qui dépendent de la file d&apos;attente du chauffeur et de la circulation.
      </p>

      <H2>6. Responsabilités</H2>
      <p>
        L&apos;éditeur met tout en œuvre pour que le service soit disponible, sans pouvoir le garantir en permanence (maintenance, réseau). Le
        chauffeur est responsable de la livraison et de l&apos;eau qu&apos;il fournit. Tout litige sur une livraison peut être signalé au contact
        ci-dessus.
      </p>

      <H2>7. Données personnelles</H2>
      <p>
        Les données collectées et tes droits sont décrits dans la{" "}
        <Link href="/confidentialite" className="font-bold text-azur underline">
          politique de confidentialité
        </Link>
        .
      </p>

      <H2>8. Droit applicable</H2>
      <p>
        Les présentes conditions sont régies par le droit ivoirien, notamment la loi n°2013-546 du 30 juillet 2013 relative aux transactions
        électroniques. Elles peuvent évoluer ; la date de mise à jour figure en haut de cette page.
      </p>
    </LegalPage>
  );
}
