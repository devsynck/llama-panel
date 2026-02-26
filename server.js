const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const config = require('./src/config');
const LlamaManager = require('./src/llama-manager');
const ModelManager = require('./src/model-manager');

const app = express();
const server = http.createServer(app);

// Managers
const llama = new LlamaManager();
const models = new ModelManager();

// Middleware
app.use(express.json());

// Serve web files: embedded (exe mode) or filesystem (dev mode)
const MIME_TYPES = { html: 'text/html', css: 'text/css', js: 'application/javascript' };
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
    // Dev mode
    app.use(express.static(path.join(__dirname, 'web')));
}

// ============ API Routes ============

// --- Status ---
app.get('/api/status', (req, res) => {
    res.json(llama.getStatus());
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

// --- File System ---
app.get('/api/browse-directory', async (req, res) => {
    try {
        const { execFile } = require('child_process');
        const fs = require('fs');
        const os = require('os');
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
        res.sendFile(path.join(__dirname, 'web', 'index.html'));
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
                data: llama.getStatus(),
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

server.listen(managerPort, '127.0.0.1', () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║          🦙 Llama Panel Manager               ║');
    console.log('  ╠═══════════════════════════════════════════════╣');
    console.log(`  ║  Dashboard: http://127.0.0.1:${managerPort}              ║`);
    console.log('  ║  Press Ctrl+C to exit                         ║');
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('');

    // Auto-open browser
    const { exec } = require('child_process');
    exec(`start http://127.0.0.1:${managerPort}`);
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
