// ============================================================
// Llama Panel — Frontend Application
// ============================================================

let ws = null;
let currentStatus = {};
let currentConfig = {};

// ============ Navigation ============

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        navigateTo(page);
    });
});

function navigateTo(page) {
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const activePage = document.getElementById(`page-${page}`);
    if (activePage) activePage.classList.add('active');

    // Load page data
    if (page === 'config') loadConfig();
    if (page === 'models') refreshModels();
}

// ============ WebSocket ============

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWSMessage(msg);
        } catch (_) { }
    };

    ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
        ws.close();
    };
}

function handleWSMessage(msg) {
    switch (msg.type) {
        case 'status':
            updateDashboard(msg.data);
            break;
        case 'log':
            appendLog(msg.data);
            break;
        case 'logs:history':
            for (const entry of msg.data) {
                appendLog(entry);
            }
            break;
        case 'downloads':
            updateDownloadsList(msg.data);
            break;
    }
}

// ============ Dashboard ============

function updateDashboard(data) {
    currentStatus = data;

    // Status
    const statusVal = document.getElementById('stat-status-value');
    const statusMap = {
        stopped: { text: 'Offline', class: '' },
        starting: { text: 'Starting...', class: 'starting' },
        running: { text: 'Running', class: 'running' },
        error: { text: 'Error', class: 'error' },
    };
    const s = statusMap[data.status] || statusMap.stopped;
    statusVal.textContent = s.text;

    // Indicator
    const dot = document.querySelector('.indicator-dot');
    const indicatorText = document.querySelector('.indicator-text');
    dot.className = 'indicator-dot ' + (s.class || '');
    indicatorText.textContent = s.text;

    // Buttons
    document.getElementById('btn-start').disabled = data.status === 'running' || data.status === 'starting';
    document.getElementById('btn-stop').disabled = data.status === 'stopped';

    // Uptime
    const uptimeVal = document.getElementById('stat-uptime-value');
    if (data.uptime > 0) {
        uptimeVal.textContent = formatUptime(data.uptime);
    } else {
        uptimeVal.textContent = '—';
    }

    // Slots
    const slotsVal = document.getElementById('stat-slots-value');
    if (data.slots && Array.isArray(data.slots)) {
        const active = data.slots.filter(s => s.is_processing || (s.id_task !== undefined && s.id_task !== -1)).length;
        slotsVal.textContent = `${active} / ${data.slots.length}`;
        updateSlotsDetail(data.slots);
    } else {
        slotsVal.textContent = '—';
        document.getElementById('slots-detail').innerHTML = '<div class="empty-state">No active slots</div>';
    }

    // Context
    const ctxVal = document.getElementById('stat-ctx-value');
    if (data.slots && data.slots.length > 0) {
        // Use the context size of a single slot as the official 'Model Context' limit
        const baseCtx = data.slots[0].n_ctx || 0;

        // Track the highest usage among any slot to represent current context pressure
        const usedCtx = data.slots.reduce((max, s) => {
            let used = 0;
            if (s.n_decoded !== undefined) used = s.n_decoded;
            else if (s.next_token && s.next_token[0] && s.next_token[0].n_decoded !== undefined) {
                used = s.next_token[0].n_decoded;
            } else {
                used = (s.n_prompt_tokens_processed || 0) + (s.n_tokens_predicted || 0);
            }
            return Math.max(max, used);
        }, 0);

        if (baseCtx > 0) {
            ctxVal.textContent = `${usedCtx.toLocaleString()} / ${baseCtx.toLocaleString()}`;
        } else {
            ctxVal.textContent = `${usedCtx.toLocaleString()} tokens`;
        }
    } else {
        ctxVal.textContent = '—';
    }

    // Speed / Throughput
    const speedVal = document.getElementById('stat-speed-value');
    if (data.metrics && data.metrics.predicted_tokens_seconds !== undefined && data.metrics.predicted_tokens_seconds > 0) {
        speedVal.textContent = `${data.metrics.predicted_tokens_seconds.toFixed(2)} t/s`;
    } else if (data.health && data.health.tokens_per_second !== undefined && data.health.tokens_per_second > 0) {
        speedVal.textContent = `${data.health.tokens_per_second.toFixed(2)} t/s`;
    } else {
        speedVal.textContent = '—';
    }

    // Sys Info
    const ramUsedVal = document.getElementById('stat-ram-used');
    const ramTotalVal = document.getElementById('stat-ram-total');
    if (ramUsedVal && ramTotalVal && data.sysInfo && data.sysInfo.ram) {
        ramUsedVal.textContent = formatSize(data.sysInfo.ram.used);
        ramTotalVal.textContent = `/ ${formatSize(data.sysInfo.ram.total)}`;
    } else if (ramUsedVal && ramTotalVal) {
        ramUsedVal.textContent = '—';
        ramTotalVal.textContent = '—';
    }

    const gpuVal = document.getElementById('stat-gpu-value');
    const vramUsedVal = document.getElementById('stat-vram-used');
    const vramTotalVal = document.getElementById('stat-vram-total');
    const gpuTempVal = document.getElementById('stat-gpu-temp');
    const gpuPowerVal = document.getElementById('stat-gpu-power');

    if (gpuVal && vramUsedVal && vramTotalVal && data.sysInfo && data.sysInfo.gpu && data.sysInfo.gpu.vramTotal > 0) {
        gpuVal.textContent = `${data.sysInfo.gpu.utilization.toFixed(1)}%`;
        vramUsedVal.textContent = formatSize(data.sysInfo.gpu.vramUsed * 1024 * 1024);
        vramTotalVal.textContent = `/ ${formatSize(data.sysInfo.gpu.vramTotal * 1024 * 1024)}`;

        const coreTempStr = data.sysInfo.gpu.tempCore > 0 ? `${data.sysInfo.gpu.tempCore.toFixed(0)}°C` : '';
        const memTempStr = data.sysInfo.gpu.tempMem > 0 ? `${data.sysInfo.gpu.tempMem.toFixed(0)}°C (Mem)` : '';
        if (gpuTempVal) gpuTempVal.textContent = (coreTempStr || memTempStr) ? [coreTempStr, memTempStr].filter(Boolean).join(' | ') : '—';
        if (gpuPowerVal) gpuPowerVal.textContent = data.sysInfo.gpu.powerDraw > 0 ? `${data.sysInfo.gpu.powerDraw.toFixed(1)} W Draw` : '—';
    } else if (gpuVal && vramUsedVal && vramTotalVal) {
        gpuVal.textContent = '—';
        vramUsedVal.textContent = '—';
        vramTotalVal.textContent = '—';
        if (gpuTempVal) gpuTempVal.textContent = '—';
        if (gpuPowerVal) gpuPowerVal.textContent = '—';
    }

    // Health detail
    updateHealthDetail(data.health, data.metrics);

    // Current model
    updateCurrentModel(data.config);
}

