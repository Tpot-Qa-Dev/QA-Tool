// ─────────────────────────────────────────────────────────────────────────────
//  utils/sse.js
//  Server-Sent Events helpers — keeps streaming plumbing out of controllers.
// ─────────────────────────────────────────────────────────────────────────────

// Set the response headers required for an SSE stream.
export function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

// Write a single named SSE event with a JSON payload.
export function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
