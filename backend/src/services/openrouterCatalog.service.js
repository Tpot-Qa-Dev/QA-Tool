const URL = 'https://openrouter.ai/api/v1/models'
let cache = { at: 0, models: [] } // simple in-memory cache

export async function listOpenRouterModels() {
  // catalog changes rarely → cache 30 min to avoid latency/rate limits
  if (Date.now() - cache.at < 30 * 60_000 && cache.models.length) return cache.models
  const res = await fetch(URL, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`OpenRouter catalog ${res.status}`)
  const { data } = await res.json()
  const models = (data || [])
    .filter((m) => m.supported_parameters?.includes('tools')) // tool-capable ONLY
    .map((m) => ({
      id: m.id, // the slug
      name: m.name || m.id,
      contextLength: m.context_length || null,
      promptPrice: Number(m.pricing?.prompt || 0), // $/token, 0 = free
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  cache = { at: Date.now(), models }
  return models
}
