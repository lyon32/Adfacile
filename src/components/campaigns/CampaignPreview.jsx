/**
 * CampaignPreview — Mockup Facebook Feed
 * Preview en temps réel de la publicité telle qu'elle apparaîtra sur Facebook
 */

const CTA_LABELS = {
    'LEARN_MORE': 'En savoir plus',
    'SHOP_NOW': 'Acheter maintenant',
    'SIGN_UP': "S'inscrire",
    'CONTACT_US': 'Nous contacter',
    'DOWNLOAD': 'Télécharger',
    'BOOK_NOW': 'Réserver',
    'SEND_MESSAGE': 'Envoyer un message'
};

const CampaignPreview = ({ creative, user }) => {
    const pageName = user?.fb_page_name || user?.business_name || 'Votre Page';
    const ctaLabel = CTA_LABELS[creative.call_to_action] || 'En savoir plus';

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-md mx-auto">
            {/* Facebook-style container */}
            <div className="bg-gray-100 px-3 py-2 text-center">
                <span className="text-xs text-gray-500 font-medium">Aperçu Facebook Feed</span>
            </div>

            <div className="p-4">
                {/* Post Header */}
                <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {pageName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{pageName}</p>
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">Sponsorisé</span>
                            <span className="text-xs text-gray-400">·</span>
                            <svg className="w-3 h-3 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 16A8 8 0 108 0a8 8 0 000 16zM4.5 7.5a.5.5 0 000 1h4.793l-2.147 2.146a.5.5 0 00.708.708l3-3a.5.5 0 000-.708l-3-3a.5.5 0 10-.708.708L9.293 7.5H4.5z" />
                            </svg>
                        </div>
                    </div>
                    {/* 3 dots menu */}
                    <button className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>
                </div>

                {/* Post Text */}
                <p className="text-sm text-gray-900 leading-relaxed mb-3 whitespace-pre-wrap">
                    {creative.message || (
                        <span className="text-gray-300 italic">Votre texte apparaîtra ici...</span>
                    )}
                </p>
            </div>

            {/* Media */}
            {creative.media_type === 'carousel' && creative.media_items?.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto px-4 pb-3 snap-x snap-mandatory" aria-label="Cartes du carrousel">
                    {creative.media_items.map((item, i) => (
                        <div key={`${item.url}-${i}`} className="flex-shrink-0 w-56 snap-start rounded-lg border border-gray-200 overflow-hidden">
                            <div className="aspect-square bg-gray-100">
                                {item.type === 'video'
                                    ? <video src={item.url} className="w-full h-full object-cover" muted />
                                    : <img src={item.url} alt={`Carte ${i + 1}`} className="w-full h-full object-cover" />}
                            </div>
                            <div className="bg-gray-50 px-3 py-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">{item.name || `Carte ${i + 1}`}</p>
                                {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
                                <span className="mt-2 block w-full py-1.5 bg-gray-200 rounded text-xs font-semibold text-gray-800 text-center">
                                    {ctaLabel}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : creative.media_type === 'flexible' && creative.media_items?.length > 0 ? (
                <div className="relative bg-gray-100 aspect-square">
                    {creative.media_items[0].type === 'video'
                        ? <video src={creative.media_items[0].url} className="w-full h-full object-cover" muted />
                        : <img src={creative.media_items[0].url} alt="Visuel 1" className="w-full h-full object-cover" />}
                    <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                        1 / {creative.media_items.length} · Meta choisit l’ordre
                    </span>
                </div>
            ) : (
            <div className="bg-gray-100 aspect-square flex items-center justify-center">
                {creative.media_url ? (
                    creative.media_type === 'video' ? (
                        <video src={creative.media_url} className="w-full h-full object-cover" muted />
                    ) : (
                        <img src={creative.media_url} alt="Ad preview" className="w-full h-full object-cover" />
                    )
                ) : (
                    <div className="text-center p-8">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-gray-400">Votre visuel apparaîtra ici</p>
                    </div>
                )}
            </div>
            )}

            {/* Link Card — le carrousel porte titres et boutons sur chaque carte */}
            {creative.media_type !== 'carousel' && (creative.headline || creative.link) && (
                <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                    {creative.display_link && (
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                            {creative.display_link}
                        </p>
                    )}
                    <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {creative.headline || 'Titre de votre publicité'}
                    </p>
                    {creative.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {creative.description}
                        </p>
                    )}

                    {/* CTA Button */}
                    <button className="mt-3 w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded text-sm font-semibold text-gray-800 text-center transition-colors">
                        {ctaLabel}
                    </button>
                </div>
            )}

            {/* Social Footer */}
            <div className="border-t border-gray-200 px-4 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <div className="flex -space-x-1">
                            <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14 9V5.5C14 4.12 15.12 3 16.5 3h.5v6h-3zM4 9h3v12H4V9zm9 12H8V9h5v12zM18 9v12h-3V9h3z" />
                                </svg>
                            </span>
                            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                            </span>
                        </div>
                        <span className="text-xs text-gray-500 ml-1">24</span>
                    </div>
                    <span className="text-xs text-gray-500">3 commentaires · 1 partage</span>
                </div>

                {/* Action Buttons */}
                <div className="flex border-t border-gray-200 mt-2 pt-2">
                    {['👍 J\'aime', '💬 Commenter', '↗️ Partager'].map(action => (
                        <button
                            key={action}
                            disabled
                            className="flex-1 py-1.5 text-xs text-gray-500 font-medium text-center rounded hover:bg-gray-50 opacity-60 cursor-not-allowed"
                        >
                            {action}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CampaignPreview;
