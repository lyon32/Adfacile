// ============================================
// AdLaunch Pro - Dashboard JavaScript
// ============================================

const API_URL = '/api';
let selectedFile = null;

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    if (!token) {
        // Clear everything to be safe if no token
        localStorage.removeItem('adlaunch_user');
        window.location.replace('auth.html');
        return;
    }

    // Immediate UI update from cache to prevent flickering
    const cachedUser = localStorage.getItem('adlaunch_user') || sessionStorage.getItem('adlaunch_user');
    if (cachedUser) {
        try {
            updateUI(JSON.parse(cachedUser));
        } catch (e) {
            console.error('Error parsing cached user', e);
        }
    }

    try {
        const response = await fetch(`${API_URL}/user/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Session expired');
        }

        const user = await response.json();
        // Update storage to keep data in sync
        const storage = localStorage.getItem('adlaunch_token') ? localStorage : sessionStorage;
        storage.setItem('adlaunch_user', JSON.stringify(user));
        
        updateUI(user);
        
        // Restore Facebook Session from User Profile if available
        if (user.fb_access_token) {
            sessionStorage.setItem('fb_access_token', user.fb_access_token);
            sessionStorage.setItem('fb_user_id', user.fb_user_id);
            // Manually trigger connected state in UI
            if (window.FacebookSDK && window.FacebookSDK.handleLoginStatus) {
                window.FacebookSDK.handleLoginStatus({
                    status: 'connected',
                    authResponse: {
                        accessToken: user.fb_access_token,
                        userID: user.fb_user_id
                    }
                });
            }
        }
    } catch (error) {
        console.error('Auth error:', error);
        logout();
    }
}

// Global scope for selected locations
window.selectedLocations = [];

// Location Search Setup
function setupLocationSearch() {
    console.log('setupLocationSearch function called'); 
    const searchInput = document.getElementById('locationSearch');
    const resultsContainer = document.getElementById('locationResults');
    
    if (!searchInput) {
        console.error('ERROR: locationSearch input NOT found in DOM!');
        return;
    }
    console.log('locationSearch input found successfully'); 

    let debounceTimer;

    // Search Input Hander
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        console.log('Location search input:', query); 
        clearTimeout(debounceTimer);
        
        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                resultsContainer.innerHTML = '<div style="padding:10px;">Recherche en cours...</div>';
                resultsContainer.style.display = 'block';
                
                const locations = await FacebookSDK.searchLocations(query);
                console.log('Locations found:', locations);
                displayLocationResults(locations);
            } catch (error) {
                console.error('Location search failed:', error);
                resultsContainer.innerHTML = `<div style="padding:10px; color:red;">Erreur: ${error.message}</div>`;
            }
        }, 500); 
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.style.display = 'none';
        }
    });
}

function displayLocationResults(locations) {
    const resultsContainer = document.getElementById('locationResults');
    resultsContainer.innerHTML = '';

    if (!locations || locations.length === 0) {
        resultsContainer.innerHTML = '<div style="padding:12px; color: #64748b; text-align: center;">Aucun résultat trouvé</div>';
        return;
    }

    locations.forEach(loc => {
        const div = document.createElement('div');
        div.className = 'location-result-item';
        
        const typeLabels = { country: 'Pays', city: 'Ville', region: 'Région', zip: 'Code Postal' };
        const typeLabel = typeLabels[loc.type] || loc.type;
        const region = loc.region ? `, ${loc.region}` : '';
        const country = loc.country_name ? `, ${loc.country_name}` : '';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; color: #1e293b;">${loc.name}</div>
                    <div style="font-size: 0.85rem; color: #64748b;">${loc.region || ''} ${loc.country_name || ''}</div>
                </div>
                <span style="font-size: 0.75rem; background: #f1f5f9; padding: 2px 8px; border-radius: 12px; color: #475569;">${typeLabel}</span>
            </div>
        `;
        
        div.onclick = () => {
            addLocation(loc);
            document.getElementById('locationSearch').value = '';
            resultsContainer.style.display = 'none';
        };

        resultsContainer.appendChild(div);
    });
}

function addLocation(location) {
    if (window.selectedLocations.some(l => l.key === location.key)) return;
    window.selectedLocations.push(location);
    updateSelectedLocationsUI();
}

function removeLocation(key) {
    window.selectedLocations = window.selectedLocations.filter(l => l.key !== key);
    updateSelectedLocationsUI();
}

