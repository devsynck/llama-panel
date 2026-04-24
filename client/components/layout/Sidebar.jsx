import { NavLink } from 'react-router-dom'
import { LayoutGrid, Settings, Box, Download, Sun, Moon } from 'lucide-react'
import { toggleTheme, getTheme } from '../../hooks/useTheme'
import { useStatus } from '../../context/StatusContext'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard', end: true },
  { to: '/config', icon: Settings, label: 'Configuration' },
  { to: '/models', icon: Box, label: 'Models' },
  { to: '/download', icon: Download, label: 'Download' },
]

const statusMap = {
  stopped: { text: 'Offline', dot: 'bg-[var(--text-dim)]' },
  starting: { text: 'Starting...', dot: 'bg-[var(--warning)] animate-pulse' },
  running: { text: 'Running', dot: 'bg-[var(--success)] animate-pulse' },
  error: { text: 'Error', dot: 'bg-[var(--danger)]' },
}

export default function Sidebar() {
  const { state } = useStatus()
  const [theme, setTheme] = useState(getTheme())

  const handleToggle = () => {
    toggleTheme()
    setTheme(getTheme())
  }

  const s = statusMap[state.status] || statusMap.stopped

  return (
    <nav className="w-60 bg-[var(--bg-sidebar)] border-r border-[var(--border)] flex flex-col shrink-0 z-10 transition-colors duration-300">
      <div className="flex items-center gap-3 px-5 pt-5 pb-7 border-b border-[var(--border)]">
        <span className="text-2xl leading-none">🦙</span>
        <span className="font-bold text-base bg-gradient-to-r from-[var(--accent)] to-violet-400 bg-clip-text text-transparent tracking-tight">
          Llama Panel
        </span>
      </div>

      <ul className="list-none px-2.5 py-3 flex-1">
        {navItems.map(item => (
          <li key={item.to} className="mb-0.5">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => `
                flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-colors relative
                ${isActive
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-gradient-to-b from-[var(--accent)] to-violet-400 rounded-r" />}
                  <item.icon size={18} className={isActive ? '' : 'opacity-70'} />
                  <span className="hidden md:inline">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between">
        <button
          onClick={handleToggle}
          className="flex items-center justify-center p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)] py-2">
          <span className={`w-[9px] h-[9px] rounded-full ${s.dot} transition-all`} />
          <span className="hidden md:inline">{s.text}</span>
        </div>
      </div>
    </nav>
  )
}
