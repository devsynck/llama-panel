import clsx from 'clsx'

export default function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-3 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
      <span className="relative inline-flex h-[22px] w-10 shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={onChange}
        />
        <span className={clsx(
          'absolute inset-0 rounded-full border transition-colors',
          checked
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'bg-[var(--bg-input)] border-[var(--border)]'
        )} />
        <span className={clsx(
          'absolute left-[2px] top-[2px] h-4 w-4 rounded-full transition-transform bg-white',
          checked && 'translate-x-5'
        )} />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}
