const SHEET_ID   = '1WwSvS1ymkl7RJ6MHOnNGE0mkvt5q5JJcvA9XUZ0ZvKg';
const SHEET_NAME = 'BD';
const TZ         = 'America/Argentina/Buenos_Aires';

const COL = {
  FECHA:               0,
  HORA:                1,
  NOMBRE:              2,
  APELLIDO:            3,
  DNI:                 4,
  ESTUDIO:             5,
  ORIGEN:              6,
  CONFIRMA:            7,
  OTORGADO:            8,
  MODIFICADO:          9,
  FECHA_MODIFICADO:    10,
  COD_MOD:             11,
  PRESENTE_ST:         12,
  FECHA_PRESENTE_ST:   13,
  PRESENTE_AMB:        14,
  FECHA_PRESENTE_AMB:  15,
  OBSERVACIONES_BD:    16,
  TURNO_ID:            17,
  PLANILLA_ORIGEN:     18,
  ENTREGA_INFORME:     19,
  FECHA_ENTREGA:       20,
  OBS_ENTREGA:         21,
  RECLAMO_DIAGNOSTICO: 22,
  RECLAMO_INFORMADO:   23,
  RECLAMO_TURNO:       24,
  TIPO_ORDEN:          25,
  RECLAMO_ESTADO:      26,
  RECLAMO_FECHA:       27,
  RECLAMO_COMENTARIO:  28,
  RECLAMO_OBS:         29,
  RECLAMO_NRO:         30,
  RECLAMO_ARCHIVADO:   39, // AN
  NUEVO_TURNO:         31,
  NUEVO_TURNO_FECHA:   32,
  NUEVO_TURNO_OBS:     33,
  REGION_STATUS:       34,
  RECITAR_CODIGO:      35,
  RECITAR_MOTIVO:      36,
  RECITAR_FECHA_NUEVO: 37,
};

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'list';
  try {
    if      (action === 'list')      return jsonResponse(listReclamos(e.parameter));
    else if (action === 'stats')     return jsonResponse(getStats());
    else if (action === 'config')    return jsonResponse(getConfigData());
    else if (action === 'recitados') return jsonResponse(listRecitados());
    else if (action === 'dashboard') return jsonResponse(getDashboard());
    else return jsonResponse({ ok: false, error: 'Accion no reconocida' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch(err) {}
  const action = body.action || '';
  try {
    if      (action === 'add')            return jsonResponse(addReclamo(body.data));
    else if (action === 'update')         return jsonResponse(updateReclamo(body.id, body.changes));
    else if (action === 'resolver')       return jsonResponse(resolverReclamo(body.id, body.comentario, body.nuevoTurno));
    else if (action === 'resolverRegion') return jsonResponse(resolverRegion(body.id, body.region, body.comentario, body.todasRegiones));
    else if (action === 'entregar')       return jsonResponse(entregarReclamo(body.id));
    else if (action === 'revisado')       return jsonResponse(revisadoAdmin(body.id));
    else if (action === 'recitar')        return jsonResponse(recitarReclamo(body.id, body.motivo));
    else if (action === 'asignarTurno')   return jsonResponse(asignarTurnoRecitado(body.id, body.fechaNuevo));
    else if (action === 'resolverTodo') return jsonResponse(resolverTodo(body.id, body.comentario, body.todasRegiones));
    else return jsonResponse({ ok: false, error: 'Accion no reconocida' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function ensureExtraColumns() {
  const sheet = getSheet();
  const headers = {
    [COL.REGION_STATUS + 1]:       'REGION_STATUS',
    [COL.RECITAR_CODIGO + 1]:      'RECITAR_CODIGO',
    [COL.RECITAR_MOTIVO + 1]:      'RECITAR_MOTIVO',
    [COL.RECITAR_FECHA_NUEVO + 1]: 'RECITAR_FECHA_NUEVO',
  };
  Object.keys(headers).forEach(function(col) {
    const colNum = parseInt(col);
    if (!sheet.getRange(1, colNum).getValue()) {
      sheet.getRange(1, colNum).setValue(headers[col]);
    }
  });
}

function getDataRows() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 40).getValues();
}

function fmtDate(val) {
  if (!val) return '';
  try {
    const d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return Utilities.formatDate(d, TZ, 'dd/MM/yyyy');
  } catch(e) { return String(val); }
}

function fmtDateTime() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
}

function rowToObj(row, rowIndex) {
  const estado     = String(row[COL.RECLAMO_ESTADO]      || '').trim();
  const reclDiag   = String(row[COL.RECLAMO_DIAGNOSTICO] || '').trim();
  const reclInform = String(row[COL.RECLAMO_INFORMADO]   || '').trim();
  const reclTurnoRaw = row[COL.RECLAMO_TURNO];
  const reclTurno = reclTurnoRaw instanceof Date
  ? fmtDate(reclTurnoRaw)
  : String(reclTurnoRaw || '').trim();
  const fechaTurno = row[COL.FECHA];
  const retraso    = fechaTurno instanceof Date
    ? Math.max(0, Math.floor((new Date() - fechaTurno) / 86400000)) : 0;
  const tieneReclamo = reclDiag !== '' || reclInform !== '' || reclTurno !== '';

  var regionStatus = {};
  try {
    const raw = String(row[COL.REGION_STATUS] || '').trim();
    if (raw) regionStatus = JSON.parse(raw);
  } catch(e) {}

  return {
    rowIndex,
    id: String(row[COL.TURNO_ID] || '').trim() || String(Number(row[COL.RECLAMO_NRO]) || rowIndex),
    nroReclamo:          Number(row[COL.RECLAMO_NRO])       || rowIndex,
    apellido:            String(row[COL.APELLIDO]           || '').trim(),
    nombre:              String(row[COL.NOMBRE]             || '').trim(),
    dni:                 String(row[COL.DNI]                || '').replace(/\.0$/,'').replace(/\D/g,''),
    estudio:             String(row[COL.ESTUDIO]            || '').trim(),
    fechaEstudio:        fmtDate(row[COL.FECHA]),
    hora:                String(row[COL.HORA]               || '').trim(),
    origen:              String(row[COL.ORIGEN]             || '').trim(),
    tipoOrden:           String(row[COL.TIPO_ORDEN]         || '').trim(),
    reclamoDiagnostico:  reclDiag,
    reclamoInformado:    reclInform,
    reclamoTurno:        reclTurno,
    estado:              estado !== '' ? estado : (tieneReclamo ? 'pendiente' : ''),
    fechaReclamo:        fmtDate(row[COL.RECLAMO_FECHA]),
    comentarioMedico:    String(row[COL.RECLAMO_COMENTARIO] || '').trim(),
    observaciones:       String(row[COL.RECLAMO_OBS]        || '').trim(),
    entregaInforme:      String(row[COL.ENTREGA_INFORME]    || '').trim(),
    fechaEntrega:        fmtDate(row[COL.FECHA_ENTREGA]),
    retraso,
    informado:           reclInform ? 'Si' : 'No',
    tieneImagen:         '',
    turnoMedico:         reclTurno,
    diagnostico:         String(row[COL.RECLAMO_OBS]        || '-').trim(),
    tieneReclamo,
    nuevoTurno:          String(row[COL.NUEVO_TURNO]        || '').trim(),
    nuevoTurnoFecha:     fmtDate(row[COL.NUEVO_TURNO_FECHA]),
    nuevoTurnoObs:       String(row[COL.NUEVO_TURNO_OBS]    || '').trim(),
    regionStatus,
    recitarCodigo:       String(row[COL.RECITAR_CODIGO]     || '').trim(),
    recitarMotivo:       String(row[COL.RECITAR_MOTIVO]     || '').trim(),
    recitarFechaNuevo:   fmtDate(row[COL.RECITAR_FECHA_NUEVO]),
    archivado:           String(row[COL.RECLAMO_ARCHIVADO] || '').trim() === 'Si',
  };
}

function findRowByTurnoId(turnoId) {
  const rows = getDataRows();
  const turnoIdStr = String(turnoId).trim();

  for (var i = 0; i < rows.length; i++) {
    const id = String(rows[i][COL.TURNO_ID] || '').trim();

    // Buscar por TURNO_ID si tiene valor
    if (id && id === turnoIdStr) return { rowIndex: i + 2, row: rows[i] };

    // Fallback: buscar por número de reclamo
    const nro = String(rows[i][COL.RECLAMO_NRO] || '').trim();
    if (!id && nro && nro === turnoIdStr) return { rowIndex: i + 2, row: rows[i] };
  }
  return null;
}

function listReclamos(params, rows) {
  rows = rows || getDataRows();

  const buscarDni = params && params.dni
    ? String(params.dni).replace(/\D/g,'') : '';

  if (buscarDni) {
    const data = rows
      .map(function(row, i) { return rowToObj(row, i + 2); })
      .filter(function(r) {
        return r.apellido !== '' &&
               String(r.dni).replace(/\D/g,'') === buscarDni;
      });
    return { ok: true, data: data };
  }

  if (params && params.estado === 'archivado') {
    const data = rows
      .map(function(row, i) { return rowToObj(row, i + 2); })
      .filter(function(r) { return r.archivado && r.apellido !== ''; });
    return { ok: true, data: data };
  }

  var data = rows
    .map(function(row, i) { return rowToObj(row, i + 2); })
    .filter(function(r) {
      return r.tieneReclamo && r.apellido !== '' && r.estado !== 'recitar' && !r.archivado;
    });

  if (params && params.estado)
    data = data.filter(function(r) { return r.estado === params.estado; });

  data.sort(function(a, b) {
    function prio(r) {
      if (r.reclamoTurno && r.estado !== 'recitado') return 3;
      if (r.estado === 'recitado')   return 2;
      if (r.reclamoInformado)        return 1;
      if (r.reclamoDiagnostico)      return 1;
      return 0;
    }
    const pa = prio(a), pb = prio(b);
    if (pb !== pa) return pb - pa;
    return (b.retraso || 0) - (a.retraso || 0);
  });

  return { ok: true, data: data };
}

function listRecitados(rows) {
  rows = rows || getDataRows();
  const data = rows
    .map(function(row, i) { return rowToObj(row, i + 2); })
    .filter(function(r) { return r.estado === 'recitar' && r.apellido !== ''; });
  return { ok: true, data: data };
}

function getStats(rows) {
  rows = rows || getDataRows();
  const sheet = getSheet();
  const tresMesesAtras = new Date();
  tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

  rows.forEach(function(row, i) {
    const obj = rowToObj(row, i + 2);
    if (!obj.tieneReclamo || obj.archivado) return;
    if (!obj.fechaReclamo) return;
    const partes = obj.fechaReclamo.split('/');
    if (partes.length < 3) return;
    const fecha = new Date(
      Number(partes[2].split(' ')[0]),
      Number(partes[1]) - 1,
      Number(partes[0])
    );
    if (isNaN(fecha.getTime())) return;
    if (fecha < tresMesesAtras) {
      sheet.getRange(i + 2, COL.RECLAMO_ARCHIVADO + 1).setValue('Si');
    }
  });

  const data = rows
    .map(function(row, i) { return rowToObj(row, i + 2); })
    .filter(function(r) { return r.tieneReclamo && r.apellido !== ''; });

  return {
    ok: true,
    stats: {
      total:        data.filter(function(r){ return !r.archivado; }).length,
      pendientes:   data.filter(function(r){ return r.estado === 'pendiente'      && !r.archivado; }).length,
      resueltos:    data.filter(function(r){ return r.estado === 'resuelto'       && !r.archivado; }).length,
      entregados:   data.filter(function(r){ return r.estado === 'entregado'      && !r.archivado; }).length,
      revisados:    data.filter(function(r){ return r.estado === 'revisado-admin' && !r.archivado; }).length,
      urgentes:     data.filter(function(r){ return r.estado === 'pendiente' && r.reclamoTurno && !r.archivado; }).length,
      nuevosTurnos: data.filter(function(r){ return r.nuevoTurno === 'Si' && !r.archivado; }).length,
      recitados:    data.filter(function(r){ return r.estado === 'recitar' && !r.archivado; }).length,
      archivados:   data.filter(function(r){ return r.archivado; }).length,
    }
  };
}

// Combina list + recitados + stats en una sola lectura de la planilla,
// para que el polling del frontend (cada 30s) dispare 1 ejecucion de
// Apps Script en vez de 3.
function getDashboard() {
  const rows = getDataRows();
  const listResult      = listReclamos(null, rows);
  const recitadosResult = listRecitados(rows);
  const statsResult     = getStats(rows);
  return {
    ok: true,
    list: listResult.data,
    recitados: recitadosResult.data,
    stats: statsResult.stats,
  };
}

function getConfigData() {
  const CONFIG_SHEET_ID = '1aMQWhajoQMJgACvV5lc7sON73sgsqLMXbTFWc4b3GtE';
  const sheet = SpreadsheetApp.openById(CONFIG_SHEET_ID).getSheetByName('Config');
  if (!sheet) return { ok: false, error: 'Hoja Config no encontrada' };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, regiones: {} };
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const regiones = {};
  data.forEach(function(row) {
    const estudio     = String(row[0] || '').trim().toLowerCase();
    const estadistica = String(row[1] || '').trim();
    if (!estudio || !estadistica) return;
    const match = estadistica.match(/^(\d+)\s*-\s*(.+)$/);
    if (!match) return;
    const numero = parseInt(match[1]);
    const region = match[2].trim();
    if (!regiones[region]) regiones[region] = { numero, estudios: [] };
    regiones[region].estudios.push(estudio);
  });
  return { ok: true, regiones };
}

function addReclamo(data) {
  ensureExtraColumns();
  const sheet  = getSheet();
  const ahora  = fmtDateTime();
  const dniStr = String(data.dni || '').replace(/\D/g,'');
  const rows   = getDataRows();
  var targetRow = -1;

  for (var i = 0; i < rows.length; i++) {
    const rowDni = String(rows[i][COL.DNI] || '').replace(/\.0$/,'').replace(/\D/g,'');
    const rowEst = String(rows[i][COL.ESTUDIO] || '').trim().toLowerCase();
    if (rowDni === dniStr && rowEst === String(data.estudio || '').trim().toLowerCase()) {
      targetRow = i + 2; break;
    }
  }

 const nroReclamo = rows.reduce(function(max, r) {
  const n = Number(r[COL.RECLAMO_NRO]) || 0;
  return n > max ? n : max;
}, 0) + 1;

  if (targetRow !== -1) {
    sheet.getRange(targetRow, COL.RECLAMO_DIAGNOSTICO + 1).setValue(data.reclamoDiagnostico || '');
    sheet.getRange(targetRow, COL.RECLAMO_INFORMADO   + 1).setValue(data.reclamoInformado   || '');
    sheet.getRange(targetRow, COL.RECLAMO_TURNO       + 1).setValue(data.reclamoTurno       || '');
    sheet.getRange(targetRow, COL.RECLAMO_ESTADO      + 1).setValue('pendiente');
    sheet.getRange(targetRow, COL.RECLAMO_FECHA       + 1).setValue(ahora);
    sheet.getRange(targetRow, COL.RECLAMO_OBS         + 1).setValue(data.observaciones || '');
    sheet.getRange(targetRow, COL.RECLAMO_NRO         + 1).setValue(nroReclamo);
    sheet.getRange(targetRow, COL.REGION_STATUS       + 1).setValue('');
    sheet.getRange(targetRow, COL.RECITAR_CODIGO      + 1).setValue('');
    sheet.getRange(targetRow, COL.RECITAR_MOTIVO      + 1).setValue('');
    sheet.getRange(targetRow, COL.RECITAR_FECHA_NUEVO + 1).setValue('');
    const turnoId = String(rows[targetRow - 2][COL.TURNO_ID] || '').trim() || String(targetRow);
    return { ok: true, id: turnoId, nroReclamo, vinculado: true };
  }

  const newRow = new Array(38).fill('');
  newRow[COL.APELLIDO]            = data.apellido           || '';
  newRow[COL.NOMBRE]              = data.nombre             || '';
  newRow[COL.DNI]                 = data.dni                || '';
  newRow[COL.ESTUDIO]             = data.estudio            || '';
  newRow[COL.FECHA]               = data.fechaEstudio ? new Date(data.fechaEstudio) : '';
  newRow[COL.RECLAMO_DIAGNOSTICO] = data.reclamoDiagnostico || '';
  newRow[COL.RECLAMO_INFORMADO]   = data.reclamoInformado   || '';
  newRow[COL.RECLAMO_TURNO]       = data.reclamoTurno       || '';
  newRow[COL.RECLAMO_ESTADO]      = 'pendiente';
  newRow[COL.RECLAMO_FECHA]       = ahora;
  newRow[COL.RECLAMO_OBS]         = data.observaciones      || '';
  newRow[COL.RECLAMO_NRO]         = nroReclamo;
  newRow[COL.TURNO_ID]            = 'manual_' + new Date().getTime();
  sheet.appendRow(newRow);
  return { ok: true, id: newRow[COL.TURNO_ID], nroReclamo, vinculado: false };
}

function updateReclamo(id, changes) {
  const sheet = getSheet();
  const found = findRowByTurnoId(id);
  if (!found) return { ok: false, error: 'Reclamo no encontrado: ' + id };
  const targetRow = found.rowIndex;

  const colMap = {
    reclamoDiagnostico:  COL.RECLAMO_DIAGNOSTICO + 1,
    reclamoInformado:    COL.RECLAMO_INFORMADO   + 1,
    reclamoTurno:        COL.RECLAMO_TURNO       + 1,
    estado:              COL.RECLAMO_ESTADO      + 1,
    fechaReclamo:        COL.RECLAMO_FECHA       + 1,
    comentarioMedico:    COL.RECLAMO_COMENTARIO  + 1,
    observaciones:       COL.RECLAMO_OBS         + 1,
    nroReclamo:          COL.RECLAMO_NRO         + 1,
    entregaInforme:      COL.ENTREGA_INFORME     + 1,
    fechaEntrega:        COL.FECHA_ENTREGA       + 1,
    entregadoAt:         COL.FECHA_ENTREGA       + 1,
    apellido:            COL.APELLIDO            + 1,
    nombre:              COL.NOMBRE              + 1,
    dni:                 COL.DNI                 + 1,
    estudio:             COL.ESTUDIO             + 1,
    informado:           COL.RECLAMO_INFORMADO   + 1,
    turnoMedico:         COL.RECLAMO_TURNO       + 1,
    nuevoTurno:          COL.NUEVO_TURNO         + 1,
    nuevoTurnoFecha:     COL.NUEVO_TURNO_FECHA   + 1,
    nuevoTurnoObs:       COL.NUEVO_TURNO_OBS     + 1,
    regionStatus:        COL.REGION_STATUS       + 1,
    recitarCodigo:       COL.RECITAR_CODIGO      + 1,
    recitarMotivo:       COL.RECITAR_MOTIVO      + 1,
    recitarFechaNuevo:   COL.RECITAR_FECHA_NUEVO + 1,
    archivado:           COL.RECLAMO_ARCHIVADO   + 1,
  };

  for (var key in changes) {
    if (colMap[key] !== undefined) {
      const val = (key === 'regionStatus' && typeof changes[key] === 'object')
        ? JSON.stringify(changes[key]) : changes[key];
      sheet.getRange(targetRow, colMap[key]).setValue(val);
    }
  }
  return { ok: true };
}

function resolverReclamo(id, comentario, nuevoTurno) {
  var changes = {
    estado:           'resuelto',
    comentarioMedico: comentario || 'Informe completado',
    entregadoAt:      fmtDateTime(),
  };
  if (nuevoTurno && nuevoTurno.requiere) {
    changes.nuevoTurno      = 'Si';
    changes.nuevoTurnoFecha = nuevoTurno.fecha || '';
    changes.nuevoTurnoObs   = nuevoTurno.obs   || '';
  }
  return updateReclamo(id, changes);
}

function resolverRegion(id, region, comentario, todasRegiones) {
  ensureExtraColumns();
  const found = findRowByTurnoId(id);
  if (!found) return { ok: false, error: 'Reclamo no encontrado: ' + id };
  var regionStatus = {};
  try {
    const raw = String(found.row[COL.REGION_STATUS] || '').trim();
    if (raw) regionStatus = JSON.parse(raw);
  } catch(e) {}
  regionStatus[region] = 'Si';
  var changes = { regionStatus };
  if (todasRegiones && todasRegiones.length > 0) {
    const todasListas = todasRegiones.every(function(r) { return regionStatus[r] === 'Si'; });
    if (todasListas) {
      changes.estado           = 'resuelto';
      changes.comentarioMedico = comentario || 'Todas las regiones informadas';
      changes.entregadoAt      = fmtDateTime();
    } else if (comentario) {
      changes.comentarioMedico = comentario;
    }
  }
  return updateReclamo(id, changes);
}

function recitarReclamo(id, motivo) {
  ensureExtraColumns();
  const codigo = 'RCT-' + String(new Date().getTime()).slice(-6);
  return updateReclamo(id, {
    estado:            'recitar',
    recitarCodigo:     codigo,
    recitarMotivo:     motivo,
    recitarFechaNuevo: '',
  });
}

function asignarTurnoRecitado(id, fechaNuevo) {
  return updateReclamo(id, {
    estado:            'recitado',
    recitarFechaNuevo: fechaNuevo,
  });
}

function entregarReclamo(id) {
  return updateReclamo(id, {
    estado:         'entregado',
    entregaInforme: 'INFORME',
    fechaEntrega:   fmtDateTime(),
    entregadoAt:    fmtDateTime(),
  });
}

function revisadoAdmin(id) {
  return updateReclamo(id, {
    estado:      'revisado-admin',
    entregadoAt: fmtDateTime(),
  });
}

async function marcarTodasRegiones(id) {
  const todasRegiones = reclamoRegionesMap[id] || [];
  if (!todasRegiones.length) {
    toast('❌ Error: regiones no identificadas. Recargá la página.', 'error');
    return;
  }
  const comentario = (document.getElementById(`coment-${id}`)?.value || '').trim();
  const btn = document.getElementById(`btn-todo-${id}`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
  try {
    // Marcar cada región pendiente secuencialmente
    const regionStatus = todosLosReclamos.find(x => x.id === id)?.regionStatus || {};
    for (let i = 0; i < todasRegiones.length; i++) {
      const reg = todasRegiones[i];
      if (regionStatus[reg] !== 'Si') {
        await resolverRegion(id, reg, comentario, todasRegiones);
      }
    }
    delete comentariosTemp[`coment-${id}`];
    await recargar();
    toast('✅ Todas las regiones informadas — reclamo resuelto.');
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Marcar todo informado'; }
  }
}

function resolverTodo(id, comentario, todasRegiones) {
  ensureExtraColumns();
  const found = findRowByTurnoId(id);
  if (!found) return { ok: false, error: 'Reclamo no encontrado: ' + id };

  var regionStatus = {};
  try {
    const raw = String(found.row[COL.REGION_STATUS] || '').trim();
    if (raw) regionStatus = JSON.parse(raw);
  } catch(e) {}

  // Marcar todas las regiones de una vez
  if (todasRegiones && todasRegiones.length > 0) {
    todasRegiones.forEach(function(reg) {
      regionStatus[reg] = 'Si';
    });
  }

  return updateReclamo(id, {
    regionStatus:     regionStatus,
    estado:           'resuelto',
    comentarioMedico: comentario || 'Todas las regiones informadas',
    entregadoAt:      fmtDateTime(),
  });
}

function renumerarReclamos() {
  const sheet = getSheet();
  const rows  = getDataRows();

  // Filtrar solo filas con reclamo
  const conReclamo = rows
    .map(function(row, i) { return { row, rowIndex: i + 2 }; })
    .filter(function(r) {
      const estado = String(r.row[COL.RECLAMO_ESTADO] || '').trim();
      const diag   = String(r.row[COL.RECLAMO_DIAGNOSTICO] || '').trim();
      const inform = String(r.row[COL.RECLAMO_INFORMADO]   || '').trim();
      const turno  = String(r.row[COL.RECLAMO_TURNO]       || '').trim();
      return estado !== '' || diag !== '' || inform !== '' || turno !== '';
    });

  // Ordenar por fila para asignar números consecutivos
  conReclamo.sort(function(a, b) { return a.rowIndex - b.rowIndex; });

  // Asignar número consecutivo a cada uno
  conReclamo.forEach(function(r, i) {
    sheet.getRange(r.rowIndex, COL.RECLAMO_NRO + 1).setValue(i + 1);
  });

  Logger.log('Renumerados: ' + conReclamo.length + ' reclamos');
}

function filtrarPorStat(tipo) {
  tabActual = 'reclamos';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-btn')[0].classList.add('active');
  document.getElementById('panelReclamos').style.display  = '';
  document.getElementById('panelRecitados').style.display = 'none';

  const select = document.getElementById('filtroEstado');
  const subFiltro = document.getElementById('subFiltroResueltos');

  // Mostrar sub-filtro solo para resueltos/entregados
  if (tipo === 'resuelto' || tipo === 'entregado') {
    subFiltro.style.display = 'flex';
    document.getElementById('btnSubResuelto').classList.toggle('active', tipo === 'resuelto');
    document.getElementById('btnSubEntregado').classList.toggle('active', tipo === 'entregado');
  } else {
    subFiltro.style.display = 'none';
  }

  if (tipo === 'urgente') {
    select.value = 'pendiente';
    const data = todosLosReclamos
      .filter(r => r.estado === 'pendiente' && r.reclamoTurno)
      .sort((a, b) => (b.retraso || 0) - (a.retraso || 0));
    renderLista(data);
  } else {
    select.value = tipo;
    filtrarLista();
  }

  document.getElementById('panelReclamos').scrollIntoView({ behavior: 'smooth' });
}

function subFiltrar(estado) {
  document.getElementById('btnSubResuelto').classList.toggle('active', estado === 'resuelto');
  document.getElementById('btnSubEntregado').classList.toggle('active', estado === 'entregado');
  document.getElementById('filtroEstado').value = estado;
  filtrarLista();
}