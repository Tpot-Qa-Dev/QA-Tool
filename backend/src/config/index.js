// ─────────────────────────────────────────────────────────────────────────────
//  config/index.js
//  Loads environment variables from backend/.env and exposes a typed config object.
//  This is the single source of truth for runtime configuration.
// ─────────────────────────────────────────────────────────────────────────────
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// backend/.env sits two levels up from this file (src/config/ → src/ → backend/)
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: resolve(backendRoot, '.env') })

// Run mode — set NODE_ENV=production (in .env or the shell) for production.
// Anything other than "production" is treated as development.
const env = process.env.NODE_ENV === 'production' ? 'production' : 'development'

export const config = {
  env,
  isProd: env === 'production',
  isDev: env !== 'production',
  port: process.env.PORT || 3001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  keys: {
    claude: process.env.CLAUDE_API_KEY || '',
    psi: process.env.PSI_API_KEY || '',
    figma: process.env.FIGMA_TOKEN || '',
  },
  // Authentication / RBAC. JWT_SECRET signs login tokens; the ADMIN_* pair seeds
  // the first admin account (see db/seed.js). Set all three in backend/.env.
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    adminEmail: process.env.ADMIN_EMAIL || 'admin@qa-tool.local',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    adminName: process.env.ADMIN_NAME || 'Administrator',
  },
  playwright: {
    // HEADLESS=false in .env runs Chromium in a visible window (for debugging).
    // Any other value (or unset) keeps it headless.
    headless: process.env.HEADLESS !== 'false',
    // Browser defaults — overridden at runtime by settings.service (applyRuntime).
    viewport: { width: 1280, height: 800 },
    navTimeoutMs: 30_000,
    maxLinks: 80,
  },
}
