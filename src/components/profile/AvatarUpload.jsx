/**
 * Composant AvatarUpload
 * Cercle cliquable avec preview, upload vers API
 */

import { useState, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';

const AvatarUpload = ({ profilePictureUrl, firstName, lastName, onUpload, saving }) => {
    const [preview, setPreview] = useState(null);
    const fileInputRef = useRef(null);

    const initials = `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase() || '?';

    const handleClick = () => {
        if (!saving) fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation taille
        if (file.size > 2 * 1024 * 1024) {
            alert('L\'image ne doit pas dépasser 2 MB');
            return;
        }

        // Preview immédiate
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);

        try {
            await onUpload(file);
        } catch {
            setPreview(null);
        }

        // Nettoyer l'input
        e.target.value = '';
    };

    const displayUrl = preview || profilePictureUrl;

    return (
        <div className="avatar-upload" onClick={handleClick}>
            <div className="avatar-circle">
                {displayUrl ? (
                    <img src={displayUrl} alt="Avatar" className="avatar-image" />
                ) : (
                    <span className="avatar-initials">{initials}</span>
                )}
                <div className="avatar-overlay">
                    {saving ? (
                        <Loader2 size={24} className="avatar-spinner" />
                    ) : (
                        <Camera size={24} />
                    )}
                </div>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
            />
        </div>
    );
};

export default AvatarUpload;
