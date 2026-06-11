// ─────────────────────────────────────────────────────────────────────────────
//  tools/playwright.tools.js
//  Real Playwright browser automation — all QA checks run in a real Chromium.
//  Each export is a self-contained tool; withPage() handles browser lifecycle.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright'
import { config } from '../config/index.js'

// Helper: launch a browser + page
async function withPage(url, fn, options = {}) {
  const browser = await chromium.launch({ headless: config.playwright.headless })
  const context = await browser.newContext({
    viewport:  { ...config.playwright.viewport },
    userAgent: 'Mozilla/5.0 (compatible; QA-Tool/1.0; Playwright)',
    ...options.context,
  })
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: config.playwright.navTimeoutMs })
    return await fn(page, context)
  } finally {
    await browser.close()
  }
}

// ── TOOL 1: Take Screenshot ───────────────────────────────────────────────────
export async function takeScreenshot(url, options = {}) {
  return withPage(url, async (page) => {
    const buf = await page.screenshot({
      fullPage: options.fullPage !== false,
      type:     'png',
    })
    return {
      tool:    'screenshot',
      url,
      base64:  buf.toString('base64'),
      mimeType:'image/png',
      width:   config.playwright.viewport.width,
      message: `Screenshot captured for ${url}`,
    }
  })
}

// ── TOOL 2: Capture Console Errors ───────────────────────────────────────────
export async function captureConsoleErrors(url) {
  const browser = await chromium.launch({ headless: config.playwright.headless })
  const context = await browser.newContext({ viewport: { ...config.playwright.viewport } })
  const page    = await context.newPage()

  const errors   = []
  const warnings = []
  const network  = []

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location() }
    if (msg.type() === 'error')   errors.push(entry)
    if (msg.type() === 'warning') warnings.push(entry)
  })

  page.on('pageerror', err => {
    errors.push({ type: 'pageerror', text: err.message, stack: err.stack })
  })

  page.on('requestfailed', req => {
    network.push({
      url:     req.url(),
      method:  req.method(),
      failure: req.failure()?.errorText || 'unknown',
    })
  })

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: config.playwright.navTimeoutMs })
    await page.waitForTimeout(2000) // wait for late JS errors
  } finally {
    await browser.close()
  }

  return {
    tool:        'console_errors',
    url,
    errors,
    warnings,
    networkFails: network,
    summary: {
      errorCount:   errors.length,
      warningCount: warnings.length,
      networkFailCount: network.length,
      clean: errors.length === 0 && network.length === 0,
    },
  }
}

// ── TOOL 3: Check All Links ────────────────────────────────────────────────────
export async function checkAllLinks(url) {
  return withPage(url, async (page) => {
    // Extract all links from page (cap is operator-configurable in Settings).
    const links = await page.evaluate((maxLinks) =>
      [...document.querySelectorAll('a[href]')].map(a => ({
        href:     a.href,
        text:     a.textContent.trim().slice(0, 60),
        internal: a.href.startsWith(location.origin),
        nofollow: (a.rel || '').includes('nofollow'),
        target:   a.target,
      })).filter(l => l.href.startsWith('http'))
        .slice(0, maxLinks)
    , config.playwright.maxLinks)

    // Check status of each link (parallel, limited concurrency)
    const CONCURRENCY = 6
    const results     = []
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      const batch = links.slice(i, i + CONCURRENCY)
      const checked = await Promise.all(
        batch.map(async link => {
          try {
            const r = await fetch(link.href, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) })
            return { ...link, status: r.status, ok: r.ok }
          } catch (e) {
            return { ...link, status: 'error', ok: false, error: e.message }
          }
        })
      )
      results.push(...checked)
    }

    const broken   = results.filter(l => !l.ok)
    const internal = results.filter(l => l.internal)
    const external = results.filter(l => !l.internal)

    return {
      tool:     'link_check',
      url,
      total:    results.length,
      broken,
      internal: internal.length,
      external: external.length,
      results:  results.slice(0, 50), // cap payload
      summary: {
        brokenCount:   broken.length,
        internalCount: internal.length,
        externalCount: external.length,
        clean:         broken.length === 0,
      },
    }
  })
}

