export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Suppression de vos données
        </h1>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-3">
            Comment supprimer vos données
          </h2>
          <ol className="list-decimal ml-6 text-blue-800 space-y-2">
            <li>Connectez-vous à votre compte AdsFacile</li>
            <li>Allez dans Paramètres → Mon compte</li>
            <li>Cliquez sur "Supprimer mon compte"</li>
            <li>Confirmez la suppression</li>
          </ol>
        </div>

        <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
          <h2 className="text-xl font-semibold text-green-900 mb-3">
            Ou envoyez un email
          </h2>
          <p className="text-green-800">
            Envoyez un email à{' '}
            <a href="mailto:support@adsfacile.xyz" className="font-semibold underline hover:text-green-900">
              support@adsfacile.xyz
            </a>
            {' '}avec l'objet "Demande de suppression de données".
          </p>
        </div>

        <p className="text-sm text-gray-600">
          Vos données seront supprimées sous 30 jours maximum.
        </p>
      </div>
    </div>
  );
}
