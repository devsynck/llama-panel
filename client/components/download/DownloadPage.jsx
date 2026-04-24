import { useState, useCallback } from 'react'
import { searchModels, getRepoFiles, downloadModel, pauseDownload, resumeDownload, stopDownload } from '../../api/client'
import { useStatus } from '../../context/StatusContext'
import { useToast } from '../../context/ToastContext'
import { formatSize, formatNumber } from '../../lib/format'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import Tag from '../ui/Tag'
import Modal from '../ui/Modal'
import ProgressBar from '../ui/ProgressBar'
import EmptyState from '../ui/EmptyState'
import Spinner from '../ui/Spinner'
import { Search, X } from 'lucide-react'

export default function DownloadPage() {
  const { state } = useStatus()
  const { addToast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [repoModal, setRepoModal] = useState(null)
  const [repoFiles, setRepoFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  const handleSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      const data = await searchModels(q)
      setResults(data)
    } catch (err) {
      addToast('Search failed: ' + err.message, 'error')
      setResults([])
    }
    setSearching(false)
  }, [query])

  const openRepo = async (repoId) => {
    setRepoModal(repoId)
    setLoadingFiles(true)
    try {
      const [owner, repo] = repoId.split('/')
      const data = await getRepoFiles(owner, repo)
      setRepoFiles(data)
    } catch (err) {
      addToast('Failed to load repo files', 'error')
      setRepoFiles([])
    }
    setLoadingFiles(false)
  }

  const handleDownload = async (repoId, files) => {
    try {
      await downloadModel(repoId, files)
      const label = files.length > 1 ? files[0].split('-00001')[0] + ` (${files.length} parts)` : files[0]
      addToast(`Started downloading ${label}...`, 'success')
      setRepoModal(null)
    } catch (err) {
      addToast('Download failed: ' + err.message, 'error')
    }
  }

  const resultCard = 'flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-4 transition-all hover:border-[var(--accent)] cursor-pointer hover:shadow-[var(--shadow-card-hover)]'
  const dlCard = 'bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-4 transition-colors duration-300'

  return (
    <div>
      <PageHeader title="Download Models" />

      <div className="mb-6">
        <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] px-4 py-2 transition-colors focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]">
          <Search size={20} className="text-[var(--text-dim)] shrink-0" />
          <input
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm outline-none py-2 placeholder:text-[var(--text-dim)]"
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search HuggingFace for GGUF models..."
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]) }} className="bg-transparent border-none text-[var(--text-dim)] cursor-pointer p-1 hover:text-[var(--text-primary)] hover:bg-[var(--accent-subtle)] rounded">
              <X size={16} />
            </button>
          )}
          <Button onClick={handleSearch}>Search</Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-7">
          {results.map(r => (
            <div key={r.id} onClick={() => openRepo(r.id)} className={resultCard}>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <span className="font-semibold text-[var(--accent)] text-sm">{r.id}</span>
                <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                  <span>{formatNumber(r.downloads)} downloads</span>
                  <span>{formatNumber(r.likes)} likes</span>
                </div>
                {r.tags?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-1">{r.tags.slice(0, 5).map(t => <Tag key={t}>{t}</Tag>)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {searching && <EmptyState><Spinner /> Searching HuggingFace...</EmptyState>}
      {!searching && results.length === 0 && query && <EmptyState>No GGUF models found. Try a different search.</EmptyState>}

      <Modal open={!!repoModal} onClose={() => setRepoModal(null)} title={repoModal || ''} width="w-[600px]">
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {loadingFiles ? (
            <EmptyState><Spinner /> Loading files...</EmptyState>
          ) : repoFiles.length === 0 ? (
            <EmptyState>No GGUF files found in this repo.</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {repoFiles.map(f => (
                <div key={f.name} className="flex items-center justify-between p-3 rounded-md hover:bg-[var(--accent-subtle)] transition-colors gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium text-sm text-[var(--text-primary)]">
                      {f.name}
                      {f.isSplit && <span className="text-xs bg-[var(--bg-input)] px-1.5 py-0.5 rounded ml-2">Split ({f.files.length} parts)</span>}
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{f.sizeHuman}</span>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => handleDownload(repoModal, f.files)}>Download</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <div className="mt-2">
        <h3 className="text-base font-semibold text-[var(--text-secondary)] mb-3">Active Downloads</h3>
        {state.downloads?.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {state.downloads.map(d => (
              <div key={d.id} className={dlCard}>
                <div className="flex justify-between items-center mb-2.5">
                  <span className="font-semibold text-[var(--text-primary)] text-sm">{d.filename}</span>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${d.status === 'complete' ? 'text-[var(--success)]' : d.status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>{d.status}</span>
                </div>
                <ProgressBar percent={d.progress} variant={d.status === 'complete' ? 'success' : d.status === 'error' ? 'error' : 'default'} />
                <div className="flex gap-4 text-xs text-[var(--text-muted)] mt-2">
                  <span>{d.progress}%</span>
                  <span>{formatSize(d.downloaded)} / {formatSize(d.total)}</span>
                  {d.speed > 0 && <span>{formatSize(d.speed)}/s</span>}
                  {d.error && <span className="text-[var(--danger)]">{d.error}</span>}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                  {d.status === 'downloading' && <Button variant="secondary" size="sm" onClick={() => pauseDownload(d.id)}>Pause</Button>}
                  {d.status === 'paused' && <Button variant="primary" size="sm" onClick={() => resumeDownload(d.id)}>Resume</Button>}
                  {(d.status === 'downloading' || d.status === 'paused') && <Button variant="danger" size="sm" onClick={() => stopDownload(d.id)}>Stop</Button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No active downloads</EmptyState>
        )}
      </div>
    </div>
  )
}
