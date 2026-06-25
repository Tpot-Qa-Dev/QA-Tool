// ─────────────────────────────────────────────────────────────────────────────
//  components/steps/RunningAudit.jsx
//  Wizard step 3 — live audit progress (MUI). Log box stays custom for scroll.
// ─────────────────────────────────────────────────────────────────────────────
import { Paper, Box, Typography, LinearProgress, Chip, Stack } from '@mui/material'
import { COLORS } from '../../lib/colors.js'

const STAGES = [
  'Launching browser',
  'Loading page',
  'Executing checks',
  'Capturing data',
  'Generating report',
]

const fmt = (n) => (Number(n) || 0).toLocaleString()

export default function RunningAudit({
  mod,
  url,
  progress,
  progressLabel,
  toolCalls,
  logs,
  usage,
  logRef,
}) {
  const accent = mod?.color || COLORS.info
  // Per-model rows for the live token panel, biggest spender first.
  const modelRows = usage?.byModel
    ? Object.entries(usage.byModel)
        .map(([name, m]) => ({ name, ...m, total: (m.inputTokens || 0) + (m.outputTokens || 0) }))
        .sort((a, b) => b.total - a.total)
    : []

  return (
    <Box className="fade-in">
      <Paper className="card" elevation={0} sx={{ p: 3, textAlign: 'center' }}>
        <Box className="pulse" sx={{ fontSize: 40, mb: 2 }}>
          {mod?.icon}
        </Box>
        <Typography variant="h6">Running {mod?.label} Audit</Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, fontFamily: "'JetBrains Mono', monospace" }}
        >
          {url}
        </Typography>

        <Box sx={{ maxWidth: 480, mx: 'auto', mb: 1.5 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress)}
            sx={{
              height: 8,
              borderRadius: 5,
              '& .MuiLinearProgress-bar': {
                background: `linear-gradient(90deg, ${accent}, ${accent}AA)`,
              },
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {progress}% — {progressLabel || 'Initializing…'}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          justifyContent="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 2 }}
        >
          {STAGES.map((s, i) => {
            const reached = progress > i * 20
            return (
              <Chip
                key={s}
                size="small"
                label={`${reached ? '✓' : '○'} ${s}`}
                variant={reached ? 'filled' : 'outlined'}
                sx={
                  reached
                    ? {
                        bgcolor: `color-mix(in srgb, ${accent} 18%, transparent)`,
                        color: accent,
                        borderColor: accent,
                      }
                    : undefined
                }
              />
            )
          })}
        </Stack>

        {usage && (
          <Box
            sx={{
              mt: 2.5,
              mx: 'auto',
              maxWidth: 480,
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: `color-mix(in srgb, ${accent} 6%, transparent)`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}>
                {fmt(usage.totalTokens)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                tokens · {fmt(usage.inputTokens)} in · {fmt(usage.outputTokens)} out ·{' '}
                {fmt(usage.calls)} call{usage.calls === 1 ? '' : 's'}
              </Typography>
            </Box>
            {modelRows.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {modelRows.map((m) => (
                  <Box
                    key={m.name}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                      fontSize: 12,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "'JetBrains Mono', monospace",
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={m.name}
                    >
                      {m.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {fmt(m.total)} ({fmt(m.inputTokens)}/{fmt(m.outputTokens)})
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        )}

        {toolCalls.length > 0 && (
          <Stack
            direction="row"
            spacing={1}
            justifyContent="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 2 }}
          >
            {toolCalls.map((tc, i) => (
              <Chip
                key={i}
                size="small"
                variant="outlined"
                label={`${tc.status === 'done' ? '✓' : tc.status === 'error' ? '✗' : '⟳'} ${tc.tool}`}
                sx={{
                  color:
                    tc.status === 'done'
                      ? COLORS.pass
                      : tc.status === 'error'
                        ? COLORS.fail
                        : 'text.secondary',
                }}
              />
            ))}
          </Stack>
        )}

        {logs.length > 0 && (
          <div className="log-box" ref={logRef} style={{ marginTop: 18, textAlign: 'left' }}>
            {logs.map((l, i) => (
              <div key={i} className={`log-line ${l.hi ? 'hi' : ''}`}>
                {l.msg}
              </div>
            ))}
          </div>
        )}
      </Paper>
    </Box>
  )
}
