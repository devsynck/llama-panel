-# Llama Panel - Development Context

## Project Overview

**Llama Panel** is a lightweight, modern web-based management tool for `llama-server` (llama.cpp inference server). It provides a graphical dashboard for configuring, monitoring, and controlling local LLM inference without command-line interaction.

### Core Technologies
- **Backend:** Node.js (v20+) with Express.js HTTP server
- **Real-time Communication:** WebSocket (ws library) for live logs and stats
- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (no build framework)
- **Packaging:** esbuild for bundling, Node.js SEA (Single Executable Application) for standalone binaries

### Architecture

```
server.js (Entry Point)
├── Express HTTP Server (REST API)
├── WebSocket Server (/ws)
└── Managers
    ├── LlamaManager   - llama-server process control, health polling
    ├── ModelManager   - Model discovery, Hugging Face download
    ├── PresetManager  - Multi-model preset configuration
    ├── Config         - Persistent settings storage
    └── SysStats       - System resource monitoring
```

**Key Design Patterns:**
- **Embedded Mode:** Web assets can be bundled into a single executable via `globalThis.__EMBEDDED_WEB__`
- **Preset Mode:** Supports multi-model presets with `--models-preset` argument
- **Hot-swap:** Runtime model switching without full restart

---

## Building and Running

### Prerequisites
- Node.js v20 or higher
- `llama-server` executable (via `winget install llama.cpp` or manual download)

### Development Mode
```bash
npm install
npm start
```
Dashboard opens at `http://127.0.0.1:7654`

### Build Standalone Executable
```bash
npm run build
```
Output: `dist/llama-panel.exe` (Windows) or `dist/llama-panel` (macOS/Linux)

### Release Versioning
```bash
npm run release:patch   # Increment patch version
npm run release:minor   # Increment minor version
npm run release:major   # Increment major version
```

---

## Configuration

**Config Location:** `%APPDATA%/llama-panel/config.json` (Windows) or `~/.config/llama-panel/config.json` (macOS/Linux)

**Default Settings:**
| Setting | Default | Description |
|---------|---------|-------------|
| `host` | `127.0.0.1` | llama-server bind address |
| `port` | `8080` | llama-server API port |
| `ctxSize` | `4096` | Context window size |
| `threads` | `-1` | CPU threads (auto if -1) |
| `gpuLayers` | `99` | GPU offload layers |
| `flashAttn` | `on` | Flash attention |
| `managerPort` | `7654` | Panel dashboard port |
| `modelsDir` | `<config>/models` | Model storage directory |

**Preset Mode:** Enable multi-model presets via `usePresetMode: true` and `modelsPresetPath`

---

## API Endpoints

### Server Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/start` | Start llama-server |
| `POST` | `/api/stop` | Stop llama-server |
| `POST` | `/api/restart` | Restart llama-server |
| `POST` | `/api/hotswap` | Hot-swap model (requires `modelPath`) |

### Models
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/models` | List available models |
| `DELETE` | `/api/models/:name` | Delete model |
| `GET` | `/api/models/search?q=...` | Search Hugging Face |
| `GET` | `/api/models/repo-files/:owner/:repo` | List repo files |
| `POST` | `/api/models/download` | Download model(s) |
| `GET` | `/api/downloads` | List active downloads |
| `GET` | `/api/downloads/:id` | Get download progress |

### Presets
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/presets` | List presets |
| `GET` | `/api/presets/:id` | Get preset |
| `POST` | `/api/presets` | Create preset |
| `PUT` | `/api/presets/:id` | Update preset |
| `DELETE` | `/api/presets/:id` | Delete preset |
| `POST` | `/api/presets/:id/activate` | Activate preset |
| `POST` | `/api/presets/deactivate` | Deactivate preset |

### Logs & Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Server status + system stats |
| `GET` | `/api/logs?n=200` | Recent log entries |
| `GET` | `/ws` | WebSocket: live logs + status stream |

---

## Development Conventions

### Code Style
- CommonJS modules (`require`/`module.exports`)
- Class-based architecture for managers
- Async/await for I/O operations

### File Organization
```
src/
├── config.js          - Config load/save, defaults
├── llama-manager.js   - Process spawning, health polling
├── model-manager.js   - Model filesystem + Hugging Face
├── preset-manager.js  - Multi-model preset handling
├── log-buffer.js      - Circular log storage
└── sys-stats.js       - CPU/memory monitoring

web/
├── index.html         - Dashboard markup
├── style.css          - UI styling
└── app.js             - Frontend logic

build.js               - Standalone executable builder
server.js              - HTTP + WebSocket server
```

### Testing
No automated tests present. Manual testing via dashboard UI.

### Error Handling
- API endpoints return `500` with `{ error: message }` on failure
- Process errors captured in `llama.lastError`
- Downloads track progress and errors via `ModelManager.downloads` map

---

## Standalone Build Process (build.js)

1. **Bundle:** esbuild bundles `server.js` + dependencies → `dist/bundle.cjs`
2. **Embed:** Web assets injected as `globalThis.__EMBEDDED_WEB__`
3. **SEA Config:** Generate `sea-config.json` for Node.js SEA
4. **Blob:** Create `sea-prep.blob` via `node --experimental-sea-config`
5. **Copy Runtime:** Copy `node.exe` to `dist/llama-panel.exe`
6. **Inject:** Use `postject` to embed SEA blob into executable

**Note:** Requires Node.js 20+ and `postject` dev dependency.

---

## Key Implementation Details

### Health Monitoring
- Polls `/health`, `/slots`, `/metrics` from llama-server every 2s
- Auto-detects server ready state via health check or log parsing
- Metrics parsed from Prometheus-style `/metrics` output

### Model File Structure
- **New:** `models/<model-name>/<model>.gguf` (folder-based)
- **Legacy:** `models/<model>.gguf` (flat, auto-migrated)
- **mmproj:** Auto-detected for multimodal models

### Hot-swap Flow
1. Update `config.modelPath`
2. Stop server
3. 1.5s delay (port cleanup)
4. Start server with new model