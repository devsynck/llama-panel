import { useState, useCallback } from 'react'
import { useStatus } from '../../context/StatusContext'
import { useToast } from '../../context/ToastContext'
import { formatUptime, formatSize, formatNumber, shortenPath } from '../../lib/format'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import StatCard from '../ui/StatCard'
import ProgressBar from '../ui/ProgressBar'
import EmptyState from '../ui/EmptyState'
import Spinner from '../ui/Spinner'
import { Play, Square, RefreshCw, Activity, Clock, Users, Monitor, Zap, Cpu, HardDrive, Thermometer, Database, BarChart3, Bolt } from 'lucide-react'

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

  let activeSlots = 0
  const totalSlots = state.slots?.length || 0
  if (state.slots) activeSlots = state.slots.filter(sl => sl.is_processing || (sl.id_task !== undefined && sl.id_task !== -1)).length
  const slotsText = totalSlots > 0 ? `${activeSlots} / ${totalSlots}` : '—'

  let ctxText = '—'
  if (state.slots?.length > 0) {
    const baseCtx = state.slots[0].n_ctx || 0
    const usedCtx = state.slots.reduce((max, sl) => Math.max(max, sl.n_decoded ?? (sl.n_prompt_tokens_processed || 0) + (sl.n_tokens_predicted || 0)), 0)
    ctxText = baseCtx > 0 ? `${usedCtx.toLocaleString()} / ${baseCtx.toLocaleString()}` : `${usedCtx.toLocaleString()} tokens`
  }

  let speedText = '—'
  if (state.metrics) {
    const tps = state.metrics.tokens_predicted_seconds || state.metrics.predicted_tokens_seconds || state.metrics.t_token_generation_mean
    if (tps > 0) speedText = `${tps.toFixed(2)} t/s`
    else if (state.health?.tokens_per_second > 0) speedText = `${state.health.tokens_per_second.toFixed(2)} t/s`
  }

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

  let kvPct = null, kvTokens = '', kvVariant = 'default'
  if (state.metrics?.kv_cache_usage_ratio !== undefined) {
    const ratio = state.metrics.kv_cache_usage_ratio
    kvPct = (ratio * 100).toFixed(1)
    kvVariant = ratio > 0.85 ? 'danger' : ratio > 0.6 ? 'warn' : 'default'
    const tokCount = state.metrics.kv_cache_tokens_count ?? state.metrics.kv_cache_tokens
    if (tokCount !== undefined) kvTokens = `${Math.round(tokCount).toLocaleString()} tokens`
  }

  let reqProc = '—', reqDeferred = ''
  if (state.metrics) {
    reqProc = state.metrics.requests_processing !== undefined ? `${Math.round(state.metrics.requests_processing)} active` : '—'
    if (state.metrics.requests_deferred > 0) reqDeferred = `${Math.round(state.metrics.requests_deferred)} queued`
  }

  let totalGen = '—', totalPrompt = ''
  if (state.metrics?.tokens_predicted_total !== undefined) {
    totalGen = formatNumber(state.metrics.tokens_predicted_total) + ' gen'
    if (state.metrics.prompt_tokens_total !== undefined) totalPrompt = formatNumber(state.metrics.prompt_tokens_total) + ' prompt'
  }

  const detailCard = 'bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-5 transition-colors duration-300'
  const detailHeading = 'text-sm font-semibold text-[var(--text-secondary)] mb-4 pb-3 border-b border-[var(--border)]'

  return (
    <div>
      <PageHeader title="Dashboard">
        <div className="flex gap-2.5">
          <Button
            variant={isRunning ? 'warning' : 'success'}
            onClick={() => isRunning ? doAction('restart', 'restarting') : doAction('start', 'starting')}
            disabled={s === 'starting'}
          >
            {actionLoading === 'start' || actionLoading === 'restart' ? <Spinner /> : isRunning ? <RefreshCw size={16} /> : <Play size={16} />}
            {isRunning ? 'Restart Server' : 'Start Server'}
          </Button>
          <Button variant="danger" onClick={() => doAction('stop', 'stopping')} disabled={!isRunning || actionLoading === 'stop'}>
            {actionLoading === 'stop' ? <Spinner /> : <Square size={16} />}
            Stop Server
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 mb-6">
        <StatCard icon={statusIcons[s]} label="Status" value={statusText} />
        <StatCard icon={{ element: <Clock size={24} className="text-[var(--success)]" />, style: { background: 'var(--success-bg)', color: 'var(--success)' } }} label="Uptime" value={uptime} />
        <StatCard icon={{ element: <Users size={24} className="text-violet-400" />, style: { background: 'rgba(168,85,247,0.12)', color: '#a855f7' } }} label="Active Slots" value={slotsText} />
        <StatCard icon={{ element: <Monitor size={24} className="text-[var(--warning)]" />, style: { background: 'var(--warning-bg)', color: 'var(--warning)' } }} label="Context Usage" value={ctxText} />
        <StatCard icon={{ element: <Zap size={24} className="text-[var(--success)]" />, style: { background: 'var(--success-bg)', color: 'var(--success)' } }} label="Token Speed" value={speedText} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 mb-6">
        <StatCard icon={{ element: <HardDrive size={24} className="text-[var(--accent)]" />, style: { background: 'var(--accent-subtle)', color: 'var(--accent)' } }} label="System RAM" value={ramUsed} secondaryValue={ramTotal} />
        <StatCard icon={{ element: <Cpu size={24} className="text-[var(--warning)]" />, style: { background: 'var(--warning-bg)', color: 'var(--warning)' } }} label="GPU Usage" value={gpuText} />
        <StatCard icon={{ element: <Database size={24} className="text-[var(--danger)]" />, style: { background: 'var(--danger-bg)', color: 'var(--danger)' } }} label="VRAM Usage" value={vramUsed} secondaryValue={vramTotal} />
        <StatCard icon={{ element: <Thermometer size={24} className="text-pink-400" />, style: { background: 'rgba(236,72,153,0.12)', color: '#ec4899' } }} label="GPU Temps & Power" value={tempText} secondaryValue={powerText} />
      </div>

      <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 mb-6">
        <div className="flex items-center gap-4 p-5 bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px]">
          <div className="w-12 h-12 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(20,184,166,0.12)', color: '#14b8a6' }}>
            <Database size={24} className="text-teal-400" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="text-[0.72rem] font-medium text-[var(--text-muted)] uppercase tracking-wider">KV Cache</span>
            <div className="flex items-baseline gap-2.5 mb-2">
              <span className="text-base font-bold text-[var(--text-primary)]">{kvPct !== null ? `${kvPct}%` : '—'}</span>
              {kvTokens && <span className="text-xs text-[var(--text-muted)]">{kvTokens}</span>}
            </div>
            <ProgressBar percent={kvPct !== null ? parseFloat(kvPct) : 0} variant={kvVariant} />
          </div>
        </div>
        <StatCard icon={{ element: <BarChart3 size={24} className="text-[var(--accent)]" />, style: { background: 'var(--accent-subtle)', color: '#818cf8' } }} label="Requests" value={reqProc} secondaryValue={reqDeferred} />
        <StatCard icon={{ element: <Bolt size={24} className="text-[var(--warning)]" />, style: { background: 'var(--warning-bg)', color: 'var(--warning)' } }} label="Total Generated" value={totalGen} secondaryValue={totalPrompt} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={detailCard}>
          <h3 className={detailHeading}>Slot Details</h3>
          {!state.slots?.length ? (
            <EmptyState>No active slots</EmptyState>
          ) : (
            <div className="flex flex-col">
              {state.slots.map((slot, i) => {
                const isActive = slot.is_processing || (slot.id_task !== undefined && slot.id_task !== -1)
                let decoded = slot.n_decoded ?? (slot.n_prompt_tokens_processed || 0) + (slot.n_tokens_predicted || 0)
                return (
                  <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                    <span className={`px-2 py-0.5 rounded text-[0.65rem] font-semibold uppercase tracking-wider ${isActive ? 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/25' : 'bg-[var(--bg-input)] text-[var(--text-muted)]'}`}>
                      {isActive ? 'ACTIVE' : 'IDLE'}
                    </span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">Slot {slot.id ?? i} — {decoded.toLocaleString()} tokens decoded</span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">{isActive ? '⚡' : '💤'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={detailCard}>
          <h3 className={detailHeading}>Server Health</h3>
          {!state.health && !state.metrics ? (
            <EmptyState>Server not running</EmptyState>
          ) : (() => {
            const items = []
            if (state.health?.status) items.push(['Status', state.health.status])
            if (state.health?.slots_idle !== undefined) items.push(['Idle Slots', state.health.slots_idle])
            if (state.metrics) {
              if (state.metrics.prompt_tokens_seconds !== undefined) items.push(['Prompt Speed', `${state.metrics.prompt_tokens_seconds.toFixed(2)} t/s`])
              if (state.metrics.predicted_tokens_seconds !== undefined) items.push(['Gen Speed', `${state.metrics.predicted_tokens_seconds.toFixed(2)} t/s`])
              if (state.metrics.prompt_tokens_total !== undefined) items.push(['Total Prompt', state.metrics.prompt_tokens_total.toLocaleString()])
              if (state.metrics.tokens_predicted_total !== undefined) items.push(['Total Gen', state.metrics.tokens_predicted_total.toLocaleString()])
            } else if (state.health?.tokens_per_second !== undefined) {
              items.push(['Tokens/sec', state.health.tokens_per_second.toFixed(2)])
            }
            if (state.health?.model) items.push(['Model', shortenPath(state.health.model)])
            return items.length === 0 ? <EmptyState>No health data</EmptyState> : (
              <div className="flex flex-col">
                {items.map(([label, value], i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-b-0 text-sm">
                    <span className="text-[var(--text-secondary)]">{label}</span>
                    <span className="font-mono font-medium text-[var(--text-primary)]">{value}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
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
    </div>
  )
}
