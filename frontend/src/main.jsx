// ─────────────────────────────────────────────────────────────────────────────
//  main.jsx
//  React entry point — mounts <App /> and loads theme + global styles.
// ─────────────────────────────────────────────────────────────────────────────
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/global.css'
import App from './App.jsx'
import { installAuthInterceptor } from './api/client.js'

// Attach the auth token to every API request before anything renders.
installAuthInterceptor()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
