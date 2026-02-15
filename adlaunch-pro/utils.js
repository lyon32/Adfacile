/**
 * Professional Notification System
 * Replaces standard browser alerts with premium toasts
 */

const showToast = (message, type = 'info', duration = 5000) => {
    // Create container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Toast configuration
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">✕</button>
    `;

    // Add to container
    container.appendChild(toast);

    // Auto remove after duration
    const removeToast = () => {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
            if (container.childNodes.length === 0) {
                container.remove();
            }
        }, 300);
    };

    const autoRemoveTimeout = setTimeout(removeToast, duration);

    // Close button click
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(autoRemoveTimeout);
        removeToast();
    });
};

// Also expose internationally for easier access
window.showToast = showToast;
window.alert = (msg) => showToast(msg, 'info'); // Override window.alert for secondary alerts
