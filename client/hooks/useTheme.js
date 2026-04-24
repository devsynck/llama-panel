import { useEffect } from 'react'

const THEME_KEY = 'llama-panel-theme'

export default function useTheme() {
  useEffect(() => {
    const theme = localStorage.getItem(THEME_KEY) || 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])
}

export function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark')
  const next = isDark ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', next === 'dark')
  localStorage.setItem(THEME_KEY, next)
}

export function getTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
