const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const config = require('./config');

class ModelManager {
    constructor() {
        this.downloads = new Map(); // id -> { progress, total, speed, status, filename, error, paused, abortController }
    }

    getModelsDir() {
        const cfg = config.load();
        return cfg.modelsDir || config.MODELS_DIR;
    }

    listModels() {
        const dir = this.getModelsDir();
        if (!fs.existsSync(dir)) return [];

        const models = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                // Scan subdirectory for models
                const subModel = this._scanModelDirectory(path.join(dir, entry.name), entry.name);
                if (subModel) models.push(subModel);
            } else if (entry.isFile()) {
                // Handle legacy flat structure (backward compatibility)
                const file = entry.name;
                const ext = path.extname(file).toLowerCase();
                if (ext !== '.gguf') continue;

                // Skip split parts that are not the first one (00001)
                const splitMatch = file.match(/-(\d{5})-of-(\d{5})\.gguf$/i);
                if (splitMatch && splitMatch[1] !== '00001') {
                    continue;
                }

                const filePath = path.join(dir, file);
                try {
                    const stat = fs.statSync(filePath);
                    // Check for associated mmproj file
                    const mmprojName = file.replace(/\.gguf$/i, '-mmproj.gguf');
                    const mmprojPath = path.join(dir, mmprojName);
                    const hasMmproj = fs.existsSync(mmprojPath);

                    models.push({
                        name: file,
                        path: filePath,
                        size: stat.size,
                        sizeHuman: formatSize(stat.size),
                        modified: stat.mtime.toISOString(),
                        isLegacy: true,
                        hasMmproj: hasMmproj,
                        mmprojPath: hasMmproj ? mmprojPath : null,
                    });
                } catch (_) { /* skip */ }
            }
        }

        return models.sort((a, b) => b.modified.localeCompare(a.modified));
    }

    _scanModelDirectory(dirPath, folderName) {
        const files = fs.readdirSync(dirPath);
        const ggufFiles = files.filter(f => f.toLowerCase().endsWith('.gguf') && !f.toLowerCase().includes('mmproj'));
        const mmprojFiles = files.filter(f => f.toLowerCase().includes('mmproj'));

        if (ggufFiles.length === 0) return null;

        // Find the main model file (first split or largest file)
        let mainFile = ggufFiles[0];
        let totalSize = 0;
        for (const file of ggufFiles) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);
            totalSize += stat.size;
        }

        // Check if this is a split model and get the first part
        const splitMatch = mainFile.match(/-(\d{5})-of-(\d{5})\.gguf$/i);
        if (splitMatch && splitMatch[1] !== '00001') {
            // Find the first part
            const firstPart = ggufFiles.find(f => f.match(/-00001-of-\d{5}\.gguf$/i));
            if (firstPart) mainFile = firstPart;
        }

        const stat = fs.statSync(path.join(dirPath, mainFile));
        const hasMmproj = mmprojFiles.length > 0;
        const isSplit = ggufFiles.length > 1;

        return {
            name: folderName,
            path: path.join(dirPath, mainFile),
            folderPath: dirPath,
            size: totalSize,
            sizeHuman: formatSize(totalSize),
            modified: stat.mtime.toISOString(),
            fileCount: ggufFiles.length,
            hasMmproj: hasMmproj,
            mmprojPath: hasMmproj ? path.join(dirPath, mmprojFiles[0]) : null,
            isSplit: isSplit,
        };
    }

    deleteModel(modelIdentifier) {
        const dir = this.getModelsDir();

        // Check if it's a folder (new structure)
        const folderPath = path.join(dir, modelIdentifier);
        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return true;
        }

        // Fallback for legacy flat structure (filename)
        const filePath = path.join(dir, modelIdentifier);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            // Also delete associated mmproj file if exists
            const mmprojName = modelIdentifier.replace(/\.gguf$/i, '-mmproj.gguf');
            const mmprojPath = path.join(dir, mmprojName);
            if (fs.existsSync(mmprojPath)) {
                fs.unlinkSync(mmprojPath);
            }
            return true;
        }

        throw new Error('Model not found');
    }

    async downloadFromHuggingFace(repoId, filenames, hfToken) {
        const filesToDownload = Array.isArray(filenames) ? filenames : [filenames];
        if (filesToDownload.length === 0) throw new Error("No files to download");

        const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dir = this.getModelsDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Extract model name for subfolder
        const firstFile = filesToDownload[0];
        let modelName = firstFile;

        // Remove directory prefix if present
        const folderMatch = firstFile.match(/^([^/]+)\//);
        if (folderMatch) {
            modelName = folderMatch[1];
        } else {
            // Extract base name from filename (remove split suffix and extension)
            const splitMatch = firstFile.match(/^(.*?)-\d{5}-of-\d{5}\.gguf$/);
            if (splitMatch) {
                modelName = splitMatch[1];
            } else {
                modelName = firstFile.replace(/\.gguf$/i, '');
            }
        }

        // Sanitize model name for folder
        modelName = modelName.replace(/[^a-zA-Z0-9._-]/g, '_');

        // Create subfolder for this model
        const modelDir = path.join(dir, modelName);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        // Use a logical name for the display
        let displayName = firstFile;
        if (folderMatch) displayName = folderMatch[1];
        else {
            const splitMatch = displayName.match(/^(.*?)-\d{5}-of-\d{5}\.gguf$/);
            if (splitMatch) displayName = splitMatch[1];
            else displayName = displayName.replace(/\.gguf$/i, '');
        }

        const downloadState = {
            id: downloadId,
            filename: displayName,
            repoId,
            status: 'starting',
            progress: 0,
            total: 0,
            downloaded: 0,
            speed: 0,
            error: null,
            paused: false,
            startTime: Date.now(),
            filesCount: filesToDownload.length,
            currentFileIndex: 0,
            abortController: null,
            // For pause/resume support
            fileProgress: {},  // { filename: { downloaded: number, total: number } }
            filesToDownload: filesToDownload,
            modelDir: modelDir,
            hfToken: hfToken
        };

        this.downloads.set(downloadId, downloadState);

        // Start download in background to modelDir instead of dir
        this._doDownloadSequence(downloadId, repoId, filesToDownload, modelDir, hfToken).catch(err => {
            downloadState.status = 'error';
            downloadState.error = err.message;
        });

        return downloadId;
    }

    async _getFileSize(repoId, filename, hfToken) {
        return new Promise((resolve) => {
            const url = `https://huggingface.co/${repoId}/resolve/main/${filename}`;
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            const headers = hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {};

            const req = client.request(url, { method: 'HEAD', headers }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = res.headers.location;
                    const c2 = new URL(redirectUrl).protocol === 'https:' ? https : http;
                    const req2 = c2.request(redirectUrl, { method: 'HEAD', headers }, (res2) => {
                        resolve(parseInt(res2.headers['content-length'] || '0', 10));
                    });
                    req2.on('error', () => resolve(0));
                    req2.end();
                } else if (res.statusCode === 200) {
                    resolve(parseInt(res.headers['content-length'] || '0', 10));
                } else {
                    resolve(0);
                }
            });
            req.on('error', () => resolve(0));
            req.end();
        });
    }

    async _doDownloadSequence(downloadId, repoId, filesToDownload, dir, hfToken) {
        const state = this.downloads.get(downloadId);

        // Initialize abort controller
        state.abortController = new AbortController();

        let globalTotal = 0;
        for (const file of filesToDownload) {
            globalTotal += await this._getFileSize(repoId, file, hfToken);
        }
        state.total = globalTotal;

        if (state.abortController.signal.aborted) return;

        state.status = 'downloading';

        let globalDownloaded = 0;
        let lastTime = Date.now();
        let lastBytes = 0;

        for (let i = 0; i < filesToDownload.length; i++) {
            const filename = filesToDownload[i];
            state.currentFileIndex = i;

            // Check if paused before starting each file
            while (state.paused && !state.abortController.signal.aborted) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (state.abortController.signal.aborted) {
                state.status = 'stopped';
                return;
            }

            // Use basename for local filename, but handle mmproj files specially
            let localFilename = path.basename(filename);
            const destPath = path.join(dir, localFilename);
            const tempPath = destPath + '.downloading';

            await new Promise((resolve, reject) => {
                const url = `https://huggingface.co/${repoId}/resolve/main/${filename}`;
                const headers = hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {};

                const makeRequest = (urlToFetch, redirectCount = 0) => {
                    if (redirectCount > 5) return reject(new Error('Too many redirects'));
                    if (state.abortController.signal.aborted) return reject(new Error('Download stopped'));

                    const parsedUrl = new URL(urlToFetch);
                    const client = parsedUrl.protocol === 'https:' ? https : http;

                    const req = client.get(urlToFetch, { headers, signal: state.abortController.signal }, (res) => {
                        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            res.resume();
                            return makeRequest(res.headers.location, redirectCount + 1);
                        }

                        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));

                        const fileStream = fs.createWriteStream(tempPath);
                        let localDownloaded = 0;

                        // Pipe immediately - this is the critical fix
                        // The response data must be piped to the file stream as it arrives
                        res.pipe(fileStream);

                        const updateProgress = () => {
                            state.downloaded = globalDownloaded + localDownloaded;
                            state.progress = state.total > 0 ? Math.round((state.downloaded / state.total) * 100) : 0;

                            const now = Date.now();
                            const elapsed = (now - lastTime) / 1000;
                            if (elapsed >= 1) {
                                state.speed = Math.round((state.downloaded - lastBytes) / elapsed);
                                lastTime = now;
                                lastBytes = state.downloaded;
                            }
                        };

                        res.on('data', (chunk) => {
                            localDownloaded += chunk.length;
                            updateProgress();
                        });


                        fileStream.on('finish', () => {
                            fileStream.close();
                            try {
                                // Verify file size before completing
                                const actualSize = fs.statSync(tempPath).size;
                                if (actualSize === 0) {
                                    try { fs.unlinkSync(tempPath); } catch (_) { }
                                    reject(new Error(`Downloaded file is empty (0 bytes): ${localFilename}`));
                                    return;
                                }

                                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                                fs.renameSync(tempPath, destPath);
                                globalDownloaded += localDownloaded;
                                resolve();
                            } catch (err) {
                                try { fs.unlinkSync(tempPath); } catch (_) { }
                                reject(err);
                            }
                        });

                        fileStream.on('error', (err) => {
                            try { fs.unlinkSync(tempPath); } catch (_) { }
                            reject(err);
                        });
                    });

                    req.on('error', (err) => {
                        if (err.message === 'Download stopped') return;
                        reject(err);
                    });
                    req.setTimeout(30000, () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });
                };

                makeRequest(url);
            });

            // Check if paused after completing each file
            while (state.paused && !state.abortController.signal.aborted) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        state.status = 'complete';
        state.progress = 100;
        state.paused = false;
    }

    getDownloadProgress(downloadId) {
        return this.downloads.get(downloadId) || null;
    }

    getAllDownloads() {
        const result = [];
        for (const [id, state] of this.downloads) {
            result.push({ ...state });
        }
        return result;
    }

    pauseDownload(downloadId) {
        const state = this.downloads.get(downloadId);
        if (!state) throw new Error('Download not found');
        if (state.status !== 'downloading') throw new Error('Cannot pause: download is not active');
        state.paused = true;
        state.status = 'paused';
    }

    resumeDownload(downloadId) {
        const state = this.downloads.get(downloadId);
        if (!state) throw new Error('Download not found');
        if (state.status !== 'paused') throw new Error('Cannot resume: download is not paused');
        state.paused = false;
        state.status = 'downloading';
        // The download will resume in the background via the _doDownloadSequence loop
    }

    stopDownload(downloadId) {
        const state = this.downloads.get(downloadId);
        if (!state) throw new Error('Download not found');
        if (state.abortController) {
            state.abortController.abort();
        }
        state.paused = false;
        state.status = 'stopped';
    }

    cleanupCompletedDownloads() {
        for (const [id, state] of this.downloads) {
            if (state.status === 'complete' || state.status === 'error' || state.status === 'stopped') {
                this.downloads.delete(id);
            }
        }
    }

    async searchHuggingFace(query) {
        const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=20`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);
        const data = await response.json();

        return data.map(model => ({
            id: model.modelId || model.id,
            author: model.author,
            downloads: model.downloads,
            likes: model.likes,
            tags: model.tags?.slice(0, 5) || [],
            lastModified: model.lastModified,
        }));
    }

    async getRepoFiles(repoId) {
        // Use the tree API with recursive=true to get actual file sizes
        const url = `https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to get repo: ${response.statusText}`);
        const data = await response.json();

        const rawFiles = (Array.isArray(data) ? data : [])
            .filter(f => f.type === 'file' && f.path && f.path.endsWith('.gguf') && !f.path.toLowerCase().includes('mmproj'));

        const groups = {};

        for (const f of rawFiles) {
            let logicalName = f.path;

            const folderMatch = f.path.match(/^([^/]+)\/.*?\.gguf$/);
            const splitMatch = f.path.match(/^(.*?)-(\d{5})-of-(\d{5})\.gguf$/);

            if (folderMatch) {
                logicalName = folderMatch[1];
            } else if (splitMatch) {
                logicalName = splitMatch[1];
            } else {
                logicalName = f.path.replace(/\.gguf$/, '');
            }

            // Extract quantization name if possible (e.g. UD-Q4_K_XL from Qwen3.5-35B-A3B-UD-Q4_K_XL)
            const parts = logicalName.split('-');
            const quantIndex = parts.findIndex(p => /^(?:(?:UD)?-?I?Q[1-8]|F16|F32|BF16|mmproj)/i.test(p) || p.toUpperCase() === 'UD');
            if (quantIndex !== -1) {
                logicalName = parts.slice(quantIndex).join('-');
            }

            if (!groups[logicalName]) {
                groups[logicalName] = {
                    name: logicalName,
                    files: [],
                    totalSize: 0,
                };
            }

            groups[logicalName].files.push(f.path);
            groups[logicalName].totalSize += (f.size || 0);
        }

        return Object.values(groups).map(g => ({
            name: g.name,
            totalSize: g.totalSize,
            sizeHuman: formatSize(g.totalSize),
            files: g.files.sort(),
            isSplit: g.files.length > 1,
        }));
    }

    migrateToFolderStructure() {
        const dir = this.getModelsDir();
        if (!fs.existsSync(dir)) return 0;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let migrated = 0;

        for (const entry of entries) {
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
                // Create folder based on filename
                let folderName = entry.name.replace(/\.gguf$/i, '');

                // Remove split suffix for folder name
                folderName = folderName.replace(/-(\d{5})-of-(\d{5})$/, '');

                // Sanitize folder name
                folderName = folderName.replace(/[^a-zA-Z0-9._-]/g, '_');

                const newDir = path.join(dir, folderName);

                // Skip if folder already exists
                if (fs.existsSync(newDir)) {
                    // Move file into existing folder
                    const filePath = path.join(dir, entry.name);
                    const newPath = path.join(newDir, entry.name);
                    if (!fs.existsSync(newPath)) {
                        fs.renameSync(filePath, newPath);
                        migrated++;
                    }
                    continue;
                }

                // Create new folder
                fs.mkdirSync(newDir, { recursive: true });

                // Move model file
                const filePath = path.join(dir, entry.name);
                const newPath = path.join(newDir, entry.name);
                fs.renameSync(filePath, newPath);

                // Move associated mmproj file if exists
                const mmprojName = entry.name.replace(/\.gguf$/i, '-mmproj.gguf');
                const mmprojPath = path.join(dir, mmprojName);
                if (fs.existsSync(mmprojPath)) {
                    const newMmprojPath = path.join(newDir, mmprojName);
                    fs.renameSync(mmprojPath, newMmprojPath);
                }

                migrated++;
            }
        }

        return migrated;
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

module.exports = ModelManager;
