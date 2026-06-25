// ─────────────────────────────────────────────────────────────────────────────
//  hooks/useAudit.js
//  Encapsulates all audit run state — progress, logs, tool calls, the final
//  report, and errors — plus the SSE event handling. Components consume the
//  returned state; they never touch the API client directly.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback } from 'react'
import { runAudit } from '../api/client.js'

export function useAudit() {
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])
  const [toolCalls, setToolCalls] = useState([])
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState(null)
  const logRef = useRef(null)

  // Append a log line and keep the log box scrolled to the bottom.
  const addLog = useCallback((msg, hi = false) => {
    setLogs((l) => [...l.slice(-50), { msg, hi }])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 40)
  }, [])

  // Translate a single SSE event into state updates.
  const handleEvent = useCallback(
    (event, data) => {
      switch (event) {
        case 'status':
          addLog(data.message, true)
          if (data.progress) setProgress(data.progress)
          break
        case 'thinking':
          addLog(`🤖 ${data.text?.slice(0, 120)}…`)
          if (data.progress) setProgress(data.progress)
          break
        case 'tool_call':
          addLog(`🔧 ${data.tool}: ${JSON.stringify(data.input).slice(0, 80)}`, true)
          setToolCalls((t) => [...t, { tool: data.tool, status: 'running' }])
          if (data.progress) setProgress(data.progress)
          break
        case 'tool_result':
          addLog(`✓ ${data.tool} done`)
          setToolCalls((t) =>
            t.map((tc) =>
              tc.tool === data.tool ? { ...tc, status: 'done', result: data.result } : tc,
            ),
          )
          break
        case 'tool_error':
          addLog(`✗ ${data.tool}: ${data.error}`)
          setToolCalls((t) =>
            t.map((tc) => (tc.tool === data.tool ? { ...tc, status: 'error' } : tc)),
          )
          break
        case 'usage_update':
          setUsage(data)
          break
        case 'complete':
          setProgress(100)
          addLog('✅ Audit complete!', true)
          setReport(data.report ?? data)
          if (data.report?.usage) setUsage(data.report.usage)
          break
        case 'error':
          setError(data.message)
          break
        default:
          break
      }
    },
    [addLog],
  )

  // Start a new audit run, resetting all previous state.
  const start = useCallback(
    async ({ url, figmaUrl, module, checks, requiredTools, reportId, environmentHint }) => {
      setProgress(0)
      setLogs([])
      setToolCalls([])
      setReport(null)
      setError(null)
      setUsage(null)

      try {
        await runAudit(
          { url, figmaUrl, module, checks, requiredTools, reportId, environmentHint },
          handleEvent,
        )
      } catch (err) {
        setError(err.message)
        addLog(`✗ ${err.message}`)
      }
    },
    [handleEvent, addLog],
  )

  return { progress, logs, toolCalls, report, error, usage, logRef, start }
}
