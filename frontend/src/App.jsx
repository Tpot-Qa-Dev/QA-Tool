// ─────────────────────────────────────────────────────────────────────────────
//  App.jsx
//  Four-step audit wizard: Select Module → Configure → Running → Report.
//  Audit run state lives in useAudit; theme state in useTheme.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { buildMuiTheme } from './lib/muiTheme.js'
import { applyAppearance } from './lib/applyAppearance.js'
import { revealAll, attachTilt } from './lib/motion.js'
import './styles/app.css'
import './styles/fx.css'
import {
  checkHealth,
  getSettings,
  getCustomChecks,
  listFigmaProjects,
  listUserAiModels,
} from './api/client.js'
import {
  MODULES,
  buildCheckState,
  selectedCheckLabels,
  selectedCheckTools,
  mergeCustomChecks,
} from './config/modules.js'
import { normalizeUrl, validateUrl, validateFigmaUrl } from './lib/validation.js'
import { getRecentUrls, addRecentUrl } from './lib/recentUrls.js'
import { useAudit } from './hooks/useAudit.js'
import { useAuth } from './hooks/useAuth.js'
import { useTheme } from './hooks/useTheme.js'
import Login from './components/Login.jsx'
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import StepIndicator from './components/StepIndicator.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import SelectModule from './components/steps/SelectModule.jsx'
import ConfigureAudit from './components/steps/ConfigureAudit.jsx'
import RunningAudit from './components/steps/RunningAudit.jsx'
import AuditReport from './components/steps/AuditReport.jsx'

