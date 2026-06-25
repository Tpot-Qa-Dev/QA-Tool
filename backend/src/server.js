// ─────────────────────────────────────────────────────────────────────────────
//  server.js
//  Entry point — starts the HTTP server.
//  Run: npm start   (from the backend/ directory)
// ─────────────────────────────────────────────────────────────────────────────
import { createApp } from './app.js'
import { config, hasEnvAiKey } from './config/index.js'

const app = createApp()

app.listen(config.port, () => {
  const status = {
    OpenRouter: config.keys.openrouter ? '✓' : config.keys.claude ? '○ using Claude' : '✗ MISSING',
    Claude: config.keys.claude ? '✓ (fallback)' : '○ optional',
    PageSpeed: config.keys.psi ? '✓' : '○ optional',
    Figma: config.keys.figma ? '✓' : '○ optional',
  }
  if (!hasEnvAiKey()) {
    status.OpenRouter = '✗ MISSING — set OPENROUTER_API_KEY in .env'
  }
  const browserMode = config.playwright.headless ? 'headless' : 'headed — visible window'
  console.log(`\n  QA Tool Backend — http://localhost:${config.port}`)
  console.log(
    `  Mode: ${config.env.toUpperCase()} ${config.isDev ? '(verbose logs · permissive CORS · detailed errors)' : '(minimal logs · locked CORS · generic errors)'}`,
  )
  console.log(
    `  API keys: ${Object.entries(status)
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ·  ')}`,
  )
  console.log(`  Playwright: Chromium (${browserMode})\n`)
})
