/**
 * AdLaunch Pro - Customer Support Chatbot
 * Handles automated responses and UI interactions
 */

class AdLaunchChatbot {
    constructor() {
        this.isOpen = false;
        this.isTyping = false;
        this.responses = {
            'bonjour': 'Bonjour ! Comment puis-je vous aider aujourd\'hui ? 😊',
            'salut': 'Salut ! En quoi puis-je vous être utile ?',
            'prix': 'AdLaunch Pro est actuellement 100% gratuit ! Vous pouvez profiter de toutes nos fonctionnalités sans aucun frais.',
            'tarif': 'AdLaunch Pro est entièrement gratuit pour tous nos utilisateurs.',
            'aide': 'Je peux vous aider à configurer votre compte, connecter Facebook ou optimiser vos campagnes. Que souhaitez-vous faire ?',
            'facebook': 'Pour connecter Facebook, allez dans votre Dashboard et cliquez sur "Connexion Facebook". C\'est rapide et sécurisé !',
            'compte': 'Vous pouvez gérer votre compte directement depuis les paramètres de votre profil dans le Dashboard.',
            'merci': 'Avec plaisir ! N\'hésitez pas si vous avez d\'autres questions. 🚀',
            'au revoir': 'Au revoir et bon succès avec vos campagnes ! 👋'
        };
        
        this.init();
    }

    init() {
        this.createWidget();
        this.addEventListeners();
    }

    createWidget() {
        const widgetHTML = `
            <div class="chat-toggle" id="chatToggle">
                <span>💬</span>
            </div>
            <div class="chat-window" id="chatWindow">
                <div class="chat-header">
                    <div class="chat-header-info">
                        <h3>Support AdLaunch</h3>
                        <span>En ligne • Répond instantanément</span>
                    </div>
                    <button class="chat-close" id="chatClose">✕</button>
                </div>
                <div class="chat-messages" id="chatMessages">
                    <div class="message message-bot">
                        Bonjour ! Je suis l'assistant AdLaunch. Comment puis-je vous aider ?
                        <div class="quick-replies">
                            <button class="quick-reply-btn" data-msg="Comment ça marche ?">Comment ça marche ?</button>
                            <button class="quick-reply-btn" data-msg="Aide technique">Aide</button>
                        </div>
                    </div>
                </div>
                <div class="chat-input-area">
                    <input type="text" class="chat-input" id="chatInput" placeholder="Écrivez votre message...">
                    <button class="chat-send" id="chatSend">➤</button>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.id = 'adlaunch-chatbot-root';
        container.innerHTML = widgetHTML;
        document.body.appendChild(container);

        this.elements = {
            toggle: document.getElementById('chatToggle'),
            window: document.getElementById('chatWindow'),
            close: document.getElementById('chatClose'),
            messages: document.getElementById('chatMessages'),
            input: document.getElementById('chatInput'),
            send: document.getElementById('chatSend')
        };
    }

    addEventListeners() {
        this.elements.toggle.addEventListener('click', () => this.toggleChat());
        this.elements.close.addEventListener('click', () => this.toggleChat());
        this.elements.send.addEventListener('click', () => this.handleSendMessage());
        this.elements.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });

        // Quick replies
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-reply-btn')) {
                const msg = e.target.getAttribute('data-msg');
                this.addMessage(msg, 'user');
                this.processMessage(msg);
            }
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        this.elements.window.classList.toggle('active', this.isOpen);
        if (this.isOpen) {
            this.elements.input.focus();
        }
    }

    handleSendMessage() {
        const text = this.elements.input.value.trim();
        if (!text || this.isTyping) return;

        this.addMessage(text, 'user');
        this.elements.input.value = '';
        this.processMessage(text);
    }

    addMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${sender}`;
        msgDiv.textContent = text;
        this.elements.messages.appendChild(msgDiv);
        this.scrollToBottom();
    }

    showTyping() {
        this.isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        this.elements.messages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTyping() {
        this.isTyping = false;
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();
    }

    processMessage(text) {
        this.showTyping();
        
        // Simulate thinking time
        setTimeout(() => {
            this.hideTyping();
            const lowerText = text.toLowerCase();
            let response = 'Désolé, je ne comprends pas tout à fait. Souhaitez-vous parler à un agent humain ?';

            for (const [key, value] of Object.entries(this.responses)) {
                if (lowerText.includes(key)) {
                    response = value;
                    break;
                }
            }

            this.addMessage(response, 'bot');
        }, 1500);
    }

    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.adlaunchChatbot = new AdLaunchChatbot();
});
