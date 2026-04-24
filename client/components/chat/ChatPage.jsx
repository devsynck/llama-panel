import { useState, useRef, useEffect, useCallback } from 'react'
import { useStatus } from '../../context/StatusContext'
import { shortenPath } from '../../lib/format'

export default function ChatPage() {
  const { state } = useStatus()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const activeModel = state.status === 'running' && state.config
    ? (state.config.modelsPresetPath
        ? state.config.modelsPresetPath.split(/[/\\]/).pop().replace('.json', '')
        : state.config.modelPath
          ? shortenPath(state.config.modelPath)
          : 'None')
    : 'None'

  useEffect(() => { containerRef.current?.scrollTo(0, containerRef.current.scrollHeight) }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || state.status !== 'running' || streaming) return

    setInput('')
    inputRef.current.style.height = 'auto'

    const userMsg = { role: 'user', content: text }
    const assistantMsg = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to connect' }))
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: `Error: ${err.error}` } : m))
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.trim() || !line.startsWith('data: ')) continue
          const dataStr = line.slice(6).trim()
          if (dataStr === '[DONE]') continue
          try {
            const data = JSON.parse(dataStr)
            fullContent += data.choices?.[0]?.delta?.content || ''
            setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: fullContent } : m))
          } catch { }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: `Error: ${err.message}` } : m))
    }
    setStreaming(false)
  }, [input, state.status, streaming])

  const handleInputKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const handleInputChange = (e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }

  const isEmpty = messages.length === 0

  return (
    <div className={`flex flex-col h-[calc(100vh-60px)] relative max-w-[1000px] mx-auto w-full`}>
      <div className="pb-4 mb-2 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-[var(--text-muted)] uppercase tracking-wider">Active Model:</span>
          <span className="font-semibold text-[var(--accent)] text-sm">{activeModel}</span>
        </div>
      </div>

      {isEmpty ? null : (
        <div ref={containerRef} className="flex-1 flex flex-col gap-8 py-8 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'self-end' : 'self-start w-full'} animate-[slideUp_0.4s_ease]`}>
              <span className={`text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider ${msg.role === 'user' ? 'text-right' : ''}`}>
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <div className={
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white px-5 py-3.5 rounded-[20px] rounded-br-sm text-sm leading-relaxed whitespace-pre-wrap break-words shadow-[var(--shadow-card)]'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] px-5 py-3.5 rounded-[20px] rounded-bl-sm text-sm leading-relaxed whitespace-pre-wrap break-words'
              }>
                {msg.content === '' && i === messages.length - 1 && streaming ? (
                  <div className="flex gap-1 py-2.5">
                    {[0, 1, 2].map(n => (
                      <span key={n} className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-[bounce_1.4s_infinite_ease-in-out]" style={{ animationDelay: `${-0.32 + n * 0.16}s` }} />
                    ))}
                  </div>
                ) : msg.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`py-5 border-t border-[var(--border)] bg-[var(--bg-primary)] transition-all duration-500 shrink-0 ${isEmpty ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[720px] border-t-0 bg-transparent px-7 py-0' : ''}`}>
        <div className={`flex items-end bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl px-5 py-2.5 transition-all shadow-[var(--shadow-card-hover)] max-w-[800px] mx-auto focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask anything... (Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm resize-none max-h-[200px] py-2.5 outline-none font-[inherit] leading-relaxed placeholder:text-[var(--text-dim)]"
          />
          <button
            onClick={send}
            disabled={!input.trim() || state.status !== 'running' || streaming}
            className="bg-[var(--accent)] text-white border-none w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all hover:bg-[var(--accent-hover)] hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ml-2 self-center shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
