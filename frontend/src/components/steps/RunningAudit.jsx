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

export default function RunningAudit({
  mod,
  url,
  progress,
  progressLabel,
  toolCalls,
  logs,
  logRef,
}) {
  const accent = mod?.color || COLORS.info

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
