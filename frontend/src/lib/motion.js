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
  const els = [...document.querySelectorAll(sel)].filter(el => !el.dataset.revealed)
  els.forEach((el, i) => {
    el.dataset.revealed = '1'
    if (fxOff()) return
    el.classList.add('reveal')
    setTimeout(() => el.classList.add('in'), 40 + i * stagger)
  })
}

// Attach pointer-based 3D tilt to matching elements (once each).
export function attachTilt(sel = '.module-card', max = 9) {
  if (fxOff()) return () => {}
  const cleanups = []
  for (const el of document.querySelectorAll(sel)) {
    if (el.dataset.tilt) continue
    el.dataset.tilt = '1'
    const move = (e) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(720px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(8px)`
    }
    const leave = () => { el.style.transform = '' }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); delete el.dataset.tilt })
  }
  return () => cleanups.forEach(fn => fn())
}

// Animate a number from 0 → `to`. Returns a cleanup. Used by useCountUp.
export function countUp(setValue, to, dur = 850) {
  const target = Number(to) || 0
  if (fxOff() || !target) { setValue(target); return () => {} }
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
