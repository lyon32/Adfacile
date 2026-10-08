/**
 * Conditions d’utilisation — AdsFacile
 *
 * Page publique exigée par Meta (champ « URL des conditions de service » de
 * l’application Facebook). Le champ pointait vers facebook.com faute de page :
 * une fiche d’app incomplète peut faire suspendre la connexion Facebook.
 * Même gabarit que PrivacyPolicyPage.
 */

const MISE_A_JOUR = '7 octobre 2026';
const CONTACT = 'lionelyvan24@gmail.com';

const Section = ({ titre, children }) => (
  <section className="mb-6">
    <h2 className="text-2xl font-semibold text-gray-900 mb-3">{titre}</h2>
    {children}
  </section>
);

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Conditions d’utilisation
        </h1>

        <p className="text-sm text-gray-600 mb-6">
          Dernière mise à jour : {MISE_A_JOUR}
        </p>

        <Section titre="Objet">
          <p className="text-gray-700">
            AdsFacile est un service en ligne qui permet de créer, publier et suivre des
            campagnes publicitaires Facebook et Instagram depuis votre compte Meta. En créant
            un compte ou en utilisant le service, vous acceptez les présentes conditions.
          </p>
        </Section>

        <Section titre="Compte et connexion à Facebook">
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>Vous devez fournir des informations exactes et garder vos identifiants confidentiels.</li>
            <li>
              Pour publier des publicités, vous connectez votre compte Facebook et choisissez la Page
              et le compte publicitaire utilisés. Vous déclarez avoir le droit de les gérer.
            </li>
            <li>
              Vous pouvez retirer l’accès d’AdsFacile à tout moment depuis les paramètres de votre
              compte AdsFacile ou depuis les paramètres de votre compte Facebook.
            </li>
          </ul>
        </Section>

        <Section titre="Vos publicités">
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>
              Vous restez seul responsable du contenu de vos publicités (textes, images, liens,
              ciblage) et de leur conformité aux lois applicables et aux Politiques publicitaires de Meta.
            </li>
            <li>
              Les campagnes sont diffusées par Meta. Meta peut refuser, limiter ou suspendre une
              publicité selon ses propres règles ; AdsFacile n’a aucune maîtrise sur ces décisions.
            </li>
            <li>
              Les montants dépensés en publicité sont facturés par Meta sur le moyen de paiement de
              votre compte publicitaire. Ils sont distincts de l’abonnement AdsFacile.
            </li>
          </ul>
        </Section>

        <Section titre="Abonnement">
          <p className="text-gray-700">
            AdsFacile propose une offre gratuite et des offres payantes. Le prix et le contenu de
            chaque offre sont indiqués sur la page Tarifs au moment de la souscription.
          </p>
        </Section>

        <Section titre="Usages interdits">
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>Diffuser des publicités trompeuses, illégales ou contraires aux règles de Meta.</li>
            <li>Utiliser le service avec un compte Facebook ou publicitaire qui ne vous appartient pas sans autorisation.</li>
            <li>Tenter de perturber le service ou d’accéder aux données d’autres utilisateurs.</li>
          </ul>
          <p className="text-gray-700 mt-3">
            Un manquement peut entraîner la suspension ou la fermeture du compte AdsFacile.
          </p>
        </Section>

        <Section titre="Responsabilité">
          <p className="text-gray-700">
            AdsFacile s’efforce d’assurer un service disponible et fiable, sans garantir de
            résultat publicitaire (portée, clics, ventes). Le service dépend des API de Meta :
            une indisponibilité ou une modification de leur part peut l’affecter.
          </p>
        </Section>

        <Section titre="Données personnelles">
          <p className="text-gray-700">
            Le traitement de vos données est décrit dans la{' '}
            <a href="/privacy-policy" className="text-blue-600 hover:underline">politique de confidentialité</a>.
            Pour demander la suppression de vos données, suivez les{' '}
            <a href="/data-deletion" className="text-blue-600 hover:underline">instructions de suppression</a>.
          </p>
        </Section>

        <Section titre="Modification des conditions">
          <p className="text-gray-700">
            Ces conditions peuvent évoluer. La date de mise à jour figure en haut de cette page ;
            continuer à utiliser le service après une modification vaut acceptation.
          </p>
        </Section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">Contact</h2>
          <p className="text-gray-700">
            Email :{' '}
            <a href={`mailto:${CONTACT}`} className="text-blue-600 hover:underline">{CONTACT}</a>
          </p>
        </section>
      </div>
    </div>
  );
}
