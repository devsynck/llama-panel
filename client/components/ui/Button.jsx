import clsx from 'clsx'

const variants = {
  primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
  success: 'bg-[var(--success)] text-white hover:brightness-110',
  danger: 'bg-[var(--danger)] text-white hover:brightness-110',
  warning: 'bg-[var(--warning)] text-white hover:brightness-110',
  secondary: 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]',
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)]',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  xs: 'px-2 py-1 text-[0.7rem]',
  default: 'px-4 py-2.5 text-sm',
}

export default function Button({ children, variant = 'primary', size = 'default', className, disabled, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 rounded-md font-semibold transition-all whitespace-nowrap cursor-pointer',
        variants[variant],
        sizes[size],
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
