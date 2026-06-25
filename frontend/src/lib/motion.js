// ─────────────────────────────────────────────────────────────────────────────
//  lib/motion.js
//  Lightweight motion (no GSAP): entrance reveal with stagger, hover 3D tilt,
//  and count-up. All no-ops when effects are disabled (.fx-off) or the user
//  prefers reduced motion.
// ─────────────────────────────────────────────────────────────────────────────
const fxOff = () =>
  document.documentElement.classList.contains('fx-off') ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Reveal matching elements (once each) with a staggered slide-up.
export function revealAll(sel = '.card, .module-card', stagger = 55) {
  const els = [...document.querySelectorAll(sel)].filter((el) => !el.dataset.revealed)
  els.forEach((el, i) => {
    el.dataset.revealed = '1'
    if (fxOff()) return
    el.classList.add('reveal')
    setTimeout(() => el.classList.add('in'), 40 + i * stagger)
  })
}

// 3D hover tilt was part of the old "neon dark" look; the neutral/minimal theme
// drops it. Kept as a no-op so existing callers don't need to change.
export function attachTilt() {
  return () => {}
}

// Animate a number from 0 → `to`. Returns a cleanup. Used by useCountUp.
export function countUp(setValue, to, dur = 850) {
  const target = Number(to) || 0
  if (fxOff() || !target) {
    setValue(target)
    return () => {}
  }
  const start = performance.now()
  let raf
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    setValue(Math.round(target * eased))
    if (p < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
