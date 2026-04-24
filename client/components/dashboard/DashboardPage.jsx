import { useState, useEffect, useCallback } from 'react'
import { useStatus } from '../../context/StatusContext'
import { useToast } from '../../context/ToastContext'
import { getModels, getConfig, saveConfig, hotswapModel } from '../../api/client'
import { formatUptime, formatSize, shortenPath } from '../../lib/format'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import StatCard from '../ui/StatCard'
import Spinner from '../ui/Spinner'
import PresetModal from '../presets/PresetModal'
import { Play, Square, RefreshCw, Activity, Clock, Cpu, HardDrive, Thermometer, Database, SlidersHorizontal } from 'lucide-react'

const statusIcons = {
  stopped: { element: <Activity size={24} className="text-[var(--accent)]" />, style: { background: 'var(--accent-subtle)', color: 'var(--accent)' } },
  starting: { element: <Spinner />, style: { background: 'var(--warning-bg)', color: 'var(--warning)' } },
  running: { element: <Activity size={24} className="text-[var(--success)]" />, style: { background: 'var(--success-bg)', color: 'var(--success)' } },
  error: { element: <Activity size={24} className="text-[var(--danger)]" />, style: { background: 'var(--danger-bg)', color: 'var(--danger)' } },
}

export default function DashboardPage() {
  const { state } = useStatus()
  const { addToast } = useToast()
  const [actionLoading, setActionLoading] = useState(null)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [presetOpen, setPresetOpen] = useState(false)

  useEffect(() => {
    Promise.all([getModels(), getConfig()])
      .then(([modelList, cfg]) => {
        setModels(modelList)
        setSelectedModel(cfg.modelPath || '')
      })
      .catch(() => {})
  }, [])

  const handleModelSelect = async (path) => {
    setSelectedModel(path)
    try {
      const cfg = await getConfig()
      cfg.modelPath = path
      await saveConfig(cfg)
      if (isRunning) {
        setActionLoading('hotswap')
        await hotswapModel(path)
        addToast('Model hotswapped', 'success')
        setActionLoading(null)
      }
    } catch (err) {
      addToast(err.message, 'error')
      setActionLoading(null)
    }
  }

  const doAction = useCallback(async (action, label) => {
    setActionLoading(action)
    try {
      const res = await fetch(`/api/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${label}`)
      addToast(`Server is ${label}...`, action === 'start' ? 'success' : 'info')
    } catch (err) {
      addToast(err.message, 'error')
    }
    setActionLoading(null)
  }, [addToast])

  const s = state.status || 'stopped'
  const statusText = { stopped: 'Offline', starting: 'Starting...', running: 'Running', error: 'Error' }[s]
  const isRunning = s === 'running'
  const uptime = state.uptime > 0 ? formatUptime(state.uptime) : '—'

  const gpu = state.sysInfo?.gpu
  const ramUsed = state.sysInfo?.ram ? formatSize(state.sysInfo.ram.used) : '—'
  const ramTotal = state.sysInfo?.ram ? `/ ${formatSize(state.sysInfo.ram.total)}` : '—'
  const gpuText = gpu?.vramTotal > 0 ? `${gpu.utilization.toFixed(1)}%` : '—'
  const vramUsed = gpu?.vramTotal > 0 ? formatSize(gpu.vramUsed * 1024 * 1024) : '—'
  const vramTotal = gpu?.vramTotal > 0 ? `/ ${formatSize(gpu.vramTotal * 1024 * 1024)}` : '—'
  let tempText = '—', powerText = '—'
  if (gpu) {
    const core = gpu.tempCore > 0 ? `${gpu.tempCore.toFixed(0)}°C` : ''
    const mem = gpu.tempMem > 0 ? `${gpu.tempMem.toFixed(0)}°C (Mem)` : ''
    tempText = [core, mem].filter(Boolean).join(' | ') || '—'
    powerText = gpu.powerDraw > 0 ? `${gpu.powerDraw.toFixed(1)} W Draw` : '—'
  }

  const detailCard = 'bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-5 transition-colors duration-300'
  const detailHeading = 'text-sm font-semibold text-[var(--text-secondary)] mb-4 pb-3 border-b border-[var(--border)]'

  return (
    <div>
      <PageHeader title="Dashboard">
        <div className="flex items-center gap-2.5">
          <select
            className="bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-2 text-sm outline-none appearance-none cursor-pointer transition-colors focus:border-[var(--accent)] max-w-[300px]"
            value={selectedModel}
            onChange={e => handleModelSelect(e.target.value)}
            disabled={!!actionLoading}
          >
            <option value="">Select model...</option>
            {models.map(m => (
              <option key={m.path} value={m.path}>{m.name}</option>
            ))}
          </select>
          <Button
            variant={isRunning ? 'warning' : 'success'}
            onClick={() => isRunning ? doAction('restart', 'restarting') : doAction('start', 'starting')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'start' || actionLoading === 'restart' ? <Spinner /> : isRunning ? <RefreshCw size={16} /> : <Play size={16} />}
            {isRunning ? 'Restart Server' : 'Start Server'}
          </Button>
          <Button variant="danger" onClick={() => doAction('stop', 'stopping')} disabled={!isRunning || actionLoading === 'stop'}>
            {actionLoading === 'stop' ? <Spinner /> : <Square size={16} />}
            Stop Server
          </Button>
          <Button variant="secondary" onClick={() => setPresetOpen(true)}>
            <SlidersHorizontal size={16} />
            Presets
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 mb-6">
        <StatCard icon={statusIcons[s]} label="Status" value={statusText} />
        <StatCard icon={{ element: <Clock size={24} className="text-[var(--success)]" />, style: { background: 'var(--success-bg)', color: 'var(--success)' } }} label="Uptime" value={uptime} />
        <StatCard icon={{ element: <HardDrive size={24} className="text-[var(--accent)]" />, style: { background: 'var(--accent-subtle)', color: 'var(--accent)' } }} label="System RAM" value={ramUsed} secondaryValue={ramTotal} />
        <StatCard icon={{ element: <Cpu size={24} className="text-[var(--warning)]" />, style: { background: 'var(--warning-bg)', color: 'var(--warning)' } }} label="GPU Usage" value={gpuText} />
        <StatCard icon={{ element: <Database size={24} className="text-[var(--danger)]" />, style: { background: 'var(--danger-bg)', color: 'var(--danger)' } }} label="VRAM Usage" value={vramUsed} secondaryValue={vramTotal} />
        <StatCard icon={{ element: <Thermometer size={24} className="text-pink-400" />, style: { background: 'rgba(236,72,153,0.12)', color: '#ec4899' } }} label="GPU Temps & Power" value={tempText} secondaryValue={powerText} />
      </div>

      {state.activeModels?.length > 0 && (
        <div className={detailCard}>
          <h3 className={detailHeading}>
            Active Models
            <span className="inline-flex items-center justify-center w-5 h-5 bg-[var(--accent)] text-white rounded-full text-[0.65rem] font-bold ml-2 align-middle">{state.activeModels.length}</span>
          </h3>
          <div className="flex flex-col gap-2">
            {state.activeModels.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-2.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-md">
                <div className="w-8 h-8 flex items-center justify-center bg-[var(--accent-subtle)] rounded-md shrink-0">
                  <Database size={16} className="text-[var(--accent)]" />
                </div>
                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)] truncate">{m.id}</span>
                  <span className="text-xs text-[var(--text-muted)]">{m.owned_by || 'llamacpp'}</span>
                </div>
                <span className="text-xs font-semibold text-[var(--success)] shrink-0">live</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.serverArgs && (
        <div className={detailCard}>
          <h3 className={detailHeading}>Server Command</h3>
          <code className="block text-xs text-[var(--text-secondary)] font-mono leading-relaxed break-all whitespace-pre-wrap select-all bg-[var(--bg-input)] border border-[var(--border)] rounded-md p-3">
            llama-server {state.serverArgs}
          </code>
        </div>
      )}

      <PresetModal open={presetOpen} onClose={() => setPresetOpen(false)} />
    </div>
  )
}
