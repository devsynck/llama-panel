import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, width = 'w-[600px]' }) {
  useEffect(() => {
    if (!open) return
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[14px] ${width} max-w-[90vw] max-h-[85vh] flex flex-col shadow-[0_10px_40px_rgba(0,0,0,0.15)] animate-[modalIn_0.2s_ease]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xl leading-none cursor-pointer p-1">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
