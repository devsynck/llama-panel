export default function PageHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
      <div className="flex gap-2.5">{children}</div>
    </div>
  )
}
