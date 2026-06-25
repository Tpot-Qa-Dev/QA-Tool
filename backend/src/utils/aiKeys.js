// ─────────────────────────────────────────────────────────────────────────────
//  utils/aiKeys.js
//  Shared check for whether the server can run an audit (env key or active
//  Admin AI model profile with a runnable provider + key).
// ─────────────────────────────────────────────────────────────────────────────
import { hasEnvAiKey } from '../config/index.js'
import { getActiveProfile } from '../services/aiModels.service.js'

export async function hasAiKey() {
  if (hasEnvAiKey()) return true
  const profile = await getActiveProfile()
  return !!(profile?.apiKey && profile.runnable)
}
