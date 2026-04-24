import { BrowserRouter } from 'react-router-dom'
import { StatusProvider } from './context/StatusContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/layout/Layout'
import useTheme from './hooks/useTheme'

export default function App() {
  useTheme()

  return (
    <BrowserRouter>
      <StatusProvider>
        <ToastProvider>
          <Layout />
        </ToastProvider>
      </StatusProvider>
    </BrowserRouter>
  )
}
