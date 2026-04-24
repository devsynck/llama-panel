import { useState, useEffect } from 'react'
import { getConfig, saveConfig, browseDirectory } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import Toggle from '../ui/Toggle'
import { Save } from 'lucide-react'

export default function ConfigPage() {
  const { addToast } = useToast()
  const [cfg, setCfg] = useState({
    host: '', port: 8080, apiKey: '', extraArgs: '', modelsDir: '', managerPort: 7654,
    contBatching: false, mlock: false, mmap: false, cachePrompt: false, metrics: false, slots: false,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getConfig().then(setCfg).catch(() => addToast('Failed to load config', 'error'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = await saveConfig(cfg)
      setCfg(data.config || cfg)
      addToast('Configuration saved!', 'success')
    } catch (err) {
      addToast('Failed to save: ' + err.message, 'error')
    }
    setSaving(false)
  }

  const handleBrowse = async () => {
    addToast('Opening folder picker...', 'info')
    try {
      const data = await browseDirectory()
      if (data.path) {
        setCfg(prev => ({ ...prev, modelsDir: data.path }))
        handleSave()
      }
    } catch (err) {
      addToast('Failed to open folder picker', 'error')
    }
  }

  const update = (key, value) => setCfg(prev => ({ ...prev, [key]: value }))

  const inputCls = 'bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] placeholder:text-[var(--text-dim)]'

  const sectionCls = 'bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-5 transition-colors duration-300'
  const headingCls = 'text-base font-semibold mb-4 pb-3 border-b border-[var(--border)] text-[var(--text-primary)]'

  return (
    <div>
      <PageHeader title="Configuration">
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-5">
        <div className={sectionCls}>
          <h3 className={headingCls}>Network</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Host</span>
              <input className={inputCls} value={cfg.host} onChange={e => update('host', e.target.value)} placeholder="127.0.0.1" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Port</span>
              <input className={inputCls} type="number" value={cfg.port} onChange={e => update('port', parseInt(e.target.value) || 8080)} placeholder="8080" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">API Key</span>
              <input className={inputCls} value={cfg.apiKey} onChange={e => update('apiKey', e.target.value)} placeholder="Optional API key" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Manager Port</span>
              <input className={inputCls} type="number" value={cfg.managerPort} onChange={e => update('managerPort', parseInt(e.target.value) || 7654)} placeholder="7654" />
              <span className="text-xs text-[var(--text-dim)]">Port for this management UI (requires restart)</span>
            </label>
          </div>
        </div>

        <div className={sectionCls}>
          <h3 className={headingCls}>Model</h3>
          <div className="grid grid-cols-1 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Models Directory</span>
              <div className="flex gap-2">
                <input className={`${inputCls} flex-1`} value={cfg.modelsDir} onChange={e => update('modelsDir', e.target.value)} placeholder="Path to folder containing .gguf models" />
                <Button variant="secondary" size="sm" onClick={handleBrowse}>Browse</Button>
              </div>
              <span className="text-xs text-[var(--text-dim)]">Set the folder where your .gguf model files are stored</span>
            </label>
          </div>
        </div>

        <div className={sectionCls}>
          <h3 className={headingCls}>Options</h3>
          <div className="flex gap-8 flex-wrap">
            <div className="flex-1 min-w-[300px]">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
                <Toggle checked={cfg.contBatching} onChange={v => update('contBatching', v.target.checked)} label="Continuous Batching" />
                <Toggle checked={cfg.mlock} onChange={v => update('mlock', v.target.checked)} label="Memory Lock (mlock)" />
                <Toggle checked={cfg.mmap} onChange={v => update('mmap', v.target.checked)} label="Memory Map (mmap)" />
                <Toggle checked={cfg.cachePrompt} onChange={v => update('cachePrompt', v.target.checked)} label="Prompt Caching" />
              </div>
            </div>
            <div className="flex-1 min-w-[300px]">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
                <Toggle checked={cfg.metrics} onChange={v => update('metrics', v.target.checked)} label="Enable Metrics" />
                <Toggle checked={cfg.slots} onChange={v => update('slots', v.target.checked)} label="Enable Slots Endpoint" />
              </div>
            </div>
          </div>
        </div>

        <div className={sectionCls}>
          <h3 className={headingCls}>Extra Arguments</h3>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Additional CLI arguments</span>
            <input className={inputCls} value={cfg.extraArgs} onChange={e => update('extraArgs', e.target.value)} placeholder="e.g. --rope-scaling yarn --rope-freq-base 10000" />
            <span className="text-xs text-[var(--text-dim)]">Any additional flags to pass to llama-server</span>
          </label>
        </div>
      </div>
    </div>
  )
}