// ── TOOL 4: Audit Forms ───────────────────────────────────────────────────────
export async function auditForms(url) {
  return withPage(url, async (page) => {
    const forms = await page.evaluate(() =>
      [...document.querySelectorAll('form')].map((form, idx) => ({
        index:    idx + 1,
        action:   form.action || 'none',
        method:   (form.method || 'GET').toUpperCase(),
        id:       form.id || '',
        class:    form.className || '',
        fields:   [...form.querySelectorAll('input,textarea,select')].map(f => ({
          type:        f.type || f.tagName.toLowerCase(),
          name:        f.name,
          id:          f.id,
          required:    f.required,
          placeholder: f.placeholder,
          hasLabel:    !!document.querySelector(`label[for="${f.id}"]`),
          ariaLabel:   f.getAttribute('aria-label') || '',
        })),
        hasSubmitButton: !!form.querySelector('[type="submit"], button:not([type="button"])'),
        hasRecaptcha:    form.innerHTML.includes('recaptcha') || form.innerHTML.includes('g-recaptcha'),
      }))
    )

    return {
      tool:       'form_audit',
      url,
      formCount:  forms.length,
      forms,
      summary: {
        totalForms:   forms.length,
        postForms:    forms.filter(f => f.method === 'POST').length,
        formsWithIssues: forms.filter(f =>
          f.fields.some(fld => fld.required && !fld.hasLabel && !fld.ariaLabel)
        ).length,
      },
    }
  })
}

// ── TOOL 5: Real Web Vitals via Performance API ────────────────────────────────
export async function getWebVitals(url) {
  return withPage(url, async (page) => {
    // Inject web-vitals script and collect metrics
    const vitals = await page.evaluate(() =>
      new Promise(resolve => {
        const metrics = {}
        const nav = performance.getEntriesByType('navigation')[0]
        if (nav) {
          metrics.ttfb     = Math.round(nav.responseStart - nav.requestStart)
          metrics.domLoad  = Math.round(nav.domContentLoadedEventEnd - nav.startTime)
          metrics.fullLoad = Math.round(nav.loadEventEnd - nav.startTime)
        }
        const paint = performance.getEntriesByType('paint')
        paint.forEach(p => {
          if (p.name === 'first-paint')           metrics.fp  = Math.round(p.startTime)
          if (p.name === 'first-contentful-paint') metrics.fcp = Math.round(p.startTime)
        })
        // LCP via PerformanceObserver — disconnect after resolving so the
        // observer + fallback timeout don't keep firing after we're done.
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          try { observer?.disconnect() } catch {}
          resolve(metrics)
        }
        let observer
        try {
          observer = new PerformanceObserver(list => {
            const entries = list.getEntries()
            const last    = entries[entries.length - 1]
            metrics.lcp   = Math.round(last.startTime)
            finish()
          })
          observer.observe({ entryTypes: ['largest-contentful-paint'] })
        } catch { finish() }
        setTimeout(finish, 5000)
      })
    )

    const grade = n => n === undefined ? 'N/A' : n < 1800 ? 'good' : n < 3000 ? 'needs-improvement' : 'poor'

    return {
      tool: 'web_vitals',
      url,
      metrics: {
        lcp:      { value: vitals.lcp,     unit: 'ms', status: grade(vitals.lcp) },
        fcp:      { value: vitals.fcp,     unit: 'ms', status: grade(vitals.fcp) },
        ttfb:     { value: vitals.ttfb,    unit: 'ms', status: vitals.ttfb < 800 ? 'good' : 'needs-improvement' },
        domLoad:  { value: vitals.domLoad, unit: 'ms', status: 'info' },
        fullLoad: { value: vitals.fullLoad,unit: 'ms', status: 'info' },
      },
      summary: `LCP ${vitals.lcp ?? 'N/A'}ms · FCP ${vitals.fcp ?? 'N/A'}ms · TTFB ${vitals.ttfb ?? 'N/A'}ms`,
    }
  })
}

