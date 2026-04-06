const API_BASE = '/api';
let selectedServerId = null;
let servers = [];
let downloads = [];

async function getAuthToken() {
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        return null;
    }
    return window.firebaseAuth.currentUser.getIdToken(true);
}

async function requestJson(endpoint, options = {}) {
    const token = await getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        credentials: 'include',
        ...options,
        headers,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Request failed: ${response.status}`);
    }
    return response.json();
}

async function initDashboard() {
    await waitForFirebaseAuth();
    await Promise.all([loadServers(), loadDownloads()]);
    updateClock();
    setInterval(updateClock, 1000);
}

async function waitForFirebaseAuth() {
    if (window.firebaseAuth && window.firebaseAuth.currentUser) return;
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
        setTimeout(() => { clearInterval(interval); resolve(); }, 5000);
    });
}

async function loadServers() {
    try {
        servers = await requestJson('/servers');
        renderDashboard();
        renderManageList();
    } catch (error) {
        console.error(error);
    }
}

async function loadDownloads() {
    try {
        downloads = await requestJson('/downloads');
        renderDownloads();
    } catch (error) {
        console.error(error);
    }
}

function renderDashboard() {
    const grid = document.getElementById('server-grid');
    const empty = document.getElementById('empty-state');
    const cntOk = document.getElementById('cnt-ok');
    const cntErr = document.getElementById('cnt-err');
    const cntWarn = document.getElementById('cnt-warn');
    let ok = 0, err = 0, warn = 0;
    grid.innerHTML = '';

    if (!servers.length) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
    } else {
        grid.style.display = 'grid';
        empty.style.display = 'none';
        servers.forEach((srv) => {
            if (srv.status === 'ok') ok++;
            if (srv.status === 'error') err++;
            if (srv.status === 'warn') warn++;
            const card = document.createElement('div');
            card.className = `card ${srv.status}`;
            card.dataset.id = srv.id;
            card.innerHTML = `
                <div class="card-top">
                    <div class="card-name">${escapeHtml(srv.name)}</div>
                    <div class="card-badge badge-${srv.status}">${srv.status === 'ok' ? 'Actief' : srv.status === 'warn' ? 'Waarschuwing' : srv.status === 'error' ? 'Fout' : 'Onbekend'}</div>
                </div>
                <div class="card-status-row">
                    <div class="status-dot ${srv.status}"></div>
                    <span class="status-label">${escapeHtml(srv.host)}</span>
                    <span class="status-latency">${srv.ports?.length ? ':' + srv.ports[0] : '─'}</span>
                </div>
                <div class="card-desc">${escapeHtml(srv.description || 'Geen omschrijving')}</div>
                <div class="card-ports">${(srv.ports || []).map((p) => `<div class="card-port">:${p}</div>`).join('')}</div>
            `;
            card.addEventListener('click', () => openDetail(srv.id));
            grid.appendChild(card);
        });
    }
    cntOk.textContent = ok;
    cntErr.textContent = err;
    cntWarn.textContent = warn;
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    document.getElementById('topbar-host').textContent = window.location.hostname;
}

function renderManageList() {
    const q = (document.getElementById('manage-search').value || '').toLowerCase();
    const list = document.getElementById('manage-list');
    const filtered = servers.filter((srv) =>
        srv.name.toLowerCase().includes(q) ||
        srv.host.toLowerCase().includes(q) ||
        (srv.description || '').toLowerCase().includes(q) ||
        (srv.ports || []).some((p) => String(p).includes(q))
    );
    if (!filtered.length) {
        list.innerHTML = `<div class="manage-empty"><i class="fa fa-server"></i>${servers.length ? 'Geen resultaten gevonden.' : 'Voeg je eerste server toe via de knop hierboven.'}</div>`;
        return;
    }
    list.innerHTML = filtered.map((srv) => `
        <div class="m-row">
            <div class="m-indicator ${srv.status}"></div>
            <div class="m-info">
                <div class="m-name">${escapeHtml(srv.name)}</div>
                <div class="m-meta">${escapeHtml(srv.host)} · ${(srv.ports || []).map((p) => ':' + p).join(', ') || 'geen poorten'} · ${srv.status}</div>
            </div>
            <div class="m-actions">
                ${srv.ssh?.enabled ? `<button class="btn btn-secondary btn-sm btn-icon-only" title="Terminal" onclick="openTerminalById('${srv.id}')"><i class="fa fa-terminal"></i></button>` : ''}
                <button class="btn btn-secondary btn-sm btn-icon-only" title="Bewerken" onclick="openServerForm('${srv.id}')"><i class="fa fa-pen"></i></button>
                <button class="btn btn-danger btn-sm btn-icon-only" title="Verwijderen" onclick="deleteServer('${srv.id}')"><i class="fa fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function openDetail(id) {
    const srv = servers.find((s) => s.id === id);
    if (!srv) return;
    selectedServerId = id;
    document.getElementById('detail-title').textContent = srv.name;
    const icon = document.getElementById('detail-icon');
    icon.className = `d-status-icon ${srv.status}`;
    icon.innerHTML = `<i class="fa ${srv.status === 'ok' ? 'fa-circle-check' : srv.status === 'error' ? 'fa-circle-xmark' : 'fa-circle-question'}"></i>`;
    document.getElementById('detail-status-text').textContent = srv.status === 'ok' ? 'Actief' : srv.status === 'warn' ? 'Waarschuwing' : srv.status === 'error' ? 'Fout' : 'Onbekend';
    document.getElementById('detail-host-text').textContent = `${srv.host} · ${srv.ports?.[0] ? ':' + srv.ports[0] : 'geen poort'}`;
    document.getElementById('detail-terminal-btn').style.display = srv.ssh?.enabled ? '' : 'none';
    document.getElementById('detail-stats').innerHTML = `
        <div class="d-stat"><div class="d-stat-label">Host</div><div class="d-stat-value">${escapeHtml(srv.host)}</div></div>
        <div class="d-stat"><div class="d-stat-label">Status</div><div class="d-stat-value">${escapeHtml(srv.status)}</div></div>
        <div class="d-stat"><div class="d-stat-label">Poorten</div><div class="d-stat-value">${escapeHtml((srv.ports || []).join(', ') || '─')}</div></div>
    `;
    document.getElementById('detail-ports').innerHTML = (srv.ports || []).map((p) => `<div class="d-port">:${p}</div>`).join('') || '<span style="color:var(--sage);font-size:.8rem">Geen poorten geconfigureerd</span>';
    document.getElementById('detail-extra').innerHTML = `
        <div style="font-size:.76rem;color:#c0d8d0">${escapeHtml(srv.description || 'Geen omschrijving')}</div>
        ${srv.ssh?.enabled ? `<div style="font-size:.76rem;color:var(--mint);margin-top:.5rem"><i class="fa fa-terminal" style="margin-right:4px"></i>SSH: ${escapeHtml(srv.ssh.username || '─')}@${escapeHtml(srv.ssh.host || srv.host)}:${srv.ssh.port || 22}</div>` : ''}
    `;
    document.getElementById('detail-overlay').classList.add('active');
}