function updateSlotsDetail(slots) {
    const container = document.getElementById('slots-detail');
    if (!slots || slots.length === 0) {
        container.innerHTML = '<div class="empty-state">No slots available</div>';
        return;
    }

    container.innerHTML = slots.map((slot, i) => {
        const isActive = slot.is_processing || (slot.id_task !== undefined && slot.id_task !== -1);
        const badgeClass = isActive ? 'active' : 'idle';
        const badgeText = isActive ? 'ACTIVE' : 'IDLE';

        // Use n_decoded from official API if available
        let decoded = 0;
        if (slot.n_decoded !== undefined) decoded = slot.n_decoded;
        else if (slot.next_token && slot.next_token[0] && slot.next_token[0].n_decoded !== undefined) {
            decoded = slot.next_token[0].n_decoded;
        } else {
            decoded = (slot.n_prompt_tokens_processed || 0) + (slot.n_tokens_predicted || 0);
        }

        return `
      <div class="slot-item">
        <span class="slot-badge ${badgeClass}">${badgeText}</span>
        <span class="slot-ctx">Slot ${slot.id ?? i} — ${decoded.toLocaleString()} tokens decoded</span>
        <span class="slot-ctx">${isActive ? '⚡' : '💤'}</span>
      </div>
    `;
    }).join('');
}

