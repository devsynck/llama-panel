import clsx from 'clsx'

export default function StatCard({ icon, label, value, secondaryValue, className, wide }) {
  return (
    <div className={clsx(
      'flex items-center gap-4 p-5 bg-[var(--bg-card)] border border-[var(--border)] rounded-[10px] transition-all hover:-translate-y-0.5 hover:border-[var(--border-light)] hover:shadow-[var(--shadow-card-hover)]',
      wide && 'col-span-2',
      className
    )}>
      <div className="w-12 h-12 rounded-md flex items-center justify-center shrink-0" style={icon.style}>
        {icon.element}
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[0.72rem] font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight truncate">{value}</span>
        {secondaryValue && <span className="text-[0.8rem] text-[var(--text-muted)] font-medium">{secondaryValue}</span>}
      </div>
    </div>
  )
}
