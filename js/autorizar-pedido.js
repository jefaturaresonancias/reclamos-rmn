// autorizar-pedido.js — cuadro "¿Quién autoriza?" para los pedidos de turno
// de internados (15/10/2026, a pedido de jefatura: que quede quién autorizó
// y que pueda dejar un comentario). Lo usan medico.html e internados.html,
// las dos páginas desde las que se autoriza. Necesita api.js cargado antes
// (autorizarPedidoTurno).
//
// Para sumar o sacar un médico: editar MEDICOS_AUTORIZANTES acá — es la
// única lista (el backend solo exige que venga un nombre).
//
// A propósito NO se preselecciona el último médico usado: si la misma
// compu la usan varios, autorizar con el nombre de otro sin darse cuenta
// es justo lo que esto busca evitar.

const MEDICOS_AUTORIZANTES = [
  'Dr. Weissman Marcelo',
  'Dr. Santapichi Daniel',
  'Dra. Barroquismo Estefania',
  'Dra. Aguilera Alejandra',
  'Dra. Rodriguez Fabiana',
];

function _escAut(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _estilosModalAutorizar() {
  if (document.getElementById('autModalEstilos')) return;
  const st = document.createElement('style');
  st.id = 'autModalEstilos';
  st.textContent = `
    .aut-modal-overlay{position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;padding:20px;}
    .aut-modal-box{background:var(--surface);border:1px solid rgba(16,185,129,.35);
      border-radius:20px;padding:26px;width:440px;max-width:92vw;
      display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);}
    .aut-modal-title{font-family:'DM Serif Display',serif;font-size:1.2rem;font-weight:400;color:var(--success);}
    .aut-modal-paciente{font-size:.85rem;color:var(--text2);margin-top:-8px;}
    .aut-modal-box label{font-size:.72rem;color:var(--text2);font-weight:600;display:block;margin-bottom:4px;}
    .aut-modal-box label span{font-weight:400;color:var(--text3);}
    .aut-modal-box select,.aut-modal-box textarea{width:100%;padding:9px 12px;background:var(--surface2);
      border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;font-size:.9rem;}
    .aut-modal-box textarea{resize:vertical;min-height:70px;}
    .aut-modal-box select:focus,.aut-modal-box textarea:focus{outline:2px solid var(--success);outline-offset:1px;}
    .aut-modal-error{font-size:.78rem;color:var(--danger);min-height:1em;}
    .aut-modal-acciones{display:flex;gap:10px;justify-content:flex-end;}
    .aut-modal-acciones button{padding:9px 16px;border-radius:9px;font:inherit;font-weight:600;font-size:.85rem;cursor:pointer;border:none;}
    .aut-btn-cancelar{background:transparent;color:var(--text2);border:1px solid var(--border) !important;}
    .aut-btn-ok{background:var(--success);color:#04140e;}
  `;
  document.head.appendChild(st);
}

// Devuelve { autorizadoPor, comentario } o null si se cancela.
function pedirDatosAutorizacion(p) {
  _estilosModalAutorizar();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'aut-modal-overlay';
    overlay.innerHTML = `
      <div class="aut-modal-box" role="dialog" aria-modal="true" aria-labelledby="autModalTitulo">
        <div class="aut-modal-title" id="autModalTitulo">Autorizar pedido de turno</div>
        <div class="aut-modal-paciente">${_escAut(p.apellido)}, ${_escAut(p.nombre)} · ${_escAut(p.estudio)}</div>
        <div>
          <label for="autMedico">¿Quién autoriza?</label>
          <select id="autMedico">
            <option value="">Elegí tu nombre…</option>
            ${MEDICOS_AUTORIZANTES.map((m) => `<option value="${_escAut(m)}">${_escAut(m)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="autComentario">Comentario <span>(opcional — lo ven técnicos y piso)</span></label>
          <textarea id="autComentario" rows="3" maxlength="1000" placeholder="Ej.: con contraste, prioritario, coordinar con anestesia…"></textarea>
        </div>
        <div class="aut-modal-error" id="autError" role="alert"></div>
        <div class="aut-modal-acciones">
          <button type="button" class="aut-btn-cancelar">Cancelar</button>
          <button type="button" class="aut-btn-ok">✔ Autorizar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const select = overlay.querySelector('#autMedico');
    const cerrar = (valor) => {
      document.removeEventListener('keydown', alTeclado);
      overlay.remove();
      resolve(valor);
    };
    const confirmar = () => {
      if (!select.value) {
        overlay.querySelector('#autError').textContent = 'Elegí qué médico autoriza.';
        select.focus();
        return;
      }
      cerrar({ autorizadoPor: select.value, comentario: overlay.querySelector('#autComentario').value.trim() });
    };
    const alTeclado = (e) => { if (e.key === 'Escape') cerrar(null); };

    overlay.querySelector('.aut-btn-ok').addEventListener('click', confirmar);
    overlay.querySelector('.aut-btn-cancelar').addEventListener('click', () => cerrar(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(null); });
    document.addEventListener('keydown', alTeclado);
    select.focus();
  });
}

// Línea "quién autorizó + comentario" para mostrar en las tarjetas
// (vacía en los pedidos autorizados antes del 15/10/2026, que no lo tienen).
function lineaAutorizacionHtml(p) {
  if (!p || !p.autorizadoPor) return '';
  return `<div class="linea-autorizacion" style="font-size:.78rem;color:var(--text2);margin-top:6px;">
      👨‍⚕️ Autorizó <b>${_escAut(p.autorizadoPor)}</b>${p.comentarioAutorizacion ? ` — 💬 ${_escAut(p.comentarioAutorizacion)}` : ''}</div>`;
}