function shortenPath(p) {
    if (!p) return '';
    const parts = p.split(/[\\/]/);
    if (parts.length > 2) {
        return '...' + parts.slice(-2).join('\\');
    }
    return p;
}

function updateHealthDetail(health, metrics) {
    const container = document.getElementById('health-detail');
    if (!health && !metrics) {
        container.innerHTML = '<div class="empty-state">Server not running</div>';
        return;
    }

    const items = [];
    if (health?.status) items.push(['Status', health.status]);
    if (health?.slots_idle !== undefined) items.push(['Idle Slots', health.slots_idle]);

    // Use Metrics for high-fidelity throughput if available
    if (metrics) {
        if (metrics.prompt_tokens_seconds !== undefined) {
            items.push(['Prompt Speed', `${metrics.prompt_tokens_seconds.toFixed(2)} t/s`]);
        }
        if (metrics.predicted_tokens_seconds !== undefined) {
            items.push(['Gen Speed', `${metrics.predicted_tokens_seconds.toFixed(2)} t/s`]);
        }
        if (metrics.prompt_tokens_total !== undefined) {
            items.push(['Total Prompt', metrics.prompt_tokens_total.toLocaleString()]);
        }
        if (metrics.tokens_predicted_total !== undefined) {
            items.push(['Total Gen', metrics.tokens_predicted_total.toLocaleString()]);
        }
    } else if (health) {
        // Fallback to basic health speed
        if (health.tokens_per_second !== undefined) {
            items.push(['Tokens/sec', health.tokens_per_second.toFixed(2)]);
        }
    }

    if (health?.model) items.push(['Model', shortenPath(health.model)]);

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">No health data</div>';
        return;
    }

    container.innerHTML = items.map(([label, value]) => `
    <div class="health-item">
      <span class="health-label">${label}</span>
      <span class="health-value">${value}</span>
    </div>
  `).join('');
}

function updateCurrentModel(cfg) {
    const container = document.getElementById('current-model-info');
    if (!cfg || !cfg.modelPath) {
        container.innerHTML = '<div class="empty-state">No model loaded</div>';
        return;
    }
    container.innerHTML = `<div class="model-path-display">${cfg.modelPath}</div>`;
}

// ============ Server Control ============

async function startServer() {
    const btn = document.getElementById('btn-start');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Starting...';
    try {
        const res = await fetch('/api/start', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start');
        showToast('Server is starting...', 'success');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
    }
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Server`;
}

async function stopServer() {
    const btn = document.getElementById('btn-stop');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Stopping...';
    try {
        const res = await fetch('/api/stop', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to stop');
        showToast('Server stopped', 'info');
    } catch (err) {
        showToast(err.message, 'error');
    }
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop Server`;
    btn.disabled = true;
}

// ============ Config ============

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        currentConfig = await res.json();
        populateConfigForm(currentConfig);
    } catch (err) {
        showToast('Failed to load config', 'error');
    }
}

function populateConfigForm(cfg) {
    // Text/number inputs
    const fields = [
        'host', 'port', 'ctxSize', 'threads', 'threadsBatch',
        'batchSize', 'ubatchSize', 'gpuLayers', 'parallel', 'apiKey',
        'extraArgs', 'modelsDir', 'managerPort'
    ];
    for (const field of fields) {
        const el = document.getElementById(`cfg-${field}`);
        if (el && cfg[field] !== undefined) {
            el.value = cfg[field];
        }
    }

    // Selects
    const selects = ['flashAttn', 'cacheTypeK', 'cacheTypeV', 'splitMode'];
    for (const field of selects) {
        const el = document.getElementById(`cfg-${field}`);
        if (el && cfg[field] !== undefined) {
            el.value = cfg[field];
        }
    }

    // Checkboxes
    const toggles = ['contBatching', 'mlock', 'mmap', 'cachePrompt', 'metrics', 'slots'];
    for (const field of toggles) {
        const el = document.getElementById(`cfg-${field}`);
        if (el && cfg[field] !== undefined) {
            el.checked = cfg[field];
        }
    }

    // Populate the dropdown with models
    if (cfg.modelPath !== undefined) {
        refreshModelSelect(cfg.modelPath);
    }
}

