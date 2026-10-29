import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage } from "@/components/LegalPage";
import { CGV_CASE } from "@/lib/format";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Conditions générales d'utilisation — ${LEGAL.service}`,
  description: `Règles d'utilisation du service ${LEGAL.service} de livraison d'eau dans les cités.`,
  alternates: { canonical: "/cgu" },
};

export default function CguPage() {
  return (
    <LegalPage title="Conditions générales d'utilisation">
      <p>
        Les présentes conditions encadrent l&apos;utilisation du service {LEGAL.service}, qui permet aux habitants de cités fermées de commander une
        livraison d&apos;eau auprès d&apos;un livreur de leur cité. En créant un foyer, tu les acceptes.
      </p>

      <H2>1. Éditeur du service</H2>
      <p>
        {LEGAL.editeur} — {LEGAL.rccm} — {LEGAL.adresse}. Contact : {LEGAL.email}.
      </p>

      <H2>2. Maisons, foyers et code maison</H2>
      <p>
        Chaque maison porte un autocollant avec un code (ex. PROMO 012) et un QR code. Le premier habitant qui scanne crée le <strong>foyer</strong>{" "}
        (nom de famille, numéro principal, code maison à 4 chiffres). Les autres membres de la famille utilisent le même code maison. Toute commande
        passée avec ce code est réputée faite par le foyer : garde-le confidentiel. Une commande est <strong>toujours livrée à la maison</strong> du
        foyer, quel que soit l&apos;endroit d&apos;où elle est passée.
      </p>

      <H2>3. Crédits de livraison — non remboursables</H2>
      <p>
        L&apos;utilisation du service fonctionne avec des points (1 FCFA = 1 point), débités à chaque commande. Une recharge est un{" "}
        <strong>achat définitif</strong> : les points ne sont ni remboursables, ni échangeables contre de l&apos;argent, ni transférables à un autre
        foyer. Avant toute commande payante (à la création du foyer, ou à la fin de l&apos;essai gratuit pour un foyer créé pendant l&apos;essai), la case suivante doit être cochée : « {CGV_CASE} »
      </p>
      <p>
        <strong>Essai gratuit :</strong> jusqu&apos;à la date annoncée dans l&apos;application, aucun point n&apos;est débité (ni au foyer, ni au
        livreur). Cette date peut être prolongée ou avancée par l&apos;éditeur ; elle est toujours affichée dans l&apos;application.
      </p>
      <p>
        Si une commande est annulée avant le départ du livreur, ses points sont recrédités sur le portefeuille du foyer (crédit, pas d&apos;argent).
        Le prix de l&apos;eau est fixé par chaque livreur, affiché avant la commande, et réglé directement au livreur à la livraison.
      </p>

      <H2>4. Départ de la maison</H2>
      <p>
        Lorsque le foyer quitte la maison, son compte est clôturé : les téléphones sont déconnectés, le code maison est effacé, et{" "}
        <strong>les points restants sont perdus définitivement</strong>, sans remboursement ni transfert. Pense à utiliser ton solde avant de
        déménager. L&apos;autocollant reste sur la maison pour les occupants suivants.
      </p>

      <H2>5. Avis</H2>
      <p>
        Après une livraison, le foyer peut noter le livreur (1 à 5 étoiles, commentaire facultatif), une seule fois par livraison. Les avis doivent
        rester respectueux ; l&apos;éditeur peut écarter un avis injurieux.
      </p>

      <H2>6. Abus</H2>
      <p>
        L&apos;éditeur peut suspendre une maison en cas d&apos;abus (fausses commandes, usurpation d&apos;une maison, comportement envers un livreur).
        Le fait de s&apos;inscrire dans une maison qu&apos;on n&apos;habite pas entraîne la clôture du foyer.
      </p>

      <H2>7. Responsabilités</H2>
      <p>
        L&apos;éditeur met tout en œuvre pour que le service soit disponible, sans pouvoir le garantir en permanence (maintenance, réseau). Le livreur
        est responsable de la livraison et de l&apos;eau qu&apos;il fournit. Tout litige peut être signalé au contact ci-dessus.
      </p>

      <H2>8. Données personnelles</H2>
      <p>
        Les données collectées et tes droits sont décrits dans la{" "}
        <Link href="/confidentialite" className="font-bold text-azur underline">
          politique de confidentialité
        </Link>
        .
      </p>

      <H2>9. Droit applicable</H2>
      <p>
        Les présentes conditions sont régies par le droit ivoirien, notamment la loi n°2013-546 du 30 juillet 2013 relative aux transactions
        électroniques. Elles peuvent évoluer ; la date de mise à jour figure en haut de cette page.
      </p>
    </LegalPage>
  );
}
