const { spawn } = require('child_process');
const LogBuffer = require('./log-buffer');
const config = require('./config');
const PresetManager = require('./preset-manager');

class LlamaManager {
    constructor() {
        this.process = null;
        this.status = 'stopped'; // stopped, starting, running, error
        this.logs = new LogBuffer(2000);
        this.startTime = null;
        this.lastError = null;
        this.healthData = null;
        this.slotsData = null;
        this.metricsData = null;
        this._healthInterval = null;
        this._currentConfig = null;
    }

    buildArgs(cfg) {
        const args = [];

        // Check if preset mode is enabled
        const isPresetMode = cfg.usePresetMode && cfg.modelsPresetPath && require('fs').existsSync(cfg.modelsPresetPath);

        if (isPresetMode) {
            args.push('--models-preset', cfg.modelsPresetPath);
            this.logs.push(`[Manager] Using preset mode: ${cfg.modelsPresetPath}`);
        } else if (cfg.modelPath) {
            args.push('-m', cfg.modelPath);
        }

        // Server-level args (apply in both modes)
        if (cfg.host && cfg.host !== '127.0.0.1') { args.push('--host', cfg.host); }
        if (cfg.port && cfg.port !== 8080) { args.push('--port', String(cfg.port)); }
        if (cfg.apiKey) { args.push('--api-key', cfg.apiKey); }

        // Model-specific args - in preset mode, let the preset control these
        // In single model mode, use config values
        if (!isPresetMode) {
            if (cfg.ctxSize) { args.push('-c', String(cfg.ctxSize)); }
            if (cfg.threads && cfg.threads !== -1) { args.push('-t', String(cfg.threads)); }
            if (cfg.threadsBatch && cfg.threadsBatch !== -1) { args.push('-tb', String(cfg.threadsBatch)); }
            if (cfg.batchSize && cfg.batchSize !== 2048) { args.push('-b', String(cfg.batchSize)); }
            if (cfg.ubatchSize && cfg.ubatchSize !== 512) { args.push('-ub', String(cfg.ubatchSize)); }
            if (cfg.gpuLayers !== undefined && cfg.gpuLayers !== '' && cfg.gpuLayers !== 'auto') { args.push('-ngl', String(cfg.gpuLayers)); }
            if (cfg.flashAttn && cfg.flashAttn !== '' && cfg.flashAttn !== 'auto') { args.push('-fa', String(cfg.flashAttn)); }
            if (cfg.contBatching) { args.push('-cb'); }
            if (cfg.mlock) { args.push('--mlock'); }
            if (cfg.mmap === false) { args.push('--no-mmap'); }
            if (cfg.cachePrompt) { args.push('--cache-prompt'); }
            if (cfg.cacheTypeK && cfg.cacheTypeK !== '' && cfg.cacheTypeK !== 'f16') { args.push('-ctk', cfg.cacheTypeK); }
            if (cfg.cacheTypeV && cfg.cacheTypeV !== '' && cfg.cacheTypeV !== 'f16') { args.push('-ctv', cfg.cacheTypeV); }
            if (cfg.splitMode && cfg.splitMode !== '' && cfg.splitMode !== 'layer') { args.push('-sm', cfg.splitMode); }
        } else {
            // In preset mode, warn if extraArgs might override preset values
            if (cfg.extraArgs && cfg.extraArgs.includes('-ngl')) {
                this.logs.push('[Manager] Warning: extraArgs contains -ngl which may override preset values');
            }
        }

        // Parallel/slots work in both modes
        if (cfg.parallel && cfg.parallel > 1) {
            args.push('-np', String(cfg.parallel));
            args.push('--models-max', String(cfg.parallel));
        }

        // Pass metrics & slots natively if not explicitly disabled
        if (cfg.metrics !== false) { args.push('--metrics'); }
        if (cfg.slots !== false && cfg.modelPath) { args.push('--slots'); }

        // Disable the built-in webui since we have our own
        // args.push('--no-webui');
        // Verbose logging for stats
        args.push('-v');
        // Control logging style
        //args.push('--log-colors', 'off');
        if (cfg.logDisable !== false) {
            args.push('--log-disable');
        }

        // Extra args (user can override anything here)
        if (cfg.extraArgs) {
            const extra = cfg.extraArgs.trim().split(/\s+/);
            args.push(...extra);
        }

        return args;
    }

    async start() {
        if (this.process) {
            throw new Error('Server is already running');
        }

        const cfg = config.load();
        this._currentConfig = cfg;

        if (!cfg.modelPath && !cfg.usePresetMode) {
            this.logs.push('[Manager] No active model selected. Starting without a model.');
        }

        if (cfg.usePresetMode && !cfg.modelsPresetPath) {
            this.logs.push('[Manager] Warning: Preset mode is enabled but no preset path is set.');
        }

        const args = this.buildArgs(cfg);
        this.logs.clear();
        this.status = 'starting';
        this.lastError = null;
        this.startTime = Date.now();

        this.logs.push(`[Manager] Starting llama-server with args: ${args.join(' ')}`);

        try {
            this.process = spawn('llama-server', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });
        } catch (err) {
            this.status = 'error';
            this.lastError = err.message;
            this.logs.push(`[Manager] Failed to spawn: ${err.message}`);
            throw err;
        }

