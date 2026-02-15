const API_URL = 'http://localhost:3000/api';
let allUsers = []; // Cache for filtering

// Authentication & Initialization
async function initAdmin() {
    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    if (!token) {
        window.location.replace('auth.html');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/user/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await response.json();
        
        if (user.role !== 'admin') {
            showToast('Accès réservé aux administrateurs.', 'error');
            window.location.replace('dashboard.html');
            return;
        }

        // Setup Profile UI
        document.getElementById('admin-name-display').textContent = user.name;
        document.getElementById('admin-avatar-display').textContent = user.name.charAt(0).toUpperCase();

        // Initial Loads
        loadUsers();
    } catch (error) {
        console.error('Initialization failed:', error);
        window.location.replace('auth.html');
    }
}

// Navigation Logic
document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.getAttribute('data-view');
        
        // UI Updates
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
        document.getElementById(`${view}-view`).classList.add('active');

        // Header Updates
        const titles = {
            'users': { t: 'Gestion des Utilisateurs', d: 'Aperçu et contrôle des comptes de la plateforme' }
        };
        document.getElementById('view-title').textContent = titles[view].t;
        document.getElementById('view-desc').textContent = titles[view].d;
    });
});

// User Management
async function loadUsers() {
    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        allUsers = await response.json();
        
        // Update Stats
        document.getElementById('count-total-users').textContent = allUsers.length;
        
        const now = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const thisYear = now.getFullYear();

        const newUsersMonth = allUsers.filter(u => new Date(u.created_at) > oneMonthAgo).length;
        const newUsersYear = allUsers.filter(u => new Date(u.created_at).getFullYear() === thisYear).length;
        const onlineUsers = allUsers.filter(u => u.is_online).length;

        document.getElementById('count-new-users').textContent = newUsersMonth;
        document.getElementById('count-year-users').textContent = newUsersYear;
        document.getElementById('count-online-users').textContent = onlineUsers;

        renderUsers(allUsers);
    } catch (error) {
        console.error('Failed to load users:', error);
        showToast('Erreur lors du chargement des utilisateurs: ' + error.message, 'error');
    }
}

function renderUsers(users) {
    const tableBody = document.getElementById('user-rows');
    tableBody.innerHTML = '';

    users.forEach(user => {
        const isOnline = user.is_online;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="user-info">
                    <div class="avatar">${user.name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight: 700; display: flex; align-items: center;">
                            <span class="online-indicator ${isOnline ? 'online' : 'offline'}" title="${isOnline ? 'En ligne' : 'Hors ligne'}"></span>
                            ${user.name}
                        </div>
                        <div style="font-size: 12px; color: var(--admin-text-muted);">${user.email}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="status-pill status-${user.role}">${user.role}</span>
            </td>
            <td style="color: var(--admin-text-muted); font-size: 13px;">
                ${user.phone || 'Non renseigné'}
            </td>
            <td style="font-size: 13px;">
                ${new Date(user.created_at).toLocaleDateString()}
            </td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon" title="Changer le rôle" onclick="toggleUserRole(${user.id}, '${user.role}')">⚙️</button>
                    <button class="btn-icon" title="Supprimer" style="color: #ef4444;" onclick="deleteUserAccount(${user.id})">🗑️</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function filterUsers() {
    const query = document.getElementById('user-search').value.toLowerCase();
    const filtered = allUsers.filter(u => 
        u.name.toLowerCase().includes(query) || 
        u.email.toLowerCase().includes(query) ||
        (u.phone && u.phone.includes(query))
    );
    renderUsers(filtered);
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


// Actions
async function toggleUserRole(id, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`Passer cet utilisateur au rang de "${newRole}" ?`)) return;

    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    try {
        await fetch(`${API_URL}/admin/users/${id}/role`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role: newRole })
        });
        loadUsers();
        showToast('Rôle mis à jour', 'success');
    } catch (error) {
        showToast('Erreur lors du changement de rôle', 'error');
    }
}

async function deleteUserAccount(id) {
    if (!confirm('Action irréversible : Supprimer cet utilisateur ?')) return;

    const token = localStorage.getItem('adlaunch_token') || sessionStorage.getItem('adlaunch_token');
    try {
        const res = await fetch(`${API_URL}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadUsers();
            showToast('Utilisateur supprimé', 'success');
        }
    } catch (error) {
        showToast('Erreur lors de la suppression', 'error');
    }
}

function logout() {
    localStorage.removeItem('adlaunch_token');
    localStorage.removeItem('adlaunch_user');
    sessionStorage.clear();
    window.location.replace('auth.html');
}

document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
    startHeartbeat();
});
