import { useState, useEffect, useCallback, useReducer } from 'react'
import { getPresets, getPreset, createPreset, updatePreset, deletePreset, activatePreset, deactivatePreset, getModels } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Tag from '../ui/Tag'
import EmptyState from '../ui/EmptyState'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Plus, Database, ChevronRight, Trash2 } from 'lucide-react'

const emptyModel = () => ({
  identifier: '', modelPath: '',
  ctxSize: '', gpuLayers: '', threads: '', threadsBatch: '', batchSize: '', ubatchSize: '',
  flashAttn: '', splitMode: '',
  cacheTypeK: 'none', cacheTypeV: 'none',
  mlock: false, mmap: true, cachePrompt: false, loadMmproj: false,
  temp: '', topK: '', topP: '', minP: '', repeatPenalty: '', presencePenalty: '',
  thinking: '',
})

function presetReducer(state, action) {
  switch (action.type) {
    case 'SET_NAME': return { ...state, name: action.value }
    case 'SET_DESC': return { ...state, description: action.value }
    case 'SET_EDITING_ID': return { ...state, editingId: action.value }
    case 'ADD_MODEL': return { ...state, models: [...state.models, emptyModel()] }
    case 'REMOVE_MODEL': return { ...state, models: state.models.filter((_, i) => i !== action.index) }
    case 'UPDATE_MODEL': {
      const models = [...state.models]
      models[action.index] = { ...models[action.index], [action.field]: action.value }
      return { ...state, models }
    }
    case 'LOAD_PRESET': return { ...state, name: action.preset.name, description: action.preset.description || '', editingId: action.id, models: (action.preset.models || []).map(m => ({ ...emptyModel(), ...m })) }
    case 'RESET': return { name: '', description: '', editingId: null, models: [emptyModel()] }
    default: return state
  }
}

const initialState = { name: '', description: '', editingId: null, models: [emptyModel()] }

