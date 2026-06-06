// ─────────────────────────────────────────────────────────────────────────────
//  components/Header.jsx
//  Top bar of the dashboard shell (MUI) — section title on the left; status
//  chips (report id · model · browser · mode · online) + theme toggle on the
//  right. Navigation lives in the Sidebar.
// ─────────────────────────────────────────────────────────────────────────────
import { AppBar, Toolbar, Box, Typography, Chip, IconButton, Tooltip } from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon  from '@mui/icons-material/DarkMode'

export default function Header({ reportId, health, theme, onToggleTheme, title = 'Dashboard' }) {
  const online = health?.ok

  return (
    <AppBar position="sticky" sx={{ borderRadius: 0, mb: 3, top: 0, zIndex: 5 }}>
      <Toolbar disableGutters sx={{ gap: 1, flexWrap: 'wrap', px: { xs: 2, md: 3 }, py: 1 }}>
        <Typography variant="h6">{title}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Chip label={reportId} size="small" color="primary" variant="outlined" />
          {health?.model && (
            <Tooltip title="Audit model"><Chip size="small" variant="outlined" label={health.model.replace(/^claude-/, '')} /></Tooltip>
          )}
          {health && typeof health.headless === 'boolean' && (
            <Tooltip title={`Browser: ${health.headless ? 'headless' : 'headed (visible)'}`}>
              <Chip size="small" variant="outlined" label={health.headless ? '🕶 headless' : '👁 headed'} />
            </Tooltip>
          )}
          {health?.env && (
            <Tooltip title={`Backend in ${health.env} mode`}>
              <Chip size="small" label={health.env === 'production' ? 'PROD' : 'DEV'} color={health.env === 'production' ? 'success' : 'warning'} />
            </Tooltip>
          )}
          {health && <Chip size="small" variant="outlined" label={online ? 'online' : 'offline'} color={online ? 'success' : 'error'} />}
          <Tooltip title="Toggle light / dark">
            <IconButton onClick={onToggleTheme} color="inherit" size="small">
              {theme === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  )
}
