// ─────────────────────────────────────────────────────────────────────────────
//  components/Checkbox.jsx
//  Square checkbox with an animated tick. `accent` colours the checked state.
// ─────────────────────────────────────────────────────────────────────────────

export default function Checkbox({ checked, accent }) {
  return (
    <span className={`cbx-box ${checked ? 'checked' : ''}`} style={{ '--acc-color': accent }}>
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
          <path
            d="M1 3L3.5 5.5L8 1"
            stroke="var(--on-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}
