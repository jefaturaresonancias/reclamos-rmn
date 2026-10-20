// aviso-servicio.js — cartel "⚠️ Aviso de Resonancia" arriba de piso.html,
// medico.html e internados.html (20/10/2026, a pedido: "poder poner un
// mensaje en la página de piso desde técnicos, por ejemplo que el equipo
// está fuera de servicio"). Lo publica tecnicos.html; el servidor guarda un
// solo aviso vigente (reclamos-rmn-backend, src/repo/avisosPiso.js).
//
// Uso: iniciarAvisoServicio({ contenedorId, alCambiar }) — después del PIN.
// Revisa cada 2 minutos, así una página abierta ve aparecer o irse el aviso
// sin recargar. alCambiar(aviso|null) avisa cuando cambia (piso lo usa para
// bloquear el formulario de pedidos). Devuelve una función para revisar ya.
// Necesita api.js cargado antes (getAvisoPiso).

(function () {
  const INTERVALO_MS = 2 * 60 * 1000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function estilos() {
    if (document.getElementById('avisoServicioEstilos')) return;
    const st = document.createElement('style');
    st.id = 'avisoServicioEstilos';
    st.textContent = `
      .aviso-servicio{margin:14px auto 0;max-width:1200px;padding:14px 18px;border-radius:12px;
        background:#7f1d1d;border:2px solid #ef4444;color:#fff;box-shadow:0 8px 24px rgba(239,68,68,.25);}
      .aviso-servicio-wrap{padding:0 16px;}
      .aviso-servicio-wrap:empty{display:none;}
      .aviso-servicio-titulo{font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fecaca;}
      .aviso-servicio-msg{font-size:1.05rem;font-weight:700;line-height:1.4;margin-top:4px;white-space:pre-line;overflow-wrap:anywhere;}
      .aviso-servicio-bloqueo{margin-top:8px;font-size:.85rem;font-weight:600;color:#fde68a;}
      .aviso-servicio-meta{margin-top:6px;font-size:.75rem;color:#fecaca;}
    `;
    document.head.appendChild(st);
  }

  function html(a) {
    return `<div class="aviso-servicio" role="alert">
      <div class="aviso-servicio-titulo">⚠️ Aviso de Resonancia</div>
      <div class="aviso-servicio-msg">${esc(a.mensaje)}</div>
      ${a.bloqueaPedidos ? '<div class="aviso-servicio-bloqueo">🚫 Mientras siga este aviso no se pueden cargar pedidos de turno de internados.</div>' : ''}
      <div class="aviso-servicio-meta">Publicado por ${esc(a.publicadoPor || 'Técnicos')} el ${esc(a.publicadoEn)}${a.venceEn ? ` · hasta el ${esc(a.venceEn)}` : ''}</div>
    </div>`;
  }

  window.iniciarAvisoServicio = function ({ contenedorId = 'aviso-servicio', alCambiar } = {}) {
    estilos();
    let ultimaFirma = null;
    async function revisar() {
      let aviso;
      try {
        aviso = await getAvisoPiso();
      } catch (_) {
        return; // sin conexión o PIN vencido: se deja como estaba
      }
      const firma = aviso ? `${aviso.id}|${aviso.bloqueaPedidos}` : '';
      if (firma === ultimaFirma) return;
      ultimaFirma = firma;
      const cont = document.getElementById(contenedorId);
      if (cont) cont.innerHTML = aviso ? html(aviso) : '';
      if (alCambiar) alCambiar(aviso);
    }
    revisar();
    setInterval(revisar, INTERVALO_MS);
    return revisar;
  };
})();
