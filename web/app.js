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
    if (page === 'presets') refreshPresets();
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
    const btnStart = document.getElementById('btn-start');
    if (data.status === 'running') {
        btnStart.disabled = false;
        btnStart.className = 'btn btn-warning';
        btnStart.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg> Restart Server`;
        btnStart.onclick = restartServer;
    } else {
        btnStart.disabled = data.status === 'starting';
        btnStart.className = 'btn btn-success';
        btnStart.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Server`;
        btnStart.onclick = startServer;
    }

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
    if (data.metrics) {
        // llama-server Prometheus: tokens_predicted_seconds = t/s throughput
        const tps = data.metrics.tokens_predicted_seconds ||
            data.metrics.predicted_tokens_seconds ||
            data.metrics.t_token_generation_mean;
        if (tps !== undefined && tps > 0) {
            speedVal.textContent = `${tps.toFixed(2)} t/s`;
        } else if (data.health && data.health.tokens_per_second > 0) {
            speedVal.textContent = `${data.health.tokens_per_second.toFixed(2)} t/s`;
        } else {
            speedVal.textContent = '—';
        }
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

    // KV Cache
    const kvVal = document.getElementById('stat-kv-value');
    const kvTokens = document.getElementById('stat-kv-tokens');
    const kvBarFill = document.getElementById('kv-bar-fill');
    if (kvVal && data.metrics && data.metrics.kv_cache_usage_ratio !== undefined) {
        const ratio = data.metrics.kv_cache_usage_ratio;
        const pct = (ratio * 100).toFixed(1);
        kvVal.textContent = `${pct}%`;
        if (kvBarFill) {
            kvBarFill.style.width = `${Math.min(pct, 100)}%`;
            kvBarFill.className = 'kv-bar-fill' +
                (ratio > 0.85 ? ' kv-bar-danger' : ratio > 0.6 ? ' kv-bar-warn' : '');
        }
        // token count key is kv_cache_tokens_count in Prometheus output
        const tokCount = data.metrics.kv_cache_tokens_count ?? data.metrics.kv_cache_tokens;
        if (kvTokens && tokCount !== undefined) {
            kvTokens.textContent = `${Math.round(tokCount).toLocaleString()} tokens`;
        } else if (kvTokens) {
            kvTokens.textContent = '';
        }
    } else if (kvVal) {
        kvVal.textContent = '—';
        if (kvBarFill) kvBarFill.style.width = '0%';
        if (kvTokens) kvTokens.textContent = '';
    }

    // Requests processing / deferred
    const reqProcessing = document.getElementById('stat-req-processing');
    const reqDeferred = document.getElementById('stat-req-deferred');
    if (reqProcessing && data.metrics) {
        const proc = data.metrics.requests_processing;
        const deferred = data.metrics.requests_deferred;
        reqProcessing.textContent = proc !== undefined ? `${Math.round(proc)} active` : '—';
        if (reqDeferred && deferred !== undefined) {
            reqDeferred.textContent = deferred > 0 ? `${Math.round(deferred)} queued` : '';
        }
    } else if (reqProcessing) {
        reqProcessing.textContent = '—';
    }

    // Total tokens lifetime
    const totalGen = document.getElementById('stat-total-gen');
    const totalPrompt = document.getElementById('stat-total-prompt');
    if (totalGen && data.metrics && data.metrics.tokens_predicted_total !== undefined) {
        totalGen.textContent = formatNumber(data.metrics.tokens_predicted_total) + ' gen';
        if (totalPrompt && data.metrics.prompt_tokens_total !== undefined) {
            totalPrompt.textContent = formatNumber(data.metrics.prompt_tokens_total) + ' prompt';
        }
    } else if (totalGen) {
        totalGen.textContent = '—';
        if (totalPrompt) totalPrompt.textContent = '';
    }

    // Active Models from /v1/models
    updateActiveModels(data.activeModels);
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

function updateServerConfig(data) {
    const container = document.getElementById('current-model-info');
    if (!data) {
        container.innerHTML = '<div class="empty-state">No model loaded</div>';
        return;
    }

    // Check if we're in preset mode with active preset data
    if (data.activePreset && data.activePreset.models && data.activePreset.models.length > 0) {
        const preset = data.activePreset;
        let html = `<div class="preset-header">`;
        html += `<div class="preset-title">📋 Active Preset: ${escapeHtml(preset.name)}</div>`;
        if (preset.description) {
            html += `<div class="preset-description">${escapeHtml(preset.description)}</div>`;
        }
        html += `</div>`;

        // Display each model with its configuration
        for (const model of preset.models) {
            html += `<div class="preset-model-item">`;
            html += `<div class="preset-model-header">${escapeHtml(model.identifier)}</div>`;
            html += `<div class="preset-model-detail">`;
            html += `<span class="model-detail-label">Path:</span> `;
            html += `<span class="model-detail-value">${escapeHtml(shortenPath(model.modelPath))}</span>`;
            html += `</div>`;

            // Build configuration details
            const configDetails = [];

            // Model configuration
            if (model.ctxSize) configDetails.push(`Ctx: ${model.ctxSize}`);
            if (model.gpuLayers !== undefined && model.gpuLayers !== '') configDetails.push(`GPU Layers: ${model.gpuLayers}`);
            if (model.threads && model.threads > 0) configDetails.push(`Threads: ${model.threads}`);
            if (model.cacheTypeK) configDetails.push(`Cache K: ${model.cacheTypeK}`);
            if (model.cacheTypeV) configDetails.push(`Cache V: ${model.cacheTypeV}`);
            if (model.flashAttn) configDetails.push(`Flash Attn: on`);
            if (model.contBatching) configDetails.push(`Cont. Batching: on`);
            if (model.mmap) configDetails.push(`MMap: on`);
            if (model.mlock) configDetails.push(`MLock: on`);
            if (model.cachePrompt) configDetails.push(`Prompt Cache: on`);

            // Generation parameters
            const genParams = [];
            if (model.temp !== undefined) genParams.push(`Temp: ${model.temp}`);
            if (model.topK) genParams.push(`Top K: ${model.topK}`);
            if (model.topP) genParams.push(`Top P: ${model.topP}`);
            if (model.minP) genParams.push(`Min P: ${model.minP}`);
            if (model.repeatPenalty) genParams.push(`Rep. Pen: ${model.repeatPenalty}`);

            if (configDetails.length > 0) {
                html += `<div class="preset-model-detail">`;
                html += `<span class="model-detail-label">Config:</span> `;
                html += `<span class="model-detail-value">${configDetails.join(' | ')}</span>`;
                html += `</div>`;
            }

            if (genParams.length > 0) {
                html += `<div class="preset-model-detail">`;
                html += `<span class="model-detail-label">Generation:</span> `;
                html += `<span class="model-detail-value">${genParams.join(' | ')}</span>`;
                html += `</div>`;
            }

            if (model.mmprojPath) {
                html += `<div class="preset-model-detail">`;
                html += `<span class="model-detail-label">Vision:</span> `;
                html += `<span class="model-detail-value">${escapeHtml(shortenPath(model.mmprojPath))}</span>`;
                html += `</div>`;
            }

            // Effective args for this model
            const modelArgs = data.effectiveArgsByModel && data.effectiveArgsByModel[model.identifier];
            if (modelArgs) {
                html += `<div class="server-args-strip">`;
                html += `<span class="server-args-label">Args</span>`;
                html += `<code class="server-args-value">${escapeHtml(modelArgs)}</code>`;
                html += `</div>`;
            }

            html += `</div>`;
        }


        container.innerHTML = html;
    } else if (data.config && data.config.modelPath) {
        // Single model mode
        let html = `<div class="model-path-display">${escapeHtml(data.config.modelPath)}</div>`;

        if (data.serverArgs) {
            html += `<div class="server-args-strip">`;
            html += `<span class="server-args-label">Server Args</span>`;
            html += `<code class="server-args-value">${escapeHtml(data.serverArgs)}</code>`;
            html += `</div>`;
        }

        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="empty-state">No model loaded</div>';
    }
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
        showToast('Server is stopping...', 'info');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
    }
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop Server`;
    btn.disabled = true;
}

async function restartServer() {
    const btn = document.getElementById('btn-start');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Restarting...';
    try {
        const res = await fetch('/api/restart', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to restart');
        showToast('Server is restarting...', 'success');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg> Restart Server`;
    }
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
        'host', 'port', 'apiKey',
        'extraArgs', 'modelsDir', 'managerPort', 'modelsPresetPath',
        'parallel', 'sleepIdleSeconds'
    ];
    for (const field of fields) {
        const el = document.getElementById(`cfg-${field}`);
        if (el && cfg[field] !== undefined) {
            el.value = cfg[field];
        }
    }

    // Checkboxes
    const toggles = ['contBatching', 'mlock', 'mmap', 'cachePrompt', 'metrics', 'slots',
        'usePresetMode', 'logDisable', 'jinja', 'enableProps'];
    for (const field of toggles) {
        const el = document.getElementById(`cfg-${field}`);
        if (el && cfg[field] !== undefined) {
            el.checked = cfg[field];
        }
    }
}

