import clsx from 'clsx'
import { useToast } from '../../context/ToastContext'

const types = {
  success: 'bg-[var(--success)]',
  error: 'bg-[var(--danger)]',
  info: 'bg-[var(--accent)]',
}

export function ToastContainer() {
  const { toasts } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[1000] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={clsx('px-5 py-3 rounded-md text-sm font-medium text-white shadow-lg max-w-[360px] animate-[toastIn_0.3s_ease]', types[t.type] || types.info)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