// Readable, date-time-first report ids so History is easy to scan and files are
// meaningful — e.g. "2026-06-09_1545_example-com_console_errors_k2x" instead of
// an opaque "QA-MQ7ZK2MX". The trailing base36 keeps it unique per run.
const pad2 = (n) => String(n).padStart(2, '0')
const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`
const domainSlug = (url) => {
  try {
    const u = new URL(url)
    const base = u.hostname || u.pathname.split('/').pop() || 'local'
    return (
      base
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .toLowerCase() || 'site'
    )
  } catch {
    return 'site'
  }
}
const makeReportId = (url, moduleId) =>
  `${stamp()}_${domainSlug(url)}_${moduleId || 'audit'}_${Date.now().toString(36).slice(-3)}`
const newReportId = () => `audit_${stamp()}` // placeholder shown before a run
const EMPTY_INPUTS = {
  website_url: '',
  figma_url: '',
  environment: 'live',
  figmaProject: '',
  sections: [],
  aiModelId: '',
}

// Per-environment URL memory: remembers a separate website URL for the Local,
// Staging/Dev and Live link types so switching the type recalls its own link.
const URL_BY_ENV_KEY = 'qa-tool-url-by-env'
const loadUrlByEnv = () => {
  try {
    return JSON.parse(localStorage.getItem(URL_BY_ENV_KEY)) || {}
  } catch {
    return {}
  }
}
const saveUrlByEnv = (map) => {
  try {
    localStorage.setItem(URL_BY_ENV_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [step, setStep] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [inputs, setInputs] = useState(EMPTY_INPUTS)
  const [checkState, setCheckState] = useState({})
  const [health, setHealth] = useState(null)
  const [reportId, setReportId] = useState(newReportId)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [checksAllOn, setChecksAllOn] = useState(false) // default from settings
  const [recentUrls, setRecentUrls] = useState(getRecentUrls)
  const [recentFigmaUrls, setRecentFigmaUrls] = useState(() => getRecentUrls('figma'))
  const [urlByEnv, setUrlByEnv] = useState(loadUrlByEnv) // { local, staging, live }
  const [customChecks, setCustomChecks] = useState({}) // { moduleId: [items] }
  const [disabledChecks, setDisabledChecks] = useState({}) // { moduleId: [builtinIds] }
  const [uiCfg, setUiCfg] = useState(null) // admin appearance settings
  const [pastReport, setPastReport] = useState(null)
  const [figmaProjects, setFigmaProjects] = useState({ projects: [], activeId: '' })
  const [aiModels, setAiModels] = useState({ profiles: [], activeId: '' })

  const audit = useAudit()
  const auth = useAuth()
  const theme = useTheme()
  const muiTheme = useMemo(() => buildMuiTheme(theme.theme, uiCfg || {}), [theme.theme, uiCfg])
  const baseMod = MODULES.find((m) => m.id === selectedId) || null
  // Built-in module merged with custom checks, minus disabled built-ins.
  const mod = baseMod
    ? mergeCustomChecks(baseMod, customChecks[baseMod.id], disabledChecks[baseMod.id])
    : null
  // When viewing a past report, prefer the matching module so the report header
  // shows the right icon/colour. A merged report has no single module, so it
  // gets a synthetic label; otherwise fall back to the currently selected one.
  const MERGED_MOD = { icon: '⧉', label: 'Merged Report', color: 'var(--accent)' }
  const displayMod = pastReport
    ? pastReport.merged
      ? MERGED_MOD
      : MODULES.find((m) => m.id === pastReport.module) || mod
    : mod

  useEffect(() => {
    checkHealth().then(setHealth)
  }, [])

  // Load the AI models the admin permitted users to pick (for the audit picker).
  // These all need a signed-in session, so they re-run once a user logs in.
  useEffect(() => {
    if (!auth.user) return
    listUserAiModels()
      .then(setAiModels)
      .catch(() => {})
  }, [auth.user])

  // Load custom checks + disabled built-ins (merged into modules in the wizard).
  useEffect(() => {
    if (!auth.user) return
    getCustomChecks()
      .then((d) => {
        setCustomChecks(d.customChecks || {})
        setDisabledChecks(d.disabledChecks || {})
      })
      .catch(() => {})
  }, [auth.user])

  // Load the saved Figma project tokens (for the per-audit project picker).
  useEffect(() => {
    if (!auth.user) return
    listFigmaProjects()
      .then(setFigmaProjects)
      .catch(() => {})
  }, [auth.user])

  // Entrance reveal + 3D hover tilt whenever the visible content changes.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      revealAll()
      attachTilt()
    })
    return () => cancelAnimationFrame(raf)
  }, [step, selectedId, audit.report, pastReport])

  // Load audit-default settings after sign-in: which module to pre-select and
  // whether checkboxes start all-on. Best-effort — failure leaves defaults.
  useEffect(() => {
    if (!auth.user) return
    getSettings()
      .then((s) => {
        const a = s?.settings?.audit || {}
        setChecksAllOn(!!a.checksAllOn)
        if (a.defaultModule && MODULES.some((m) => m.id === a.defaultModule)) {
          setSelectedId(a.defaultModule)
        }
        const ui = s?.settings?.ui
        if (ui) {
          setUiCfg(ui)
          applyAppearance(ui)
          // Apply the admin's default theme only for users who haven't chosen one.
          if (!localStorage.getItem('qa-tool-theme') && ui.defaultTheme)
            theme.setMode(ui.defaultTheme)
        }
      })
      .catch(() => {})
  }, [auth.user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset checks + inputs whenever a different module is chosen (or once custom
  // checks finish loading, so they're included in the initial state).
  useEffect(() => {
    if (!mod) return
    setCheckState(buildCheckState(mod, checksAllOn))
    setInputs(EMPTY_INPUTS)
  }, [selectedId, checksAllOn, customChecks, disabledChecks]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────
  const isCheckbox = (i) => (i.type || 'checkbox') === 'checkbox'
  const setInput = (key, val) => setInputs((s) => ({ ...s, [key]: val }))

  // Switch the link type (Local / Staging / Live): stash the URL typed for the
  // current type, then recall whatever URL was last used for the new type.
  const setEnvironment = (env) => {
    if (env === inputs.environment) return
    const cur = inputs.website_url.trim()
    const nextMap = cur ? { ...urlByEnv, [inputs.environment]: cur } : urlByEnv
    if (cur) {
      setUrlByEnv(nextMap)
      saveUrlByEnv(nextMap)
    }
    setInputs((s) => ({ ...s, environment: env, website_url: nextMap[env] || '' }))
  }
  const toggleCheck = (id) => setCheckState((s) => ({ ...s, [id]: !s[id] }))
  const setCheckValue = (id, val) => setCheckState((s) => ({ ...s, [id]: val })) // dropdowns
  const toggleAll = (group, val) =>
    setCheckState((s) => {
      const next = { ...s }
      group.items.forEach((i) => {
        if (isCheckbox(i)) next[i.id] = val
      })
      return next
    })
  // Tick / untick every checkbox across all groups at once (dropdowns untouched).
  const setAllChecks = (val) =>
    setCheckState((s) => {
      const next = { ...s }
      mod?.checkboxGroups.forEach((g) =>
        g.items.forEach((i) => {
          if (isCheckbox(i)) next[i.id] = val
        }),
      )
      return next
    })

  const needsFigma = !!mod?.inputs.includes('figma_url')

  // Per-field link validation — each field accepts only a valid link. The Local
  // link type also accepts a file:// path to a local HTML file.
  const websiteError = inputs.website_url.trim()
    ? validateUrl(inputs.website_url, { allowFile: inputs.environment === 'local' })
    : null
  const figmaFieldError =
    needsFigma && inputs.figma_url.trim() ? validateFigmaUrl(inputs.figma_url) : null

  // Figma vs Web also requires the two links to be different.
  const sameUrls =
    needsFigma &&
    !websiteError &&
    !figmaFieldError &&
    inputs.website_url.trim() !== '' &&
    inputs.figma_url.trim() !== '' &&
    normalizeUrl(inputs.website_url) === normalizeUrl(inputs.figma_url)

  const errors = {
    website: websiteError,
    figma:
      figmaFieldError ||
      (sameUrls
        ? 'Website URL and Figma URL must be different — enter the live site and its Figma file.'
        : null),
  }

  const canRun =
    !!mod &&
    inputs.website_url.trim() !== '' &&
    !websiteError &&
    (!needsFigma || (inputs.figma_url.trim() !== '' && !figmaFieldError)) &&
    !sameUrls &&
    Object.values(checkState).some(Boolean) &&
    !!health?.ok &&
    !!health?.keys?.ai

  const handleRun = async () => {
    if (!canRun) return
    setPastReport(null) // a fresh run replaces any viewed past report
    const cleanUrl = inputs.website_url.trim()
    // Generate a meaningful, date-time-first id for THIS run (url + module known now).
    const runId = makeReportId(cleanUrl, mod.id)
    setReportId(runId)
    setRecentUrls(addRecentUrl(cleanUrl)) // remember the website URL
    // Remember this URL under its link type so the type recalls it next time.
    const nextMap = { ...urlByEnv, [inputs.environment]: cleanUrl }
    setUrlByEnv(nextMap)
    saveUrlByEnv(nextMap)
    if (needsFigma && inputs.figma_url.trim()) {
      setRecentFigmaUrls(addRecentUrl(inputs.figma_url.trim(), 'figma')) // remember the Figma URL
    }
    setStep(3)
    await audit.start({
      url: cleanUrl,
      figmaUrl: inputs.figma_url.trim(),
      module: mod.id,
      checks: selectedCheckLabels(mod, checkState),
      requiredTools: selectedCheckTools(mod, checkState),
      reportId: runId,
      environmentHint: inputs.environment,
      figmaProject: inputs.figmaProject || undefined,
      sections: inputs.sections?.length ? inputs.sections : undefined,
      aiModelId: inputs.aiModelId || undefined,
    })
    setStep(4)
  }

  const handleReset = () => {
    setStep(1)
    setSelectedId(null)
    setInputs(EMPTY_INPUTS)
    setReportId(newReportId())
    setPastReport(null)
  }

  // Load a past report from the history panel and jump straight to step 4.
  const handleOpenPastReport = (report) => {
    setPastReport(report)
    setReportId(report.id || reportId)
    setHistoryOpen(false)
    setStep(4)
  }

  const progressLabel = audit.logs.length ? audit.logs[audit.logs.length - 1].msg : ''
  const activeNav = historyOpen
    ? 'history'
    : settingsOpen
      ? 'settings'
      : adminOpen
        ? 'admin'
        : 'dashboard'
  const stepTitle = adminOpen
    ? 'Admin Dashboard'
    : ['Select Module', 'Configure Audit', 'Running Audit', 'Audit Report'][step - 1] || 'Dashboard'

  // ── Auth gate ─────────────────────────────────────────────────────────────
  // Until the stored token has been checked, render an empty shell to avoid a
  // flash of the login screen for already-signed-in users.
  if (!auth.ready) {
    return (
      <ThemeProvider theme={muiTheme}>
        <div className="app-shell" />
      </ThemeProvider>
    )
  }
  if (!auth.user) {
    return (
      <ThemeProvider theme={muiTheme}>
        <Login onLogin={auth.login} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="app-shell">
        <Sidebar
          active={activeNav}
          isAdmin={auth.isAdmin}
          onHome={handleReset}
          onHistory={() => setHistoryOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onAdmin={() => setAdminOpen(true)}
        />

        <main className="app-main">
          <Header
            reportId={reportId}
            health={health}
            theme={theme.theme}
            onToggleTheme={theme.toggle}
            title={stepTitle}
            user={auth.user}
            onLogout={auth.logout}
          />

          <div className="app-content">
            <HistoryPanel
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              onOpenReport={handleOpenPastReport}
              onOpenMerged={handleOpenPastReport}
            />

            <SettingsPanel
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              health={health}
            />

            <AdminPanel
              open={adminOpen && auth.isAdmin}
              onClose={() => setAdminOpen(false)}
              currentUser={auth.user}
            />

            <StepIndicator current={step} />

            {step === 1 && (
              <SelectModule
                selectedId={selectedId}
                onSelect={setSelectedId}
                onContinue={() => setStep(2)}
              />
            )}

            {step === 2 && mod && (
              <ConfigureAudit
                mod={mod}
                inputs={inputs}
                setInput={setInput}
                setEnvironment={setEnvironment}
                errors={errors}
                checkState={checkState}
                toggleCheck={toggleCheck}
                setCheckValue={setCheckValue}
                toggleAll={toggleAll}
                setAllChecks={setAllChecks}
                recentUrls={recentUrls}
                recentFigmaUrls={recentFigmaUrls}
                figmaProjects={figmaProjects}
                aiModels={aiModels}
                health={health}
                canRun={canRun}
                onBack={() => setStep(1)}
                onChangeModule={() => setStep(1)}
                onRun={handleRun}
              />
            )}

            {step === 3 && (
              <RunningAudit
                mod={mod}
                url={inputs.website_url}
                progress={audit.progress}
                progressLabel={progressLabel}
                toolCalls={audit.toolCalls}
                logs={audit.logs}
                usage={audit.usage}
                logRef={audit.logRef}
              />
            )}

            {step === 4 && (
              <AuditReport
                mod={displayMod}
                report={pastReport || audit.report}
                error={pastReport ? null : audit.error}
                url={pastReport?.url || inputs.website_url}
                reportId={reportId}
                onRerun={() => {
                  setPastReport(null)
                  setStep(2)
                }}
                onReset={handleReset}
                onHome={handleReset}
              />
            )}
          </div>
          {/* app-content */}
        </main>
      </div>
      {/* app-shell */}
    </ThemeProvider>
  )
}