// ── TOOL 6: Detect Tracking Scripts ───────────────────────────────────────────
export async function detectTracking(url) {
  return withPage(url, async (page) => {
    const tracking = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src)
      const html    = document.documentElement.innerHTML

      return {
        ga4:      scripts.some(s => /googletagmanager|google-analytics/.test(s)) || html.includes('gtag('),
        gtm:      html.includes('googletagmanager.com/gtm.js'),
        fbPixel:  html.includes('fbq(') || scripts.some(s => /connect\.facebook/.test(s)),
        hotjar:   scripts.some(s => /hotjar/.test(s)) || html.includes('_hjSettings'),
        clarity:  scripts.some(s => /clarity\.ms/.test(s)),
        linkedin: scripts.some(s => /linkedin/.test(s)),
        tiktok:   scripts.some(s => /tiktok\.com\/i\/pixel/.test(s)),
        intercom: scripts.some(s => /intercom/.test(s)) || html.includes('window.intercomSettings'),
        scripts:  scripts.map(s => { try { return new URL(s).hostname } catch { return s.slice(0,60) } }),
      }
    })

    return {
      tool:     'tracking',
      url,
      tracking,
      detected: Object.entries(tracking)
        .filter(([k, v]) => k !== 'scripts' && v === true)
        .map(([k]) => k),
      summary: `Detected: ${Object.entries(tracking).filter(([k,v]) => k !== 'scripts' && v).map(([k]) => k).join(', ') || 'none'}`,
    }
  })
}

// ── TOOL 7: Accessibility Checks ──────────────────────────────────────────────
export async function checkAccessibility(url) {
  return withPage(url, async (page) => {
    const a11y = await page.evaluate(() => {
      const issues = []

      // Images without alt
      const imgs = [...document.querySelectorAll('img')]
      const noAlt = imgs.filter(i => !i.hasAttribute('alt'))
      if (noAlt.length) issues.push({ type: 'missing-alt', count: noAlt.length, severity: 'error', message: `${noAlt.length} images missing alt attribute` })

      // Buttons without text
      const buttons = [...document.querySelectorAll('button')]
      const noText = buttons.filter(b => !b.textContent.trim() && !b.getAttribute('aria-label'))
      if (noText.length) issues.push({ type: 'empty-button', count: noText.length, severity: 'error', message: `${noText.length} buttons with no text or aria-label` })

      // H1 count
      const h1s = document.querySelectorAll('h1')
      if (h1s.length === 0)  issues.push({ type: 'no-h1', severity: 'error',   message: 'No H1 heading found' })
      if (h1s.length > 1)    issues.push({ type: 'multi-h1', severity: 'warn', message: `${h1s.length} H1 headings found (should be 1)` })

      // Form labels
      const inputs = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])')]
      const unlabelled = inputs.filter(i => !document.querySelector(`label[for="${i.id}"]`) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby'))
      if (unlabelled.length) issues.push({ type: 'unlabelled-input', count: unlabelled.length, severity: 'error', message: `${unlabelled.length} inputs without labels` })

      // lang attribute
      if (!document.documentElement.lang) issues.push({ type: 'no-lang', severity: 'warn', message: 'html element missing lang attribute' })

      // Skip link
      const skipLink = document.querySelector('a[href="#main"], a[href="#content"], a[href^="#skip"]')
      if (!skipLink) issues.push({ type: 'no-skip-link', severity: 'warn', message: 'No skip navigation link found' })

      return {
        issues,
        stats: {
          totalImages: imgs.length,
          imagesWithAlt: imgs.length - noAlt.length,
          totalButtons: buttons.length,
          h1Count: h1s.length,
          totalInputs: inputs.length,
          labelledInputs: inputs.length - unlabelled.length,
        },
      }
    })

    return {
      tool:   'accessibility',
      url,
      ...a11y,
      score:  Math.round(Math.max(0, 100 - a11y.issues.filter(i => i.severity === 'error').length * 15 - a11y.issues.filter(i => i.severity === 'warn').length * 5)),
      summary: `${a11y.issues.filter(i => i.severity === 'error').length} errors · ${a11y.issues.filter(i => i.severity === 'warn').length} warnings`,
    }
  })
}

// ── TOOL 8: Full Page HTML + Meta Audit ───────────────────────────────────────
export async function auditPageMeta(url) {
  return withPage(url, async (page) => {
    const meta = await page.evaluate(() => ({
      title:       document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      ogTitle:     document.querySelector('meta[property="og:title"]')?.content || '',
      ogImage:     document.querySelector('meta[property="og:image"]')?.content || '',
      ogDesc:      document.querySelector('meta[property="og:description"]')?.content || '',
      twitterCard: document.querySelector('meta[name="twitter:card"]')?.content || '',
      canonical:   document.querySelector('link[rel="canonical"]')?.href || '',
      viewport:    document.querySelector('meta[name="viewport"]')?.content || '',
      robots:      document.querySelector('meta[name="robots"]')?.content || '',
      lang:        document.documentElement.lang || '',
      headings: {
        h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().slice(0, 80)),
        h2: [...document.querySelectorAll('h2')].map(h => h.textContent.trim().slice(0, 80)).slice(0, 6),
      },
      schemas: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
        try { return JSON.parse(s.textContent)?.['@type'] } catch { return 'invalid' }
      }).filter(Boolean),
      wordCount: document.body?.innerText?.split(/\s+/).length || 0,
    }))

    return { tool: 'meta_audit', url, meta }
  })
}

