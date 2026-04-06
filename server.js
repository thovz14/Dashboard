import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import net from 'net';
import { once } from 'events';
import { Client } from 'ssh2';
import admin from 'firebase-admin';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, 'data');
const serversFile = path.join(dataDir, 'servers.json');
const downloadsFile = path.join(dataDir, 'downloads.json');
const downloadsRoot = path.join(__dirname, 'downloads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(serversFile)) fs.writeFileSync(serversFile, JSON.stringify([], null, 2));
if (!fs.existsSync(downloadsFile)) fs.writeFileSync(downloadsFile, JSON.stringify([], null, 2));
if (!fs.existsSync(downloadsRoot)) fs.mkdirSync(downloadsRoot, { recursive: true });

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadServers() {
    return readJson(serversFile);
}

function saveServers(servers) {
    writeJson(serversFile, servers);
}

function loadDownloads() {
    return readJson(downloadsFile);
}

function saveDownloads(items) {
    writeJson(downloadsFile, items);
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const idToken = authHeader.split(' ')[1];
    admin.auth().verifyIdToken(idToken)
        .then(decodedToken => {
            req.user = decodedToken;
            next();
        })
        .catch((error) => {
            console.error('Token verification failed', error);
            res.status(401).json({ error: 'Invalid token' });
        });
}

function getFirebaseApp() {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return admin.initializeApp();
}

try {
    getFirebaseApp();
} catch (error) {
    console.warn('Firebase admin init failed, make sure GOOGLE_APPLICATION_CREDENTIALS is set:', error.message);
}

function sendJsonResponse(res, data) {
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
}

function checkTcp(host, port, timeout = 5000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        socket.setTimeout(timeout);
        socket.on('connect', () => {
            if (!settled) {
                settled = true;
                socket.destroy();
                resolve({ ok: true });
            }
        });
        socket.on('error', () => {
            if (!settled) {
                settled = true;
                resolve({ ok: false });
            }
        });
        socket.on('timeout', () => {
            if (!settled) {
                settled = true;
                socket.destroy();
                resolve({ ok: false });
            }
        });
        socket.connect(port, host);
    });
}

function checkHttp(url, timeout = 5000) {
    return new Promise((resolve) => {
        try {
            const client = url.startsWith('https://') ? https : http;
            const request = client.get(url, { timeout }, (res) => {
                const ok = res.statusCode >= 200 && res.statusCode < 400;
                res.resume();
                resolve({ ok, status: res.statusCode });
            });
            request.on('error', () => resolve({ ok: false }));
            request.on('timeout', () => { request.destroy(); resolve({ ok: false }); });
        } catch (error) {
            resolve({ ok: false });
        }
    });
}

app.get('/api/status', (req, res) => sendJsonResponse(res, { ok: true }));

app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const userRecord = await admin.auth().getUser(req.user.uid);
        sendJsonResponse(res, {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName,
            photoURL: userRecord.photoURL,
        });
    } catch (error) {
        console.error(error);
        sendJsonResponse(res, { uid: req.user.uid, email: req.user.email || '', displayName: req.user.name || '', photoURL: '' });
    }
});

app.get('/api/servers', verifyToken, (req, res) => {
    const servers = loadServers();
    sendJsonResponse(res, servers);
});

app.post('/api/servers', verifyToken, (req, res) => {
    const servers = loadServers();
    const server = req.body;
    if (!server.name || !server.host) {
        return res.status(400).json({ error: 'Naam en host zijn verplicht.' });
    }
    const id = server.id || `srv-${Date.now()}`;
    const item = {
        id,
        name: server.name,
        host: server.host,
        ports: Array.isArray(server.ports) ? server.ports : String(server.ports || '').split(',').map(p => Number(p.trim())).filter(Boolean),
        description: server.description || '',
        checkUrl: server.checkUrl || '',
        status: server.status || 'unknown',
        ssh: server.ssh || { enabled: false },
        createdAt: new Date().toISOString(),
    };
    servers.push(item);
    saveServers(servers);
    sendJsonResponse(res, item);
});

