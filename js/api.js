// api.js — Conexión con Google Apps Script
// La URL de la API se guarda en el localStorage de CADA navegador
// El código fuente en GitHub no contiene ningún dato sensible
// ─────────────────────────────────────────────────────────────

const API_KEY = 'reclamos_api_url';

function getApiUrl() { return localStorage.getItem(API_KEY) || null; }
function setApiUrl(url) { localStorage.setItem(API_KEY, url.trim()); }
function resetApiUrl() { localStorage.removeItem(API_KEY); location.reload(); }

// ── Pantalla de configuración ─────────────────────────────────
function mostrarPantallaConfig(onSuccess) {
  const overlay = document.createElement('div');
  overlay.id = 'config-overlay';
  overlay.innerHTML = `
    <style>
      #config-overlay {
        position:fixed;inset:0;z-index:9999;background:#0d0f14;
        display:flex;align-items:center;justify-content:center;
        font-family:'DM Sans',sans-serif;
      }
      #config-box {
        background:#13161e;border:1px solid #252a38;border-radius:20px;
        padding:40px;width:520px;max-width:95vw;
        display:flex;flex-direction:column;gap:20px;
        animation:cfgUp .4s ease both;
      }
      @keyframes cfgUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      #config-box .cfg-icon{width:52px;height:52px;border-radius:14px;
        background:linear-gradient(135deg,#4f7cff,#7c3aed);
        display:flex;align-items:center;justify-content:center;font-size:26px;}
      #config-box h2{font-family:'DM Serif Display',serif;font-size:1.4rem;font-weight:400;color:#e8ecf4;}
      #config-box p{font-size:.875rem;color:#8892aa;line-height:1.6;}
      #config-box .cfg-steps{background:#1a1e29;border-radius:12px;padding:16px 20px;
        display:flex;flex-direction:column;gap:8px;}
      #config-box .cfg-step{display:flex;gap:10px;align-items:flex-start;font-size:.82rem;color:#8892aa;}
      #config-box .cfg-n{min-width:20px;height:20px;border-radius:50%;
        background:rgba(79,124,255,.2);color:#4f7cff;
        display:flex;align-items:center;justify-content:center;
        font-size:.72rem;font-weight:700;flex-shrink:0;margin-top:1px;}
      #config-box label{font-size:.78rem;color:#8892aa;font-weight:500;
        text-transform:uppercase;letter-spacing:.03em;}
      #config-url{width:100%;padding:12px 14px;background:#1a1e29;
        border:1px solid #252a38;border-radius:10px;color:#e8ecf4;
        font-family:monospace;font-size:.82rem;outline:none;transition:border-color .2s;}
      #config-url:focus{border-color:#4f7cff;}
      #config-url::placeholder{color:#4f5870;}
      #config-error{font-size:.8rem;color:#ef4444;display:none;
        background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);
        border-radius:8px;padding:8px 12px;}
      #btn-cfg-save{padding:12px 20px;border-radius:10px;background:#4f7cff;
        border:none;color:#fff;font-family:'DM Sans',sans-serif;
        font-size:.9rem;font-weight:500;cursor:pointer;transition:all .2s;width:100%;}
      #btn-cfg-save:hover{background:#3a68f0;transform:translateY(-1px);}
      #btn-cfg-save:disabled{background:#2a3a6a;color:#5a6a9a;cursor:not-allowed;transform:none;}
      #config-box .cfg-nota{font-size:.75rem;color:#4f5870;text-align:center;
        border-top:1px solid #252a38;padding-top:14px;}
      #config-box strong{color:#e8ecf4;}
      #config-box code{background:#252a38;padding:2px 6px;border-radius:4px;
        color:#a78bfa;font-size:.78rem;}
    </style>
    <div id="config-box">
      <div class="cfg-icon">⚙️</div>
      <h2>Configuración inicial</h2>
      <p>Para conectar la app con Google Sheets, ingresá la URL de tu Apps Script.<br>
         Solo se hace <strong>una vez por dispositivo</strong> y se guarda localmente.</p>
      <div class="cfg-steps">
        <div class="cfg-step"><div class="cfg-n">1</div>
          <span>Abrí tu Google Sheet → <strong>Extensiones → Apps Script</strong></span></div>
        <div class="cfg-step"><div class="cfg-n">2</div>
          <span>Click en <strong>Implementar → Administrar implementaciones</strong></span></div>
        <div class="cfg-step"><div class="cfg-n">3</div>
          <span>Copiá la <strong>URL de la aplicación web</strong><br>
          <code>https://script.google.com/macros/s/.../exec</code></span></div>
        <div class="cfg-step"><div class="cfg-n">4</div>
          <span>Pegala abajo y hacé click en <strong>Guardar y conectar</strong></span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label>URL del Apps Script *</label>
        <input id="config-url" type="url"
          placeholder="https://script.google.com/macros/s/ABC.../exec" />
        <div id="config-error"></div>
      </div>
      <button id="btn-cfg-save" onclick="guardarConfigUrl()">Guardar y conectar</button>
      <p class="cfg-nota">🔒 Esta URL se guarda solo en este dispositivo. Nunca se sube a GitHub ni a ningún servidor.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('config-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') guardarConfigUrl();
  });
  window._configOnSuccess = onSuccess;
}

function guardarConfigUrl() {
  const input = document.getElementById('config-url');
  const error = document.getElementById('config-error');
  const btn   = document.getElementById('btn-cfg-save');
  const url   = (input?.value || '').trim();

  if (!url.startsWith('https://script.google.com/macros/s/')) {
    error.textContent = '⚠️ La URL debe empezar con https://script.google.com/macros/s/';
    error.style.display = 'block';
    input.style.borderColor = '#ef4444';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Verificando conexión...';
  error.style.display = 'none';
  input.style.borderColor = '#252a38';

  fetch(`${url}?action=stats`)
    .then(r => r.json())
    .then(data => {
      if (data.ok || data.stats) {
        setApiUrl(url);
        document.getElementById('config-overlay').remove();
        if (window._configOnSuccess) window._configOnSuccess();
      } else {
        throw new Error(JSON.stringify(data));
      }
    })
    .catch(() => {
      error.textContent = '❌ No se pudo conectar. Verificá que la URL sea correcta y que el script esté publicado con acceso "Cualquier persona".';
      error.style.display = 'block';
      input.style.borderColor = '#ef4444';
      btn.disabled = false;
      btn.textContent = 'Guardar y conectar';
    });
}

// ── Verificar config al iniciar ───────────────────────────────
function verificarConfig(callback) {
  if (getApiUrl()) { callback(); }
  else { mostrarPantallaConfig(callback); }
}

// ── Helpers fetch ─────────────────────────────────────────────
async function apiGet(params = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('API no configurada');
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(body) {
  const url = getApiUrl();
  if (!url) throw new Error('API no configurada');
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── API pública ───────────────────────────────────────────────
async function getReclamos(filtro = {}) {
  const result = await apiGet({ action: 'list', ...filtro });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function getStats() {
  const result = await apiGet({ action: 'stats' });
  if (!result.ok) throw new Error(result.error);
  return result.stats;
}

async function addReclamo(data) {
  const result = await apiPost({ action: 'add', data });
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function updateReclamo(id, changes) {
  const result = await apiPost({ action: 'update', id, changes });
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function resolverReclamo(id, comentario) {
  const result = await apiPost({ action: 'resolver', id, comentario });
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function entregarReclamo(id) {
  const result = await apiPost({ action: 'entregar', id });
  if (!result.ok) throw new Error(result.error);
  return result;
}
