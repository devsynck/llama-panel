const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');

const PRESETS_FILE = path.join(CONFIG_DIR, 'presets.json');

function load() {
    try {
        if (fs.existsSync(PRESETS_FILE)) {
            return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load presets:', e.message);
    }
    return [];
}

function save(presets) {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf-8');
}

module.exports = { load, save };
