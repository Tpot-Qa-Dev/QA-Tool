// ─────────────────────────────────────────────────────────────────────────────
//  controllers/figmaProjects.controller.js
//  HTTP layer for managing project-wise Figma access tokens.
// ─────────────────────────────────────────────────────────────────────────────
import { listProjects, addProject, removeProject, setActiveProject } from '../services/figmaProjects.service.js'

export async function getFigmaProjects(req, res) {
  try {
    res.json(await listProjects())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function postFigmaProject(req, res) {
  try {
    const { name, token } = req.body || {}
    res.json(await addProject({ name, token }))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export async function deleteFigmaProject(req, res) {
  try {
    res.json(await removeProject(req.params.id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export async function putActiveFigmaProject(req, res) {
  try {
    const { id } = req.body || {}
    res.json(await setActiveProject(id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}