async function saveConfig() {
    const cfg = {
        host: document.getElementById('cfg-host').value,
        port: parseInt(document.getElementById('cfg-port').value) || 8080,
        modelPath: document.getElementById('cfg-modelPath').value,
        ctxSize: parseInt(document.getElementById('cfg-ctxSize').value) || 4096,
        threads: parseInt(document.getElementById('cfg-threads').value) || -1,
        threadsBatch: parseInt(document.getElementById('cfg-threadsBatch').value) || -1,
        batchSize: parseInt(document.getElementById('cfg-batchSize').value) || 2048,
        ubatchSize: parseInt(document.getElementById('cfg-ubatchSize').value) || 512,
        gpuLayers: document.getElementById('cfg-gpuLayers').value || 'auto',
        flashAttn: document.getElementById('cfg-flashAttn').value,
        parallel: parseInt(document.getElementById('cfg-parallel').value) || 1,
        contBatching: document.getElementById('cfg-contBatching').checked,
        mlock: document.getElementById('cfg-mlock').checked,
        mmap: document.getElementById('cfg-mmap').checked,
        cachePrompt: document.getElementById('cfg-cachePrompt').checked,
        metrics: document.getElementById('cfg-metrics').checked,
        slots: document.getElementById('cfg-slots').checked,
        cacheTypeK: document.getElementById('cfg-cacheTypeK').value,
        cacheTypeV: document.getElementById('cfg-cacheTypeV').value,
        splitMode: document.getElementById('cfg-splitMode').value,
        apiKey: document.getElementById('cfg-apiKey').value,
        extraArgs: document.getElementById('cfg-extraArgs').value,
        modelsDir: document.getElementById('cfg-modelsDir').value,
        managerPort: parseInt(document.getElementById('cfg-managerPort').value) || 7654,
    };

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Configuration saved!', 'success');
        currentConfig = data.config || cfg;
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    }
}

function browseDirectory() {
    showToast('Opening folder picker...', 'info');
    fetch('/api/browse-directory')
        .then(r => r.json())
        .then(data => {
            if (data.path) {
                document.getElementById('cfg-modelsDir').value = data.path;
                // Also save config so backend knows about the new directory for scanning
                saveConfig().then(() => refreshModelSelect());
            }
        })
        .catch(err => {
            showToast('Failed to open folder picker: ' + err.message, 'error');
        });
}

function refreshModelSelect(selectedPath = null) {
    const select = document.getElementById('cfg-modelPath');
    const prevValue = selectedPath || select.value;

    select.innerHTML = '<option value="">Scanning...</option>';
    select.disabled = true;

    fetch('/api/models')
        .then(r => r.json())
        .then(models => {
            select.disabled = false;

            if (models.length === 0) {
                select.innerHTML = '<option value="">No models found in Models Directory</option>';
                return;
            }

            // Auto-heal logic: if prevValue looks like stripped backslashes, see if there's a match by name
            let healedPrevValue = prevValue;
            if (prevValue && !models.some(m => m.path === prevValue)) {
                const likelyFileName = shortenPath(prevValue).replace(/^.*C:Users.*lama/, '');
                const found = models.find(m => m.name === likelyFileName || prevValue.endsWith(m.name));
                if (found) {
                    healedPrevValue = found.path;
                    // Proactively save to fix the server state
                    setTimeout(() => saveConfig(), 500);
                }
            }

            select.innerHTML = '<option value="">— Select a Model —</option>' +
                models.map(m => {
                    const isSelected = m.path === healedPrevValue ? 'selected' : '';
                    return `<option value="${escapeHtml(m.path)}" ${isSelected}>${escapeHtml(m.name)}  (${m.sizeHuman})</option>`;
                }).join('');

            // If it STILL isn't found even after healing attempt
            if (healedPrevValue && !models.some(m => m.path === healedPrevValue)) {
                select.innerHTML += `<option value="${escapeHtml(healedPrevValue)}" selected>⚠️ ${escapeHtml(shortenPath(healedPrevValue))} (Not Found in Dir)</option>`;
            }
        })
        .catch(err => {
            select.disabled = false;
            select.innerHTML = `<option value="">Error loading models: ${err.message}</option>`;
        });
}

