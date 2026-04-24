import clsx from 'clsx'

export default function ProgressBar({ percent, variant = 'default' }) {
  const fill = clsx(
    'h-full rounded-full transition-all duration-300',
    variant === 'default' && 'bg-[var(--accent)]',
    variant === 'success' && 'bg-[var(--success)]',
    variant === 'error' && 'bg-[var(--danger)]',
    variant === 'warn' && 'bg-[var(--warning)]',
    variant === 'danger' && 'bg-[var(--danger)] shadow-[0_0_8px_rgba(239,68,68,0.4)]',
  )

  return (
    <div className="w-full h-1.5 bg-[var(--bg-input)] rounded-full overflow-hidden border border-[var(--border)]">
      <div className={fill} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}
