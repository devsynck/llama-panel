import { useState, useEffect, useCallback } from 'react'
import { getModels, deleteModel, hotswapModel } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import Tag from '../ui/Tag'
import EmptyState from '../ui/EmptyState'
import ConfirmDialog from '../ui/ConfirmDialog'
import Spinner from '../ui/Spinner'
import { RefreshCw } from 'lucide-react'

export default function ModelsPage() {
  const { addToast } = useToast()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getModels()
      setModels(data)
    } catch (err) {
      addToast('Failed to load models', 'error')
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleDelete = async (name) => {
    try {
      await deleteModel(name)
      addToast('Model deleted', 'success')
      refresh()
    } catch (err) {
      addToast('Delete failed: ' + err.message, 'error')
    }
  }

  const handleHotswap = async (path) => {
    try {
      await hotswapModel(path)
      addToast('Model hotswapped successfully!', 'success')
    } catch (err) {
      addToast('Hotswap failed: ' + err.message, 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Local Models">
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </PageHeader>

      {loading ? (
        <EmptyState><Spinner /></EmptyState>
      ) : models.length === 0 ? (
        <EmptyState>No models found. Go to Download to get models, or configure the models directory.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {models.map(m => (
            <div key={m.name} className="flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] p-4 transition-all hover:shadow-[var(--shadow-card-hover)] hover:border-[var(--border-light)]">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-[var(--text-primary)] text-sm">{m.name}</span>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    {m.isLegacy && <Tag color="warning">Legacy</Tag>}
                    {m.isSplit && <Tag>Split: {m.fileCount} files</Tag>}
                    {m.hasMmproj && <Tag>Vision</Tag>}
                    <span>{m.sizeHuman}</span>
                    <span>{new Date(m.modified).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="primary" size="sm" onClick={() => setConfirm({ type: 'hotswap', path: m.path, name: m.name })}>Load</Button>
                <Button variant="danger" size="sm" onClick={() => setConfirm({ type: 'delete', name: m.name })}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.type === 'hotswap' ? 'Hotswap Model' : 'Delete Model'}
        message={confirm?.type === 'hotswap' ? `This will restart the server with ${confirm?.name}. Continue?` : `Delete "${confirm?.name}"? This cannot be undone.`}
        confirmText={confirm?.type === 'hotswap' ? 'Hotswap' : 'Delete'}
        variant={confirm?.type === 'hotswap' ? 'primary' : 'danger'}
        onConfirm={() => { if (confirm?.type === 'hotswap') handleHotswap(confirm.path); else handleDelete(confirm.name) }}
      />
    </div>
  )
}
