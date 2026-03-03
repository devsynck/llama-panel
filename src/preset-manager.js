const fs = require('fs');
const path = require('path');

// Simple UUID v4 generator (built-in, no external dependency)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class PresetManager {
    constructor() {
        this.presetsDir = path.join(process.env.APPDATA || path.join(require('os').homedir(), '.config'), 'llama-panel', 'presets');
        this.metadataFile = path.join(this.presetsDir, 'presets.json');
        this._ensureDirs();
    }

    _ensureDirs() {
        if (!fs.existsSync(this.presetsDir)) {
            fs.mkdirSync(this.presetsDir, { recursive: true });
        }
    }

    _loadMetadata() {
        this._ensureDirs();
        if (fs.existsSync(this.metadataFile)) {
            try {
                const data = fs.readFileSync(this.metadataFile, 'utf-8');
                return JSON.parse(data);
            } catch (err) {
                console.error('Failed to load presets metadata:', err.message);
                return {};
            }
        }
        return {};
    }

    _saveMetadata(metadata) {
        this._ensureDirs();
        fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    listPresets() {
        const metadata = this._loadMetadata();
        const presets = [];
        for (const [id, preset] of Object.entries(metadata)) {
            presets.push(preset);
        }
        return presets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    getPreset(id) {
        const metadata = this._loadMetadata();
        return metadata[id] || null;
    }

    createPreset(preset) {
        const validation = this._validatePreset(preset);
        if (!validation.valid) {
            throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
        }

        const metadata = this._loadMetadata();
        const id = generateUUID();
        const now = new Date().toISOString();

        const newPreset = {
            id,
            name: preset.name,
            description: preset.description || '',
            models: preset.models || [],
            createdAt: now,
            updatedAt: now,
        };

        metadata[id] = newPreset;
        this._saveMetadata(metadata);

        // Generate INI file
        this._generateIniFile(newPreset);

        return newPreset;
    }

    updatePreset(id, preset) {
        const metadata = this._loadMetadata();
        if (!metadata[id]) {
            throw new Error('Preset not found');
        }

        const validation = this._validatePreset(preset);
        if (!validation.valid) {
            throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
        }

        const updatedPreset = {
            ...metadata[id],
            name: preset.name,
            description: preset.description || '',
            models: preset.models || [],
            updatedAt: new Date().toISOString(),
        };

        metadata[id] = updatedPreset;
        this._saveMetadata(metadata);

        // Regenerate INI file
        this._generateIniFile(updatedPreset);

        return updatedPreset;
    }

    deletePreset(id) {
        const metadata = this._loadMetadata();
        if (!metadata[id]) {
            throw new Error('Preset not found');
        }

        // Delete INI file
        const iniPath = this._getPresetPath(id);
        if (fs.existsSync(iniPath)) {
            fs.unlinkSync(iniPath);
        }

        // Remove from metadata
        delete metadata[id];
        this._saveMetadata(metadata);

        return true;
    }

    _validatePreset(preset) {
        const errors = [];

        if (!preset.name || typeof preset.name !== 'string' || preset.name.trim() === '') {
            errors.push('Name is required');
        }

        if (!preset.models || !Array.isArray(preset.models) || preset.models.length === 0) {
            errors.push('At least one model is required');
        } else {
            for (let i = 0; i < preset.models.length; i++) {
                const model = preset.models[i];
                if (!model.identifier || model.identifier.trim() === '') {
                    errors.push(`Model ${i + 1}: identifier is required`);
                }
                if (!model.modelPath || model.modelPath.trim() === '') {
                    errors.push(`Model ${i + 1}: modelPath is required`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    _generateIniFile(preset) {
        const iniPath = this._getPresetPath(preset.id);
        let ini = '';

        // These specific values were identified as causing performance issues
        // when written to INI. Only skip these exact values.
        const PROBLEMATIC_DEFAULTS = {
            threads: -1,
            threadsBatch: -1,
            batchSize: 2048,
            ubatchSize: 512,
            mmap: true,
            splitMode: 'layer',
        };

        // Check if a value should be skipped (only skip problematic defaults)
        const shouldSkip = (key, value) => {
            if (value === undefined || value === null || value === '') return true;
            // Skip cache types when set to "none" (let llama-server use default)
            if ((key === 'cacheTypeK' || key === 'cacheTypeV') && value === 'none') {
                return true;
            }
            // Only skip if it's one of the problematic defaults
            if (key in PROBLEMATIC_DEFAULTS && value === PROBLEMATIC_DEFAULTS[key]) {
                return true;
            }
            return false;
        };

        for (const model of preset.models) {
            ini += `[${model.identifier}]\n`;

            // Always write model path
            ini += `model = ${model.modelPath}\n`;

            let currentMmprojPath = model.mmprojPath;
            if (model.loadMmproj && !currentMmprojPath) {
                try {
                    const modelDir = path.dirname(model.modelPath);
                    if (fs.existsSync(modelDir)) {
                        const files = fs.readdirSync(modelDir);
                        const mmprojFile = files.find(f => f.toLowerCase().includes('mmproj') && f.endsWith('.gguf'));
                        if (mmprojFile) {
                            currentMmprojPath = path.join(modelDir, mmprojFile);
                        }
                    }
                } catch (err) {
                    console.error('Failed to find mmproj file:', err.message);
                }
            }

            if (currentMmprojPath) {
                ini += `mmproj = ${currentMmprojPath}\n`;
            }

            // Write model parameters - skip only problematic defaults
            for (const [key, iniKey] of Object.entries({
                ctxSize: 'ctx-size',
                gpuLayers: 'n-gpu-layers',
                threads: 'threads',
                threadsBatch: 'threads-batch',
                batchSize: 'batch-size',
                ubatchSize: 'ubatch-size',
                flashAttn: 'flash-attn',
                parallel: 'parallel',
                contBatching: 'cont-batching',
                mlock: 'mlock',
                mmap: 'mmap',
                cachePrompt: 'cache-prompt',
                cacheTypeK: 'cache-type-k',
                cacheTypeV: 'cache-type-v',
                splitMode: 'split-mode',
                apiKey: 'api-key',
            })) {
                const value = model[key];
                if (!shouldSkip(key, value)) {
                    if (typeof value === 'boolean') {
                        ini += `${iniKey} = true\n`;
                    } else {
                        ini += `${iniKey} = ${value}\n`;
                    }
                }
            }

            // Write generation parameters - always write if set
            for (const [key, iniKey] of Object.entries({
                temp: 'temperature',
                topK: 'top-k',
                topP: 'top-p',
                minP: 'min-p',
                repeatPenalty: 'repeat-penalty',
                presencePenalty: 'presence-penalty',
            })) {
                const value = model[key];
                if (value !== undefined && value !== null && value !== '') {
                    ini += `${iniKey} = ${value}\n`;
                }
            }

            // Thinking mode via chat-template-kwargs (requires --jinja)
            // Ref: https://unsloth.ai/docs/models/qwen3.5#how-to-enable-or-disable-reasoning-and-thinking
            // CLI: --chat-template-kwargs '{"enable_thinking":false}'
            if (model.thinking === true) ini += `chat-template-kwargs = {"enable_thinking":true}\n`;
            if (model.thinking === false) ini += `chat-template-kwargs = {"enable_thinking":false}\n`;

            ini += '\n';
        }

        fs.writeFileSync(iniPath, ini, 'utf-8');
    }

    _getPresetPath(id) {
        return path.join(this.presetsDir, `${id}.ini`);
    }

    getPresetPath(id) {
        const preset = this.getPreset(id);
        if (!preset) {
            throw new Error('Preset not found');
        }
        return this._getPresetPath(id);
    }
}

module.exports = PresetManager;
