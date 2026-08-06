// api.js — Conexión con Google Apps Script
const API_KEY = 'reclamos_api_url';
const PIN_KEY = 'reclamos_pin';

function getApiUrl() { return localStorage.getItem(API_KEY) || null; }
function setApiUrl(url) { localStorage.setItem(API_KEY, url.trim()); }
function resetApiUrl() { localStorage.removeItem(API_KEY); sessionStorage.removeItem(PIN_KEY); location.reload(); }

// El PIN vive en sessionStorage (no localStorage): se pide de nuevo en cada
// sesión de navegador nueva, no queda guardado para siempre en la máquina.
function getPin() { return sessionStorage.getItem(PIN_KEY) || ''; }
function setPin(pin) { sessionStorage.setItem(PIN_KEY, pin); }
function clearPin() { sessionStorage.removeItem(PIN_KEY); }

function mostrarPantallaConfig(onSuccess) {
  const overlay = document.createElement('div');
  overlay.id = 'config-overlay';
  overlay.innerHTML = `
    <style>
      #config-overlay{position:fixed;inset:0;z-index:9999;background:#0d0f14;
        display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;}
      #config-box{background:#13161e;border:1px solid #252a38;border-radius:20px;
        padding:40px;width:520px;max-width:95vw;display:flex;flex-direction:column;gap:20px;
        animation:cfgUp .4s ease both;}
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
        background:rgba(79,124,255,.2);color:#4f7cff;display:flex;align-items:center;
        justify-content:center;font-size:.72rem;font-weight:700;flex-shrink:0;margin-top:1px;}
      #config-box label{font-size:.78rem;color:#8892aa;font-weight:500;
        text-transform:uppercase;letter-spacing:.03em;}
      #config-url{width:100%;padding:12px 14px;background:#1a1e29;border:1px solid #252a38;
        border-radius:10px;color:#e8ecf4;font-family:monospace;font-size:.82rem;outline:none;
        transition:border-color .2s;}
      #config-url:focus{border-color:#4f7cff;}
      #config-url::placeholder{color:#4f5870;}
      #config-error{font-size:.8rem;color:#ef4444;display:none;
        background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);
        border-radius:8px;padding:8px 12px;}
      #btn-cfg-save{padding:12px 20px;border-radius:10px;background:#4f7cff;border:none;
        color:#fff;font-family:'DM Sans',sans-serif;font-size:.9rem;font-weight:500;
        cursor:pointer;transition:all .2s;width:100%;}
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
      <p class="cfg-nota">🔒 Esta URL se guarda solo en este dispositivo. Nunca se sube a GitHub.</p>
    </div>`;
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
    error.style.display = 'block'; input.style.borderColor = '#ef4444'; return;
  }
  btn.disabled = true; btn.textContent = '⏳ Verificando conexión...';
  error.style.display = 'none'; input.style.borderColor = '#252a38';
  fetch(`${url}?action=stats`)
    .then(r => r.json())
    .then(data => {
      if (data.ok || data.stats) {
        setApiUrl(url);
        document.getElementById('config-overlay').remove();
        if (window._configOnSuccess) window._configOnSuccess();
      } else { throw new Error(JSON.stringify(data)); }
    })
    .catch(() => {
      error.textContent = '❌ No se pudo conectar. Verificá que la URL sea correcta y que el script esté publicado con acceso "Cualquier persona".';
      error.style.display = 'block'; input.style.borderColor = '#ef4444';
      btn.disabled = false; btn.textContent = 'Guardar y conectar';
    });
}

function verificarConfig(callback) {
  if (getApiUrl()) { callback(); } else { mostrarPantallaConfig(callback); }
}

