// ─────────────────────────────────────────────────────────────────────────────
//  components/StepIndicator.jsx
//  Horizontal wizard progress (MUI Stepper).
// ─────────────────────────────────────────────────────────────────────────────
import { Stepper, Step, StepLabel, Box } from '@mui/material'

const STEPS = ['Select Module', 'Configure', 'Running', 'Report']

export default function StepIndicator({ current }) {
  return (
    <Box
      sx={{
        mb: 4,
        '& .MuiStepIcon-root.Mui-active': {
          filter: (t) => `drop-shadow(0 0 8px ${t.palette.primary.main})`,
        },
      }}
    >
      <Stepper activeStep={current - 1} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  )
}
