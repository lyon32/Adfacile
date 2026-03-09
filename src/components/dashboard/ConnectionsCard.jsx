import { CheckCircle2, Facebook, Instagram, LogOut } from 'lucide-react';

export function ConnectionsCard({ connections, onDisconnect }) {
    if (!connections) return null;

    // Only show this card if user has a page
    if (!connections.hasPage) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="text-[13px] font-bold text-gray-500 uppercase tracking-widest">État des connexions</h3>

                {onDisconnect && (
                    <button
                        onClick={onDisconnect}
                        className="flex items-center gap-1.5 text-[12px] font-bold text-red-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-100"
                    >
                        <LogOut size={14} />
                        Déconnecter Facebook
                    </button>
                )}
            </div>

            <div className="p-3">
                <ConnectionRow
                    icon={<Facebook size={20} className="text-blue-600" />}
                    name="Page Facebook"
                    connected={true}
                    info={connections.facebook.pageName}
                    bgColor="bg-blue-50"
                    borderColor="border-blue-100"
                />

                <ConnectionRow
                    icon={<Instagram size={20} className="text-pink-600" />}
                    name="Instagram"
                    connected={connections.instagram?.connected}
                    info={connections.instagram?.username ? `@${connections.instagram.username}` : null}
                    bgColor="bg-pink-50"
                    borderColor="border-pink-100"
                />
            </div>
        </div>
    );
}

function ConnectionRow({ icon, name, connected, info, bgColor, borderColor }) {
    return (
        <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50/80 transition-all duration-200">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bgColor} border ${borderColor} shadow-sm`}>
                {icon}
            </div>

            <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{name}</p>
                {connected ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="text-emerald-500" size={14} />
                        <p className="text-xs font-semibold text-emerald-600">{info || 'Connecté'}</p>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        <p className="text-xs font-semibold text-gray-400">Non connecté</p>
                    </div>
                )}
            </div>
        </div>
    );
}
