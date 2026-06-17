// ─────────────────────────────────────────────────────────────────────────────
//  config/modules.js
//  Test-module catalogue. Each module defines its required inputs and a set of
//  checkbox groups. The checks the user ticks are sent to the backend as the
//  "checks requested" list, which Claude uses to focus the audit.
//
//  Every check also declares the backend tool(s) that actually perform it via
//  its `tools` field. The union of those tools for the ticked checks is sent as
//  `requiredTools`, and the agent loop guarantees each one is run before the
//  report is produced — so ticking an option always makes that check happen.
//  Tool names must match the keys in backend/src/tools/index.js HANDLERS.
// ─────────────────────────────────────────────────────────────────────────────

// Fixed brand colours per module — intentionally vivid, used on both themes.
const C = {
  cyan: '#00E5FF',
  green: '#00FF94',
  orange: '#FF9F43',
  red: '#FF4560',
  purple: '#A78BFA',
}

// Backend tool-name shorthands (keep in sync with tools/index.js).
const T = {
  shot: 'playwright_screenshot',
  console: 'playwright_console_errors',
  links: 'playwright_check_links',
  forms: 'playwright_audit_forms',
  vitals: 'playwright_web_vitals',
  tracking: 'playwright_tracking',
  a11y: 'playwright_accessibility',
  meta: 'playwright_meta_audit',
  psi: 'pagespeed_audit',
  figma: 'figma_fetch',
}

