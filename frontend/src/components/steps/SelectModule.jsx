// ─────────────────────────────────────────────────────────────────────────────
//  components/steps/SelectModule.jsx
//  Wizard step 1 — pick a test module (MUI Card grid; keeps neon-3D classes).
// ─────────────────────────────────────────────────────────────────────────────
import { Paper, Box, Typography, Button, Stack } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { MODULES } from '../../config/modules.js'

export default function SelectModule({ selectedId, onSelect, onContinue }) {
  const accent = MODULES.find((m) => m.id === selectedId)?.color

  return (
    <Box className="fade-in">
      <Paper className="card" elevation={0} sx={{ p: 2.5, mb: 2 }}>
        <Typography className="section-label" variant="overline" sx={{ display: 'block', mb: 1.5 }}>
          01 — Select Test Module
        </Typography>
        <Box className="module-grid">
          {MODULES.map((m) => {
            const selected = selectedId === m.id
            return (
              <Paper
                key={m.id}
                elevation={0}
                onClick={() => onSelect(m.id)}
                className={`module-card ${selected ? 'selected' : ''}`}
                sx={{
                  position: 'relative',
                  p: 2,
                  cursor: 'pointer',
                  textAlign: 'center',
                  border: 2,
                  borderColor: selected ? m.color : 'divider',
                  background: selected
                    ? `color-mix(in srgb, ${m.color} 9%, transparent)`
                    : 'background.paper',
                }}
              >
                {selected && (
                  <CheckCircleIcon
                    sx={{ position: 'absolute', top: 8, right: 8, fontSize: 18, color: m.color }}
                  />
                )}
                <Box sx={{ fontSize: 30, mb: 0.5, color: m.color }}>{m.icon}</Box>
                <Typography
                  sx={{ fontWeight: 700, fontSize: 14, color: selected ? m.color : 'text.primary' }}
                >
                  {m.label}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}
                >
                  {m.desc}
                </Typography>
              </Paper>
            )
          })}
        </Box>
      </Paper>

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          size="large"
          endIcon={<ArrowForwardIcon />}
          disabled={!selectedId}
          onClick={onContinue}
          sx={
            accent ? { background: `linear-gradient(135deg, ${accent}, ${accent}BB)` } : undefined
          }
        >
          Continue
        </Button>
      </Stack>
    </Box>
  )
}
