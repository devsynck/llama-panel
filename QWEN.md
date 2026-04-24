# Llama Panel — Project Context

## Project Overview

**Llama Panel** is a premium, lightweight, modern web-based management tool for `llama-server` (from llama.cpp). It provides a graphical interface to configure, monitor, and control local LLM inference servers without manual CLI interaction.

### Core Technologies

- **Backend**: Node.js (ES6 modules, CommonJS)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no framework)
- **Server Framework**: Express.js
- **Real-time Communication**: WebSocket (ws library)
- **Build Tooling**: esbuild for bundling, Node.js SEA (Single Executable Application) for standalone binaries
- **Styling**: Custom CSS with CSS variables, dark theme design

### Architecture

```
llama-panel/
├── server.js           # Express server, API routes, WebSocket management
├── build.js            # Build script for standalone executable
├── package.json        # Dependencies: express, ws, esbuild, postject
│
├── src/
│   ├── config.js       # Configuration management (appdata/global config)
│   ├── llama-manager.js # Server process control, health polling, metrics parsing
│   ├── model-manager.js # Model listing, Hugging Face download, folder migration
│   ├── preset-manager.js # Multi-model preset management (INI file generation)
│   ├── log-buffer.js   # Ring buffer for log storage (max 2000 lines)
│   └── sys-stats.js    # System stats polling (RAM, GPU via nvidia-smi)
│
└── web/
    ├── index.html      # Single-page application structure
    ├── style.css       # Dark theme CSS with CSS variables
    └── app.js          # Frontend logic (navigation, WebSocket, API calls)
```

### Key Features

- **Server Management**: Start/stop/restart llama-server with one click
- **Visual Configuration**: GUI for context size, threads, batch sizes, GPU layers, flash attention
- **Preset Mode**: Multi-model configurations with per-model generation parameters (active by default when a preset is selected)
- **Model Downloader**: Hugging Face search and download with multi-part model handling
- **Real-time Monitoring**: Live stats, slot utilization, context usage, GPU metrics
- **Log Viewer**: Organized log display with spam filtering
- **Standalone Executable**: Zero-dependency binary for Windows/macOS/Linux

---

## Building and Running

### Prerequisites

- **Node.js** v20 or higher
- **llama-server** executable (via winget, manual download, or PATH)

### Development Mode

```bash
# Install dependencies
npm install

# Start the server
npm start

# Dashboard opens at: http://127.0.0.1:7654
```

### Building Standalone Executable

```bash
# Ensure devDependencies are installed
npm install

# Build standalone binary
npm run build
# Output: dist/llama-panel.exe (Windows) or dist/llama-panel (macOS/Linux)
```

### Release Versioning

```bash
# Patch release (1.0.4 → 1.0.5)
npm run release:patch

# Minor release (1.0.4 → 1.1.0)
npm run release:minor

# Major release (1.0.4 → 2.0.0)
npm run release:major
```

---

## Development Conventions

### File Structure

- **src/**: Core backend logic, organized by responsibility (manager pattern)
- **web/**: Frontend static files, vanilla JS with no build step
- **dist/**: Build output (standalone executable)

### Code Style

- **JavaScript**: CommonJS (`require`/`module.exports`)
- **CSS**: CSS Custom Properties (variables) for theming, BEM-like naming
- **Naming**: CamelCase for variables/functions, PascalCase for classes
- **Comments**: High-level explanations only, no inline commentary for obvious code

### Configuration

- **Location**: `%APPDATA%/llama-panel/config.json` (Windows) or `~/.config/llama-panel/config.json` (macOS/Linux)
- **Models**: Stored in subdirectories under the models directory
- **Presets**: Stored in `presets/` folder with UUID-based IDs and `.ini` files

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Server status, metrics, slots, system info |
| GET | `/api/config` | Load current configuration |
| POST | `/api/config` | Update configuration |
| POST | `/api/start` | Start llama-server |
| POST | `/api/stop` | Stop llama-server |
| POST | `/api/restart` | Restart llama-server |
| POST | `/api/hotswap` | Hot-swap model without full restart |
| GET | `/api/models` | List available models |
| DELETE | `/api/models/:name` | Delete a model |
| GET | `/api/models/search` | Search Hugging Face for models |
| POST | `/api/models/download` | Download model from Hugging Face |
| GET | `/api/presets` | List presets |
| POST | `/api/presets` | Create preset |
| PUT | `/api/presets/:id` | Update preset |
| DELETE | `/api/presets/:id` | Delete preset |
| POST | `/api/presets/:id/activate` | Activate preset |
| GET | `/api/logs` | Get recent logs |
| WS | `/ws` | Real-time logs and status updates |

### State Management

- **WebSocket**: Persistent connection for real-time updates (logs, status, downloads)
- **Polling**: Health checks every 2 seconds via HTTP when server is running
- **Log Buffer**: Circular buffer (2000 lines) with listener pattern for push notifications

### Error Handling

- Graceful shutdown on `SIGINT`/`SIGTERM`
- Process spawning errors caught and logged
- Network errors during health polling are silently ignored
- Download errors marked with status `'error'` and message

---

## Important Implementation Details

### Preset Mode

Preset mode allows multi-model configurations stored as INI files. When a preset is activated:

1. Config sets `modelsPresetPath: <path>` and `activePresetId: <id>`
2. `llama-manager.js` automatically detects the preset path and passes `--models-preset <path>` to llama-server
3. Per-model args (ctx-size, n-gpu-layers, temperature, etc.) are defined in the preset INI
4. Server-level args (host, port, parallel) come from the main config

### Hot-swap Behavior

The `hotswap` function:
1. Updates config with new model path
2. Stops the server
3. Waits 1.5 seconds for port release
4. Starts server with new model

### Metrics Parsing

Metrics are parsed from llama-server's Prometheus-style output:
- Counters (e.g., `tokens_predicted_total`) are summed across all slots
- Gauges (e.g., `kv_cache_usage_ratio`) take the maximum value
- Namespace prefix `llamacpp:` is stripped

### Model Storage Migration

`migrateToFolderStructure()` converts legacy flat model storage to folder-based:
- Each model gets its own folder named after the model
- Split files are kept together
- Associated `mmproj.gguf` files are moved with the model

### Build Process

The `build.js` script:
1. Bundles `server.js` with esbuild into `dist/bundle.cjs`
2. Embeds web assets into `globalThis.__EMBEDDED_WEB__`
3. Creates SEA config blob via `node --experimental-sea-config`
4. Copies `node.exe` and injects the blob with postject
5. Removes code signature for portability

---

## Environment Variables

- **APPDATA**: Used for config path on Windows (default: `%APPDATA%`)
- **Home directory**: Used for config path on macOS/Linux (`~/.config`)

---

## Dependencies

### Runtime
- `express` (^4.21.2): HTTP server
- `ws` (^8.18.0): WebSocket server

### Dev
- `esbuild` (^0.27.3): Bundling
- `postject` (^1.0.0-alpha.6): SEA blob injection

---

## Git Hooks / CI/CD

See `.github/workflows/` for CI configuration (if present).

Release commands push tags to remote:
```bash
git push --follow-tags
```