export const MODULES = [
  {
    id: 'figma_vs_web',
    label: 'Figma vs Web',
    icon: '⬡',
    color: C.purple,
    desc: 'Pixel-perfect visual comparison between Figma design and live website',
    inputs: ['website_url', 'figma_url'],
    checkboxGroups: [
      {
        group: 'Visual Checks',
        items: [
          {
            id: 'typography',
            label: 'Typography (font, size, weight, spacing)',
            default: true,
            tools: [T.shot, T.figma],
          },
          {
            id: 'colors',
            label: 'Colors & Background (hex match)',
            default: true,
            tools: [T.shot, T.figma],
          },
          {
            id: 'spacing',
            label: 'Padding & Margin spacing',
            default: true,
            tools: [T.shot, T.figma],
          },
          {
            id: 'layout',
            label: 'Layout & Grid alignment',
            default: true,
            tools: [T.shot, T.figma],
          },
          {
            id: 'pixel_check',
            label: 'Pixel-by-pixel image diff',
            default: false,
            tools: [T.shot, T.figma],
          },
          {
            id: 'images',
            label: 'Images & Icons (size, quality)',
            default: true,
            tools: [T.shot, T.figma],
          },
          { id: 'shadows', label: 'Shadows & Borders', default: false, tools: [T.shot, T.figma] },
          {
            id: 'border_radius',
            label: 'Border radius & corner styling',
            default: false,
            tools: [T.shot, T.figma],
          },
          {
            id: 'opacity',
            label: 'Opacity & transparency',
            default: false,
            tools: [T.shot, T.figma],
          },
          { id: 'responsive', label: 'Responsive breakpoints', default: false, tools: [T.shot] },
        ],
      },
      {
        group: 'Component Checks',
        items: [
          {
            id: 'cta_buttons',
            label: 'CTA Buttons (style, size)',
            default: true,
            tools: [T.shot, T.figma],
          },
          {
            id: 'forms',
            label: 'Form elements (inputs, labels)',
            default: true,
            tools: [T.shot, T.forms],
          },
          {
            id: 'navigation',
            label: 'Navigation & Header',
            default: true,
            tools: [T.shot, T.figma],
          },
          { id: 'footer', label: 'Footer layout', default: false, tools: [T.shot, T.figma] },
          { id: 'cards', label: 'Cards & Containers', default: false, tools: [T.shot, T.figma] },
          { id: 'modals', label: 'Modals & Overlays', default: false, tools: [T.shot] },
          { id: 'icons', label: 'Icon set & sizing', default: false, tools: [T.shot, T.figma] },
        ],
      },
    ],
  },
  {
    id: 'sehshat',
    label: 'SEHSHAT Tracking',
    icon: '◎',
    color: C.orange,
    desc: 'Audit all tracking: links, buttons, forms — analytics & event data',
    inputs: ['website_url'],
    checkboxGroups: [
      {
        group: 'Element Tracking',
        items: [
          {
            id: 'all_links',
            label: 'All links (href, target, status)',
            default: true,
            tools: [T.links],
          },
          {
            id: 'broken_links',
            label: 'Broken links (404 check)',
            default: true,
            tools: [T.links],
          },
          {
            id: 'external_links',
            label: 'External links (target, rel)',
            default: false,
            tools: [T.links],
          },
          {
            id: 'buttons',
            label: 'Buttons & CTAs (labels, events)',
            default: true,
            tools: [T.a11y],
          },
          {
            id: 'forms_tracking',
            label: 'Forms (fields, actions, method)',
            default: true,
            tools: [T.forms],
          },
          { id: 'anchor_tags', label: 'Anchor / Hash links', default: false, tools: [T.links] },
        ],
      },
      {
        group: 'Analytics & Events',
        items: [
          { id: 'ga4', label: 'GA4 / GTM events', default: true, tools: [T.tracking] },
          { id: 'fb_pixel', label: 'Facebook Pixel', default: false, tools: [T.tracking] },
          {
            id: 'custom_events',
            label: 'Custom dataLayer events',
            default: false,
            tools: [T.tracking],
          },
          {
            id: 'heatmap',
            label: 'Heatmap triggers (Hotjar/Clarity)',
            default: false,
            tools: [T.tracking],
          },
          {
            id: 'linkedin_tiktok',
            label: 'LinkedIn / TikTok pixels',
            default: false,
            tools: [T.tracking],
          },
        ],
      },
    ],
  },
  {
    id: 'form_submission',
    label: 'Form Submission',
    icon: '▣',
    color: C.green,
    desc: 'Test inline and popup form submissions end-to-end',
    inputs: ['website_url'],
    checkboxGroups: [
      {
        group: 'Form Types',
        items: [
          { id: 'inline_forms', label: 'Inline forms on page', default: true, tools: [T.forms] },
          { id: 'popup_forms', label: 'Popup / Modal forms', default: true, tools: [T.forms] },
          { id: 'multi_step', label: 'Multi-step forms', default: false, tools: [T.forms] },
          { id: 'contact_forms', label: 'Contact forms', default: true, tools: [T.forms] },
          { id: 'newsletter', label: 'Newsletter signup', default: false, tools: [T.forms] },
          { id: 'search_forms', label: 'Search forms', default: false, tools: [T.forms] },
          { id: 'login_forms', label: 'Login / Auth forms', default: false, tools: [T.forms] },
        ],
      },
      {
        group: 'Validation Checks',
        items: [
          {
            id: 'required_fields',
            label: 'Required field validation',
            default: true,
            tools: [T.forms],
          },
          {
            id: 'email_validation',
            label: 'Email format validation',
            default: true,
            tools: [T.forms],
          },
          {
            id: 'phone_validation',
            label: 'Phone number validation',
            default: false,
            tools: [T.forms],
          },
          {
            id: 'field_labels',
            label: 'Field labels & placeholders',
            default: false,
            tools: [T.forms, T.a11y],
          },
          {
            id: 'success_message',
            label: 'Success / Thank-you message',
            default: true,
            tools: [T.forms],
          },
          { id: 'error_handling', label: 'Error state handling', default: true, tools: [T.forms] },
          {
            id: 'recaptcha',
            label: 'reCAPTCHA / bot protection',
            default: false,
            tools: [T.forms],
          },
        ],
      },
    ],
  },
  {
    id: 'console_errors',
    label: 'Console Errors',
    icon: '⚡',
    color: C.red,
    desc: 'Detect all JS errors, warnings and network failures in browser console',
    inputs: ['website_url'],
    checkboxGroups: [
      {
        group: 'Error Types',
        items: [
          {
            id: 'js_errors',
            label: 'JavaScript runtime errors',
            default: true,
            tools: [T.console],
          },
          { id: 'js_warnings', label: 'JS warnings', default: true, tools: [T.console] },
          {
            id: 'network_errors',
            label: 'Network / Fetch failures',
            default: true,
            tools: [T.console],
          },
          { id: 'cors_errors', label: 'CORS errors', default: true, tools: [T.console] },
          { id: 'deprecations', label: 'Deprecation warnings', default: false, tools: [T.console] },
          {
            id: 'unhandled_promises',
            label: 'Unhandled promise rejections',
            default: false,
            tools: [T.console],
          },
        ],
      },
      {
        group: 'Resource Checks',
        items: [
          {
            id: 'missing_assets',
            label: 'Missing images / assets (404)',
            default: true,
            tools: [T.console, T.links],
          },
          {
            id: 'js_404',
            label: 'Failed script / CSS file loads',
            default: false,
            tools: [T.console],
          },
          {
            id: 'font_errors',
            label: 'Web font load failures',
            default: false,
            tools: [T.console],
          },
          {
            id: 'slow_resources',
            label: 'Slow loading resources (>3s)',
            default: false,
            tools: [T.console, T.vitals],
          },
          {
            id: 'ssl_errors',
            label: 'SSL / Mixed content errors',
            default: true,
            tools: [T.console],
          },
          {
            id: 'csp_violations',
            label: 'CSP policy violations',
            default: false,
            tools: [T.console],
          },
        ],
      },
    ],
  },
  {
    id: 'core_web_vitals',
    label: 'Core Web Vitals',
    icon: '◈',
    color: C.cyan,
    desc: 'Full HTML markup audit & Core Web Vitals — LCP, FID, CLS benchmarks',
    inputs: ['website_url'],
    checkboxGroups: [
      {
        group: 'Performance Metrics',
        items: [
          {
            id: 'lcp',
            label: 'LCP — Largest Contentful Paint',
            default: true,
            tools: [T.vitals, T.psi],
          },
          { id: 'fid', label: 'FID — First Input Delay', default: true, tools: [T.psi] },
          { id: 'cls', label: 'CLS — Cumulative Layout Shift', default: true, tools: [T.psi] },
          {
            id: 'fcp',
            label: 'FCP — First Contentful Paint',
            default: true,
            tools: [T.vitals, T.psi],
          },
          { id: 'ttfb', label: 'TTFB — Time to First Byte', default: false, tools: [T.vitals] },
          { id: 'inp', label: 'INP — Interaction to Next Paint', default: false, tools: [T.psi] },
          { id: 'tbt', label: 'TBT — Total Blocking Time', default: false, tools: [T.psi] },
          { id: 'speed_index', label: 'Speed Index', default: false, tools: [T.psi] },
          {
            id: 'render_blocking',
            label: 'Render-blocking resources',
            default: false,
            tools: [T.psi],
          },
        ],
      },
      {
        group: 'HTML Markup Quality',
        items: [
          {
            id: 'semantic_html',
            label: 'Semantic HTML5 structure',
            default: true,
            tools: [T.meta],
          },
          { id: 'meta_tags', label: 'Meta tags (OG, Twitter)', default: true, tools: [T.meta] },
          { id: 'open_graph', label: 'Open Graph social preview', default: false, tools: [T.meta] },
          {
            id: 'heading_hierarchy',
            label: 'Heading hierarchy (H1–H6)',
            default: true,
            tools: [T.meta, T.a11y],
          },
          { id: 'alt_attributes', label: 'Image alt attributes', default: true, tools: [T.a11y] },
          {
            id: 'aria_labels',
            label: 'ARIA labels & accessibility',
            default: false,
            tools: [T.a11y],
          },
          { id: 'lang_attr', label: 'HTML lang attribute', default: false, tools: [T.a11y] },
          {
            id: 'schema_markup',
            label: 'Schema / Structured data',
            default: false,
            tools: [T.meta],
          },
          { id: 'canonical', label: 'Canonical & hreflang tags', default: false, tools: [T.meta] },
          { id: 'robots_meta', label: 'Robots & sitemap meta', default: false, tools: [T.meta] },
        ],
      },
    ],
  },
]

