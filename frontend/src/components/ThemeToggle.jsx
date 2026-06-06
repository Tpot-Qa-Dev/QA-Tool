// ─────────────────────────────────────────────────────────────────────────────
//  components/ThemeToggle.jsx
//  Animated dark / light theme switch.
// ─────────────────────────────────────────────────────────────────────────────

export default function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === 'light'

  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      aria-label="Toggle colour theme"
    >
      <span className={`theme-toggle-track ${isLight ? 'on' : ''}`}>
        <span className="theme-toggle-thumb">{isLight ? '☀' : '☾'}</span>
      </span>
    </button>
  )
}
