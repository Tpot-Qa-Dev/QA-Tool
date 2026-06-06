// ─────────────────────────────────────────────────────────────────────────────
//  controllers/customchecks.controller.js
//  HTTP layer for /api/custom-checks — custom checks + disabled built-ins.
//  Every response returns { customChecks, disabledChecks } (the full store).
// ─────────────────────────────────────────────────────────────────────────────
import {
  getCustomChecks, addCustomCheck, removeCustomCheck, updateCustomCheck, setBuiltinDisabled,
} from '../services/customchecks.service.js'

const shape = (store) => ({ customChecks: store.items, disabledChecks: store.disabled })

export async function listCustomChecks(_req, res) {
  try { res.json(shape(await getCustomChecks())) }
  catch (err) { console.error('[custom-checks] list error:', err); res.status(500).json({ error: err.message }) }
}

export async function postCustomCheck(req, res) {
  try {
    const { moduleId, item } = req.body || {}
    res.json(shape(await addCustomCheck(moduleId, item || {})))
  } catch (err) { console.error('[custom-checks] add error:', err); res.status(400).json({ error: err.message }) }
}

export async function patchCustomCheck(req, res) {
  try { res.json(shape(await updateCustomCheck(req.params.moduleId, req.params.id, req.body || {}))) }
  catch (err) { console.error('[custom-checks] update error:', err); res.status(400).json({ error: err.message }) }
}

export async function deleteCustomCheck(req, res) {
  try { res.json(shape(await removeCustomCheck(req.params.moduleId, req.params.id))) }
  catch (err) { console.error('[custom-checks] delete error:', err); res.status(400).json({ error: err.message }) }
}

// POST /api/custom-checks/builtin { moduleId, checkId, disabled }
export async function setBuiltinDisabledHandler(req, res) {
  try {
    const { moduleId, checkId, disabled } = req.body || {}
    res.json(shape(await setBuiltinDisabled(moduleId, checkId, disabled)))
  } catch (err) { console.error('[custom-checks] builtin error:', err); res.status(400).json({ error: err.message }) }
}