function closeDetail() {
    document.getElementById('detail-overlay').classList.remove('active');
}

function refreshDetailStatus() {
    if (!selectedServerId) return;
    checkServer(selectedServerId);
}

async function openManage() {
    await loadServers();
    document.getElementById('manage-overlay').classList.add('active');
}

function closeManage() {
    document.getElementById('manage-overlay').classList.remove('active');
}

function openServerForm(id) {
    const form = document.getElementById('server-form-overlay');
    const title = document.getElementById('form-title');
    document.getElementById('f-id').value = id || '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-host').value = '';
    document.getElementById('f-ports').value = '';
    document.getElementById('f-desc').value = '';
    document.getElementById('f-url').value = '';
    document.getElementById('f-status').value = 'unknown';
    document.getElementById('f-ssh-enabled').checked = false;
    document.getElementById('f-ssh-host').value = '';
    document.getElementById('f-ssh-port').value = '22';
    document.getElementById('f-ssh-user').value = '';
    document.getElementById('f-ssh-pass').value = '';
    toggleSshFields();
    title.innerHTML = id ? '<i class="fa fa-pen" style="margin-right:6px"></i> Server bewerken' : '<i class="fa fa-plus" style="margin-right:6px"></i> Server toevoegen';
    if (id) {
        const srv = servers.find((s) => s.id === id);
        if (srv) {
            document.getElementById('f-name').value = srv.name;
            document.getElementById('f-host').value = srv.host;
            document.getElementById('f-ports').value = (srv.ports || []).join(', ');
            document.getElementById('f-desc').value = srv.description || '';
            document.getElementById('f-url').value = srv.checkUrl || '';
            document.getElementById('f-status').value = srv.status || 'unknown';
            if (srv.ssh) {
                document.getElementById('f-ssh-enabled').checked = !!srv.ssh.enabled;
                document.getElementById('f-ssh-host').value = srv.ssh.host || '';
                document.getElementById('f-ssh-port').value = srv.ssh.port || 22;
                document.getElementById('f-ssh-user').value = srv.ssh.username || '';
                document.getElementById('f-ssh-pass').value = srv.ssh.password || '';
                toggleSshFields();
            }
        }
    }
    form.classList.add('active');
}

