const { spawn } = require('child_process');
const LogBuffer = require('./log-buffer');
const config = require('./config');

class LlamaManager {
    constructor() {
        this.process = null;
        this.status = 'stopped'; // stopped, starting, running, error
        this.logs = new LogBuffer(2000);
        this.startTime = null;
        this.lastError = null;
        this.healthData = null;
        this._healthInterval = null;
        this._currentConfig = null;
        this._serverArgs = null;
    }

    buildArgs(cfg) {
        const args = [];

        if (cfg.modelPath) {
            args.push('-m', cfg.modelPath);
        }

        if (cfg.host && cfg.host !== '127.0.0.1') { args.push('--host', cfg.host); }
        if (cfg.port && cfg.port !== 8080) { args.push('--port', String(cfg.port)); }
        if (cfg.apiKey) { args.push('--api-key', cfg.apiKey); }

        if (cfg.ctxSize) { args.push('-c', String(cfg.ctxSize)); }
        if (cfg.threads && cfg.threads !== -1) { args.push('-t', String(cfg.threads)); }
        if (cfg.threadsBatch && cfg.threadsBatch !== -1) { args.push('-tb', String(cfg.threadsBatch)); }
        if (cfg.batchSize && cfg.batchSize !== 2048) { args.push('-b', String(cfg.batchSize)); }
        if (cfg.ubatchSize && cfg.ubatchSize !== 512) { args.push('-ub', String(cfg.ubatchSize)); }
        if (cfg.gpuLayers !== undefined && cfg.gpuLayers !== '' && cfg.gpuLayers !== 'auto') { args.push('-ngl', String(cfg.gpuLayers)); }
        if (cfg.flashAttn === 'on' || cfg.flashAttn === 'off') { args.push('-fa', cfg.flashAttn); }
        if (cfg.fit !== undefined) { args.push('-fit', cfg.fit ? 'on' : 'off'); }
        if (cfg.noMmap) { args.push('--no-mmap'); }
        if (cfg.cacheTypeK && cfg.cacheTypeK !== '') { args.push('-ctk', cfg.cacheTypeK); }
        if (cfg.cacheTypeV && cfg.cacheTypeV !== '') { args.push('-ctv', cfg.cacheTypeV); }
        if (cfg.splitMode && cfg.splitMode !== '' && cfg.splitMode !== 'layer') { args.push('-sm', cfg.splitMode); }

        args.push('-v');

        if (cfg.temp !== undefined) { args.push('--temp', String(cfg.temp)); }
        if (cfg.topK !== undefined) { args.push('--top-k', String(cfg.topK)); }
        if (cfg.topP !== undefined) { args.push('--top-p', String(cfg.topP)); }
        if (cfg.minP !== undefined) { args.push('--min-p', String(cfg.minP)); }
        if (cfg.repeatPenalty !== undefined) { args.push('--repeat-penalty', String(cfg.repeatPenalty)); }
        if (cfg.presencePenalty !== undefined) { args.push('--presence-penalty', String(cfg.presencePenalty)); }

        if (cfg.logDisable) {
            args.push('--log-disable');
        }

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

        if (!cfg.modelPath) {
            this.logs.push('[Manager] No active model selected. Starting without a model.');
        }

        const args = this.buildArgs(cfg);
        this._serverArgs = args;
        this.logs.clear();
        this.status = 'starting';
        this.lastError = null;
        this.startTime = Date.now();

        this._logManager(`Starting llama-server with args: ${args.join(' ')}`);

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
                console.log(line);
            }
        });

        this.process.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                this.logs.push(line);
                console.error(line);
                if (line.includes('server is listening on')) {
                    if (this.status === 'starting') {
                        this.status = 'running';
                        this._logManager('Server is ready (detected via logs)');
                    }
                }
            }
        });

        this._startHealthPolling(cfg);

        this.process.on('error', (err) => {
            this.status = 'error';
            this.lastError = err.message;
            this._logManager(`Process error: ${err.message}`, true);
            this._stopHealthPolling();
            this.process = null;
        });

        this.process.on('exit', (code, signal) => {
            if (this.status !== 'stopped') {
                this.status = code === 0 ? 'stopped' : 'error';
                if (code !== 0) this.lastError = `Process exited with code ${code}`;
            }
            this._logManager(`Process exited (code: ${code}, signal: ${signal})`);
            this._stopHealthPolling();
            this.process = null;
        });

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
        this._logManager('Stopping server...');

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
        await new Promise(r => setTimeout(r, 1500));
        await this.start();
    }

    _startHealthPolling(cfg) {
        this._stopHealthPolling();
        const baseUrl = `http://${cfg.host}:${cfg.port}`;

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
            } catch (_) {}

            try {
                const modelsRes = await fetch(`${baseUrl}/v1/models`);
                if (modelsRes.ok) {
                    const modelsJson = await modelsRes.json();
                    this.activeModelsData = modelsJson.data || [];
                }
            } catch (_) {}
        }, 2000);
    }

    _stopHealthPolling() {
        if (this._healthInterval) {
            clearInterval(this._healthInterval);
            this._healthInterval = null;
        }
        this.healthData = null;
        this.activeModelsData = null;
    }

    getStatus() {
        const uptime = this.startTime && this.status === 'running'
            ? Math.floor((Date.now() - this.startTime) / 1000)
            : 0;

        const result = {
            status: this.status,
            uptime,
            lastError: this.lastError,
            health: this.healthData,
            pid: this.process?.pid || null,
            config: this._currentConfig,
        };

        if (this._serverArgs) {
            result.serverArgs = this._serverArgs.join(' ');
        }

        if (this.activeModelsData) {
            result.activeModels = this.activeModelsData;
        }

        return result;
    }

    _logManager(text, isError = false) {
        const msg = `[Manager] ${text}`;
        this.logs.push(msg);
        if (isError) {
            console.error(`\x1b[31m${msg}\x1b[0m`);
        } else {
            console.log(`\x1b[36m${msg}\x1b[0m`);
        }
    }
}

module.exports = LlamaManager;