function updateSelectedLocationsUI() {
    const container = document.getElementById('selectedLocationsList');
    container.innerHTML = '';
    
    if (window.selectedLocations.length === 0) return;

    const header = document.createElement('div');
    header.style.width = '100%';
    header.style.marginBottom = '8px';
    header.style.fontSize = '0.9rem';
    header.style.fontWeight = '600';
    header.style.color = '#334155';
    header.textContent = 'Lieux sélectionnés :';
    container.appendChild(header);
    
    window.selectedLocations.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'selected-location-item';
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="background: #eef2ff; color: #4f46e5; padding: 6px; border-radius: 50%;">📍</span>
                <div>
                    <div style="font-weight: 600; font-size: 0.95rem;">${loc.name}</div>
                    <div style="font-size: 0.85rem; color: #64748b;">${loc.country_name || loc.type}</div>
                </div>
            </div>
            <button onclick="removeLocation('${loc.key}')" class="remove-location-btn">✕</button>
        `;
        container.appendChild(item);
    });
    // Update hidden input if needed
    const hiddenInput = document.getElementById('selectedLocationsData');
    if (hiddenInput) hiddenInput.value = JSON.stringify(window.selectedLocations);
}

function updateUI(user) {
    // Top Bar & Sidebar
    const names = document.querySelectorAll('#userName, #profileNameDisplay');
    names.forEach(n => n.textContent = user.name);
    
    const emails = document.querySelectorAll('#userEmail, #userEmailDisplay, #profileEmailDisplay');
    emails.forEach(e => {
        if (e.tagName === 'INPUT') e.value = user.email;
        else e.textContent = user.email;
    });

    // Avatars logic
    const avatars = document.querySelectorAll('.user-avatar');
    avatars.forEach(av => {
        const img = av.querySelector('img');
        const span = av.querySelector('span');
        
        if (user.avatar) {
            // Ensure absolute URL if it's a relative path from the server
            const avatarSrc = user.avatar.startsWith('http') ? user.avatar : `http://localhost:3000${user.avatar}`;
            if (img) img.src = avatarSrc;
            av.classList.add('has-image');
        } else {
            if (span) span.textContent = user.name.charAt(0).toUpperCase();
            av.classList.remove('has-image');
        }
    });

    // Nothing else needed for settings specifically as standardized avatars handle it

    // Fill settings form
    const settingsName = document.getElementById('settingsName');
    const settingsPhone = document.getElementById('settingsPhone');
    if (settingsName) settingsName.value = user.name;
    if (settingsPhone) settingsPhone.value = user.phone || '';
}

// Update profile function
async function updateProfile(e) {
    e.preventDefault();
    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    const name = document.getElementById('settingsName').value;
    const phone = document.getElementById('settingsPhone').value;
    const password = document.getElementById('settingsPassword').value;
    
    // Get avatar from settings preview
    const settingsAvatar = document.getElementById('settingsAvatar');
    let avatarUrl = settingsAvatar.classList.contains('has-image') ? settingsAvatar.querySelector('img').src : null;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mise à jour...';

    try {
        // Step 1: Upload file if selected
        if (selectedFile) {
            const formData = new FormData();
            formData.append('avatar', selectedFile);

            const uploadResponse = await fetch(`${API_URL}/user/avatar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!uploadResponse.ok) {
                const text = await uploadResponse.text();
                let errMsg = 'Erreur lors de l\'upload';
                try {
                    const errorData = JSON.parse(text);
                    errMsg = errorData.error || errMsg;
                } catch (e) {
                    errMsg = `Erreur serveur (${uploadResponse.status}). Vérifiez la console.`;
                }
                throw new Error(errMsg);
            }

            const uploadData = await uploadResponse.json();
            avatarUrl = uploadData.avatarUrl;
        }

        const body = { name, phone };
        if (password) body.password = password;
        if (avatarUrl) body.avatar = avatarUrl;

        const response = await fetch(`${API_URL}/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Erreur serveur (${response.status}) lors de la mise à jour.`);
        }
        
        if (!response.ok) throw new Error(data.error || 'Erreur inconnue');

        showToast('Profil mis à jour avec succès !', 'success');
        // Refresh profile data
        checkAuth();
    } catch (error) {
        showToast(error.message, 'error');
        
        // Highlight duplicates
        if (error.message.includes('nom')) {
            document.getElementById('settingsName').classList.add('error');
        } else if (error.message.includes('téléphone')) {
            document.getElementById('settingsPhone').classList.add('error');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enregistrer les modifications';
    }
}

// Logout function
function logout() {
    localStorage.removeItem('adlaunch_token');
    localStorage.removeItem('adlaunch_user');
    sessionStorage.removeItem('adlaunch_token');
    sessionStorage.removeItem('adlaunch_user');
    sessionStorage.removeItem('fb_access_token');
    sessionStorage.removeItem('fb_access_token');
    sessionStorage.removeItem('fb_user_id');
    window.location.replace('auth.html');
}

// Heartbeat system
function startHeartbeat() {
    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    if (!token) return;

    const pulse = () => {
        fetch(`${API_URL}/user/heartbeat`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    };

    pulse(); // Initial
    setInterval(pulse, 60000); // Every minute
}

// View switching
function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });

    // Show target view
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
        targetView.classList.add('active');
        sessionStorage.setItem('adlaunch_current_view', viewName);
    }

    // Update sidebar active state
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Update dashboard header title if needed
    if (viewName === 'dashboard') {
        document.querySelector('.dashboard-header h1').textContent = 'Tableau de Bord';
    }
}

// Handle Profile Picture Selection
function handleProfilePicSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast('L\'image est trop grande (max 5MB)', 'warning');
        return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = function(event) {
        const base64 = event.target.result;
        
        // Update ONLY settings preview immediately
        const settingsAvatar = document.getElementById('settingsAvatar');
        const img = settingsAvatar.querySelector('img');
        if (img) img.src = base64;
        settingsAvatar.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    // Initialize Location Search
    if (typeof setupLocationSearch === 'function') {
        setupLocationSearch();
    } else {
        console.error('setupLocationSearch function not defined!');
    }

    // Restore previous view if exists
    const savedView = sessionStorage.getItem('adlaunch_current_view') || 'dashboard';
    switchView(savedView);

    // Navigation handling
    document.querySelectorAll('.sidebar-nav a[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            switchView(view);
        });
    });

    // Profile pic input listener
    const profilePicInput = document.getElementById('profilePicInput');
    if (profilePicInput) {
        profilePicInput.addEventListener('change', handleProfilePicSelect);
    }

    startHeartbeat();
});
