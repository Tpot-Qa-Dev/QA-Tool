// ─────────────────────────────────────────────────────────────────────────────
//  services/envconfig.service.js
//  Read/update the backend .env from the Admin panel — API keys, run mode,
//  frontend URL, headless. Secrets are NEVER returned to the client (only a
//  set/not-set flag). Most changes need a server restart to take effect, since
//  config is read once at startup.
//
//  ⚠ Local/single-user use: this writes secrets to disk and exposes a write
//  endpoint. Don't expose this server publicly without auth.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { config } from '../config/index.js'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_FILE    = join(backendRoot, '.env')

// Patch field → .env variable name.
const FIELD_TO_ENV = {
  claudeKey:   'CLAUDE_API_KEY',
  psiKey:      'PSI_API_KEY',
  figmaToken:  'FIGMA_TOKEN',
  nodeEnv:     'NODE_ENV',
  frontendUrl: 'FRONTEND_URL',
  headless:    'HEADLESS',
}
const SECRET_FIELDS = ['claudeKey', 'psiKey', 'figmaToken']

// Current ACTIVE config (what the running server loaded). Secrets are shown
// only as presence booleans.
export function getEnvStatus() {
  return {
    keys: {
      claude: !!config.keys.claude,
      psi:    !!config.keys.psi,
      figma:  !!config.keys.figma,
    },
    nodeEnv:     config.env,
    frontendUrl: config.frontendUrl,
    port:        config.port,
    headless:    config.playwright.headless,
  }
}

// Replace or append `KEY=value` in the .env text, preserving everything else.
function setLine(text, key, value) {
  const line = `${key}=${value}`
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm')
  if (re.test(text)) return text.replace(re, line)
  return text.replace(/\s*$/, '') + `\n${line}\n`
}

// Apply a patch to .env. For secret fields, only write when a non-empty value
// is supplied (so blank inputs don't wipe existing keys). Returns which env
// vars were updated.
export async function updateEnvConfig(patch = {}) {
  let text = ''
  try { text = await fs.readFile(ENV_FILE, 'utf8') } catch { text = '' }

  const updated = []
  for (const [field, envName] of Object.entries(FIELD_TO_ENV)) {
    if (!(field in patch)) continue
    let val = patch[field]

    if (SECRET_FIELDS.includes(field)) {
      if (typeof val !== 'string' || !val.trim()) continue // don't overwrite with blank
      val = val.trim()
    } else if (field === 'nodeEnv') {
      val = val === 'production' ? 'production' : 'development'
    } else if (field === 'headless') {
      val = (val === true || val === 'true') ? 'true' : 'false'
    } else if (field === 'frontendUrl') {
      if (typeof val !== 'string' || !val.trim()) continue
      val = val.trim()
    }

    text = setLine(text, envName, val)
    updated.push(envName)
  }

  if (updated.length) await fs.writeFile(ENV_FILE, text, 'utf8')
  return { ok: true, updated, restartRequired: updated.length > 0 }
}