async function saveConfig() {
    const cfg = {
        host: document.getElementById('cfg-host').value,
        port: parseInt(document.getElementById('cfg-port').value) || 8080,
        contBatching: document.getElementById('cfg-contBatching').checked,
        mlock: document.getElementById('cfg-mlock').checked,
        mmap: document.getElementById('cfg-mmap').checked,
        cachePrompt: document.getElementById('cfg-cachePrompt').checked,
        metrics: document.getElementById('cfg-metrics').checked,
        slots: document.getElementById('cfg-slots').checked,
        apiKey: document.getElementById('cfg-apiKey').value,
        extraArgs: document.getElementById('cfg-extraArgs').value,
        modelsDir: document.getElementById('cfg-modelsDir').value,
        managerPort: parseInt(document.getElementById('cfg-managerPort').value) || 7654,
        usePresetMode: document.getElementById('cfg-usePresetMode').checked,
        modelsPresetPath: document.getElementById('cfg-modelsPresetPath').value,
        logDisable: document.getElementById('cfg-logDisable').checked,
        parallel: parseInt(document.getElementById('cfg-parallel')?.value) || 1,
        sleepIdleSeconds: parseInt(document.getElementById('cfg-sleepIdleSeconds')?.value) || 0,
        jinja: document.getElementById('cfg-jinja')?.checked || false,
        enableProps: document.getElementById('cfg-enableProps')?.checked || false,
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
                // Also save config so backend knows about the new directory
                saveConfig();
            }
        })
        .catch(err => {
            showToast('Failed to open folder picker: ' + err.message, 'error');
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

        container.innerHTML = models.map(m => {
            const badges = [];
            if (m.isLegacy) badges.push('<span class="tag" style="background:var(--warning-bg);color:var(--warning)">Legacy</span>');
            if (m.isSplit) badges.push(`<span class="tag">Split: ${m.fileCount} files</span>`);
            if (m.hasMmproj) badges.push('<span class="tag">Vision</span>');

            return `
      <div class="model-item">
        <div class="model-info">
          <div class="model-name">
            ${escapeHtml(m.name)}
            ${badges.length > 0 ? '<div style="display:flex;gap:6px;margin-top:4px;">' + badges.join('') + '</div>' : ''}
          </div>
          <div class="model-meta">
            <span>📦 ${m.sizeHuman}</span>
            <span>📅 ${new Date(m.modified).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="model-actions">
          <button class="btn btn-sm btn-primary" onclick="hotswapModel('${escapeHtml(m.path).replace(/\\/g, '\\\\')}')" title="Load this model">
            ⚡ Load
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteModel('${escapeHtml(m.isLegacy ? m.name : m.name)}')" title="Delete this model">
            🗑 Delete
          </button>
        </div>
      </div>
    `;
        }).join('');
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

// ============ Download ============

function toggleClearButton() {
    const input = document.getElementById('hf-search');
    const clearBtn = document.getElementById('btn-clear');
    clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
}

function clearSearch() {
    document.getElementById('hf-search').value = '';
    toggleClearButton();
    document.getElementById('search-results').innerHTML = '';
}

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
        const isDownloading = d.status === 'downloading';
        const isPaused = d.status === 'paused';
        const canPause = isDownloading;
        const canResume = isPaused;
        const canStop = isDownloading || isPaused;

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
        <div class="download-controls">
          ${canPause ? `<button class="btn btn-sm btn-secondary" onclick="pauseDownload('${d.id}')">⏸ Pause</button>` : ''}
          ${canResume ? `<button class="btn btn-sm btn-primary" onclick="resumeDownload('${d.id}')">▶ Resume</button>` : ''}
          ${canStop ? `<button class="btn btn-sm btn-danger" onclick="stopDownload('${d.id}')">⏹ Stop</button>` : ''}
        </div>
      </div>
    `;
    }).join('');
}

// ============ Download Controls ============

async function pauseDownload(id) {
    try {
        const res = await fetch(`/api/downloads/${id}/pause`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Download paused', 'info');
    } catch (err) {
        showToast('Failed to pause: ' + err.message, 'error');
    }
}

async function resumeDownload(id) {
    try {
        const res = await fetch(`/api/downloads/${id}/resume`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Download resumed', 'info');
    } catch (err) {
        showToast('Failed to resume: ' + err.message, 'error');
    }
}

async function stopDownload(id) {
    try {
        const res = await fetch(`/api/downloads/${id}/stop`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Download stopped', 'info');
    } catch (err) {
        showToast('Failed to stop: ' + err.message, 'error');
    }
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

// ============ Active Models Panel ============

function updateActiveModels(activeModels) {
    const card = document.getElementById('active-models-card');
    const list = document.getElementById('active-models-list');
    const badge = document.getElementById('active-models-badge');
    if (!card || !list) return;

    if (!activeModels || activeModels.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    if (badge) badge.textContent = activeModels.length;

    list.innerHTML = activeModels.map(m => `
        <div class="active-model-item">
            <div class="active-model-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
            </div>
            <div class="active-model-info">
                <span class="active-model-id">${escapeHtml(m.id)}</span>
                <span class="active-model-meta">${escapeHtml(m.owned_by || 'llamacpp')}</span>
            </div>
            <span class="active-model-status">● live</span>
        </div>
    `).join('');
}

// ============ Live Props ============

function showPropsModal() {
    const modal = document.getElementById('props-modal');
    if (!modal) return;

    // Reset thinking radio to default
    const thinkingDefault = document.getElementById('props-thinking-default');
    if (thinkingDefault) thinkingDefault.checked = true;

    // Pre-fill with current props if available
    const props = currentStatus.props;
    if (props) {
        const sysprompt = document.getElementById('props-system-prompt');
        const assistantName = document.getElementById('props-assistant-name');
        if (sysprompt && props.default_generation_settings?.system_prompt !== undefined) {
            sysprompt.value = props.default_generation_settings.system_prompt || '';
        }
        if (assistantName && props.assistant_name) {
            assistantName.value = props.assistant_name;
        }
        // Restore thinking state from current props
        if (props.enable_thinking === true && document.getElementById('props-thinking-on')) document.getElementById('props-thinking-on').checked = true;
        if (props.enable_thinking === false && document.getElementById('props-thinking-off')) document.getElementById('props-thinking-off').checked = true;
    }

    // Show notice if --props isn't enabled
    const notice = document.getElementById('props-notice');
    if (notice) {
        const enableProps = currentStatus.config?.enableProps;
        notice.style.display = enableProps ? 'none' : 'flex';
    }

    modal.style.display = 'flex';
}

function closePropsModal() {
    const modal = document.getElementById('props-modal');
    if (modal) modal.style.display = 'none';
}

async function applyProps() {
    const btn = document.getElementById('btn-apply-props');
    const systemPrompt = document.getElementById('props-system-prompt')?.value;
    const assistantName = document.getElementById('props-assistant-name')?.value;
    const thinkingRadio = document.querySelector('input[name="props-thinking"]:checked')?.value;

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Applying...'; }

    try {
        const payload = {};
        if (systemPrompt !== undefined) payload.system_prompt = systemPrompt;
        if (assistantName) payload.assistant_name = assistantName;

        // Send enable_thinking top-level (direct API compat)
        // AND as chat_template_kwargs (what llama-server /props understands for Jinja templates)
        // Ref: https://unsloth.ai/docs/models/qwen3.5#how-to-enable-or-disable-reasoning-and-thinking
        if (thinkingRadio === 'true' || thinkingRadio === 'false') {
            const val = thinkingRadio === 'true';
            payload.enable_thinking = val;
            payload.chat_template_kwargs = { enable_thinking: val };
        }
        // 'default' = omit entirely

        const res = await fetch('/api/props', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Prompt injected successfully!', 'success');
        closePropsModal();
    } catch (err) {
        showToast('Failed: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg> Apply Now';
        }
    }
}

// ============ Presets ============

let currentEditingPresetId = null;
let availableModelsForPreset = [];

function calculateTotalPresetSize(models, modelSizes) {
    let totalBytes = 0;
    const sizes = [];

    models.forEach(m => {
        const sizeStr = modelSizes.get(m.modelPath);
        if (sizeStr && sizeStr !== '—') {
            // Parse human-readable size back to bytes
            const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
            if (match) {
                const value = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 * 1024, 'GB': 1024 * 1024 * 1024 };
                totalBytes += value * multipliers[unit];
            }
        }
    });

    // Convert total bytes to human-readable format
    if (totalBytes === 0) {
        return 'Unknown';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let sizeValue = totalBytes;

    while (sizeValue >= 1024 && unitIndex < units.length - 1) {
        sizeValue /= 1024;
        unitIndex++;
    }

    return `${sizeValue.toFixed(sizeValue < 10 ? 2 : 1)} ${units[unitIndex]}`;
}

async function refreshPresets() {
    const container = document.getElementById('presets-list');
    const banner = document.getElementById('active-preset-banner');
    container.innerHTML = '<div class="empty-state">Loading presets...</div>';

    try {
        // Load presets, config and models in parallel
        const [presetsRes, configRes, modelsRes] = await Promise.all([
            fetch('/api/presets'),
            fetch('/api/config'),
            fetch('/api/models'),
        ]);

        const presets = await presetsRes.json();
        const cfg = await configRes.json();
        const models = await modelsRes.json();

        // Create a map of model paths to their size info for quick lookup
        const modelSizes = new Map();
        models.forEach(m => {
            modelSizes.set(m.path, m.sizeHuman);
        });

        // Update active preset banner
        if (cfg.usePresetMode && cfg.activePresetId) {
            const activePreset = presets.find(p => p.id === cfg.activePresetId);
            if (activePreset) {
                document.getElementById('active-preset-name').textContent = activePreset.name;
                document.getElementById('active-preset-models').textContent =
                    `${activePreset.models.length} model${activePreset.models.length > 1 ? 's' : ''}`;
                banner.style.display = 'flex';
            } else {
                banner.style.display = 'none';
            }
        } else {
            banner.style.display = 'none';
        }

        if (presets.length === 0) {
            container.innerHTML = '<div class="empty-state">No presets found. Create a new preset to manage multiple models.</div>';
            return;
        }

        container.innerHTML = presets.map(p => {
            const isActive = cfg.activePresetId === p.id;
            const activeBadge = isActive ? '<span class="tag" style="background:var(--success-bg);color:var(--success)">Active</span>' : '';

            return `
        <div class="preset-item">
          <div class="preset-header">
            <div class="preset-title">
              <div class="preset-name">
                ${escapeHtml(p.name)}
                ${activeBadge}
              </div>
              <div class="preset-description">${escapeHtml(p.description || 'No description')}</div>
            </div>
            <div class="preset-actions">
              ${!isActive ? `
                <button class="btn btn-sm btn-success" onclick="activatePreset('${p.id}')" title="Activate this preset">
                  ✓ Activate
                </button>
              ` : ''}
              <button class="btn btn-sm btn-secondary" onclick="editPreset('${p.id}')" title="Edit this preset">
                ✏️ Edit
              </button>
              <button class="btn btn-sm btn-danger" onclick="deletePreset('${p.id}', '${escapeHtml(p.name).replace(/'/g, "\\'")}')" title="Delete this preset">
                🗑 Delete
              </button>
            </div>
          </div>
          <div class="preset-meta">
            <span>📅 ${new Date(p.updatedAt).toLocaleDateString()}</span>
            <span>🧠 ${p.models.length} model${p.models.length > 1 ? 's' : ''}</span>
          </div>
          <div class="preset-models-list">
            ${p.models.map(m => {
              const params = [];
                if (m.ctxSize && m.ctxSize !== 4096) params.push(`ctx:${m.ctxSize}`);
                if (m.gpuLayers) params.push(`ngl:${m.gpuLayers}`);
                if (m.temp && m.temp !== 0.8) params.push(`temp:${m.temp}`);
                if (m.topP && m.topP !== 0.95) params.push(`top_p:${m.topP}`);
                const paramsStr = params.length > 0 ? `<span style="color:var(--text-dim);font-size:0.75rem;margin-left:8px;">(${params.join(', ')})</span>` : '';

                // Look up model size from available models
                const size = modelSizes.get(m.modelPath) || '—';

                return `
              <div class="preset-model-item">
                <div style="display:flex;align-items:center;gap:8px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  <span class="preset-model-identifier" style="font-weight:500;">${escapeHtml(m.identifier)}</span>
                  <span style="color:var(--text-dim);font-size:0.85rem;">📦 ${size}</span>
                </div>
                ${paramsStr}
              </div>
            `;
            }).join('')}
          </div>
        </div>
      `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
}

async function activatePreset(id) {
    showToast('Activating preset...', 'info');
    try {
        const res = await fetch(`/api/presets/${id}/activate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Preset activated! Restart the server to apply.', 'success');
        refreshPresets();
    } catch (err) {
        showToast('Failed to activate: ' + err.message, 'error');
    }
}

