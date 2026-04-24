import clsx from 'clsx'

export default function Toggle({ checked, onChange, label, size = 'md' }) {
  const isSm = size === 'sm'
  const track = isSm ? 'w-8 h-[18px]' : 'w-10 h-[22px]'
  const thumb = isSm ? 'h-3 w-3 left-[3px] top-[3px]' : 'h-4 w-4 left-[3px] top-[3px]'
  const slide = isSm ? 'translate-x-[10px]' : 'translate-x-[14px]'

  return (
    <label className={clsx('inline-flex items-center gap-2.5 cursor-pointer select-none', isSm ? 'text-xs' : 'text-sm', 'text-[var(--text-primary)]')}>
      <span className={clsx('relative inline-flex shrink-0', track)}>
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={onChange}
        />
        <span className={clsx(
          'absolute inset-0 rounded-full border transition-colors duration-200',
          checked
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'bg-[var(--border)] border-[var(--border)]'
        )} />
        <span className={clsx(
          'absolute rounded-full bg-white shadow-sm transition-transform duration-200',
          thumb,
          checked && slide
        )} />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}
