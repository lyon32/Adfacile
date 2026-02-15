// ============================================
// AdLaunch Pro - Authentication JavaScript
// ============================================

const API_URL = '/api';

// Redirect if already logged in
(function checkExistingSession() {
    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    const userJson = localStorage.getItem('adlaunch_user') || sessionStorage.getItem('adlaunch_user');
    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            if (user.role === 'admin') {
                window.location.replace('admin.html');
            } else {
                window.location.replace('dashboard.html');
            }
        } catch (e) {
            localStorage.clear();
            sessionStorage.clear();
        }
    }
})();

// Reset forms and buttons when page is shown (handles Back button cache)
window.addEventListener('pageshow', (event) => {
    const loginBtn = loginForm ? loginForm.querySelector('.submit-btn') : null;
    const registerBtn = registerForm ? registerForm.querySelector('.submit-btn') : null;
    
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Se connecter';
    }
    if (registerBtn) {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Créer mon compte';
    }
    
    // Reset forms if needed
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
});

// Tab switching
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');

authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        
        // Update active tab
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active form
        authForms.forEach(form => {
            form.classList.remove('active');
            if (form.id === `${targetTab}Form`) {
                form.classList.add('active');
            }
        });
    });
});

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Password strength checker
function checkPasswordStrength(password) {
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;
    
    if (strength <= 2) return 'weak';
    if (strength <= 4) return 'medium';
    return 'strong';
}

// Password strength indicator
const registerPassword = document.getElementById('registerPassword');
const passwordStrength = document.getElementById('passwordStrength');
if (registerPassword) {
    const passwordStrengthBar = passwordStrength.querySelector('.password-strength-bar');
    const passwordStrengthText = document.getElementById('passwordStrengthText');

    registerPassword.addEventListener('input', () => {
        const password = registerPassword.value;
        
        if (password.length > 0) {
            passwordStrength.classList.add('show');
            const strength = checkPasswordStrength(password);
            
            // Remove all strength classes
            passwordStrengthBar.classList.remove('weak', 'medium', 'strong');
            
            // Add current strength class
            passwordStrengthBar.classList.add(strength);
            
            // Update text
            const strengthTexts = {
                weak: 'Faible - Ajoutez plus de caractères et variez les types',
                medium: 'Moyen - Ajoutez des caractères spéciaux pour renforcer',
                strong: 'Fort - Excellent mot de passe !'
            };
            passwordStrengthText.textContent = strengthTexts[strength];
            passwordStrengthText.style.color = strength === 'strong' ? '#10b981' : 
                                               strength === 'medium' ? '#f59e0b' : '#ef4444';
        } else {
            passwordStrength.classList.remove('show');
            passwordStrengthText.textContent = '';
        }
    });
}

// Login Form Handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        // Reset errors
        document.getElementById('loginEmailError').classList.remove('show');
        document.getElementById('loginPasswordError').classList.remove('show');
        document.getElementById('loginEmail').classList.remove('error');
        document.getElementById('loginPassword').classList.remove('error');
        
        let hasError = false;
        
        // Validate email
        if (!isValidEmail(email)) {
            document.getElementById('loginEmailError').classList.add('show');
            document.getElementById('loginEmail').classList.add('error');
            hasError = true;
        }
        
        // Validate password
        if (password.length < 6) {
            document.getElementById('loginPasswordError').classList.add('show');
            document.getElementById('loginPassword').classList.add('error');
            hasError = true;
        }
        
        if (hasError) return;
        
        const submitBtn = loginForm.querySelector('.submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connexion en cours...';
        
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur de connexion');
            }

            // Store token and user data
            const storage = rememberMe ? localStorage : sessionStorage;
            storage.setItem('adlaunch_token', data.token);
            storage.setItem('adlaunch_user', JSON.stringify(data.user));
            
            // Redirect based on role
            if (data.user && data.user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        } catch (error) {
            showToast(error.message, 'error');
            
            // Highlight field if it's a known error
            if (error.message.includes('email')) {
                document.getElementById('loginEmail').classList.add('error');
            } else if (error.message.includes('passe')) {
                document.getElementById('loginPassword').classList.add('error');
            }
            
            submitBtn.disabled = false;
            submitBtn.textContent = 'Se connecter';
        }
    });
}

