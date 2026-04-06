const firebaseConfig = {
    apiKey: "AIzaSyCBWYgplbhCzOx6G0_Fb5xEMBdIyGFVcVM",
    authDomain: "dashboard-1cea2.firebaseapp.com",
    projectId: "dashboard-1cea2",
    storageBucket: "dashboard-1cea2.firebasestorage.app",
    messagingSenderId: "911950089916",
    appId: "1:911950089916:web:36413c7d3267aca1438ab9",
    measurementId: "G-F4G4183JSF"
};

async function setupFirebaseAuth() {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js');
    const { getAuth, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js');
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    window.firebaseAuth = auth;

    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    onAuthStateChanged(auth, (user) => {
        if (currentPath === 'login.html') {
            if (user) {
                window.location.href = 'index.html';
            }
            return;
        }
        if (!user) {
            window.location.href = 'login.html';
        } else {
            updateProfileAvatar(user);
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Logout fout:', error);
            }
        });
    }
}

function updateProfileAvatar(user) {
    const avatar = document.querySelector('.profile-avatar');
    if (!avatar) return;
    const displayName = user.displayName || '';
    const email = user.email || '';
    let initials = '';
    if (displayName) {
        initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    } else if (email) {
        initials = email[0].toUpperCase();
    } else {
        initials = 'U';
    }
    avatar.textContent = initials;
}

setupFirebaseAuth();
