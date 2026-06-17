// ─────────────────────────────────────────────────────────────────────────────
//  app.js
//  Builds and configures the Express application (middleware + routes).
//  Kept separate from server.js so the app can be imported by tests without
//  binding a port.
//
//  Behaviour differs by run mode (config.env):
//   • development — permissive CORS (any localhost), request logging, detailed
//     error responses (message + stack).
//   • production  — CORS locked to config.frontendUrl, minimal logging, generic
//     error responses (no internals leaked).
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
import routes from './routes/index.js'

// In development, allow the configured frontend plus any localhost/127.0.0.1
// origin (any port) so the dev server / tools connect without CORS friction.
function corsOptions() {
  if (config.isProd) return { origin: config.frontendUrl }
  return {
    origin(origin, cb) {
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        origin === config.frontendUrl
      ) {
        return cb(null, true)
      }
      return cb(null, true) // dev: reflect any origin
    },
  }
}

export function createApp() {
  const app = express()

  app.use(cors(corsOptions()))
  app.use(express.json({ limit: '1mb' }))

  // Verbose request logging in development only.
  if (config.isDev) {
    app.use((req, res, next) => {
      const t0 = Date.now()
      res.on('finish', () => {
        console.log(
          `  [${req.method}] ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0}ms)`,
        )
      })
      next()
    })
  }

  app.use('/api', routes)

  // 404 for unknown API routes.
  app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }))

  // Central error handler — detail in dev, generic in prod.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', config.isDev ? err : err.message)
    const body = { error: config.isDev ? err.message : 'Internal server error' }
    if (config.isDev && err.stack) body.stack = err.stack
    res.status(err.status || 500).json(body)
  })

  return app
}
