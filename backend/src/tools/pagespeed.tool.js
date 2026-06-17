// ─────────────────────────────────────────────────────────────────────────────
//  tools/pagespeed.tool.js
//  Google PageSpeed Insights API v5 — real LCP, CLS, FCP, TBT, TTFB
// ─────────────────────────────────────────────────────────────────────────────

export async function runPageSpeed(url, apiKey = '') {
  const cats = ['performance', 'accessibility', 'seo', 'best-practices']
    .map((c) => `category=${c}`)
    .join('&')
  const keyParam = apiKey ? `&key=${apiKey}` : ''
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&${cats}&strategy=desktop${keyParam}`

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`PageSpeed API ${res.status}: ${err?.error?.message || res.statusText}`)
  }

  const data = await res.json()
  const a = data.lighthouseResult?.audits || {}
  const c = data.lighthouseResult?.categories || {}

  const get = (k) => ({
    value: a[k]?.displayValue || 'N/A',
    score: a[k]?.score ?? null,
    title: a[k]?.title || k,
    desc: a[k]?.description || '',
  })

  return {
    tool: 'pagespeed',
    url,
    scores: {
      performance: Math.round((c.performance?.score || 0) * 100),
      accessibility: Math.round((c.accessibility?.score || 0) * 100),
      seo: Math.round((c.seo?.score || 0) * 100),
      bestPractices: Math.round((c['best-practices']?.score || 0) * 100),
    },
    vitals: {
      LCP: get('largest-contentful-paint'),
      FCP: get('first-contentful-paint'),
      CLS: get('cumulative-layout-shift'),
      TBT: get('total-blocking-time'),
      TTFB: get('server-response-time'),
      SI: get('speed-index'),
    },
    opportunities: Object.values(a)
      .filter((x) => x.details?.type === 'opportunity' && x.score !== null && x.score < 1)
      .map((x) => ({ title: x.title, savings: x.displayValue || '', desc: x.description || '' }))
      .slice(0, 8),
    diagnostics: Object.values(a)
      .filter((x) => x.score !== null && x.score < 0.9 && x.details?.type !== 'opportunity')
      .map((x) => ({ title: x.title, score: x.score, value: x.displayValue || '' }))
      .slice(0, 8),
  }
}
