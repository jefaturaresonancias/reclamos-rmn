// js/fecha-dmy.js — Fecha escrita a mano como DD/MM/AAAA (15/10/2026).
//
// En vez de <input type="date">: el orden en que ese campo espera los
// dígitos depende del idioma del navegador, no de la app — en las PC en
// inglés "05/10" se guardaba como 10 de mayo sin ningún aviso (bug real: el
// internado #703 cargado desde Piso y 16 reclamos de septiembre, corregidos
// contra el RIS). Mismo criterio que ya usa administrativo.html desde el
// 22/9/2026: todo el tipeo lo controla este JS y abajo se muestra la fecha
// en palabras, para que se note si quedó mal.
//
// Uso: <input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"
//        oninput="fechaDmyInput(this, 'id-de-la-salida')">
//      <div class="fecha-palabras" id="id-de-la-salida"></div>
// y al guardar: fechaDmyAIso(valor) → 'AAAA-MM-DD' o null si no es una fecha real.

const _DIAS_FECHA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const _MESES_FECHA = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaDmyAIso(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || '').trim());
  if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]), anio = Number(m[3]);
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function fechaHoyIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function fechaHoyDmy() {
  const [y, m, d] = fechaHoyIso().split('-');
  return `${d}/${m}/${y}`;
}

function fechaEnPalabras(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return `${_DIAS_FECHA[f.getDay()]} ${d} de ${_MESES_FECHA[m - 1]} de ${y}`;
}

// Pone las barras solas mientras se tipea y, con la fecha completa, la
// muestra en palabras abajo (o avisa si no existe o es futura).
function fechaDmyInput(el, idSalida) {
  const digitos = el.value.replace(/\D/g, '').slice(0, 8);
  let f = digitos;
  if (digitos.length > 4) f = digitos.slice(0, 2) + '/' + digitos.slice(2, 4) + '/' + digitos.slice(4);
  else if (digitos.length > 2) f = digitos.slice(0, 2) + '/' + digitos.slice(2);
  el.value = f;
  const salida = idSalida && document.getElementById(idSalida);
  if (!salida) return;
  salida.classList.remove('error');
  if (f.length < 10) { salida.textContent = ''; return; }
  const iso = fechaDmyAIso(f);
  if (!iso) { salida.textContent = '⚠️ Esa fecha no existe — revisá día y mes'; salida.classList.add('error'); return; }
  if (iso > fechaHoyIso()) { salida.textContent = '⚠️ Es una fecha futura (' + fechaEnPalabras(iso) + ')'; salida.classList.add('error'); return; }
  salida.textContent = '📅 ' + fechaEnPalabras(iso);
}