// Pantalla de PIN — protege todo el sistema (nombre, DNI, diagnóstico,
// informes de pacientes) mientras no haya un login real. El PIN se valida
// contra el propio Apps Script (PropertiesService → PIN_APP), nunca vive en
// el código. Se llama después de verificarConfig(), porque para validar el
// PIN hace falta que la URL del Apps Script ya esté configurada.
function mostrarPantallaPin(onSuccess) {
  const overlay = document.createElement('div');
  overlay.id = 'pin-overlay';
  overlay.innerHTML = `
    <style>
      #pin-overlay{position:fixed;inset:0;z-index:9999;background:#0d0f14;
        display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;}
      #pin-box{background:#13161e;border:1px solid #252a38;border-radius:20px;
        padding:40px;width:340px;max-width:90vw;display:flex;flex-direction:column;gap:16px;
        text-align:center;animation:pinUp .4s ease both;}
      @keyframes pinUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      #pin-box .pin-icon{font-size:2rem;}
      #pin-box h2{font-family:'DM Serif Display',serif;font-weight:400;font-size:1.2rem;color:#e8ecf4;}
      #pin-box p{font-size:.8rem;color:#8892aa;line-height:1.5;}
      #pin-input{width:100%;padding:12px 14px;background:#1a1e29;border:1px solid #252a38;
        border-radius:10px;color:#e8ecf4;font-size:1.2rem;letter-spacing:.3em;text-align:center;
        outline:none;transition:border-color .2s;}
      #pin-input:focus{border-color:#4f7cff;}
      #pin-error{font-size:.78rem;color:#ef4444;min-height:1.1em;}
      #btn-pin-entrar{padding:12px 20px;border-radius:10px;background:#4f7cff;border:none;
        color:#fff;font-family:'DM Sans',sans-serif;font-size:.9rem;font-weight:500;
        cursor:pointer;transition:all .2s;width:100%;}
      #btn-pin-entrar:hover{background:#3a68f0;transform:translateY(-1px);}
      #btn-pin-entrar:disabled{background:#2a3a6a;color:#5a6a9a;cursor:not-allowed;transform:none;}
    </style>
    <div id="pin-box">
      <div class="pin-icon">🔒</div>
      <h2>Acceso restringido</h2>
      <p>Este sistema tiene datos de pacientes. Ingresá el PIN de administrativo para continuar.</p>
      <input id="pin-input" type="password" inputmode="numeric" autocomplete="off" placeholder="••••" />
      <div id="pin-error"></div>
      <button id="btn-pin-entrar">Entrar</button>
    </div>`;
  document.body.appendChild(overlay);

  const input = document.getElementById('pin-input');
  const error = document.getElementById('pin-error');
  const btn   = document.getElementById('btn-pin-entrar');
  input.focus();

  async function intentar() {
    const pin = input.value.trim();
    if (!pin) return;
    btn.disabled = true;
    error.textContent = '';
    try {
      // 'config' no expone datos de pacientes pero sí requiere PIN válido —
      // sirve como pedido liviano para confirmar que el PIN es correcto.
      const url = getApiUrl();
      const res = await fetch(`${url}?action=config&pin=${encodeURIComponent(pin)}`);
      const data = await res.json();
      if (data.ok) {
        setPin(pin);
        overlay.remove();
        onSuccess();
      } else {
        throw new Error(data.error || 'PIN inválido');
      }
    } catch (err) {
      error.textContent = '❌ PIN incorrecto';
      input.value = '';
      input.focus();
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', intentar);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') intentar(); });
}

function verificarPin(callback) {
  if (getPin()) { callback(); } else { mostrarPantallaPin(callback); }
}

async function apiGet(params = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('API no configurada');
  const qs = new URLSearchParams({ ...params, pin: getPin() }).toString();
  const res = await fetch(`${url}?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.ok === false && data.error === 'PIN inválido') clearPin();
  return data;
}

async function apiPost(body) {
  const url = getApiUrl();
  if (!url) throw new Error('API no configurada');
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, pin: getPin() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.ok === false && data.error === 'PIN inválido') clearPin();
  return data;
}

async function getReclamos(filtro = {}) {
  const result = await apiGet({ action: 'list', ...filtro });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function getDashboard() {
  const result = await apiGet({ action: 'dashboard' });
  if (!result.ok) throw new Error(result.error);
  return result; // { list, recitados, stats }
}
async function getAnalitica() {
  const result = await apiGet({ action: 'analitica' });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function getStats() {
  const result = await apiGet({ action: 'stats' });
  if (!result.ok) throw new Error(result.error);
  return result.stats;
}
async function getConfig() {
  const result = await apiGet({ action: 'config' });
  if (!result.ok) throw new Error(result.error);
  return result.regiones;
}
async function getRecitados() {
  const result = await apiGet({ action: 'recitados' });
  if (!result.ok) throw new Error(result.error);
  return result.data;
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
async function resolverRegion(id, region, comentario, todasRegiones) {
  const result = await apiPost({ action: 'resolverRegion', id, region, comentario, todasRegiones });
  if (!result.ok) throw new Error(result.error);
  return result;
}
async function recitarReclamo(id, motivo) {
  const result = await apiPost({ action: 'recitar', id, motivo });
  if (!result.ok) throw new Error(result.error);
  return result;
}
async function asignarTurnoRecitado(id, fechaNuevo) {
  const result = await apiPost({ action: 'asignarTurno', id, fechaNuevo });
  if (!result.ok) throw new Error(result.error);
  return result;
}
async function entregarReclamo(id) {
  const result = await apiPost({ action: 'entregar', id });
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function resolverTodo(id, comentario, todasRegiones) {
  const result = await apiPost({ action: 'resolverTodo', id, comentario, todasRegiones });
  if (!result.ok) throw new Error(result.error);
  return result;
}

// ── Envíos (bot-informes.js → reclamos-rmn) ─────────────────────────
async function getInformesListos() {
  const result = await apiGet({ action: 'listarInformesListos' });
  if (!result.ok) throw new Error(result.error);
  return result.listos;
}
async function confirmarEnvioInforme(id) {
  const result = await apiPost({ action: 'confirmarEnvioInforme', id });
  if (!result.ok) throw new Error(result.error);
  return result;
}
async function rechazarInforme(id, motivo) {
  const result = await apiPost({ action: 'rechazarInforme', id, motivo });
  if (!result.ok) throw new Error(result.error);
  return result;
}