// Register Form Handler
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const phone = document.getElementById('registerPhone').value;
        const password = document.getElementById('registerPassword').value;
        const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
        const acceptTerms = document.getElementById('acceptTerms').checked;
        
        // Reset errors
        const errorElements = ['registerNameError', 'registerEmailError', 'registerPhoneError', 'registerPasswordError', 'registerPasswordConfirmError'];
        const inputElements = ['registerName', 'registerEmail', 'registerPhone', 'registerPassword', 'registerPasswordConfirm'];
        
        errorElements.forEach(id => document.getElementById(id).classList.remove('show'));
        inputElements.forEach(id => document.getElementById(id).classList.remove('error'));
        
        let hasError = false;
        
        // Validate name
        if (name.trim().length < 2) {
            document.getElementById('registerNameError').classList.add('show');
            document.getElementById('registerName').classList.add('error');
            hasError = true;
        }
        
        // Validate email
        if (!isValidEmail(email)) {
            document.getElementById('registerEmailError').classList.add('show');
            document.getElementById('registerEmail').classList.add('error');
            hasError = true;
        }

        // Validate phone
        if (phone.trim().length < 8) {
            document.getElementById('registerPhoneError').classList.add('show');
            document.getElementById('registerPhone').classList.add('error');
            hasError = true;
        }
        
        // Validate password strength
        const strength = checkPasswordStrength(password);
        if (strength === 'weak') {
            document.getElementById('registerPasswordError').classList.add('show');
            document.getElementById('registerPassword').classList.add('error');
            hasError = true;
        }
        
        // Validate password confirmation
        if (password !== passwordConfirm) {
            document.getElementById('registerPasswordConfirmError').classList.add('show');
            document.getElementById('registerPasswordConfirm').classList.add('error');
            hasError = true;
        }
        
        // Validate terms acceptance
        if (!acceptTerms) {
            showToast('Vous devez accepter les conditions d\'utilisation', 'warning');
            hasError = true;
        }
        
        if (hasError) return;
        
        const submitBtn = registerForm.querySelector('.submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Création du compte...';
        
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur d\'inscription');
            }

            localStorage.setItem('adlaunch_token', data.token);
            localStorage.setItem('adlaunch_user', JSON.stringify(data.user));
            
            // Redirect based on role
            if (data.user && data.user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        } catch (error) {
            showToast(error.message, 'error');
            
            // Highlight specific duplicate fields
            if (error.message.includes('email')) {
                document.getElementById('registerEmail').classList.add('error');
            } else if (error.message.includes('téléphone')) {
                document.getElementById('registerPhone').classList.add('error');
            } else if (error.message.includes('nom')) {
                document.getElementById('registerName').classList.add('error');
            }

            submitBtn.disabled = false;
            submitBtn.textContent = 'Créer mon compte';
        }
    });
}


// Real-time validation
const loginEmail = document.getElementById('loginEmail');
if (loginEmail) {
    loginEmail.addEventListener('blur', function() {
        if (this.value && !isValidEmail(this.value)) {
            this.classList.add('error');
            document.getElementById('loginEmailError').classList.add('show');
        } else {
            this.classList.remove('error');
            document.getElementById('loginEmailError').classList.remove('show');
        }
    });
}

const registerEmail = document.getElementById('registerEmail');
if (registerEmail) {
    registerEmail.addEventListener('blur', function() {
        if (this.value && !isValidEmail(this.value)) {
            this.classList.add('error');
            document.getElementById('registerEmailError').classList.add('show');
        } else {
            this.classList.remove('error');
            document.getElementById('registerEmailError').classList.remove('show');
        }
    });
}

const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
if (registerPasswordConfirm) {
    registerPasswordConfirm.addEventListener('input', function() {
        const password = document.getElementById('registerPassword').value;
        if (this.value && this.value !== password) {
            this.classList.add('error');
            document.getElementById('registerPasswordConfirmError').classList.add('show');
        } else {
            this.classList.remove('error');
            document.getElementById('registerPasswordConfirmError').classList.remove('show');
        }
    });
}
