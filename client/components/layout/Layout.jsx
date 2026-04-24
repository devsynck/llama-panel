import { Routes, Route } from 'react-router-dom'
import Sidebar from './Sidebar'
import useWebSocket from '../../hooks/useWebSocket'
import { ToastContainer } from '../ui/ToastContainer'

import DashboardPage from '../dashboard/DashboardPage'
import ChatPage from '../chat/ChatPage'
import ConfigPage from '../config/ConfigPage'
import ModelsPage from '../models/ModelsPage'
import PresetsPage from '../presets/PresetsPage'
import DownloadPage from '../download/DownloadPage'

export default function Layout() {
  useWebSocket()

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)] transition-colors duration-300">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-7 bg-[var(--bg-primary)] transition-colors duration-300">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/presets" element={<PresetsPage />} />
          <Route path="/download" element={<DownloadPage />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  )
}