async function deactivatePreset() {
    showToast('Deactivating preset mode...', 'info');
    try {
        const res = await fetch('/api/presets/deactivate', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Preset mode deactivated.', 'success');
        refreshPresets();
    } catch (err) {
        showToast('Failed to deactivate: ' + err.message, 'error');
    }
}

function showCreatePresetModal() {
    currentEditingPresetId = null;
    document.getElementById('preset-modal-title').textContent = 'Create Preset';
    document.getElementById('preset-name').value = '';
    document.getElementById('preset-description').value = '';
    document.getElementById('preset-models-editor').innerHTML = '';

    // Add first model slot
    addPresetModel();

    document.getElementById('preset-modal').style.display = 'flex';
}

function editPreset(id) {
    fetch(`/api/presets/${id}`)
        .then(r => r.json())
        .then(preset => {
            currentEditingPresetId = id;
            document.getElementById('preset-modal-title').textContent = 'Edit Preset';
            document.getElementById('preset-name').value = preset.name;
            document.getElementById('preset-description').value = preset.description || '';

            // Load models into editor
            const editor = document.getElementById('preset-models-editor');
            editor.innerHTML = '';
            preset.models.forEach(model => {
                addPresetModel(model);
            });

            document.getElementById('preset-modal').style.display = 'flex';
        })
        .catch(err => {
            showToast('Failed to load preset: ' + err.message, 'error');
        });
}

function closePresetModal() {
    document.getElementById('preset-modal').style.display = 'none';
    currentEditingPresetId = null;
}

async function addPresetModel(existingModel = null) {
    const editor = document.getElementById('preset-models-editor');

    // Fetch available models if not already loaded
    if (availableModelsForPreset.length === 0) {
        try {
            const res = await fetch('/api/models');
            availableModelsForPreset = await res.json();
        } catch (err) {
            showToast('Failed to load models', 'error');
            return;
        }
    }

    const modelIndex = editor.children.length;
    const modelDiv = document.createElement('div');
    modelDiv.className = 'preset-model-editor-item';

    // Helper to get value from existing model - NO DEFAULTS when editing
    // If field doesn't exist in existingModel, return undefined so field stays empty
    const val = (field) => existingModel && existingModel[field] !== undefined ? existingModel[field] : undefined;
    const valStr = (field) => existingModel && existingModel[field] !== undefined ? String(existingModel[field]) : '';

    modelDiv.innerHTML = `
        <div class="preset-model-header">
            <div class="form-group">
                <label>Identifier *</label>
                <input type="text" class="preset-model-identifier-input" placeholder="llama-2-7b" value="${escapeHtml(valStr('identifier'))}" required>
            </div>
            <div class="form-group">
                <label>Model Path *</label>
                <select class="preset-model-path-select" required>
                    <option value="">Select a model...</option>
                    ${availableModelsForPreset.map(m => {
        const selected = existingModel && existingModel.modelPath === m.path ? 'selected' : '';
        return `<option value="${escapeHtml(m.path)}" ${selected}>${escapeHtml(m.name)} (${m.sizeHuman})</option>`;
    }).join('')}
                </select>
            </div>
            <button type="button" class="btn btn-sm btn-danger btn-remove-model" onclick="this.closest('.preset-model-editor-item').remove();">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
            </button>
        </div>

        <div class="preset-model-config">
            <!-- Server Arguments Section -->
            <div class="preset-model-config-section" onclick="togglePresetConfigSection(this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>Server Arguments</span>
            </div>
            <div class="preset-model-config-fields expanded">
                <div class="form-group">
                    <label>Context Size</label>
                    <input type="number" class="preset-model-ctx-size" value="${valStr('ctxSize')}" placeholder="4096">
                </div>
                <div class="form-group">
                    <label>GPU Layers</label>
                    <input type="text" class="preset-model-gpu-layers" value="${escapeHtml(valStr('gpuLayers'))}" placeholder="99 or auto">
                </div>
                <div class="form-group">
                    <label>Threads</label>
                    <input type="number" class="preset-model-threads" value="${valStr('threads')}" placeholder="-1 for auto">
                </div>
                <div class="form-group">
                    <label>Threads Batch</label>
                    <input type="number" class="preset-model-threads-batch" value="${valStr('threadsBatch')}" placeholder="-1 for auto">
                </div>
                <div class="form-group">
                    <label>Batch Size</label>
                    <input type="number" class="preset-model-batch-size" value="${valStr('batchSize')}" placeholder="2048">
                </div>
                <div class="form-group">
                    <label>Micro Batch Size</label>
                    <input type="number" class="preset-model-ubatch-size" value="${valStr('ubatchSize')}" placeholder="512">
                </div>
                <div class="form-group">
                    <label>Flash Attention</label>
                    <select class="preset-model-flash-attn">
                        <option value="" ${!val('flashAttn') ? 'selected' : ''}>Default</option>
                        <option value="on" ${val('flashAttn') === 'on' ? 'selected' : ''}>On</option>
                        <option value="off" ${val('flashAttn') === 'off' ? 'selected' : ''}>Off</option>
                        <option value="auto" ${val('flashAttn') === 'auto' ? 'selected' : ''}>Auto</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Split Mode</label>
                    <select class="preset-model-split-mode">
                        <option value="" ${!val('splitMode') ? 'selected' : ''}>Default</option>
                        <option value="layer" ${val('splitMode') === 'layer' ? 'selected' : ''}>Layer</option>
                        <option value="row" ${val('splitMode') === 'row' ? 'selected' : ''}>Row</option>
                        <option value="none" ${val('splitMode') === 'none' ? 'selected' : ''}>None</option>
                    </select>
                </div>
            </div>

            <!-- Memory Options Section -->
            <div class="preset-model-config-section" onclick="togglePresetConfigSection(this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>Memory Options</span>
            </div>
            <div class="preset-model-config-fields">
                <!-- First row: Dropdowns -->
                <div class="form-group">
                    <label>Cache Type K</label>
                    <select class="preset-model-cache-type-k">
                        <option value="none" ${!val('cacheTypeK') || val('cacheTypeK') === 'none' ? 'selected' : ''}>default (f16) — slow</option>
                        <option value="q4_0" ${val('cacheTypeK') === 'q4_0' ? 'selected' : ''}>q4_0 — recommended ⚡</option>
                        <option value="q8_0" ${val('cacheTypeK') === 'q8_0' ? 'selected' : ''}>q8_0 — balanced</option>
                        <option value="f16" ${val('cacheTypeK') === 'f16' ? 'selected' : ''}>f16 — full precision</option>
                        <option value="bf16" ${val('cacheTypeK') === 'bf16' ? 'selected' : ''}>bf16</option>
                        <option value="f32" ${val('cacheTypeK') === 'f32' ? 'selected' : ''}>f32</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Cache Type V</label>
                    <select class="preset-model-cache-type-v">
                        <option value="none" ${!val('cacheTypeV') || val('cacheTypeV') === 'none' ? 'selected' : ''}>default (f16) — slow</option>
                        <option value="q4_0" ${val('cacheTypeV') === 'q4_0' ? 'selected' : ''}>q4_0 — recommended ⚡</option>
                        <option value="q8_0" ${val('cacheTypeV') === 'q8_0' ? 'selected' : ''}>q8_0 — balanced</option>
                        <option value="f16" ${val('cacheTypeV') === 'f16' ? 'selected' : ''}>f16 — full precision</option>
                        <option value="bf16" ${val('cacheTypeV') === 'bf16' ? 'selected' : ''}>bf16</option>
                        <option value="f32" ${val('cacheTypeV') === 'f32' ? 'selected' : ''}>f32</option>
                    </select>
                </div>
                <div class="kv-cache-hint">
                    ⚡ <strong>q4_0</strong> reduces KV cache VRAM by ~4× — critical for large context (32k+). Requires Flash Attention.
                </div>
                <!-- Second row: Checkboxes -->
                <div class="checkbox-row">
                    <label class="checkbox-label">
                        <input type="checkbox" class="preset-model-mlock" ${val('mlock') ? 'checked' : ''}>
                        <span>Memory Lock (mlock)</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="preset-model-mmap" ${val('mmap') !== false ? 'checked' : ''}>
                        <span>Memory Map (mmap)</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="preset-model-cache-prompt" ${val('cachePrompt') ? 'checked' : ''}>
                        <span>Prompt Caching</span>
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" class="preset-model-load-mmproj" ${val('loadMmproj') ? 'checked' : ''}>
                        <span>Load MMProj</span>
                    </label>
                </div>
            </div>

            <!-- Generation Parameters Section -->
            <div class="preset-model-config-section" onclick="togglePresetConfigSection(this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>Generation Parameters</span>
            </div>
            <div class="preset-model-config-fields">
                <div class="form-group">
                    <label>Temperature</label>
                    <input type="number" step="0.1" min="0" max="2" class="preset-model-temp" value="${valStr('temp')}" placeholder="0.8">
                </div>
                <div class="form-group">
                    <label>Top K</label>
                    <input type="number" min="0" class="preset-model-top-k" value="${valStr('topK')}" placeholder="40">
                </div>
                <div class="form-group">
                    <label>Top P</label>
                    <input type="number" step="0.01" min="0" max="1" class="preset-model-top-p" value="${valStr('topP')}" placeholder="0.9">
                </div>
                <div class="form-group">
                    <label>Min P</label>
                    <input type="number" step="0.01" min="0" max="1" class="preset-model-min-p" value="${valStr('minP')}" placeholder="0.05">
                </div>
                <div class="form-group">
                    <label>Repeat Penalty</label>
                    <input type="number" step="0.1" min="0" class="preset-model-repeat-penalty" value="${valStr('repeatPenalty')}" placeholder="1.1">
                </div>
                <div class="form-group">
                    <label>Presence Penalty</label>
                    <input type="number" step="0.1" min="0" class="preset-model-presence-penalty" value="${valStr('presencePenalty')}" placeholder="0.0">
                </div>
                <!-- Thinking Mode -->
                <div class="form-group full-width" style="grid-column:1/-1;">
                    <label>🧠 Thinking Mode</label>
                    <select class="preset-model-thinking">
                        <option value="" ${!val('thinking') && val('thinking') !== false ? 'selected' : ''}>Default (model decides)</option>
                        <option value="true" ${val('thinking') === true || val('thinking') === 'true' ? 'selected' : ''}>Enabled — show chain of thought</option>
                        <option value="false" ${val('thinking') === false || val('thinking') === 'false' ? 'selected' : ''}>Disabled — no thinking tokens</option>
                    </select>
                    <small>Writes <code>chat-template-kwargs = {"enable_thinking":false}</code> to the INI. Requires <strong>Jinja2 (--jinja)</strong> in Configuration → Advanced. For live switching, use the ⚡ Inject Prompt button.</small>
                </div>
            </div>
        </div>
    `;
    editor.appendChild(modelDiv);
}

function togglePresetConfigSection(header) {
    header.classList.toggle('expanded');
    const fields = header.nextElementSibling;
    fields.classList.toggle('expanded');
}

async function savePreset() {
    const name = document.getElementById('preset-name').value.trim();
    const description = document.getElementById('preset-description').value.trim();

    if (!name) {
        showToast('Name is required', 'error');
        return;
    }

    // Collect models from editor
    const modelEditors = document.querySelectorAll('.preset-model-editor-item');
    const models = [];
    let hasError = false;

    for (const editor of modelEditors) {
        const identifier = editor.querySelector('.preset-model-identifier-input').value.trim();
        const modelPath = editor.querySelector('.preset-model-path-select').value;

        if (!identifier || !modelPath) {
            hasError = true;
            break;
        }

        // Collect all parameters from the form - only include if value is set
        const modelConfig = {
            identifier,
            modelPath,
        };

        // Helper to add optional values
        const addIfSet = (key, value, skipEmptyString = true) => {
            if (value !== undefined && value !== null && value !== '' && !Number.isNaN(value)) {
                modelConfig[key] = value;
            }
        };

        // Server arguments
        const ctxSizeVal = parseInt(editor.querySelector('.preset-model-ctx-size')?.value);
        addIfSet('ctxSize', ctxSizeVal);

        const gpuLayersVal = editor.querySelector('.preset-model-gpu-layers')?.value;
        addIfSet('gpuLayers', gpuLayersVal);

        const threadsVal = parseInt(editor.querySelector('.preset-model-threads')?.value);
        addIfSet('threads', threadsVal);

        const threadsBatchVal = parseInt(editor.querySelector('.preset-model-threads-batch')?.value);
        addIfSet('threadsBatch', threadsBatchVal);

        const batchSizeVal = parseInt(editor.querySelector('.preset-model-batch-size')?.value);
        addIfSet('batchSize', batchSizeVal);

        const ubatchSizeVal = parseInt(editor.querySelector('.preset-model-ubatch-size')?.value);
        addIfSet('ubatchSize', ubatchSizeVal);

        const flashAttnVal = editor.querySelector('.preset-model-flash-attn')?.value;
        addIfSet('flashAttn', flashAttnVal);

        const splitModeVal = editor.querySelector('.preset-model-split-mode')?.value;
        addIfSet('splitMode', splitModeVal);

        // Memory options
        const cacheTypeKVal = editor.querySelector('.preset-model-cache-type-k')?.value;
        addIfSet('cacheTypeK', cacheTypeKVal);

        const cacheTypeVVal = editor.querySelector('.preset-model-cache-type-v')?.value;
        addIfSet('cacheTypeV', cacheTypeVVal);

        const mlockVal = editor.querySelector('.preset-model-mlock')?.checked;
        if (mlockVal) modelConfig.mlock = true;

        const mmapVal = editor.querySelector('.preset-model-mmap')?.checked;
        if (mmapVal !== false && mmapVal !== undefined) modelConfig.mmap = mmapVal;

        const cachePromptVal = editor.querySelector('.preset-model-cache-prompt')?.checked;
        if (cachePromptVal) modelConfig.cachePrompt = true;

        const loadMmprojVal = editor.querySelector('.preset-model-load-mmproj')?.checked;
        if (loadMmprojVal) modelConfig.loadMmproj = true;

        // Generation parameters
        const tempVal = parseFloat(editor.querySelector('.preset-model-temp')?.value);
        addIfSet('temp', tempVal);

        const topKVal = parseInt(editor.querySelector('.preset-model-top-k')?.value);
        addIfSet('topK', topKVal);

        const topPVal = parseFloat(editor.querySelector('.preset-model-top-p')?.value);
        addIfSet('topP', topPVal);

        const minPVal = parseFloat(editor.querySelector('.preset-model-min-p')?.value);
        addIfSet('minP', minPVal);

        const repeatPenaltyVal = parseFloat(editor.querySelector('.preset-model-repeat-penalty')?.value);
        addIfSet('repeatPenalty', repeatPenaltyVal);

        const presencePenaltyVal = parseFloat(editor.querySelector('.preset-model-presence-penalty')?.value);
        addIfSet('presencePenalty', presencePenaltyVal);

        // Thinking mode (tri-state: '' = default, 'true' = on, 'false' = off)
        const thinkingRaw = editor.querySelector('.preset-model-thinking')?.value;
        if (thinkingRaw === 'true') modelConfig.thinking = true;
        if (thinkingRaw === 'false') modelConfig.thinking = false;
        // empty string = default, don't set

        models.push(modelConfig);
    }

    if (hasError || models.length === 0) {
        showToast('Please add at least one model with identifier and path', 'error');
        return;
    }

    const presetData = {
        name,
        description,
        models,
    };

    try {
        const url = currentEditingPresetId
            ? `/api/presets/${currentEditingPresetId}`
            : '/api/presets';
        const method = currentEditingPresetId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(presetData),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(currentEditingPresetId ? 'Preset updated!' : 'Preset created!', 'success');
        closePresetModal();
        refreshPresets();
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    }
}

async function deletePreset(id, name) {
    if (!confirm(`Delete preset "${name}"? This cannot be undone.`)) return;

    try {
        const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Preset deleted', 'success');
        refreshPresets();
    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
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