        this.process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                this.logs.push(line);
            }
        });

        this.process.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                this.logs.push(line);
                // Detect when server is ready (legacy fallback)
                if (line.includes('server is listening on')) {
                    if (this.status === 'starting') {
                        this.status = 'running';
                        this.logs.push('[Manager] Server is ready (detected via logs)');
                    }
                }
            }
        });

        this._startHealthPolling(cfg);

        this.process.on('error', (err) => {
            this.status = 'error';
            this.lastError = err.message;
            this.logs.push(`[Manager] Process error: ${err.message}`);
            this._stopHealthPolling();
            this.process = null;
        });

        this.process.on('exit', (code, signal) => {
            if (this.status !== 'stopped') {
                this.status = code === 0 ? 'stopped' : 'error';
                if (code !== 0) this.lastError = `Process exited with code ${code}`;
            }
            this.logs.push(`[Manager] Process exited (code: ${code}, signal: ${signal})`);
            this._stopHealthPolling();
            this.process = null;
        });

        // Wait a bit and check if process is still alive
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (this.status === 'error') {
                    reject(new Error(this.lastError || 'Failed to start'));
                } else {
                    resolve();
                }
            }, 1000);
        });
    }

    async stop() {
        if (!this.process) {
            this.status = 'stopped';
            return;
        }
        this.status = 'stopped';
        this._stopHealthPolling();
        this.logs.push('[Manager] Stopping server...');

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                }
                resolve();
            }, 5000);

            if (this.process) {
                this.process.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                this.process.kill('SIGTERM');
                // On Windows, SIGTERM doesn't work well, use taskkill
                if (process.platform === 'win32' && this.process.pid) {
                    spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], { windowsHide: true });
                }
            } else {
                clearTimeout(timeout);
                resolve();
            }
        });
    }

    async hotswap(modelPath) {
        this.logs.push(`[Manager] Hotswapping model to: ${modelPath}`);
        const cfg = config.load();
        cfg.modelPath = modelPath;
        config.save(cfg);
        await this.stop();
        // Small delay to ensure port is freed
        await new Promise(r => setTimeout(r, 1500));
        await this.start();
    }

    _startHealthPolling(cfg) {
        this._stopHealthPolling();
        const baseUrl = `http://${cfg.host}:${cfg.port}`;

        // In router mode, get the first model identifier from active preset
        let modelIdentifier = null;
        if (cfg.usePresetMode && cfg.activePresetId) {
            try {
                const presetManager = new PresetManager();
                const preset = presetManager.getPreset(cfg.activePresetId);
                if (preset && preset.models && preset.models.length > 0) {
                    modelIdentifier = preset.models[0].identifier;
                }
            } catch (e) {
                // Ignore preset loading errors
            }
        }

        this._healthInterval = setInterval(async () => {
            try {
                const healthRes = await fetch(`${baseUrl}/health`);
                if (healthRes.ok) {
                    this.healthData = await healthRes.json();
                    if (this.status === 'starting') {
                        this.status = 'running';
                        this.logs.push('[Manager] Server is ready (verified via health check)');
                    }
                }

                if (this.healthData && (this.healthData.status === 'ok' || this.healthData.status === 'ready')) {
                    // Fetch slots - in router mode, need to specify model
                    let slotsUrl = `${baseUrl}/slots`;
                    if (modelIdentifier) {
                        slotsUrl += `?model=${encodeURIComponent(modelIdentifier)}`;
                    }
                    const slotsRes = await fetch(slotsUrl);
                    if (slotsRes.ok) {
                        this.slotsData = await slotsRes.json();
                    }

                    // Fetch and parse metrics
                    const metricsRes = await fetch(`${baseUrl}/metrics`);
                    if (metricsRes.ok) {
                        const rawMetrics = await metricsRes.text();
                        this.metricsData = this._parseMetrics(rawMetrics);
                    }
                } else {
                    this.slotsData = null;
                    this.metricsData = null;
                }
            } catch (_) {
                // Ignore fetch errors during polling
            }
        }, 2000);
    }

    _parseMetrics(raw) {
        const metrics = {};
        const lines = raw.split('\n');
        for (const line of lines) {
            if (line.startsWith('#') || !line.trim()) continue;
            const parts = line.split(' ');
            if (parts.length >= 2) {
                const key = parts[0].replace('llamacpp:', '');
                const value = parseFloat(parts[1]);
                metrics[key] = value;
            }
        }
        return metrics;
    }

    _stopHealthPolling() {
        if (this._healthInterval) {
            clearInterval(this._healthInterval);
            this._healthInterval = null;
        }
        this.healthData = null;
        this.slotsData = null;
    }

    getStatus() {
        const uptime = this.startTime && this.status === 'running'
            ? Math.floor((Date.now() - this.startTime) / 1000)
            : 0;

        return {
            status: this.status,
            uptime,
            lastError: this.lastError,
            health: this.healthData,
            slots: this.slotsData,
            metrics: this.metricsData,
            pid: this.process?.pid || null,
            config: this._currentConfig,
        };
    }
}

module.exports = LlamaManager;