app.put('/api/servers/:id', verifyToken, (req, res) => {
    const servers = loadServers();
    const index = servers.findIndex((s) => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Server niet gevonden.' });
    const server = req.body;
    servers[index] = {
        ...servers[index],
        name: server.name || servers[index].name,
        host: server.host || servers[index].host,
        ports: Array.isArray(server.ports) ? server.ports : String(server.ports || servers[index].ports || '').split(',').map(p => Number(p.trim())).filter(Boolean),
        description: server.description || servers[index].description,
        checkUrl: server.checkUrl || servers[index].checkUrl,
        status: server.status || servers[index].status,
        ssh: server.ssh || servers[index].ssh,
        updatedAt: new Date().toISOString(),
    };
    saveServers(servers);
    sendJsonResponse(res, servers[index]);
});

app.delete('/api/servers/:id', verifyToken, (req, res) => {
    let servers = loadServers();
    servers = servers.filter((s) => s.id !== req.params.id);
    saveServers(servers);
    sendJsonResponse(res, { success: true });
});

app.post('/api/servers/:id/check', verifyToken, async (req, res) => {
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server niet gevonden.' });
    const firstPort = (server.ports || [])[0];
    let result;
    if (server.checkUrl) {
        result = await checkHttp(server.checkUrl);
    } else if (firstPort) {
        result = await new Promise((resolve) => {
            const socket = new net.Socket();
            let done = false;
            socket.setTimeout(5000);
            socket.on('connect', () => { if (!done) { done = true; socket.destroy(); resolve({ ok: true }); } });
            socket.on('error', () => { if (!done) { done = true; resolve({ ok: false }); } });
            socket.on('timeout', () => { if (!done) { done = true; socket.destroy(); resolve({ ok: false }); } });
            socket.connect(firstPort, server.host);
        });
    } else {
        result = { ok: false };
    }
    server.status = result.ok ? 'ok' : 'error';
    server.lastChecked = new Date().toISOString();
    saveServers(servers);
    sendJsonResponse(res, { status: server.status, ok: result.ok });
});

app.post('/api/servers/:id/ssh', verifyToken, async (req, res) => {
    const servers = loadServers();
    const server = servers.find((s) => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server niet gevonden.' });
    if (!server.ssh || !server.ssh.enabled) {
        return res.status(400).json({ error: 'SSH is niet ingeschakeld voor deze server.' });
    }
    if (!req.body.command) {
        return res.status(400).json({ error: 'SSH-commando ontbreekt.' });
    }
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    conn.on('ready', () => {
        conn.exec(req.body.command, (err, stream) => {
            if (err) {
                conn.end();
                return res.status(500).json({ error: err.message });
            }
            stream.on('close', (code) => {
                conn.end();
                sendJsonResponse(res, { output: stdout.trim() || stderr.trim() || 'Geen uitvoer', code });
            }).on('data', (data) => { stdout += data.toString(); }).stderr.on('data', (data) => { stderr += data.toString(); });
        });
    }).on('error', (error) => {
        res.status(500).json({ error: error.message });
    }).connect({
        host: server.ssh.host || server.host,
        port: server.ssh.port || 22,
        username: server.ssh.username,
        password: server.ssh.password,
    });
});

app.get('/api/downloads', verifyToken, (req, res) => {
    const downloads = loadDownloads();
    sendJsonResponse(res, downloads);
});

app.post('/api/downloads', verifyToken, async (req, res) => {
    const { url, folder } = req.body;
    if (!url) return res.status(400).json({ error: 'YouTube URL is verplicht.' });
    const id = uuidv4();
    const outputRoot = folder ? path.resolve(folder) : downloadsRoot;
    const outputDir = path.isAbsolute(outputRoot) ? outputRoot : path.join(__dirname, outputRoot);
    fs.mkdirSync(outputDir, { recursive: true });
    const item = { id, url, folder: outputDir, status: 'running', createdAt: new Date().toISOString(), title: null, message: null };
    const downloads = loadDownloads();
    downloads.unshift(item);
    saveDownloads(downloads);

    const child = spawn('yt-dlp', ['-o', path.join(outputDir, '%(title)s.%(ext)s'), url], { shell: false });
    let output = '';

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });
    child.on('close', (code) => {
        const list = loadDownloads();
        const entry = list.find(d => d.id === id);
        if (entry) {
            entry.status = code === 0 ? 'done' : 'error';
            entry.message = output.trim();
            entry.updatedAt = new Date().toISOString();
            if (!entry.title) {
                entry.title = url.split('v=')[1] ? decodeURIComponent(url.split('v=')[1].split('&')[0]) : url;
            }
            saveDownloads(list);
        }
    });

    sendJsonResponse(res, item);
});

app.delete('/api/downloads/:id', verifyToken, (req, res) => {
    let downloads = loadDownloads();
    downloads = downloads.filter((d) => d.id !== req.params.id);
    saveDownloads(downloads);
    sendJsonResponse(res, { success: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`API-server draait op http://localhost:${port}`);
});
