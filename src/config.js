const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.APPDATA || path.join(require('os').homedir(), '.config'), 'llama-panel');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const MODELS_DIR = path.join(CONFIG_DIR, 'models');

const DEFAULT_CONFIG = {
  host: '127.0.0.1',
  port: 8080,
  modelPath: '',
  ctxSize: 4096,
  threads: -1,
  threadsBatch: -1,
  batchSize: 0,
  ubatchSize: 0,
  gpuLayers: 99,
  flashAttn: 'on',
  fit: true,
  noMmap: false,
  cacheTypeK: '',
  cacheTypeV: '',
  splitMode: '',
  temp: 0.8,
  topK: 40,
  topP: 0.95,
  minP: 0.05,
  repeatPenalty: 1.0,
  presencePenalty: 0.0,
  apiKey: '',
  extraArgs: '',
  modelsDir: MODELS_DIR,
  managerPort: 7654,
  logDisable: false,
};

function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function save(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

module.exports = { load, save, DEFAULT_CONFIG, CONFIG_DIR, MODELS_DIR };