// ── Section-by-section web audit ──────────────────────────────────────────────
// Splits the live page into visual sections (header → main blocks → footer),
// screenshots each one, and measures its computed styles. Used by the
// section-by-section comparison report (the "live web" side).
export async function auditWebSections(url, { withShots = true } = {}) {
  return withPage(url, async (page) => {
    // Tag candidate sections in the DOM and return their metadata. Heuristic:
    // <header>, the significant top-level blocks of <main> (or <body>), <footer>.
    const meta = await page.evaluate(() => {
      const vw = window.innerWidth
      const seen = new Set()
      const picked = []

      const rgbToHex = (rgb) => {
        const m = (rgb || '').match(/\d+/g)
        if (!m) return rgb || ''
        if (m.length >= 4 && m[3] === '0') return 'transparent'
        return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('')
      }
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.height > 60 && r.width > vw * 0.4 && s.display !== 'none' && s.visibility !== 'hidden'
      }
      const nameOf = (el, fallback) => {
        const h = el.querySelector('h1,h2,h3')
        const t = h?.textContent?.trim()
        if (t) return t.slice(0, 60)
        if (el.id) return el.id
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').slice(0, 60)
        return fallback
      }

      // Per-section QA checks — what's right (pass) and wrong (warn/fail).
      const checksFor = (el, tag) => {
        const checks = []
        const isChrome = tag === 'header' || tag === 'footer'

        const imgs = [...el.querySelectorAll('img')]
        const imgNoAlt = imgs.filter(i => !i.hasAttribute('alt')).length
        if (imgs.length) checks.push({ label: 'Image alt text',
          status: imgNoAlt === 0 ? 'pass' : imgNoAlt < imgs.length ? 'warn' : 'fail',
          detail: `${imgs.length - imgNoAlt}/${imgs.length} images have alt text` })

        const btns = [...el.querySelectorAll('button,[role="button"]')]
        const btnNoLabel = btns.filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt]:not([alt=""])')).length
        if (btns.length) checks.push({ label: 'Button labels',
          status: btnNoLabel === 0 ? 'pass' : 'fail',
          detail: btnNoLabel === 0 ? 'all buttons labelled' : `${btnNoLabel} button(s) with no label` })

        const links = [...el.querySelectorAll('a[href]')]
        const linkNoText = links.filter(a => !a.textContent.trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')).length
        if (links.length) checks.push({ label: 'Link text',
          status: linkNoText === 0 ? 'pass' : 'warn',
          detail: linkNoText === 0 ? 'all links have text' : `${linkNoText} link(s) without text` })

        const inputs = [...el.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea,select')]
        if (inputs.length) {
          const labelFors = [...el.querySelectorAll('label[for]')].map(l => l.getAttribute('for'))
          const noLabel = inputs.filter(f =>
            !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby') &&
            !f.closest('label') && !(f.id && labelFors.includes(f.id))).length
          checks.push({ label: 'Form field labels',
            status: noLabel === 0 ? 'pass' : 'fail',
            detail: `${inputs.length - noLabel}/${inputs.length} fields labelled` })
        }

        if (!isChrome) {
          const hasHeading = !!el.querySelector('h1,h2,h3,h4,h5,h6')
          checks.push({ label: 'Section heading',
            status: hasHeading ? 'pass' : 'warn',
            detail: hasHeading ? 'has a heading' : 'no heading in section' })
        }
        return checks
      }

      const add = (el, fallbackName) => {
        if (!el || seen.has(el) || !visible(el)) return
        seen.add(el)
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const heading = el.querySelector('h1,h2,h3,h4')
        const hcs = heading ? getComputedStyle(heading) : null
        const para = el.querySelector('p')
        const pcs = para ? getComputedStyle(para) : null
        const idx = picked.length
        el.setAttribute('data-qa-section', String(idx))
        picked.push({
          index: idx,
          name:  nameOf(el, fallbackName),
          tag:   el.tagName.toLowerCase(),
          measured: {
            background:   rgbToHex(cs.backgroundColor),
            textColor:    rgbToHex(cs.color),
            headingFont:  hcs ? hcs.fontFamily.split(',')[0].replace(/["']/g, '') : '—',
            headingSize:  hcs ? hcs.fontSize : '—',
            headingWeight: hcs ? hcs.fontWeight : '—',
            bodyFont:     pcs ? pcs.fontFamily.split(',')[0].replace(/["']/g, '') : '—',
            bodySize:     pcs ? pcs.fontSize : '—',
            paddingY:     `${cs.paddingTop} / ${cs.paddingBottom}`,
            display:      cs.display,
            columns:      cs.gridTemplateColumns && cs.gridTemplateColumns !== 'none'
                            ? cs.gridTemplateColumns.split(' ').length + '-col grid'
                            : cs.display.includes('flex') ? 'flex' : 'block',
            heightPx:     Math.round(r.height),
          },
          counts: {
            links:    el.querySelectorAll('a[href]').length,
            buttons:  el.querySelectorAll('button,[role="button"],input[type="submit"]').length,
            images:   el.querySelectorAll('img,svg').length,
            headings: el.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
            forms:    el.querySelectorAll('form').length,
          },
          checks: checksFor(el, el.tagName.toLowerCase()),
        })
      }

      add(document.querySelector('header'), 'Header / Navbar')
      const main = document.querySelector('main') || document.body
      for (const child of [...main.children]) {
        if (picked.length >= 14) break
        // Skip header/footer already handled; pick significant blocks.
        if (['HEADER', 'FOOTER', 'SCRIPT', 'STYLE', 'NAV'].includes(child.tagName)) continue
        add(child, `Section ${picked.length + 1}`)
      }
      add(document.querySelector('footer'), 'Footer')

      // Roll each section's checks into a single verdict (worst wins).
      for (const s of picked) {
        s.verdict = s.checks.some(c => c.status === 'fail') ? 'fail'
                  : s.checks.some(c => c.status === 'warn') ? 'warn' : 'pass'
      }
      return picked
    })

    // Screenshot each tagged section by its data attribute. Skipped when
    // withShots is false (the section PICKER only needs names — much faster).
    const sections = []
    for (const s of meta) {
      let base64 = null
      if (withShots) {
        try {
          const buf = await page.locator(`[data-qa-section="${s.index}"]`).first()
            .screenshot({ timeout: 8000 })
          base64 = buf.toString('base64')
        } catch { /* element not screenshottable — keep metadata only */ }
      }
      sections.push({ ...s, screenshot: base64, mimeType: 'image/png' })
    }

    // Full-page screenshot too (same browser pass) — used as the report hero shot.
    let fullPage = null
    if (withShots) {
      try { fullPage = (await page.screenshot({ fullPage: true })).toString('base64') } catch { /* ignore */ }
    }

    return {
      tool: 'section_audit',
      url,
      sectionCount: sections.length,
      sections,
      fullPage,
      summary: `${sections.length} sections captured`,
    }
  })
}

// ── Highlight capture ─────────────────────────────────────────────────────────
// Given a list of findings that name a faulty element via a CSS selector, open
// the page once and capture ONE screenshot per finding: the element framed with
// a red box + an arrow/label, surrounding area dimmed, with a little margin for
// context. Findings whose selector matches nothing (or is null) are skipped — so
// a screenshot is attached only when there is a real, locatable mistake.
//   targets: [{ id, selector, label }]  →  returns [{ id, base64, mimeType }]
export async function captureFindingHighlights(url, targets = []) {
  // A target is usable if it has a CSS selector OR a visible-text snippet to
  // locate the faulty element by.
  const valid = (targets || [])
    .filter(t => t && ((t.selector && typeof t.selector === 'string') || (t.textMatch && typeof t.textMatch === 'string')))
    .slice(0, 8)
  if (!valid.length) return []

  return withPage(url, async (page) => {
    const out = []
    const vp  = page.viewportSize() || { width: config.playwright.viewport.width, height: config.playwright.viewport.height }

    // Resolve a target to a visible locator: try the CSS selector first, then
    // fall back to locating by visible text — so a brittle/empty selector still
    // yields a screenshot when the issue text is on the page.
    const resolveLocator = async (t) => {
      if (t.selector) {
        try {
          if (await page.locator(t.selector).count() > 0) return page.locator(t.selector).first()
        } catch { /* invalid selector syntax — fall through to text */ }
      }
      if (t.textMatch) {
        const text = t.textMatch.trim().slice(0, 80)
        try {
          const byText = page.getByText(text, { exact: false }).first()
          if (await byText.count() > 0) return byText
        } catch { /* ignore */ }
        // Last attempt: any element containing the text.
        try {
          const has = page.locator(`:text("${text.replace(/"/g, '\\"')}")`).first()
          if (await has.count() > 0) return has
        } catch { /* ignore */ }
      }
      return null
    }

    for (const t of valid) {
      try {
        const locator = await resolveLocator(t)
        if (!locator) continue
        await locator.scrollIntoViewIfNeeded({ timeout: 3000 })
        const box = await locator.boundingBox()
        if (!box || box.width < 2 || box.height < 2) continue

        // Grab the element's real markup so the report can show the actual
        // faulty code (truncated — we only want the relevant snippet).
        const html = await locator.evaluate(el => el.outerHTML).catch(() => null)

        // Draw a red highlight box + arrow label over the element (page coords
        // are viewport-relative after scrollIntoView, matching screenshot clip).
        await page.evaluate(({ box, label }) => {
          const wrap = document.createElement('div')
          wrap.id = '__qa_hl__'
          wrap.style.cssText =
            `position:fixed;left:${box.x - 4}px;top:${box.y - 4}px;width:${box.width + 8}px;height:${box.height + 8}px;` +
            `border:3px solid #FF3B30;border-radius:5px;box-shadow:0 0 0 6000px rgba(10,11,15,.45);` +
            `z-index:2147483647;pointer-events:none`
          const tag = document.createElement('div')
          tag.textContent = '▼ ' + (label || 'Issue')
          tag.style.cssText =
            `position:fixed;left:${box.x}px;top:${Math.max(2, box.y - 26)}px;background:#FF3B30;color:#fff;` +
            `font:600 12px/1.4 system-ui,sans-serif;padding:2px 8px;border-radius:4px;` +
            `z-index:2147483647;pointer-events:none;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis`
          document.body.appendChild(wrap); document.body.appendChild(tag)
        }, { box, label: t.label })

        // Clip a region around the element (clamped to the viewport).
        const M = 44
        const x = Math.max(0, box.x - M)
        const y = Math.max(0, box.y - M - 24)
        const clip = {
          x, y,
          width:  Math.min(vp.width  - x, box.width  + M * 2),
          height: Math.min(vp.height - y, box.height + M * 2 + 24),
        }
        const buf = (clip.width > 4 && clip.height > 4)
          ? await page.screenshot({ clip })
          : await page.screenshot()
        out.push({
          id: t.id,
          base64: buf.toString('base64'),
          mimeType: 'image/png',
          html: html ? html.replace(/\s+/g, ' ').trim().slice(0, 600) : null,
        })

        await page.evaluate(() => {
          document.getElementById('__qa_hl__')?.remove()
          document.querySelectorAll('div').forEach(d => { if (d.textContent?.startsWith('▼ ')) d.remove() })
        })
      } catch { /* selector unusable / element not screenshottable — skip */ }
    }
    return out
  })
}

// ── Detect environment: live production vs dev / staging / maintenance ────────
// Inspects the URL + page for signals that the site is NOT a finished, public,
// live website — so the report can be framed as a pre-launch review instead of
// marking a work-in-progress down as if it were live. Standalone (not via
// withPage) so it can read the navigation response headers (X-Robots-Tag).
export async function detectEnvironment(url) {
  const browser = await chromium.launch({ headless: config.playwright.headless })
  const context = await browser.newContext({ viewport: { ...config.playwright.viewport } })
  const page    = await context.newPage()

  let headers = {}
  let httpStatus = null
  let dom = {}
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: config.playwright.navTimeoutMs })
    if (resp) { headers = resp.headers() || {}; httpStatus = resp.status() }
    await page.waitForTimeout(600)
    dom = await page.evaluate(() => {
      const bodyText = (document.body?.innerText || '').toLowerCase()
      const imgs = [...document.querySelectorAll('img')]
      return {
        title:       document.title || '',
        robots:      document.querySelector('meta[name="robots"]')?.content || '',
        generator:   document.querySelector('meta[name="generator"]')?.content || '',
        wordCount:   bodyText.split(/\s+/).filter(Boolean).length,
        comingSoon:  /coming soon|under construction|launching soon|site is under|maintenance mode|be right back|opening soon|website is being/.test(bodyText),
        lorem:       /lorem ipsum|dolor sit amet/.test(bodyText),
        placeholderImgs: imgs.filter(i => /placeholder|placehold\.|via\.placeholder|dummyimage|lorempixel|picsum\.photos/.test(i.src || '')).length,
        phpErrors:   /(notice|warning|deprecated|fatal error)\s*:/.test(bodyText) || /undefined (index|variable|array key|offset)/.test(bodyText),
        hasAnalytics:/gtag\(|googletagmanager|google-analytics|_gaq|fbq\(/.test(document.documentElement.innerHTML),
      }
    })
  } catch (err) {
    dom.error = err.message
  } finally {
    await browser.close()
  }

  const host = (() => { try { return new URL(url).hostname.toLowerCase() } catch { return '' } })()
  const xRobots = String(headers['x-robots-tag'] || '').toLowerCase()
  const noindex = /noindex/i.test(dom.robots || '') || xRobots.includes('noindex')

  // Host patterns that strongly imply a non-production environment.
  const HOST_DEV      = /(^|\.)localhost$|^127\.0\.0\.1|\.local$|\.test$|\.example$/
  const HOST_STAGING  = /staging|stg|preprod|pre-prod|uat|sandbox|demo|(^|\.)dev\.|(^|\.)test\./
  const HOST_PLATFORM = /netlify\.app|vercel\.app|herokuapp\.com|pages\.dev|web\.app|firebaseapp\.com|ngrok\.|\.sites\.|pantheonsite\.io|wpengine\.com|kinsta\.cloud|cloudwaysapps\.com|myftpupload\.com|onrocket/

  const signals = []
  const add = (signal, weight, detail) => signals.push({ signal, weight, detail })

  if (HOST_DEV.test(host))      add('local-host', 'development', `Host "${host}" is a local/development address`)
  if (HOST_STAGING.test(host))  add('staging-host', 'staging', `Host "${host}" looks like a staging/test environment`)
  if (HOST_PLATFORM.test(host)) add('preview-host', 'staging', `Host "${host}" is a temporary/preview hosting domain, not a custom production domain`)
  if (noindex)                  add('noindex', 'staging', 'Page is set to noindex (robots meta / X-Robots-Tag) — search engines are blocked, typical of a non-public site')
  if (dom.comingSoon)           add('coming-soon', 'maintenance', 'Page shows "coming soon" / "under construction" / "maintenance" text')
  if (dom.lorem)                add('placeholder-text', 'development', 'Lorem ipsum placeholder text found in the content')
  if (dom.placeholderImgs > 0)  add('placeholder-images', 'development', `${dom.placeholderImgs} placeholder/dummy image(s) found`)
  if (dom.phpErrors)            add('server-errors', 'development', 'Server notices/warnings are visible on the page (debug mode left on)')
  if (typeof dom.wordCount === 'number' && dom.wordCount < 60 && !dom.comingSoon)
                                add('thin-content', 'development', `Very little text on the page (${dom.wordCount} words) — may be unfinished`)

  const has = (w) => signals.some(s => s.weight === w)
  let environment = 'production'
  if (has('maintenance'))      environment = 'maintenance'
  else if (has('development')) environment = 'development'
  else if (has('staging'))     environment = 'staging'

  const isProduction = environment === 'production'
  return {
    tool: 'environment',
    url,
    environment,
    isProduction,
    confidence: signals.length >= 2 ? 'high' : signals.length === 1 ? 'medium' : 'high',
    httpStatus,
    signals,
    summary: isProduction
      ? 'Appears to be a live production site (no development/staging signals found).'
      : `Appears to be a ${environment} site — ${signals.map(s => s.signal).join(', ')}.`,
  }
}

// ── Export tool registry ──────────────────────────────────────────────────────
export const PLAYWRIGHT_TOOLS = {
  screenshot:       takeScreenshot,
  console_errors:   captureConsoleErrors,
  check_links:      checkAllLinks,
  form_audit:       auditForms,
  web_vitals:       getWebVitals,
  detect_tracking:  detectTracking,
  accessibility:    checkAccessibility,
  meta_audit:       auditPageMeta,
  environment:      detectEnvironment,
}
