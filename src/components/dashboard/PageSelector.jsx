import { useState } from 'react';
import { ChevronDown, Check, Loader2, Facebook, Instagram, MessageSquare } from 'lucide-react';
import api from '../../services/api';

export function PageSelector({ pages, activePage, onPageSwitch }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    if (!pages || pages.length === 0) return null;

    async function handleSwitchPage(pageId) {
        if (loading) return;
        try {
            setLoading(true);
            await api.post('/facebook/switch-page', { page_id: pageId });
            setIsOpen(false);
            if (onPageSwitch) onPageSwitch(pageId);
        } catch (err) {
            console.error('Switch page error:', err);
        } finally {
            setLoading(false);
        }
    }

    // Single page — compact inline display
    if (pages.length === 1) {
        return (
            <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border border-gray-200 mb-6 shadow-sm relative overflow-hidden">
                {/* Decorative left border accent */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/80" />

                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-sm">
                    <Facebook size={20} className="text-blue-600" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Page active</p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">{activePage?.fb_page_name}</p>
                </div>
            </div>
        );
    }

    // Multiple pages — dropdown selector
    return (
        <div className="relative mb-6">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all disabled:opacity-60 relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
                {/* Decorative left border accent if open */}
                {isOpen && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}

                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-sm">
                    <Facebook size={20} className="text-blue-600" />
                </div>

                <div className="flex-1 min-w-0 text-left">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Page active</p>
                    <p className="text-[15px] font-bold text-gray-900 truncate">
                        {activePage?.fb_page_name || 'Sélectionner une page'}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {activePage?.instagram_connected && (
                        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-pink-50 border border-pink-100">
                            <Instagram size={12} className="text-pink-600" />
                        </div>
                    )}
                    {activePage?.whatsapp_connected && (
                        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100">
                            <MessageSquare size={12} className="text-emerald-600" />
                        </div>
                    )}

                    <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>

                    {loading
                        ? <Loader2 size={16} className="text-blue-500 animate-spin" />
                        : <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    }
                </div>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    className="absolute z-30 inset-x-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
                    style={{ animation: 'float-in 0.15s ease-out', transformOrigin: 'top' }}
                >
                    <div className="max-h-[300px] overflow-y-auto">
                        {pages.map((page) => (
                            <button
                                key={page.fb_page_id}
                                onClick={() => handleSwitchPage(page.fb_page_id)}
                                disabled={loading || page.is_active}
                                className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors border-b border-gray-50 last:border-b-0 ${page.is_active
                                    ? 'bg-blue-50/40 cursor-default'
                                    : 'hover:bg-gray-50 cursor-pointer'
                                    }`}
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${page.is_active ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white border-gray-200 text-blue-600'
                                    }`}>
                                    <Facebook size={18} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className={`text-[14px] font-bold truncate ${page.is_active ? 'text-blue-900' : 'text-gray-900'}`}>{page.fb_page_name}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        {page.instagram_connected ? (
                                            <span className="flex items-center gap-1 text-[11px] text-pink-600 font-medium">
                                                <Instagram size={12} /> @{page.instagram_username}
                                            </span>
                                        ) : null}

                                        {page.whatsapp_connected ? (
                                            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                                <MessageSquare size={12} /> {page.whatsapp_number}
                                            </span>
                                        ) : null}

                                        {!page.instagram_connected && !page.whatsapp_connected && (
                                            <span className="text-[11px] text-gray-400 font-medium">Aucune intégration liée</span>
                                        )}
                                    </div>
                                </div>

                                {page.is_active && (
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                        <Check size={14} className="text-blue-600" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                            {pages.length} page{pages.length > 1 ? 's' : ''} Facebook
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
