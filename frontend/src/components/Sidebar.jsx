// ─────────────────────────────────────────────────────────────────────────────
//  components/Sidebar.jsx
//  Fixed left navigation (dashboard-shell). Dark, neon-accented. Each item opens
//  the matching view/panel; the active one is highlighted.
// ─────────────────────────────────────────────────────────────────────────────
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import HomeIcon from '@mui/icons-material/SpaceDashboard'
import HistoryIcon from '@mui/icons-material/History'
import SettingsIcon from '@mui/icons-material/Settings'
import InsightsIcon from '@mui/icons-material/Insights'

export default function Sidebar({ active, onHome, onHistory, onSettings, onAdmin }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: <HomeIcon />, onClick: onHome },
    { key: 'history', label: 'History', icon: <HistoryIcon />, onClick: onHistory },
    { key: 'admin', label: 'Admin', icon: <InsightsIcon />, onClick: onAdmin },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon />, onClick: onSettings },
  ]

  return (
    <Box component="nav" className="app-sidebar">
      <Box
        className="app-sidebar-brand"
        role="button"
        tabIndex={0}
        onClick={onHome}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onHome?.()
        }}
      >
        <span className="app-sidebar-logo">🔬</span>
        <span className="app-sidebar-name">QA&nbsp;TOOL</span>
      </Box>

      <Typography className="app-sidebar-heading">MENU</Typography>
      <List disablePadding sx={{ px: 1 }}>
        {items.map((it) => (
          <ListItemButton
            key={it.key}
            selected={active === it.key}
            onClick={it.onClick}
            className="app-nav-item"
            sx={{ borderRadius: 'var(--radius)', mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{it.icon}</ListItemIcon>
            <ListItemText
              primary={it.label}
              primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}
