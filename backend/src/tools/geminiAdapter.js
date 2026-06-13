// ─────────────────────────────────────────────────────────────────────────────
//  tools/geminiAdapter.js
//  Lets the audit engine run on Google Gemini WITHOUT changing the agentic loop.
//  It exposes the same surface the loop uses from the Anthropic SDK —
//  `client.messages.create(params)` returning `{ content, stop_reason, usage }`
//  with Anthropic-shaped content blocks (text / tool_use) — but under the hood
//  it calls the Gemini generateContent REST API, translating both directions:
//    • system  → systemInstruction
//    • messages (user/assistant + tool_result + image blocks) → contents
//    • tools (Anthropic input_schema) → functionDeclarations
//    • Gemini functionCall parts → {type:'tool_use'}; text → {type:'text'}
//    • tool_use ids ↔ function names tracked per-client (Gemini matches by name)
//  Untested against the live API at build time — expect to iterate.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Keep only the JSON-Schema bits Gemini's function "parameters" accepts.
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined
  const out = {}
  if (schema.type) out.type = schema.type
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum
  if (schema.items) out.items = sanitizeSchema(schema.items)
  if (schema.properties) {
    out.properties = {}
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = sanitizeSchema(v)
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required
  return out
}

// Anthropic tool defs → Gemini functionDeclarations.
function toFunctionDeclarations(tools = []) {
  const decls = tools.map(t => {
    const d = { name: t.name, description: t.description || '' }
    const params = sanitizeSchema(t.input_schema)
    if (params && params.properties && Object.keys(params.properties).length) d.parameters = params
    return d
  })
  return decls.length ? [{ functionDeclarations: decls }] : undefined
}

// One tool_result block (string OR [image,text]) → Gemini parts.
// Returns { responseText, imageParts } so the caller can place a functionResponse
// plus any image inlineData in the same user turn.
function splitToolResult(block) {
  let responseText = ''
  const imageParts = []
  if (typeof block.content === 'string') {
    responseText = block.content
  } else if (Array.isArray(block.content)) {
    for (const c of block.content) {
      if (c.type === 'text') responseText += c.text
      else if (c.type === 'image' && c.source?.data) {
        imageParts.push({ inlineData: { mimeType: c.source.media_type || 'image/png', data: c.source.data } })
      }
    }
  }
  return { responseText, imageParts }
}

// Build a Gemini client that mimics the slice of the Anthropic SDK the loop uses.
export function makeGeminiClient(apiKey) {
  // Per-audit state: map generated tool_use ids → function names so a later
  // tool_result (which only carries the id) can be sent as the right
  // functionResponse (Gemini matches by name).
  const idToName = {}
  let counter = 0
  const genId = () => `gem_${++counter}`

  // Translate the Anthropic-shaped `messages` array into Gemini `contents`.
  const toContents = (messages) => {
    const contents = []
    for (const m of messages) {
      if (m.role === 'user') {
        if (typeof m.content === 'string') {
          contents.push({ role: 'user', parts: [{ text: m.content }] })
          continue
        }
        const parts = []
        for (const block of (m.content || [])) {
          if (block.type === 'tool_result') {
            const name = idToName[block.tool_use_id] || 'tool'
            const { responseText, imageParts } = splitToolResult(block)
            parts.push({ functionResponse: { name, response: { result: responseText } } })
            parts.push(...imageParts)
          } else if (block.type === 'text') {
            parts.push({ text: block.text })
          } else if (block.type === 'image' && block.source?.data) {
            parts.push({ inlineData: { mimeType: block.source.media_type || 'image/png', data: block.source.data } })
          }
        }
        contents.push({ role: 'user', parts: parts.length ? parts : [{ text: '(no content)' }] })
      } else if (m.role === 'assistant') {
        const parts = []
        for (const block of (m.content || [])) {
          if (block.type === 'text' && block.text) parts.push({ text: block.text })
          else if (block.type === 'tool_use') parts.push({ functionCall: { name: block.name, args: block.input || {} } })
        }
        contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] })
      }
    }
    return contents
  }

  return {
    messages: {
      async create(params) {
        const body = {
          contents: toContents(params.messages || []),
          generationConfig: {
            temperature: params.temperature,
            maxOutputTokens: params.max_tokens,
          },
        }
        if (params.system) body.systemInstruction = { parts: [{ text: params.system }] }
        const tools = toFunctionDeclarations(params.tools)
        if (tools) body.tools = tools

        const model = params.model || 'gemini-2.0-flash'
        let res
        try {
          res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(90_000),
          })
        } catch (err) {
          // Network/abort — shape it so the loop's connection-retry catches it.
          const e = new Error(`Gemini connection error: ${err.message}`)
          e.name = 'APIConnectionError'
          throw e
        }

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = data?.error?.message || res.statusText || 'Gemini API error'
          const e = new Error(`Gemini API ${res.status}: ${msg}`)
          e.status = res.status
          throw e
        }

        const cand = data.candidates?.[0]
        const parts = cand?.content?.parts || []
        const content = []
        let hasCall = false
        for (const p of parts) {
          if (typeof p.text === 'string' && p.text) content.push({ type: 'text', text: p.text })
          if (p.functionCall) {
            const id = genId()
            idToName[id] = p.functionCall.name
            content.push({ type: 'tool_use', id, name: p.functionCall.name, input: p.functionCall.args || {} })
            hasCall = true
          }
        }
        if (!content.length) content.push({ type: 'text', text: '' })

        const finish = cand?.finishReason
        const stop_reason = hasCall ? 'tool_use' : (finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn')
        const usage = {
          input_tokens:  data.usageMetadata?.promptTokenCount     || 0,
          output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        }
        return { content, stop_reason, usage }
      },
    },
  }
}
