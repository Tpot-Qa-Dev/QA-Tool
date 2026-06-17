// ─────────────────────────────────────────────────────────────────────────────
//  services/settings.service.js
//  Runtime-editable tool settings, persisted to backend/settings.json. Covers
//  audit-run parameters (model, iterations, token budget, headless) and a
//  per-tool enable/disable map. Validated + clamped on write so the UI can't
//  push values that would break a run.
//
//  Some settings (headless) are applied by mutating the shared `config` object
//  so the Playwright tools — which read config at browser-launch time — pick
//  them up without any plumbing.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { config } from '../config/index.js'
import { TOOL_DEFINITIONS } from '../tools/index.js'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SETTINGS_FILE = join(backendRoot, 'settings.json')

// Models the UI offers. Free-form values are still accepted (any non-empty
// string), but these are the vetted presets.
export const MODEL_PRESETS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001']

const ALL_TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name)

const DEFAULTS = {
  audit: {
    model: 'claude-sonnet-4-6',
    maxIterations: 12,
    maxTokens: 8192,
    headless: config.playwright.headless,
    temperature: 1, // Claude sampling temperature (0–1)
    extraInstructions: '', // appended verbatim to every system prompt
    defaultModule: '', // module id pre-selected on launch ('' = none)
    checksAllOn: false, // start with every checkbox ticked vs. its default
  },
  browser: {
    viewportWidth: config.playwright.viewport.width,
    viewportHeight: config.playwright.viewport.height,
    navTimeoutSec: config.playwright.navTimeoutMs / 1000,
    maxLinks: config.playwright.maxLinks,
  },
  // Every known tool enabled by default.
  enabledTools: Object.fromEntries(ALL_TOOL_NAMES.map((n) => [n, true])),
  // Admin-managed appearance ('' accent = use theme default).
  ui: {
    accent: '',
    accent2: '',
    defaultTheme: 'dark', // 'dark' | 'light'
    density: 'comfortable', // 'comfortable' | 'compact'
    radius: 14, // px
    effects: true, // 3D tilt / glow / animations on
  },
}

const HEX = /^#[0-9a-fA-F]{3,8}$/

let cache = null // in-memory copy so reads are cheap

const clampInt = (v, min, max, fallback) => {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
const clampNum = (v, min, max, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// Merge a (possibly partial, possibly hostile) object onto the defaults,
// validating and clamping every field.
function normalize(raw = {}) {
  const a = raw.audit || {}
  const audit = {
    model: typeof a.model === 'string' && a.model.trim() ? a.model.trim() : DEFAULTS.audit.model,
    maxIterations: clampInt(a.maxIterations, 1, 30, DEFAULTS.audit.maxIterations),
    maxTokens: clampInt(a.maxTokens, 1024, 16000, DEFAULTS.audit.maxTokens),
    headless: typeof a.headless === 'boolean' ? a.headless : DEFAULTS.audit.headless,
    temperature: clampNum(a.temperature, 0, 1, DEFAULTS.audit.temperature),
    extraInstructions:
      typeof a.extraInstructions === 'string'
        ? a.extraInstructions.slice(0, 2000)
        : DEFAULTS.audit.extraInstructions,
    defaultModule:
      typeof a.defaultModule === 'string'
        ? a.defaultModule.slice(0, 60)
        : DEFAULTS.audit.defaultModule,
    checksAllOn: typeof a.checksAllOn === 'boolean' ? a.checksAllOn : DEFAULTS.audit.checksAllOn,
  }

  const b = raw.browser || {}
  const browser = {
    viewportWidth: clampInt(b.viewportWidth, 320, 3840, DEFAULTS.browser.viewportWidth),
    viewportHeight: clampInt(b.viewportHeight, 240, 2160, DEFAULTS.browser.viewportHeight),
    navTimeoutSec: clampInt(b.navTimeoutSec, 5, 120, DEFAULTS.browser.navTimeoutSec),
    maxLinks: clampInt(b.maxLinks, 1, 500, DEFAULTS.browser.maxLinks),
  }

  // Start from "all enabled", then apply only known tool overrides.
  const enabledTools = { ...DEFAULTS.enabledTools }
  const incoming = raw.enabledTools || {}
  for (const name of ALL_TOOL_NAMES) {
    if (typeof incoming[name] === 'boolean') enabledTools[name] = incoming[name]
  }

  const u = raw.ui || {}
  const ui = {
    accent:
      typeof u.accent === 'string' && (u.accent === '' || HEX.test(u.accent))
        ? u.accent
        : DEFAULTS.ui.accent,
    accent2:
      typeof u.accent2 === 'string' && (u.accent2 === '' || HEX.test(u.accent2))
        ? u.accent2
        : DEFAULTS.ui.accent2,
    defaultTheme: u.defaultTheme === 'light' ? 'light' : 'dark',
    density: u.density === 'compact' ? 'compact' : 'comfortable',
    radius: clampInt(u.radius, 0, 28, DEFAULTS.ui.radius),
    effects: typeof u.effects === 'boolean' ? u.effects : DEFAULTS.ui.effects,
  }

  return { audit, browser, enabledTools, ui }
}

// Push settings that other modules read from `config` into that object.
function applyRuntime(settings) {
  config.playwright.headless = settings.audit.headless
  config.playwright.viewport = {
    width: settings.browser.viewportWidth,
    height: settings.browser.viewportHeight,
  }
  config.playwright.navTimeoutMs = settings.browser.navTimeoutSec * 1000
  config.playwright.maxLinks = settings.browser.maxLinks
}

// Load settings from disk (or defaults), cache, and apply runtime side-effects.
export async function getSettings() {
  if (cache) return cache
  let parsed = {}
  try {
    parsed = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[settings] unreadable, using defaults:', err.message)
  }
  cache = normalize(parsed)
  applyRuntime(cache)
  return cache
}

// Merge a patch onto current settings, persist, re-apply runtime, return it.
export async function saveSettings(patch = {}) {
  const current = await getSettings()
  const merged = normalize({
    audit: { ...current.audit, ...(patch.audit || {}) },
    browser: { ...current.browser, ...(patch.browser || {}) },
    enabledTools: { ...current.enabledTools, ...(patch.enabledTools || {}) },
    ui: { ...current.ui, ...(patch.ui || {}) },
  })
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8')
  cache = merged
  applyRuntime(cache)
  return cache
}

// The tool catalogue with enabled flags + descriptions — everything the UI
// needs to render the enable/disable list.
export async function getToolCatalogue() {
  const settings = await getSettings()
  return TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    enabled: settings.enabledTools[t.name] !== false,
  }))
}