function closeServerForm() {
    document.getElementById('server-form-overlay').classList.remove('active');
}

function switchTab(tab) {
    document.querySelectorAll('.form-tab').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.form-tab-content').forEach((el) => el.classList.remove('active'));
    document.querySelector(`.form-tab[onclick="switchTab('${tab}')"]`)?.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
}

function toggleSshFields() {
    const enabled = document.getElementById('f-ssh-enabled').checked;
    document.getElementById('ssh-fields').classList.toggle('hidden', !enabled);
}

async function saveServer() {
    const id = document.getElementById('f-id').value.trim();
    const name = document.getElementById('f-name').value.trim();
    const host = document.getElementById('f-host').value.trim();
    if (!name || !host) return alert('Naam en host zijn verplicht.');
    const ports = document.getElementById('f-ports').value.split(',').map((p) => Number(p.trim())).filter((n) => n > 0 && n < 65536);
    const sshEnabled = document.getElementById('f-ssh-enabled').checked;
    const data = {
        id,
        name,
        host,
        ports,
        description: document.getElementById('f-desc').value.trim(),
        checkUrl: document.getElementById('f-url').value.trim() || '',
        status: document.getElementById('f-status').value,
        ssh: sshEnabled ? {
            enabled: true,
            host: document.getElementById('f-ssh-host').value.trim() || host,
            port: parseInt(document.getElementById('f-ssh-port').value, 10) || 22,
            username: document.getElementById('f-ssh-user').value.trim(),
            password: document.getElementById('f-ssh-pass').value,
        } : { enabled: false },
    };
    try {
        if (id) {
            await requestJson(`/servers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
            await requestJson('/servers', { method: 'POST', body: JSON.stringify(data) });
        }
        await loadServers();
        closeServerForm();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteServer(id) {
    if (!confirm('Server verwijderen?')) return;
    try {
        await requestJson(`/servers/${id}`, { method: 'DELETE' });
        await loadServers();
    } catch (error) {
        alert(error.message);
    }
}

function openTerminalById(id) {
    const srv = servers.find((s) => s.id === id);
    if (srv) openTerminal(srv);
}

function openTerminal(srv) {
    if (!srv) return;
    selectedServerId = srv.id;
    document.getElementById('terminal-server-name').textContent = ' ' + srv.name;
    document.getElementById('terminal-status').className = 'connecting';
    document.getElementById('terminal-status').textContent = 'Verbinding maken...';
    document.getElementById('terminal-container').textContent = 'SSH-verbinding wordt gestart. Voer een commando in.';
    document.getElementById('terminal-overlay').classList.add('active');
}

async function runTerminalCommand() {
    const command = document.getElementById('terminal-command').value.trim();
    if (!command || !selectedServerId) return;
    const outputEl = document.getElementById('terminal-container');
    outputEl.textContent += `\n$ ${command}\n`;
    try {
        const response = await requestJson(`/servers/${selectedServerId}/ssh`, { method: 'POST', body: JSON.stringify({ command }) });
        outputEl.textContent += `${response.output}\n`;
        document.getElementById('terminal-status').className = 'connected';
        document.getElementById('terminal-status').textContent = 'Verbinding succesvol';
    } catch (error) {
        outputEl.textContent += `Fout: ${error.message}\n`;
        document.getElementById('terminal-status').className = 'error';
        document.getElementById('terminal-status').textContent = 'SSH-fout';
    }
}

async function triggerCheck() {
    const checkBtn = document.getElementById('btn-check');
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Controleren...';
    await Promise.all(servers.map((srv) => requestJson(`/servers/${srv.id}/check`, { method: 'POST' }).catch(() => null)));
    await loadServers();
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<i class="fa fa-rotate-right"></i> Nu checken';
}

async function startDownload() {
    const url = document.getElementById('yt-url').value.trim();
    const path = document.getElementById('yt-path').value.trim() || './downloads';
    if (!url) return alert('Voer een YouTube-link in.');
    const btn = document.getElementById('download-btn');
    const status = document.getElementById('dl-status');
    btn.disabled = true;
    status.textContent = 'Starten...';
    try {
        await requestJson('/downloads', { method: 'POST', body: JSON.stringify({ url, folder: path }) });
        await loadDownloads();
        status.textContent = 'Download gestart';
    } catch (error) {
        status.textContent = 'Fout bij starten';
        alert(error.message);
    } finally {
        btn.disabled = false;
    }
}

async function removeDownload(id) {
    try {
        await requestJson(`/downloads/${id}`, { method: 'DELETE' });
        await loadDownloads();
    } catch (error) {
        alert(error.message);
    }
}

function renderDownloads() {
    const list = document.getElementById('download-list');
    list.innerHTML = '';
    if (!downloads.length) {
        list.innerHTML = '<div class="empty">Nog geen downloads</div>';
        return;
    }
    downloads.slice().forEach((item) => {
        const row = document.createElement('div');
        row.className = 'channel-item';
        row.innerHTML = `
            <div class="channel-name">${escapeHtml(item.title || item.url)}<span> (${escapeHtml(item.folder)})</span></div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:.85rem;color:#9ca3af;">${escapeHtml(item.status)}</span>
                <button class="btn btn-ghost btn-sm" onclick="removeDownload('${item.id}')">Verwijder</button>
            </div>
        `;
        list.appendChild(row);
    });
}

function toggleLog() {
    const box = document.getElementById('log-box');
    const toggle = document.querySelector('.log-toggle');
    const visible = box.style.display !== 'block';
    box.style.display = visible ? 'block' : 'none';
    toggle.textContent = visible ? '▾ Verberg logs' : '▾ Toon logs';
}

function appendLog(text) {
    const box = document.getElementById('log-box');
    const line = `${new Date().toLocaleTimeString('nl-NL')}  ${text}`;
    box.textContent = `${line}\n${box.textContent}`;
}

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateClock() {
    const now = new Date();
    const clock = document.getElementById('topbar-clock');
    const date = document.getElementById('topbar-date');
    if (clock) clock.textContent = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (date) date.textContent = now.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

window.openManage = openManage;
window.openServerForm = openServerForm;
window.closeServerForm = closeServerForm;
window.saveServer = saveServer;
window.toggleSshFields = toggleSshFields;
window.deleteServer = deleteServer;
window.openTerminalById = openTerminalById;
window.openTerminal = openTerminal;
window.closeTerminal = () => document.getElementById('terminal-overlay').classList.remove('active');
window.refreshDetailStatus = refreshDetailStatus;
window.editCurrentServer = () => { if (selectedServerId) openServerForm(selectedServerId); };
window.triggerCheck = triggerCheck;
window.startDownload = startDownload;
window.toggleLog = toggleLog;
window.removeDownload = removeDownload;
window.runTerminalCommand = runTerminalCommand;
window.closeDetail = closeDetail;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initDashboard);
}
