import { createContext, useContext, useReducer } from 'react'

const StatusContext = createContext(null)

const initialState = {
  status: 'stopped',
  uptime: 0,
  slots: [],
  metrics: null,
  health: null,
  sysInfo: null,
  config: null,
  activeModels: [],
  downloads: [],
  activePreset: null,
  effectiveArgsByModel: {},
  serverArgs: '',
}

function reducer(state, action) {
  switch (action.type) {
    case 'status':
      return { ...state, ...action.data }
    case 'downloads':
      return { ...state, downloads: action.data }
    default:
      return state
  }
}

export function StatusProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <StatusContext.Provider value={{ state, dispatch }}>
      {children}
    </StatusContext.Provider>
  )
}

export function useStatus() {
  const ctx = useContext(StatusContext)
  if (!ctx) throw new Error('useStatus must be used within StatusProvider')
  return ctx
}
