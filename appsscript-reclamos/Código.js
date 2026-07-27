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
    else if (action === 'analitica') return jsonResponse(getAnalitica());
    else return jsonResponse({ ok: false, error: 'Accion no reconocida' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch(err) {}
  const action = body.action || '';

  // Todas las acciones de escritura hacen lectura + modificacion + guardado
  // (ej: leer regionStatus, sumarle una region, volver a guardar el JSON
  // entero). Sin lock, dos requests simultaneos pueden pisarse el cambio.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'El sistema está procesando otro cambio, probá de nuevo en unos segundos.' });
  }

  try {
    var result;
    if      (action === 'add')            result = addReclamo(body.data);
    else if (action === 'update')         result = updateReclamo(body.id, body.changes);
    else if (action === 'resolver')       result = resolverReclamo(body.id, body.comentario, body.nuevoTurno);
    else if (action === 'resolverRegion') result = resolverRegion(body.id, body.region, body.comentario, body.todasRegiones);
    else if (action === 'entregar')       result = entregarReclamo(body.id);
    else if (action === 'revisado')       result = revisadoAdmin(body.id);
    else if (action === 'recitar')        result = recitarReclamo(body.id, body.motivo);
    else if (action === 'asignarTurno')   result = asignarTurnoRecitado(body.id, body.fechaNuevo);
    else if (action === 'resolverTodo')   result = resolverTodo(body.id, body.comentario, body.todasRegiones);
    else return jsonResponse({ ok: false, error: 'Accion no reconocida' });

    if (result && result.ok) {
      logCambio(action, body.id || (result.id || ''), body);
    }
    return jsonResponse(result);
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// Registro de auditoria: una fila por cada escritura exitosa, con que
// accion fue, sobre que reclamo, y el payload que la disparo. No sabemos
// "quien" la hizo porque el sistema no tiene login todavia — eso queda
// para cuando se sume autenticacion real.
function getLogSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Log_Reclamos');
  if (!sheet) {
    sheet = ss.insertSheet('Log_Reclamos');
    sheet.appendRow(['Fecha', 'Accion', 'ReclamoId', 'Detalle']);
  }
  return sheet;
}

function logCambio(accion, id, body) {
  try {
    const detalle = {};
    Object.keys(body).forEach(function(k) {
      if (k !== 'action') detalle[k] = body[k];
    });
    getLogSheet().appendRow([fmtDateTime(), accion, String(id || ''), JSON.stringify(detalle)]);
  } catch (e) {
    // Un fallo al loguear no debe interrumpir la operacion principal.
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

// Si alguien inserta/borra una columna a mano en la hoja BD, los indices
// fijos de COL quedan apuntando a datos equivocados sin que nada avise.
// Este chequeo no valida los ~34 encabezados originales (no se puede
// confirmar su texto exacto desde aca), pero si detecta si la hoja se
// quedo corta de columnas o si alguno de los headers que el propio
// backend crea/gestiona (RECLAMO_ARCHIVADO, REGION_STATUS, RECITAR_*)
// aparece con un texto distinto al esperado.
function validarEstructuraSheet(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 40) {
    throw new Error(
      'La hoja BD tiene ' + lastCol + ' columnas y se esperan al menos 40. ' +
      'Puede que se haya borrado una columna por error — revisar antes de seguir usando el sistema.'
    );
  }
  const headers = sheet.getRange(1, 1, 1, 40).getValues()[0];
  const esperados = {};
  esperados[COL.RECLAMO_ARCHIVADO]   = 'RECLAMO_ARCHIVADO';
  esperados[COL.REGION_STATUS]       = 'REGION_STATUS';
  esperados[COL.RECITAR_CODIGO]      = 'RECITAR_CODIGO';
  esperados[COL.RECITAR_MOTIVO]      = 'RECITAR_MOTIVO';
  esperados[COL.RECITAR_FECHA_NUEVO] = 'RECITAR_FECHA_NUEVO';

  for (var idx in esperados) {
    const real = String(headers[idx] || '').trim().toUpperCase();
    if (real && real !== esperados[idx]) {
      throw new Error(
        'La columna ' + (Number(idx) + 1) + ' deberia tener el header "' + esperados[idx] +
        '" pero tiene "' + headers[idx] + '" — revisar si se movio o borro una columna en la hoja BD.'
      );
    }
  }
}

function getDataRows() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  validarEstructuraSheet(sheet);
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

// Todos los reclamos alguna vez cargados (incluye archivados), para el
// dashboard de analitica. A diferencia de listReclamos(), no excluye nada
// por estado — la analitica quiere la historia completa, no solo lo activo.
function getAnalitica() {
  const rows = getDataRows();
  const data = rows
    .map(function(row, i) { return rowToObj(row, i + 2); })
    .filter(function(r) { return r.tieneReclamo && r.apellido !== ''; });
  return { ok: true, data: data };
}

function getConfigData() {
  const CACHE_KEY = 'config_regiones_v1';
  const cache = CacheService.getScriptCache();
  const cacheado = cache.get(CACHE_KEY);
  if (cacheado) {
    try { return { ok: true, regiones: JSON.parse(cacheado) }; } catch(e) {}
  }

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

  // Las regiones casi no cambian (se editan a mano en la hoja Config muy
  // de vez en cuando) — 10 minutos de cache evitan releerla en cada carga.
  cache.put(CACHE_KEY, JSON.stringify(regiones), 600);
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

// ── Backup semanal ────────────────────────────────────────────────
// Copia todo el archivo (todas las hojas: BD, Log_Reclamos, etc.) a la
// misma carpeta de Drive, con fecha en el nombre. Se ejecuta sola via
// trigger — instalarTriggerBackupSemanal() se corre UNA VEZ a mano desde
// el editor de Apps Script (Ejecutar > instalarTriggerBackupSemanal).
function backupSemanalBD() {
  const archivoOriginal = DriveApp.getFileById(SHEET_ID);
  const carpeta = archivoOriginal.getParents().hasNext()
    ? archivoOriginal.getParents().next()
    : DriveApp.getRootFolder();

  const PREFIJO = 'Backup BD reclamos - ';
  const nombre = PREFIJO + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  archivoOriginal.makeCopy(nombre, carpeta);

  // No acumular backups para siempre: nos quedamos con los ultimos ~60 dias,
  // el resto va a la papelera de Drive (recuperable ahi por 30 dias mas).
  const limite = new Date();
  limite.setDate(limite.getDate() - 60);
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const f = archivos.next();
    if (f.getName().indexOf(PREFIJO) === 0 && f.getDateCreated() < limite) {
      f.setTrashed(true);
    }
  }
}

function instalarTriggerBackupSemanal() {
  const yaExiste = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'backupSemanalBD';
  });
  if (yaExiste) {
    Logger.log('Ya existe un trigger de backup semanal, no se crea otro.');
    return;
  }
  ScriptApp.newTrigger('backupSemanalBD')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
  Logger.log('Trigger de backup semanal instalado: domingos a las 3am.');
}