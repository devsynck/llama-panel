const express = require('express');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const config = require('./src/config');
const LlamaManager = require('./src/llama-manager');
const ModelManager = require('./src/model-manager');
const PresetManager = require('./src/preset-manager');
const sysStats = require('./src/sys-stats');

const app = express();
const server = http.createServer(app);

// Managers
const llama = new LlamaManager();
const models = new ModelManager();
const presets = new PresetManager();

// Middleware
app.use(express.json());

// Serve web files: embedded (exe mode) or filesystem (dev mode)
const MIME_TYPES = { html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff: 'font/woff', woff2: 'font/woff2', map: 'application/json' };
if (typeof globalThis.__EMBEDDED_WEB__ !== 'undefined') {
    // Embedded mode (standalone exe)
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') || req.path === '/ws') return next();
        const filename = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
        if (globalThis.__EMBEDDED_WEB__[filename]) {
            const ext = filename.split('.').pop();
            res.type(MIME_TYPES[ext] || 'text/plain').send(globalThis.__EMBEDDED_WEB__[filename]);
        } else {
            next();
        }
    });
} else {
    // Dev mode (serves Vite build output from dist/)
    app.use(express.static(path.join(__dirname, 'dist')));
}

// ============ API Routes ============

// --- Status ---
app.get('/api/status', (req, res) => {
    res.json({ ...llama.getStatus(), sysInfo: sysStats.get() });
});

// --- Config ---
app.get('/api/config', (req, res) => {
    res.json(config.load());
});

