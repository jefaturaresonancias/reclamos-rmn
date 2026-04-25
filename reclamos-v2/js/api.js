// api.js — Conexión con Google Apps Script
// Reemplaza db.js de la versión anterior
// ─────────────────────────────────────────────────────────────
// ⚠️  REEMPLAZÁ esta URL con la tuya después de publicar el script
const API_URL = 'https://script.google.com/macros/s/AKfycbxodNU60uwl2DtjQn3uUXiTQ5C8lyGfGkaV0CW8PUH9y0Lymr7E68jw-vmeupawGCxoxg/exec';

// ── Helpers internos ─────────────────────────────────────────
async function apiGet(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── API pública ───────────────────────────────────────────────

/** Obtiene todos los reclamos. Filtro opcional: estado='pendiente'|'resuelto'|'entregado' */
async function getReclamos(filtro = {}) {
  const result = await apiGet({ action: 'list', ...filtro });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Obtiene las estadísticas globales */
async function getStats() {
  const result = await apiGet({ action: 'stats' });
  if (!result.ok) throw new Error(result.error);
  return result.stats;
}

/** Agrega un nuevo reclamo al sheet */
async function addReclamo(data) {
  const result = await apiPost({ action: 'add', data });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Actualiza campos de un reclamo existente */
async function updateReclamo(id, changes) {
  const result = await apiPost({ action: 'update', id, changes });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** El médico marca el reclamo como informado */
async function resolverReclamo(id, comentario) {
  const result = await apiPost({ action: 'resolver', id, comentario });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** El administrativo marca el reclamo como entregado */
async function entregarReclamo(id) {
  const result = await apiPost({ action: 'entregar', id });
  if (!result.ok) throw new Error(result.error);
  return result;
}
