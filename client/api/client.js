async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data
}

export const getStatus = () => api('/api/status')

export const getConfig = () => api('/api/config')
export const saveConfig = (cfg) => api('/api/config', { method: 'POST', body: JSON.stringify(cfg) })

export const startServer = () => api('/api/start', { method: 'POST' })
export const stopServer = () => api('/api/stop', { method: 'POST' })
export const restartServer = () => api('/api/restart', { method: 'POST' })
export const hotswapModel = (modelPath) => api('/api/hotswap', { method: 'POST', body: JSON.stringify({ modelPath }) })

export const getModels = () => api('/api/models')
export const deleteModel = (name) => api(`/api/models/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const searchModels = (q) => api(`/api/models/search?q=${encodeURIComponent(q)}`)
export const getRepoFiles = (owner, repo) => api(`/api/models/repo-files/${owner}/${repo}`)
export const downloadModel = (repoId, filenames) => api('/api/models/download', { method: 'POST', body: JSON.stringify({ repoId, filenames }) })
export const pauseDownload = (id) => api(`/api/downloads/${id}/pause`, { method: 'POST' })
export const resumeDownload = (id) => api(`/api/downloads/${id}/resume`, { method: 'POST' })
export const stopDownload = (id) => api(`/api/downloads/${id}/stop`, { method: 'POST' })

export const getPresets = () => api('/api/presets')
export const getPreset = (id) => api(`/api/presets/${id}`)
export const createPreset = (data) => api('/api/presets', { method: 'POST', body: JSON.stringify(data) })
export const updatePreset = (id, data) => api(`/api/presets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deletePreset = (id) => api(`/api/presets/${id}`, { method: 'DELETE' })
export const activatePreset = (id) => api(`/api/presets/${id}/activate`, { method: 'POST' })
export const deactivatePreset = () => api('/api/presets/deactivate', { method: 'POST' })

export const browseDirectory = () => fetch('/api/browse-directory').then(r => r.json())

export const getLogs = (n = 200) => api(`/api/logs?n=${n}`)
