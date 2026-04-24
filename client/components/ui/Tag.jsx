import clsx from 'clsx'

const colors = {
  default: 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  success: 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/25',
}

export default function Tag({ children, color = 'default', className }) {
  return (
    <span className={clsx('inline-flex px-2 py-0.5 rounded text-[0.7rem] font-medium', colors[color] || colors.default, className)}>
      {children}
    </span>
  )
}
