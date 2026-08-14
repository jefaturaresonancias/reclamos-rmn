// api.js — Conexión con el backend en Railway (Node/Express + Postgres)
const PIN_KEY = 'reclamos_pin';

// URL fija: a diferencia de Apps Script (una URL /exec distinta por cada
// implementación), Railway sirve un solo dominio público para todos los
// dispositivos — no hace falta que cada uno la configure a mano.
const API_URL = 'https://reclamos-rmn-backend-production.up.railway.app';
function getApiUrl() { return API_URL; }

// El PIN vive en sessionStorage (no localStorage): se pide de nuevo en cada
// sesión de navegador nueva, no queda guardado para siempre en la máquina.
function getPin() { return sessionStorage.getItem(PIN_KEY) || ''; }
function setPin(pin) { sessionStorage.setItem(PIN_KEY, pin); }
function clearPin() { sessionStorage.removeItem(PIN_KEY); }

// Ya no hay nada que configurar (la URL es fija), pero se mantiene esta
// función para no tener que tocar las 5 páginas que la llaman como wrapper
// antes de verificarPin().
function verificarConfig(callback) { callback(); }

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
async function resolverPlacas(id, comentario) {
  const result = await apiPost({ action: 'resolverPlacas', id, comentario });
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
async function correrBotInformes(id) {
  const result = await apiPost({ action: 'correrBotInformes', id });
  if (!result.ok) throw new Error(result.error);
  return result;
}
async function rechazarInforme(id, motivo) {
  const result = await apiPost({ action: 'rechazarInforme', id, motivo });
  if (!result.ok) throw new Error(result.error);
  return result;
}
async function getInformesRebotados() {
  const result = await apiGet({ action: 'listarInformesRebotados' });
  if (!result.ok) throw new Error(result.error);
  return result.rebotados;
}
async function reintentarEnvioInforme(id) {
  const result = await apiPost({ action: 'reintentarEnvioInforme', id });
  if (!result.ok) throw new Error(result.error);
  return result;
}
