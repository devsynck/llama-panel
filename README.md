# Llama Panel 🦙

**Llama Panel** is a premium, lightweight, and modern web-based management tool for `llama-server`. It provides an easy-to-use graphical interface to configure, monitor, and control your LLM inference server without needing to fiddle with the command line every time. 

Built heavily with aesthetics and simplicity in mind, it gives you full control over running local models.

<img width="2556" height="1305" alt="image" src="https://github.com/user-attachments/assets/4728c648-7054-49e7-b711-c5759460f9c0" />

## ✨ Features

- **One-Click Server Management**: Start, stop, and restart `llama-server` easily directly from the dashboard. Once the server is running, you can quickly restart it with a single click.
- **Visual Configuration Editor**: Manage context size, threads, batch sizes, GPU layers, flash attention, and other advanced `llama-server` parameters without manually formatting CLI arguments.
- **Model Presets & Multi-Model Support**: Combine multiple models into presets, each with their own specific generation arguments (like `presence-penalty`) and server arguments. Automatically load `mmproj` files for multimodal models.
- **Model Downloader**: Browse and search Hugging Face for GGUF models directly within the panel. Click to download directly into your models directory cleanly, grouping multi-part models seamlessly.
- **Real-Time Monitoring**: View server health, active slots, context utilization, and uptime metrics updating continuously.
- **Streamlined Log Viewer**: View server logs in an organized, scrollable panel, with smart filtering to remove repetitive or spammy log lines.
- **Single Executable Option**: Can be run via a Node.js runtime or compiled down into a zero-dependency standalone executable for Windows, macOS, or Linux.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v20 or higher (if running from source).
- An existing [llama-server](https://github.com/ggerganov/llama.cpp) executable. Here are a few ways to get it:
  - **(Recommended)** Install via Winget: run `winget install llama.cpp` in your terminal.
  - Download the pre-built binaries directly from the [llama.cpp releases page](https://github.com/ggerganov/llama.cpp/releases).
  - Place your existing `llama-server.exe` directly in the project directory, or define it in your system's PATH.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/devsynck/llama-panel.git
   cd llama-panel
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. The dashboard will automatically open in your default browser at `http://127.0.0.1:7654`.

### Building the Standalone Executable

Llama Panel can be packaged into a highly portable, single executable file using Node.js Single Executable Applications (SEA) across Windows, macOS, and Linux.

1. Ensure you have the `devDependencies` installed (`npm install`).
2. Run the build script:
   ```bash
   npm run build
   ```
3. A standalone executable will be created at `dist/llama-panel.exe` (or `dist/llama-panel` on macOS/Linux). You can move this file anywhere and run it without needing Node.js installed.

## 🛠️ Usage

1. **Configuration**: Navigate to the **Configuration** tab to point Llama Panel to your preferred models directory. Click **Browse** to open a native file picker.
2. **Downloading Models**: Navigate to the **Download** tab. Search for a model like `Llama-3-8B-Instruct-GGUF`. Select a repository and click **Download** on your desired quantization format (e.g., `Q4_K_M`). Llama Panel automatically handles downloading multi-split models safely.
3. **Starting the Server**: Once a model is loaded, head to the **Dashboard** and press the **Start Server** button. 

## 📦 File Tracking

- Models are saved securely inside the directory defined in your Config.
- Configurations are saved globally to `%APPDATA%/llama-panel/config.json` (or `~/.config/llama-panel/config.json` on macOS/Linux) so your settings persist across updates and standalone executable environments.