export default function PresetsPage() {
  const { addToast } = useToast()
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [availableModels, setAvailableModels] = useState([])
  const [form, dispatch] = useReducer(presetReducer, initialState)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [presetsData, modelsData] = await Promise.all([getPresets(), getModels()])
      setPresets(Array.isArray(presetsData) ? presetsData : [])
      setAvailableModels(Array.isArray(modelsData) ? modelsData : [])
    } catch (err) {
      addToast('Failed to load presets', 'error')
    }
    setLoading(false)
  }, [addToast])

  useEffect(() => { refresh() }, [refresh])

  const openCreate = () => { dispatch({ type: 'RESET' }); setModalOpen(true) }

  const openEdit = async (id) => {
    try {
      const preset = await getPreset(id)
      dispatch({ type: 'LOAD_PRESET', preset, id })
      setModalOpen(true)
    } catch (err) {
      addToast('Failed to load preset: ' + err.message, 'error')
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('Name is required', 'error'); return }
    const validModels = form.models.filter(m => m.identifier.trim() && m.modelPath)
    if (validModels.length === 0) { addToast('Add at least one model', 'error'); return }
    const presetData = { name: form.name.trim(), description: form.description.trim(), models: validModels }
    try {
      if (form.editingId) {
        await updatePreset(form.editingId, presetData)
        addToast('Preset updated!', 'success')
      } else {
        await createPreset(presetData)
        addToast('Preset created!', 'success')
      }
      setModalOpen(false)
      refresh()
    } catch (err) {
      addToast('Failed to save: ' + err.message, 'error')
    }
  }

  const handleDelete = async (id) => {
    try { await deletePreset(id); addToast('Preset deleted', 'success'); refresh() }
    catch (err) { addToast('Delete failed: ' + err.message, 'error') }
  }

  const handleActivate = async (id) => {
    try { await activatePreset(id); addToast('Preset activated! Restart the server to apply.', 'success'); refresh() }
    catch (err) { addToast('Failed to activate: ' + err.message, 'error') }
  }

  const cardCls = 'bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-4 transition-all hover:border-[var(--border-light)] hover:shadow-[var(--shadow-card-hover)]'
  const inputCls = 'bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] placeholder:text-[var(--text-dim)]'
  const selectCls = 'bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-2 text-sm outline-none appearance-none cursor-pointer transition-colors focus:border-[var(--accent)]'

  return (
    <div>
      <PageHeader title="Model Presets">
        <Button onClick={openCreate}><Plus size={16} />New Preset</Button>
      </PageHeader>

      {loading ? (
        <EmptyState>Loading presets...</EmptyState>
      ) : presets.length === 0 ? (
        <EmptyState>No presets found. Create a new preset to manage multiple models.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {presets.map(p => (
            <div key={p.id} className={cardCls}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[var(--text-primary)] text-sm">{p.name}</span>
                    <div className="inline-flex items-center gap-3 text-xs text-[var(--text-dim)] font-normal">
                      <span>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'N/A'}</span>
                      <span>{p.models?.length || 0} model{(p.models?.length || 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">{p.description || 'No description'}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="success" size="sm" onClick={() => handleActivate(p.id)}>Activate</Button>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(p.id)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirm({ id: p.id, name: p.name })}>Delete</Button>
                </div>
              </div>
              {p.models?.length > 0 && (
                <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-[var(--border)]">
                  {p.models.map(m => {
                    const params = []
                    if (m.ctxSize && m.ctxSize !== 4096) params.push(`ctx:${m.ctxSize}`)
                    if (m.gpuLayers) params.push(`ngl:${m.gpuLayers}`)
                    if (m.temp && m.temp !== 0.8) params.push(`temp:${m.temp}`)
                    return (
                      <div key={m.identifier} className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                        <Database size={14} className="text-[var(--accent)] shrink-0" />
                        <span className="font-mono font-medium text-[var(--accent)]">{m.identifier}</span>
                        {params.length > 0 && <span className="text-[var(--text-dim)]">({params.join(', ')})</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.editingId ? 'Edit Preset' : 'Create Preset'} width="w-[800px] max-w-[95vw]">
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-70px)]">
          <div className="mb-6 pb-5 border-b border-[var(--border)]">
            <h4 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Preset Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.68rem] font-semibold text-[var(--text-secondary)] uppercase">Name *</span>
                <input className={inputCls} value={form.name} onChange={e => dispatch({ type: 'SET_NAME', value: e.target.value })} placeholder="My Awesome Preset" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.68rem] font-semibold text-[var(--text-secondary)] uppercase">Description</span>
                <input className={inputCls} value={form.description} onChange={e => dispatch({ type: 'SET_DESC', value: e.target.value })} placeholder="A brief description" />
              </label>
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Models</h4>
            <div className="flex flex-col gap-3">
              {form.models.map((model, idx) => (
                <PresetModelRow key={idx} model={model} index={idx} availableModels={availableModels} dispatch={dispatch} inputCls={inputCls} selectCls={selectCls} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: 'ADD_MODEL' })} className="mt-3">
              <Plus size={14} />Add Model
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-[var(--border)]">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Preset</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} title="Delete Preset"
        message={`Delete preset "${confirm?.name}"? This cannot be undone.`}
        confirmText="Delete" variant="danger"
        onConfirm={() => confirm && handleDelete(confirm.id)}
      />
    </div>
  )
}

function PresetModelRow({ model, index, availableModels, dispatch, inputCls, selectCls }) {
  const [openSections, setOpenSections] = useState({ args: true, memory: false, gen: false })
  const toggle = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  const update = (field, value) => dispatch({ type: 'UPDATE_MODEL', index, field, value })

  return (
    <div className="flex flex-col p-4 bg-[var(--bg-input)] border border-[var(--border)] rounded-md">
      <div className="flex items-start gap-2.5 mb-3 pb-3 border-b border-[var(--border)]">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[0.65rem] text-[var(--text-dim)]">Identifier *</span>
          <input className={inputCls} value={model.identifier} onChange={e => update('identifier', e.target.value)} placeholder="llama-2-7b" />
        </label>
        <label className="flex flex-col gap-1 flex-[2]">
          <span className="text-[0.65rem] text-[var(--text-dim)]">Model Path *</span>
          <select className={selectCls} value={model.modelPath} onChange={e => update('modelPath', e.target.value)}>
            <option value="">Select a model...</option>
            {availableModels.map(m => <option key={m.path} value={m.path}>{m.name} ({m.sizeHuman})</option>)}
          </select>
        </label>
        <button className="p-2 mt-4 cursor-pointer" onClick={() => dispatch({ type: 'REMOVE_MODEL', index })}>
          <Trash2 size={14} className="text-[var(--danger)]" />
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <CollapsibleSection title="Server Arguments" open={openSections.args} onToggle={() => toggle('args')}>
          <Field label="Context Size" inputCls={inputCls} value={model.ctxSize} onChange={v => update('ctxSize', v)} placeholder="4096" type="number" />
          <Field label="GPU Layers" inputCls={inputCls} value={model.gpuLayers} onChange={v => update('gpuLayers', v)} placeholder="99 or auto" />
          <Field label="Threads" inputCls={inputCls} value={model.threads} onChange={v => update('threads', v)} placeholder="-1" type="number" />
          <Field label="Threads Batch" inputCls={inputCls} value={model.threadsBatch} onChange={v => update('threadsBatch', v)} placeholder="-1" type="number" />
          <Field label="Batch Size" inputCls={inputCls} value={model.batchSize} onChange={v => update('batchSize', v)} placeholder="2048" type="number" />
          <Field label="Micro Batch" inputCls={inputCls} value={model.ubatchSize} onChange={v => update('ubatchSize', v)} placeholder="512" type="number" />
          <SelectField label="Flash Attention" selectCls={selectCls} value={model.flashAttn} onChange={v => update('flashAttn', v)} options={['', 'on', 'off', 'auto']} labels={['Default', 'On', 'Off', 'Auto']} />
          <SelectField label="Split Mode" selectCls={selectCls} value={model.splitMode} onChange={v => update('splitMode', v)} options={['', 'layer', 'row', 'none']} labels={['Default', 'Layer', 'Row', 'None']} />
        </CollapsibleSection>

        <CollapsibleSection title="Memory Options" open={openSections.memory} onToggle={() => toggle('memory')}>
          <SelectField label="Cache K" selectCls={selectCls} value={model.cacheTypeK} onChange={v => update('cacheTypeK', v)}
            options={['none', 'q4_0', 'q8_0', 'f16', 'bf16', 'f32']}
            labels={['default (f16)', 'q4_0 (recommended)', 'q8_0', 'f16', 'bf16', 'f32']} />
          <SelectField label="Cache V" selectCls={selectCls} value={model.cacheTypeV} onChange={v => update('cacheTypeV', v)}
            options={['none', 'q4_0', 'q8_0', 'f16', 'bf16', 'f32']}
            labels={['default (f16)', 'q4_0 (recommended)', 'q8_0', 'f16', 'bf16', 'f32']} />
          <div className="col-span-full px-3 py-2 bg-[var(--warning-bg)] border border-[var(--warning)]/20 rounded-md text-[0.72rem] text-[var(--warning)] leading-relaxed">
            q4_0 reduces KV cache VRAM by ~4x — critical for large context (32k+).
          </div>
          <div className="col-span-full flex gap-6 pt-1">
            <Checkbox label="Memory Lock (mlock)" checked={model.mlock} onChange={v => update('mlock', v)} />
            <Checkbox label="Memory Map (mmap)" checked={model.mmap} onChange={v => update('mmap', v)} />
            <Checkbox label="Prompt Caching" checked={model.cachePrompt} onChange={v => update('cachePrompt', v)} />
            <Checkbox label="Load MMProj" checked={model.loadMmproj} onChange={v => update('loadMmproj', v)} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Generation Parameters" open={openSections.gen} onToggle={() => toggle('gen')}>
          <Field label="Temperature" inputCls={inputCls} value={model.temp} onChange={v => update('temp', v)} placeholder="0.8" type="number" step="0.1" />
          <Field label="Top K" inputCls={inputCls} value={model.topK} onChange={v => update('topK', v)} placeholder="40" type="number" />
          <Field label="Top P" inputCls={inputCls} value={model.topP} onChange={v => update('topP', v)} placeholder="0.9" type="number" step="0.01" />
          <Field label="Min P" inputCls={inputCls} value={model.minP} onChange={v => update('minP', v)} placeholder="0.05" type="number" step="0.01" />
          <Field label="Repeat Penalty" inputCls={inputCls} value={model.repeatPenalty} onChange={v => update('repeatPenalty', v)} placeholder="1.1" type="number" step="0.1" />
          <Field label="Presence Penalty" inputCls={inputCls} value={model.presencePenalty} onChange={v => update('presencePenalty', v)} placeholder="0.0" type="number" step="0.1" />
          <div className="col-span-full">
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] text-[var(--text-dim)]">Thinking Mode</span>
              <select className={selectCls} value={model.thinking} onChange={e => update('thinking', e.target.value)}>
                <option value="">Default (model decides)</option>
                <option value="true">Enabled — show chain of thought</option>
                <option value="false">Disabled — no thinking tokens</option>
              </select>
            </label>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}

function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <>
      <button onClick={onToggle} className="col-span-full flex items-center gap-2 px-3 py-2 bg-[var(--accent-subtle)] rounded-md cursor-pointer hover:brightness-110 transition-colors select-none">
        <ChevronRight size={16} className={`transition-transform text-[var(--text-secondary)] ${open ? 'rotate-90' : ''}`} />
        <span className="font-semibold text-sm text-[var(--text-secondary)]">{title}</span>
      </button>
      {open && <div className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 pt-1">{children}</div>}
    </>
  )
}

function Field({ label, inputCls, value, onChange, placeholder, type = 'text', step }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] text-[var(--text-dim)]">{label}</span>
      <input className={inputCls} type={type} step={step} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

function SelectField({ label, selectCls, value, onChange, options, labels }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] text-[var(--text-dim)]">{label}</span>
      <select className={selectCls} value={value} onChange={e => onChange(e.target.value)}>
        {options.map((opt, i) => <option key={opt} value={opt}>{labels?.[i] || opt}</option>)}
      </select>
    </label>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-[var(--text-primary)]">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
      <span>{label}</span>
    </label>
  )
}
