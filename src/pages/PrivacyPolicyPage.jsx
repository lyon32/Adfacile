export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Politique de Confidentialité
        </h1>

        <p className="text-sm text-gray-600 mb-6">
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
        </p>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            Données collectées
          </h2>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>Adresse email</li>
            <li>Informations de profil Facebook (nom, ID utilisateur)</li>
            <li>Informations sur vos pages Facebook</li>
            <li>Données de campagnes publicitaires</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            Utilisation des données
          </h2>
          <p className="text-gray-700">
            Vos données sont utilisées uniquement pour gérer votre compte AdsFacile
            et créer vos campagnes publicitaires Facebook.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            Sécurité
          </h2>
          <p className="text-gray-700">
            Vos tokens d'accès Facebook sont chiffrés en base de données.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            Contact
          </h2>
          <p className="text-gray-700">
            Email : <a href="mailto:lionelyvan24@gmail.com
" className="text-blue-600 hover:underline">
              lionelyvan24@gmail.com

            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
