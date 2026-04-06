const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme');

if (currentTheme) {
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark' && themeToggle) {
        themeToggle.checked = true;
    }
}

if (themeToggle) {
    themeToggle.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}

// Menu-item active toggle
const links = document.querySelectorAll('.link');
const currentPath = window.location.pathname.split('/').pop() || 'index.html';
links.forEach(link => {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('#')) {
        const targetPage = href.split('/').pop();
        if (targetPage === currentPath) {
            link.classList.add('active');
        }
    }

    link.addEventListener('click', (e) => {
        if (href.startsWith('#')) {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        }
    });
});

function initProfileMenu() {
    const profileBtn = document.getElementById('profileBtn');
    const profileMenu = document.getElementById('profileMenu');
    if (!profileBtn || !profileMenu) return;

    const closeMenu = () => {
        profileMenu.classList.remove('open');
        profileBtn.classList.remove('active');
        profileBtn.setAttribute('aria-expanded', 'false');
    };

    profileBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = profileMenu.classList.contains('open');
        if (isOpen) {
            closeMenu();
        } else {
            profileMenu.classList.add('open');
            profileBtn.classList.add('active');
            profileBtn.setAttribute('aria-expanded', 'true');
        }
    });

    profileMenu.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initProfileMenu();
});