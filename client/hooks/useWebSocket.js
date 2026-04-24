import { useEffect, useRef } from 'react'
import { useStatus } from '../context/StatusContext'

export default function useWebSocket() {
  const { dispatch } = useStatus()
  const wsRef = useRef(null)

  useEffect(() => {
    function connect() {
      // In dev mode, connect directly to the Express backend to avoid Vite proxy WS issues
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = import.meta.env.DEV
        ? `ws://127.0.0.1:7654/ws`
        : `${protocol}//${location.host}/ws`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'status' || msg.type === 'downloads') {
            dispatch({ type: msg.type, data: msg.data })
          }
        } catch { }
      }

      ws.onclose = () => {
        setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [dispatch])
}