app.post('/api/config', (req, res) => {
    try {
        const current = config.load();
        const updated = { ...current, ...req.body };
        config.save(updated);
        res.json({ ok: true, config: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Server Control ---
app.post('/api/start', async (req, res) => {
    try {
        await llama.start();
        res.json({ ok: true, status: llama.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stop', async (req, res) => {
    try {
        await llama.stop();
        res.json({ ok: true, status: llama.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/restart', async (req, res) => {
    try {
        await llama.stop();
        await new Promise(r => setTimeout(r, 1500));
        await llama.start();
        res.json({ ok: true, status: llama.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hotswap', async (req, res) => {
    const { modelPath } = req.body;
    if (!modelPath) return res.status(400).json({ error: 'modelPath required' });
    try {
        await llama.hotswap(modelPath);
        res.json({ ok: true, status: llama.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const cfg = config.load();
    const port = cfg.port || 8080;
    const host = cfg.host || '127.0.0.1';

    try {
        const response = await fetch(`http://${host}:${port}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(cfg.apiKey ? { 'Authorization': `Bearer ${cfg.apiKey}` } : {})
            },
            body: JSON.stringify({
                ...req.body,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error from llama-server' }));
            return res.status(response.status).json(err);
        }

        // Forward the stream
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // ReadableStream to Node.js stream
        const { Readable } = require('stream');
        Readable.fromWeb(response.body).pipe(res);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- File System ---
app.get('/api/browse-directory', async (req, res) => {
    try {
        const { exec, execFile } = require('child_process');
        const fs = require('fs');
        const os = require('os');
        const platform = os.platform();

        if (platform === 'win32') {
            const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Models Directory"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
`;
            const scriptPath = path.join(os.tmpdir(), 'browse-dialog.ps1');
            fs.writeFileSync(scriptPath, script);

            execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], (err, stdout) => {
                if (err) return res.json({ path: null });
                const selectedMatch = stdout.trim();
                res.json({ path: selectedMatch || null });
            });
        } else if (platform === 'darwin') {
            exec('osascript -e \'POSIX path of (choose folder with prompt "Select Models Directory")\'', (err, stdout) => {
                if (err) return res.json({ path: null });
                res.json({ path: stdout.trim() || null });
            });
        } else if (platform === 'linux') {
            // Try zenity first
            exec('zenity --file-selection --directory --title="Select Models Directory"', (err, stdout) => {
                if (!err && stdout) {
                    return res.json({ path: stdout.trim() });
                }
                // Try kdialog
                exec('kdialog --getexistingdirectory /', (err2, stdout2) => {
                    if (!err2 && stdout2) {
                        return res.json({ path: stdout2.trim() });
                    }
                    res.json({ path: null });
                });
            });
        } else {
            res.json({ path: null });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Models ---
app.get('/api/models', (req, res) => {
    try {
        res.json(models.listModels());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/models/:name', (req, res) => {
    try {
        models.deleteModel(req.params.name);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Model Download ---
app.get('/api/models/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    try {
        const results = await models.searchHuggingFace(q);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/models/repo-files/:owner/:repo', async (req, res) => {
    try {
        const repoId = `${req.params.owner}/${req.params.repo}`;
        const files = await models.getRepoFiles(repoId);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/models/download', async (req, res) => {
    const { repoId, filename, filenames, hfToken } = req.body;
    const filesToDownload = filenames || (filename ? [filename] : []);

    if (!repoId || filesToDownload.length === 0) {
        return res.status(400).json({ error: 'repoId and filename(s) required' });
    }
    try {
        const downloadId = await models.downloadFromHuggingFace(repoId, filesToDownload, hfToken);
        res.json({ ok: true, downloadId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/downloads', (req, res) => {
    res.json(models.getAllDownloads());
});

app.get('/api/downloads/:id', (req, res) => {
    const progress = models.getDownloadProgress(req.params.id);
    if (!progress) return res.status(404).json({ error: 'Download not found' });
    res.json(progress);
});

// --- Download Control ---
app.post('/api/downloads/:id/pause', (req, res) => {
    try {
        models.pauseDownload(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/downloads/:id/resume', (req, res) => {
    try {
        models.resumeDownload(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/downloads/:id/stop', (req, res) => {
    try {
        models.stopDownload(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/models/migrate', (req, res) => {
    try {
        const migrated = models.migrateToFolderStructure();
        res.json({ ok: true, migrated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Presets ---
app.get('/api/presets', (req, res) => {
    try {
        res.json(presets.listPresets());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/presets/:id', (req, res) => {
    try {
        const preset = presets.getPreset(req.params.id);
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json(preset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/presets', (req, res) => {
    try {
        const preset = presets.createPreset(req.body);
        res.json({ ok: true, preset });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/presets/:id', (req, res) => {
    try {
        const preset = presets.updatePreset(req.params.id, req.body);
        res.json({ ok: true, preset });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/presets/:id', (req, res) => {
    try {
        presets.deletePreset(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

app.post('/api/presets/:id/activate', async (req, res) => {
    try {
        const preset = presets.getPreset(req.params.id);
        if (!preset) return res.status(404).json({ error: 'Preset not found' });

        const presetPath = presets.getPresetPath(req.params.id);
        const cfg = config.load();

        // Update config to use preset mode
        cfg.modelsPresetPath = presetPath;
        cfg.activePresetId = preset.id;
        config.save(cfg);

        res.json({ ok: true, config: cfg });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/presets/deactivate', (req, res) => {
    try {
        const cfg = config.load();

        // Disable preset mode
        cfg.modelsPresetPath = '';
        cfg.activePresetId = null;
        config.save(cfg);

        res.json({ ok: true, config: cfg });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- LoRA Adapters (proxy to llama-server) ---
app.get('/api/lora-adapters', async (req, res) => {
    if (llama.status !== 'running') return res.json([]);
    const cfg = config.load();
    const baseUrl = `http://${cfg.host}:${cfg.port}`;
    try {
        const r = await fetch(`${baseUrl}/lora-adapters`);
        if (!r.ok) return res.status(r.status).json({ error: 'Upstream error' });
        res.json(await r.json());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/lora-adapters', async (req, res) => {
    if (llama.status !== 'running') {
        return res.status(400).json({ error: 'Server is not running' });
    }
    const cfg = config.load();
    const baseUrl = `http://${cfg.host}:${cfg.port}`;
    try {
        const r = await fetch(`${baseUrl}/lora-adapters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
        });
        if (!r.ok) return res.status(r.status).json({ error: 'Upstream error' });
        res.json({ ok: true, result: await r.json() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Debug: raw metrics from llama-server ---
app.get('/api/debug/metrics', async (req, res) => {
    const liveCfg = llama._currentConfig || config.load();
    const baseUrl = `http://${liveCfg.host}:${liveCfg.port}`;

    // In router mode, /metrics requires ?model=
    let metricsUrl = `${baseUrl}/metrics`;
    if (liveCfg.activePresetId) {
        try {
            const preset = presets.getPreset(liveCfg.activePresetId);
            if (preset?.models?.length > 0) {
                metricsUrl += `?model=${encodeURIComponent(preset.models[0].identifier)}`;
            }
        } catch (_) { }
    }

    const info = { metricsUrl, status: llama.status, parsedMetrics: llama.metricsData };
    try {
        const r = await fetch(metricsUrl);
        const raw = await r.text();
        res.json({ ...info, httpStatus: r.status, ok: r.ok, raw, rawLength: raw.length });
    } catch (err) {
        res.status(500).json({ ...info, error: err.message });
    }
});

// --- Logs ---
app.get('/api/logs', (req, res) => {
    const n = parseInt(req.query.n) || 200;
    res.json(llama.logs.getLast(n));
});

// --- Fallback to index.html for SPA ---
app.get('*', (req, res) => {
    if (typeof globalThis.__EMBEDDED_WEB__ !== 'undefined') {
        res.type('html').send(globalThis.__EMBEDDED_WEB__['index.html']);
    } else {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
});

// ============ WebSocket for real-time logs + stats ============
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    // Send recent logs on connect
    const recent = llama.logs.getLast(100);
    ws.send(JSON.stringify({ type: 'logs:history', data: recent }));

    // Stream new log lines
    const unsubLog = llama.logs.onLine((entry) => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'log', data: entry }));
        }
    });

    // Stream stats periodically
    const statsInterval = setInterval(() => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'status',
                data: { ...llama.getStatus(), sysInfo: sysStats.get() },
            }));
            // Also send download progress
            const downloads = models.getAllDownloads();
            if (downloads.length > 0) {
                ws.send(JSON.stringify({ type: 'downloads', data: downloads }));
            }
        }
    }, 2000);

    ws.on('close', () => {
        unsubLog();
        clearInterval(statsInterval);
    });

    ws.on('error', () => {
        unsubLog();
        clearInterval(statsInterval);
    });
});

// ============ Start ============
const cfg = config.load();
const managerPort = cfg.managerPort || 7654;

server.listen(managerPort, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    const networkIps = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (!iface.internal) {
                networkIps.push({ address: iface.address, family: iface.family });
            }
        }
    }

    const ipv4 = networkIps.find(ip => ip.family === 'IPv4' || ip.family === 4)?.address;
    const ipv6 = networkIps.find(ip => ip.family === 'IPv6' || ip.family === 6)?.address;

    console.log('\n\x1b[32m🦙 Llama Panel is running\x1b[0m');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('  \x1b[90mOn this machine -- open this in your browser:\x1b[0m');
    console.log(`    \x1b[32mhttp://127.0.0.1:${managerPort}\x1b[0m`);
    console.log(`    \x1b[90m(same as http://localhost:${managerPort})\x1b[0m`);

    if (ipv4 || ipv6) {
        console.log('\n  \x1b[90mFrom another device on your network / to share:\x1b[0m');
        if (ipv4) console.log(`    \x1b[32mhttp://${ipv4}:${managerPort}\x1b[0m`);
        if (ipv6) console.log(`    \x1b[32mhttp://[${ipv6}]:${managerPort}\x1b[0m`);
    }

    console.log('\n  \x1b[90mAPI & health:\x1b[0m');
    console.log(`    \x1b[32mhttp://127.0.0.1:${managerPort}/api\x1b[0m`);
    console.log(`    \x1b[32mhttp://127.0.0.1:${managerPort}/api/status\x1b[0m`);

    console.log('─────────────────────────────────────────────────────────────────');
    console.log(`  \x1b[90mTip: if you are on this computer, open\x1b[0m \x1b[32mhttp://localhost:${managerPort}/\x1b[0m \x1b[90min your browser.\x1b[0m\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await llama.stop();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await llama.stop();
    server.close();
    process.exit(0);
});