// ============ Models ============

async function refreshModels() {
    const container = document.getElementById('models-list');
    container.innerHTML = '<div class="empty-state">Loading models...</div>';

    try {
        const res = await fetch('/api/models');
        const models = await res.json();

        if (models.length === 0) {
            container.innerHTML = '<div class="empty-state">No models found. Go to Download to get models, or configure the models directory.</div>';
            return;
        }

        container.innerHTML = models.map(m => `
      <div class="model-item">
        <div class="model-info">
          <div class="model-name">${escapeHtml(m.name)}</div>
          <div class="model-meta">
            <span>📦 ${m.sizeHuman}</span>
            <span>📅 ${new Date(m.modified).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="model-actions">
          <button class="btn btn-sm btn-primary" onclick="hotswapModel('${escapeHtml(m.path).replace(/\\/g, '\\\\')}')" title="Load this model">
            ⚡ Load
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteModel('${escapeHtml(m.name)}')" title="Delete this model">
            🗑 Delete
          </button>
        </div>
      </div>
    `).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
}

async function hotswapModel(modelPath) {
    if (!confirm('This will restart the server with the new model. Continue?')) return;

    showToast('Hotswapping model...', 'info');
    try {
        const res = await fetch('/api/hotswap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelPath }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Model hotswapped successfully!', 'success');
    } catch (err) {
        showToast('Hotswap failed: ' + err.message, 'error');
    }
}

async function deleteModel(name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    try {
        const res = await fetch(`/api/models/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Model deleted', 'success');
        refreshModels();
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
}

// ============ Download ============

async function searchModels() {
    const query = document.getElementById('hf-search').value.trim();
    if (!query) return;

    const container = document.getElementById('search-results');
    container.innerHTML = '<div class="empty-state"><span class="spinner"></span> Searching HuggingFace...</div>';

    try {
        const res = await fetch(`/api/models/search?q=${encodeURIComponent(query)}`);
        const results = await res.json();

        if (!res.ok) throw new Error(results.error);

        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state">No GGUF models found. Try a different search.</div>';
            return;
        }

        container.innerHTML = results.map(r => `
      <div class="search-item" onclick="showRepoFiles('${escapeHtml(r.id)}')">
        <div class="search-item-info">
          <div class="search-item-name">${escapeHtml(r.id)}</div>
          <div class="search-item-meta">
            <span>⬇️ ${formatNumber(r.downloads)} downloads</span>
            <span>❤️ ${formatNumber(r.likes)} likes</span>
          </div>
          ${r.tags.length > 0 ? `
            <div class="search-item-tags">
              ${r.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
}

async function showRepoFiles(repoId) {
    const modal = document.getElementById('repo-modal');
    const title = document.getElementById('repo-modal-title');
    const list = document.getElementById('repo-files-list');

    title.textContent = repoId;
    list.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading files...</div>';
    modal.style.display = 'flex';

    try {
        const parts = repoId.split('/');
        const res = await fetch(`/api/models/repo-files/${parts[0]}/${parts[1]}`);
        const files = await res.json();

        if (!res.ok) throw new Error(files.error);

        if (files.length === 0) {
            list.innerHTML = '<div class="empty-state">No GGUF files found in this repo.</div>';
            return;
        }

        list.innerHTML = files.map(f => {
            const filesStr = encodeURIComponent(JSON.stringify(f.files));
            const splitBadge = f.isSplit ? `<span class="badge" style="margin-left: 8px; font-size: 0.75em; background: var(--border-color); padding: 2px 6px; border-radius: 4px;">Split (${f.files.length} parts)</span>` : '';
            return `
      <div class="repo-file-item">
        <div class="repo-file-info">
          <div class="repo-file-name" style="display:flex; align-items:center;">
             ${escapeHtml(f.name)} ${splitBadge}
          </div>
          <div class="repo-file-size">${f.sizeHuman}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="startDownload('${escapeHtml(repoId)}', '${filesStr}')">
          ⬇️ Download
        </button>
      </div>
    `;
        }).join('');
    } catch (err) {
        list.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
}

function closeRepoModal() {
    document.getElementById('repo-modal').style.display = 'none';
}

async function startDownload(repoId, filesJson) {
    try {
        const filenames = JSON.parse(decodeURIComponent(filesJson));
        const res = await fetch('/api/models/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoId, filenames }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast(`Started downloading ${filenames.length > 1 ? filenames[0].split('-00001')[0] + ' (' + filenames.length + ' parts)' : filenames[0]}...`, 'success');
        closeRepoModal();
    } catch (err) {
        showToast('Download failed: ' + err.message, 'error');
    }
}

function updateDownloadsList(downloads) {
    const container = document.getElementById('downloads-list');
    if (!downloads || downloads.length === 0) {
        container.innerHTML = '<div class="empty-state">No active downloads</div>';
        return;
    }

    container.innerHTML = downloads.map(d => {
        const progressClass = d.status === 'complete' ? 'complete' : d.status === 'error' ? 'error' : '';
        return `
      <div class="download-item">
        <div class="download-header">
          <span class="download-filename">${escapeHtml(d.filename)}</span>
          <span class="download-status ${d.status}">${d.status}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${progressClass}" style="width: ${d.progress}%"></div>
        </div>
        <div class="download-meta">
          <span>${d.progress}%</span>
          <span>${formatSize(d.downloaded)} / ${formatSize(d.total)}</span>
          ${d.speed > 0 ? `<span>${formatSize(d.speed)}/s</span>` : ''}
          ${d.error ? `<span style="color: var(--danger)">${escapeHtml(d.error)}</span>` : ''}
        </div>
      </div>
    `;
    }).join('');
}

// ============ Logs ============

function appendLog(entry) {
    const container = document.getElementById('log-container');

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const line = document.createElement('div');
    line.className = 'log-line';

    // Classify logs
    if (entry.text.startsWith('[Manager]')) {
        line.classList.add('manager');
    } else if (/error|Error|ERROR|failed|Failed/.test(entry.text)) {
        line.classList.add('error');
    } else if (/warn|Warn|WARN/.test(entry.text)) {
        line.classList.add('warn');
    }

    const ts = new Date(entry.ts).toLocaleTimeString();
    line.innerHTML = `<span class="log-ts">${ts}</span>${escapeHtml(entry.text)}`;
    container.appendChild(line);

    // Keep max lines in DOM for memory efficiency
    while (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }

    // Auto-scroll
    const autoScroll = document.getElementById('log-autoscroll');
    if (autoScroll && autoScroll.checked) {
        container.scrollTop = container.scrollHeight;
    }
}

function clearLogView() {
    const container = document.getElementById('log-container');
    container.innerHTML = '<div class="empty-state">Logs cleared. New logs will appear here.</div>';
}

// ============ Helpers ============

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function shortenPath(p) {
    if (!p) return '';
    const parts = p.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============ Init ============

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    loadConfig();

    // Poll status initially
    fetch('/api/status')
        .then(r => r.json())
        .then(data => updateDashboard(data))
        .catch(() => { });
});