const isDropdown = (i) => (i.type || 'checkbox') === 'dropdown'

// Merge operator-defined custom checks (from the backend) into a module so they
// render and behave like built-in checks. Custom items carry a `type`
// ('checkbox' | 'dropdown'), optional `group`, `options`, `default`, `tools`.
export function mergeCustomChecks(mod, customItems, disabledIds = []) {
  if (!mod) return mod
  const disabled = new Set(disabledIds)
  // Clone groups, dropping any disabled built-in checks.
  const groups = mod.checkboxGroups.map((g) => ({
    ...g,
    items: g.items.filter((i) => !disabled.has(i.id)),
  }))
  const byName = Object.fromEntries(groups.map((g) => [g.group, g]))
  for (const it of customItems || []) {
    if (it.enabled === false) continue // disabled custom checks are hidden / not used
    const name = it.group || 'Custom Checks'
    let g = byName[name]
    if (!g) {
      g = { group: name, items: [] }
      groups.push(g)
      byName[name] = g
    }
    g.items.push({ ...it, custom: true })
  }
  // Drop groups left empty after filtering.
  return { ...mod, checkboxGroups: groups.filter((g) => g.items.length) }
}

// Build the initial check state for a module. Checkboxes → boolean (allOn forces
// true); dropdowns → their default option (or '' = none).
export function buildCheckState(mod, allOn = false) {
  const state = {}
  mod.checkboxGroups.forEach((g) =>
    g.items.forEach((i) => {
      state[i.id] = isDropdown(i) ? i.default || '' : allOn ? true : i.default
    }),
  )
  return state
}

// Collect the "checks requested" labels. A ticked checkbox sends its label; a
// dropdown with a selected value sends "Label: value".
export function selectedCheckLabels(mod, checkState) {
  const labels = []
  mod.checkboxGroups.forEach((g) =>
    g.items.forEach((i) => {
      const v = checkState[i.id]
      if (isDropdown(i)) {
        if (v) labels.push(`${i.label}: ${v}`)
      } else if (v) labels.push(i.label)
    }),
  )
  return labels
}

// De-duplicated set of backend tools required by the active checks.
export function selectedCheckTools(mod, checkState) {
  const tools = new Set()
  mod.checkboxGroups.forEach((g) =>
    g.items.forEach((i) => {
      if (checkState[i.id]) (i.tools || []).forEach((t) => tools.add(t))
    }),
  )
  return [...tools]
}
