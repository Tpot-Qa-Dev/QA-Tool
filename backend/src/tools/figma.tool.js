// ─────────────────────────────────────────────────────────────────────────────
//  tools/figma.tool.js
//  Figma REST API — fetch design styles, tokens, and page structure
// ─────────────────────────────────────────────────────────────────────────────

function extractFileKey(url) {
  return url.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/)?.[2] || null
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// One Figma API call with limited backoff on transient rate-limit/overload
// (429/500/503). Honors the Retry-After header when present. After the retries
// are exhausted a 429 throws a message that tells the agent to STOP retrying
// and finalize, so a persistent rate limit doesn't loop the whole audit.
async function figmaFetch(path, token, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.figma.com/v1${path}`, {
      headers: { 'X-Figma-Token': token },
      signal:  AbortSignal.timeout(20_000),
    })
    if (res.ok) return res.json()

    // Transient — wait (Retry-After if given, else exponential) and retry.
    if ((res.status === 429 || res.status === 500 || res.status === 503) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15_000)
                                                   : Math.min(1500 * 2 ** attempt, 8_000)
      await sleep(waitMs)
      continue
    }

    // 403/401 from Figma almost always means a missing/invalid token or a file
    // the token can't see — surface that instead of a bare status line.
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `Figma API ${res.status}: the Figma token is missing, invalid, or lacks access to this file. ` +
        `Add/select a valid token (⚙ Settings → Figma Project Tokens, or FIGMA_TOKEN in backend/.env) that can open this file.`
      )
    }
    if (res.status === 404) throw new Error('Figma API 404: file not found — check the Figma URL.')
    if (res.status === 429) {
      throw new Error(
        'Figma API 429: rate limited (too many requests to Figma). Do NOT call figma_fetch again — ' +
        'finalize the report using the data already gathered and note that the Figma design comparison ' +
        'could not be completed because the Figma API was rate-limited; suggest re-running the audit in a minute.'
      )
    }
    throw new Error(`Figma API ${res.status}: ${res.statusText}`)
  }
}

export async function fetchFigmaDesign(figmaUrl, token) {
  if (!token || !String(token).trim()) {
    throw new Error(
      'FIGMA_TOKEN not configured. The Figma vs Web module needs a Figma access token — ' +
      'add FIGMA_TOKEN=... to backend/.env (Figma → Settings → Security → Personal access tokens) and restart the backend.'
    )
  }
  const fileKey = extractFileKey(figmaUrl)
  if (!fileKey) throw new Error('Invalid Figma URL — could not extract file key')

  // Sequential (not parallel) so a single audit makes one request at a time —
  // a 2-request burst is more likely to trip Figma's rate limit.
  const fileData   = await figmaFetch(`/files/${fileKey}?depth=2`, token)
  const stylesData = await figmaFetch(`/files/${fileKey}/styles`, token)

  const styles = (stylesData.meta?.styles || []).map(s => ({
    name:  s.name,
    type:  s.style_type,       // FILL, TEXT, EFFECT, GRID
    key:   s.key,
    desc:  s.description || '',
  }))

  const colorStyles = styles.filter(s => s.type === 'FILL')
  const textStyles  = styles.filter(s => s.type === 'TEXT')

  return {
    tool:         'figma_design',
    fileKey,
    name:         fileData.name,
    lastModified: fileData.lastModified,
    version:      fileData.version,
    pages:        (fileData.document?.children || []).map(p => ({
      name:       p.name,
      id:         p.id,
      childCount: p.children?.length || 0,
    })),
    styles: {
      total:  styles.length,
      colors: colorStyles.slice(0, 30),
      text:   textStyles.slice(0, 20),
      all:    styles,
    },
    summary: `${fileData.name} · ${styles.length} styles (${colorStyles.length} colors, ${textStyles.length} text) · ${fileData.document?.children?.length || 0} pages`,
  }
}
