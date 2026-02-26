const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const config = require('./config');

class ModelManager {
    constructor() {
        this.downloads = new Map(); // id -> { progress, total, speed, status, filename, error }
    }

    getModelsDir() {
        const cfg = config.load();
        return cfg.modelsDir || config.MODELS_DIR;
    }

    listModels() {
        const dir = this.getModelsDir();
        if (!fs.existsSync(dir)) return [];

        const files = fs.readdirSync(dir);
        const models = [];

        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (ext !== '.gguf') continue;

            // Skip split parts that are not the first one (00001)
            // Pattern: xxxxx-00002-of-00005.gguf
            const splitMatch = file.match(/-(\d{5})-of-(\d{5})\.gguf$/i);
            if (splitMatch && splitMatch[1] !== '00001') {
                continue;
            }

            const filePath = path.join(dir, file);
            try {
                const stat = fs.statSync(filePath);
                models.push({
                    name: file,
                    path: filePath,
                    size: stat.size,
                    sizeHuman: formatSize(stat.size),
                    modified: stat.mtime.toISOString(),
                });
            } catch (_) { /* skip */ }
        }

        return models.sort((a, b) => b.modified.localeCompare(a.modified));
    }

    deleteModel(filename) {
        const filePath = path.join(this.getModelsDir(), filename);
        if (!fs.existsSync(filePath)) {
            throw new Error('Model not found');
        }
        fs.unlinkSync(filePath);
        return true;
    }

    async downloadFromHuggingFace(repoId, filenames, hfToken) {
        const filesToDownload = Array.isArray(filenames) ? filenames : [filenames];
        if (filesToDownload.length === 0) throw new Error("No files to download");

        const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dir = this.getModelsDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Use a logical name for the display (e.g. Q4_K_M or first file)
        let displayName = filesToDownload[0];
        const folderMatch = displayName.match(/^([^/]+)\//);
        if (folderMatch) displayName = folderMatch[1];
        else {
            const splitMatch = displayName.match(/^(.*?)-\d{5}-of-\d{5}\.gguf$/);
            if (splitMatch) displayName = splitMatch[1];
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
            startTime: Date.now(),
            filesCount: filesToDownload.length,
            currentFileIndex: 0
        };

        this.downloads.set(downloadId, downloadState);

        // Start download in background
        this._doDownloadSequence(downloadId, repoId, filesToDownload, dir, hfToken).catch(err => {
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

        let globalTotal = 0;
        for (const file of filesToDownload) {
            globalTotal += await this._getFileSize(repoId, file, hfToken);
        }
        state.total = globalTotal;
        state.status = 'downloading';

        let globalDownloaded = 0;
        let lastTime = Date.now();
        let lastBytes = 0;

        for (let i = 0; i < filesToDownload.length; i++) {
            const filename = filesToDownload[i];
            state.currentFileIndex = i;

            // Flatten directory structure "Q4_K_M/model.gguf" -> "model.gguf"
            const localFilename = path.basename(filename);
            const destPath = path.join(dir, localFilename);
            const tempPath = destPath + '.downloading';

            await new Promise((resolve, reject) => {
                const url = `https://huggingface.co/${repoId}/resolve/main/${filename}`;
                const headers = hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {};

                const makeRequest = (urlToFetch, redirectCount = 0) => {
                    if (redirectCount > 5) return reject(new Error('Too many redirects'));

                    const parsedUrl = new URL(urlToFetch);
                    const client = parsedUrl.protocol === 'https:' ? https : http;

                    const req = client.get(urlToFetch, { headers }, (res) => {
                        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            res.resume();
                            return makeRequest(res.headers.location, redirectCount + 1);
                        }

                        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));

                        const fileStream = fs.createWriteStream(tempPath);
                        let localDownloaded = 0;

                        res.on('data', (chunk) => {
                            localDownloaded += chunk.length;
                            state.downloaded = globalDownloaded + localDownloaded;
                            state.progress = state.total > 0 ? Math.round((state.downloaded / state.total) * 100) : 0;

                            const now = Date.now();
                            const elapsed = (now - lastTime) / 1000;
                            if (elapsed >= 1) {
                                state.speed = Math.round((state.downloaded - lastBytes) / elapsed);
                                lastTime = now;
                                lastBytes = state.downloaded;
                            }
                        });

                        res.pipe(fileStream);

                        fileStream.on('finish', () => {
                            fileStream.close();
                            try {
                                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                                fs.renameSync(tempPath, destPath);
                                globalDownloaded += localDownloaded;
                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        });

                        fileStream.on('error', (err) => {
                            try { fs.unlinkSync(tempPath); } catch (_) { }
                            reject(err);
                        });
                    });

                    req.on('error', reject);
                    req.setTimeout(30000, () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });
                };

                makeRequest(url);
            });
        }

        state.status = 'complete';
        state.progress = 100;
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

    cleanupCompletedDownloads() {
        for (const [id, state] of this.downloads) {
            if (state.status === 'complete' || state.status === 'error') {
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
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

module.exports = ModelManager;
