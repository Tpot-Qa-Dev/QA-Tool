// ─────────────────────────────────────────────────────────────────────────────
//  tools/openrouterAdapter.js
//  Lets the audit engine run on ANY model hosted by OpenRouter (openrouter.ai)
//  WITHOUT changing the agentic loop. Like geminiAdapter, it exposes the same
//  surface the loop uses from the Anthropic SDK —
//  `client.messages.create(params)` returning `{ content, stop_reason, usage }`
//  with Anthropic-shaped content blocks (text / tool_use) — but under the hood
//  it calls OpenRouter's OpenAI-compatible /chat/completions API, translating:
//    • system   → a leading { role:'system' } message
//    • messages (user/assistant + tool_result + image blocks) → OpenAI messages
//    • tools (Anthropic input_schema) → OpenAI function tools
//    • OpenAI tool_calls → {type:'tool_use'}; message.content → {type:'text'}
//  tool_call ids are preserved verbatim, so no id remapping is needed (unlike
//  Gemini, OpenRouter echoes the same ids back via tool_call_id).
// ─────────────────────────────────────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Anthropic tool defs → OpenAI "function" tools.
function toOpenAITools(tools = []) {
  if (!tools.length) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema || { type: 'object', properties: {} },
    },
  }))
}

// One tool_result block (string OR [image,text]) → { text, images }.
function splitToolResult(block) {
  let text = ''
  const images = []
  if (typeof block.content === 'string') {
    text = block.content
  } else if (Array.isArray(block.content)) {
    for (const c of block.content) {
      if (c.type === 'text') text += c.text
      else if (c.type === 'image' && c.source?.data) {
        const mime = c.source.media_type || 'image/png'
        images.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${c.source.data}` } })
      }
    }
  }
  return { text, images }
}

// Translate the Anthropic-shaped `messages` array into OpenAI `messages`.
// OpenAI tool messages carry only text, so any image returned by a tool is
// appended as a following user message (screenshots stay visible to the model).
function toOpenAIMessages(messages, system) {
  const out = []
  if (system) out.push({ role: 'system', content: system })

  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        out.push({ role: 'user', content: m.content })
        continue
      }
      const parts = []
      const trailingImages = []
      for (const block of m.content || []) {
        if (block.type === 'tool_result') {
          const { text, images } = splitToolResult(block)
          out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: text || '(no output)' })
          trailingImages.push(...images)
        } else if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'image' && block.source?.data) {
          const mime = block.source.media_type || 'image/png'
          parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${block.source.data}` } })
        }
      }
      if (parts.length) out.push({ role: 'user', content: parts })
      if (trailingImages.length)
        out.push({ role: 'user', content: [{ type: 'text', text: 'Tool screenshot:' }, ...trailingImages] })
    } else if (m.role === 'assistant') {
      let text = ''
      const toolCalls = []
      for (const block of m.content || []) {
        if (block.type === 'text' && block.text) text += block.text
        else if (block.type === 'tool_use')
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
          })
      }
      const msg = { role: 'assistant', content: text || null }
      if (toolCalls.length) msg.tool_calls = toolCalls
      out.push(msg)
    }
  }
  return out
}

// Build an OpenRouter client that mimics the slice of the Anthropic SDK the loop
// uses.
export function makeOpenRouterClient(apiKey) {
  return {
    messages: {
      async create(params) {
        const tools = toOpenAITools(params.tools)
        const messages = toOpenAIMessages(params.messages || [], params.system)

        // One request with a given output cap. Extracted so we can retry with a
        // smaller cap if a low-credit account can't afford the requested size.
        const send = async (maxTokens) => {
          const body = {
            model: params.model,
            messages,
            temperature: params.temperature,
            max_tokens: maxTokens,
          }
          if (tools) body.tools = tools
          let res
          try {
            res = await fetch(OPENROUTER_URL, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                // Optional OpenRouter attribution headers.
                'HTTP-Referer': 'http://localhost',
                'X-Title': 'QA-Tool',
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(90_000),
            })
          } catch (err) {
            // Network/abort — shape it so the loop's connection-retry catches it.
            const e = new Error(`OpenRouter connection error: ${err.message}`)
            e.name = 'APIConnectionError'
            throw e
          }
          return { res, data: await res.json().catch(() => ({})) }
        }

        let { res, data } = await send(params.max_tokens)

        // Low/free-credit OpenRouter accounts reject when max_tokens exceeds the
        // affordable budget ("you requested up to N tokens, but can only afford
        // M"). Retry once clamped to M so these keys still run, just with a
        // shorter output cap.
        if (res.status === 402) {
          const afford = Number(/can only afford (\d+)/i.exec(data?.error?.message || '')?.[1])
          if (Number.isFinite(afford) && afford > 512 && afford < (params.max_tokens || Infinity)) {
            ;({ res, data } = await send(afford - 64))
          }
        }

        if (!res.ok) {
          const msg = data?.error?.message || res.statusText || 'OpenRouter API error'
          const e = new Error(`OpenRouter API ${res.status}: ${msg}`)
          e.status = res.status
          throw e
        }

        const message = data.choices?.[0]?.message || {}
        const content = []
        if (typeof message.content === 'string' && message.content)
          content.push({ type: 'text', text: message.content })
        let hasCall = false
        for (const call of message.tool_calls || []) {
          let input = {}
          try {
            input = call.function?.arguments ? JSON.parse(call.function.arguments) : {}
          } catch {
            input = {}
          }
          content.push({ type: 'tool_use', id: call.id, name: call.function?.name, input })
          hasCall = true
        }
        if (!content.length) content.push({ type: 'text', text: '' })

        const finish = data.choices?.[0]?.finish_reason
        const stop_reason = hasCall ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn'
        const usage = {
          input_tokens: data.usage?.prompt_tokens || 0,
          output_tokens: data.usage?.completion_tokens || 0,
        }
        return { content, stop_reason, usage }
      },
    },
  }
}
