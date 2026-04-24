import { useState, useEffect } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Toggle from '../ui/Toggle'
import { useToast } from '../../context/ToastContext'
import { getPresets, savePreset, deletePreset, applyPreset } from '../../api/client'
import { Save, Check, Trash2, Plus, SlidersHorizontal } from 'lucide-react'

const CACHE_TYPES = [
  { value: '', label: 'Default (f16)' },
  { value: 'f32', label: 'f32' },
  { value: 'f16', label: 'f16' },
  { value: 'bf16', label: 'bf16' },
  { value: 'q8_0', label: 'q8_0' },
  { value: 'q4_0', label: 'q4_0' },
  { value: 'q4_1', label: 'q4_1' },
  { value: 'iq4_nl', label: 'iq4_nl' },
  { value: 'q5_0', label: 'q5_0' },
  { value: 'q5_1', label: 'q5_1' },
]

const DEFAULT_PARAMS = {
  fit: true,
  ctxSize: 4096,
  noMmap: false,
  flashAttn: 'on',
  temp: 0.8,
  topK: 40,
  topP: 0.95,
  minP: 0.05,
  repeatPenalty: 1.0,
  presencePenalty: 0.0,
  cacheTypeK: '',
  cacheTypeV: '',
}

export default function PresetModal({ open, onClose }) {
  const { addToast } = useToast()
  const [presets, setPresets] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [presetName, setPresetName] = useState('')
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      getPresets().then(setPresets).catch(() => addToast('Failed to load presets', 'error'))
    }
  }, [open])

  const handleLoad = (preset) => {
    setSelectedId(preset.id)
    setPresetName(preset.name)
    setParams({ ...DEFAULT_PARAMS, ...preset.params })
  }

  const handleNew = () => {
    setSelectedId(null)
    setPresetName('')
    setParams(DEFAULT_PARAMS)
  }

  const handleSave = async () => {
    if (!presetName.trim()) { addToast('Enter a preset name', 'error'); return }
    setSaving(true)
    try {
      const data = await savePreset({ id: selectedId, name: presetName.trim(), params })
      setPresets(data.presets)
      if (!selectedId) setSelectedId(data.presets[data.presets.length - 1].id)
      addToast('Preset saved', 'success')
    } catch (err) {
      addToast('Failed to save preset', 'error')
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      const data = await deletePreset(id)
      setPresets(data.presets)
      if (selectedId === id) { setSelectedId(null); setPresetName(''); setParams(DEFAULT_PARAMS) }
      addToast('Preset deleted', 'success')
    } catch (err) {
      addToast('Failed to delete preset', 'error')
    }
  }

  const handleApply = async () => {
    if (!selectedId) { addToast('Select a preset first', 'error'); return }
    try {
      await applyPreset(selectedId)
      addToast('Preset applied to config', 'success')
      onClose()
    } catch (err) {
      addToast('Failed to apply preset', 'error')
    }
  }

  const update = (key, value) => setParams(prev => ({ ...prev, [key]: value }))

  const inputCls = 'bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]'
  const sectionHeading = 'text-[0.65rem] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3'

  return (
    <Modal open={open} onClose={onClose} title="Model Presets" width="w-[820px]">
      <div className="flex min-h-0">
        {/* Preset list */}
        <div className="w-48 shrink-0 border-r border-[var(--border)] flex flex-col">
          <div className="p-2.5 border-b border-[var(--border)]">
            <Button variant="secondary" size="sm" onClick={handleNew} className="w-full justify-center">
              <Plus size={13} /> New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {presets.length === 0 ? (
              <p className="text-[0.7rem] text-[var(--text-muted)] text-center py-6 px-3">No saved presets</p>
            ) : presets.map(p => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors group ${selectedId === p.id ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-input)]'}`}
                onClick={() => handleLoad(p)}
              >
                <span className={`text-xs truncate flex-1 ${selectedId === p.id ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)]'}`}>{p.name}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger)] transition-all p-0.5 cursor-pointer"
                  onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2.5">
            <SlidersHorizontal size={14} className="text-[var(--text-muted)] shrink-0" />
            <input
              className={inputCls}
              placeholder="Preset name..."
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
            {/* Toggles */}
            <div>
              <p className={sectionHeading}>General</p>
              <div className="flex flex-col gap-2">
                <Toggle checked={params.fit} onChange={() => update('fit', !params.fit)} label="Fit to device memory (--fit)" size="sm" />
                <Toggle checked={params.noMmap} onChange={() => update('noMmap', !params.noMmap)} label="No mmap (--no-mmap)" size="sm" />
                <Toggle checked={params.flashAttn === 'on'} onChange={() => update('flashAttn', params.flashAttn === 'on' ? 'off' : 'on')} label="Flash attention (-fa)" size="sm" />
              </div>
            </div>

            {/* Context */}
            <div>
              <p className={sectionHeading}>Context</p>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={1024} max={131072} step={512}
                  value={params.ctxSize} onChange={e => update('ctxSize', parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-[var(--border)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                />
                <span className="text-xs font-mono text-[var(--text-muted)] w-16 text-right">{params.ctxSize.toLocaleString()}</span>
              </div>
            </div>

            {/* Sampling */}
            <div>
              <p className={sectionHeading}>Sampling</p>
              <div className="flex flex-col gap-3">
                {[
                  ['temp', 'Temperature', 0, 2, 0.05],
                  ['topK', 'Top-k', 0, 100, 1],
                  ['topP', 'Top-p', 0, 1, 0.05],
                  ['minP', 'Min-p', 0, 1, 0.05],
                  ['repeatPenalty', 'Repeat penalty', 0, 2, 0.05],
                  ['presencePenalty', 'Presence penalty', 0, 2, 0.05],
                ].map(([key, label, min, max, step]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-secondary)] w-28 shrink-0">{label}</span>
                    <input
                      type="range" min={min} max={max} step={step}
                      value={params[key]} onChange={e => update(key, parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-[var(--border)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="text-xs font-mono text-[var(--text-muted)] w-10 text-right">{params[key]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cache types */}
            <div>
              <p className={sectionHeading}>KV Cache Type</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-[var(--text-secondary)]">Cache type K</span>
                  <select className={inputCls} value={params.cacheTypeK} onChange={e => update('cacheTypeK', e.target.value)}>
                    {CACHE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-[var(--text-secondary)]">Cache type V</span>
                  <select className={inputCls} value={params.cacheTypeV} onChange={e => update('cacheTypeV', e.target.value)}>
                    {CACHE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={handleSave} disabled={saving || !presetName.trim()}>
              <Save size={13} /> Save
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={!selectedId}>
              <Check size={13} /> Apply
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
