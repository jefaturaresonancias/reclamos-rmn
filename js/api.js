// ============================================================
// APPS SCRIPT BACKEND — BD CENTRAL
// Migrado de hoja RECLAMOS → Base_de_datos (hoja BD)
// ============================================================

const SHEET_ID   = '1WwSvS1ymkl7RJ6MHOnNGE0mkvt5q5JJcvA9XUZ0ZvKg';
const SHEET_NAME = 'BD';

// ── Columnas de la BD (índice 0 = col A) ─────────────────────
const COL = {
  // Datos del turno (ya existentes en BD)
  FECHA:               0,   // A — fecha del turno
  HORA:                1,   // B
  NOMBRE:              2,   // C
  APELLIDO:            3,   // D
  DNI:                 4,   // E
  ESTUDIO:             5,   // F
  ORIGEN:              6,   // G
  CONFIRMA:            7,   // H
  OTORGADO:            8,   // I
  MODIFICADO:          9,   // J
  FECHA_MODIFICADO:    10,  // K
  COD_MOD:             11,  // L
  PRESENTE_ST:         12,  // M
  FECHA_PRESENTE_ST:   13,  // N
  PRESENTE_AMB:        14,  // O
  FECHA_PRESENTE_AMB:  15,  // P
  OBSERVACIONES_BD:    16,  // Q
  TURNO_ID:            17,  // R ← ID único
  PLANILLA_ORIGEN:     18,  // S
  ENTREGA_INFORME:     19,  // T
  FECHA_ENTREGA:       20,  // U
  OBS_ENTREGA:         21,  // V
  // Flags de tipo de reclamo
  RECLAMO_DIAGNOSTICO: 22,  // W — flag: paciente en desacuerdo con diagnóstico
  RECLAMO_INFORMADO:   23,  // X — flag: no tiene informe / fuera de fecha
  RECLAMO_TURNO:       24,  // Y — flag: tiene turno médico próximo y necesita el estudio
  TIPO_ORDEN:          25,  // Z
  // Campos de gestión del reclamo (nuevos)
  RECLAMO_ESTADO:      26,  // AA — pendiente / resuelto / entregado
  RECLAMO_FECHA:       27,  // AB — cuándo se cargó el reclamo
  RECLAMO_COMENTARIO:  28,  // AC — comentario del médico
  RECLAMO_OBS:         29,  // AD — observaciones del reclamo
  RECLAMO_NRO:         30,  // AE — número correlativo
};

const TZ = 'America/Argentina/Buenos_Aires';

// ── Respuesta JSON ────────────────────────────────────────────
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Router GET ────────────────────────────────────────────────
function doGet(e) {
  const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'list';
  try {
    if      (action === 'list')  return jsonResponse(listReclamos(e.parameter));
    else if (action === 'stats') return jsonResponse(getStats());
    else return jsonResponse({ ok: false, error: 'Accion no reconocida' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Router POST ───────────────────────────────────────────────
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch(err) {}
  const action = body.action || '';
  try {
    if      (action === 'add')      return jsonResponse(addReclamo(body.data));
    else if (action === 'update')   return jsonResponse(updateReclamo(body.id, body.changes));
    else if (action === 'resolver') return jsonResponse(resolverReclamo(body.id, body.comentario));
    else if (action === 'entregar') return jsonResponse(entregarReclamo(body.id));
    else return jsonResponse({ ok: false, error: 'Accion no reconocida' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function getDataRows() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  // BD arranca en fila 2 (fila 1 = cabecera)
  return sheet.getRange(2, 1, lastRow - 1, 31).getValues();
}

function fmtDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, TZ, 'yyyy-MM-dd');
  }
  if (typeof val === 'number' && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }
  return String(val);
}

function fmtDateTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, TZ, 'yyyy-MM-dd HH:mm');
  }
  return String(val);
}

function rowToObj(row, rowIndex) {
  const estado = String(row[COL.RECLAMO_ESTADO] || '').trim();
  // Solo consideramos reclamos activos: tienen RECLAMO_ESTADO no vacío
  const tieneReclamo = estado !== '';

  // Calcular urgencia basada en los 3 tipos de reclamo
  const reclDiag   = String(row[COL.RECLAMO_DIAGNOSTICO] || '').trim();
  const reclInform = String(row[COL.RECLAMO_INFORMADO]   || '').trim();
  const reclTurno  = String(row[COL.RECLAMO_TURNO]       || '').trim();

  // Retraso: días desde fecha del turno
  const fechaTurno = row[COL.FECHA];
  const retraso = fechaTurno instanceof Date
    ? Math.floor((new Date() - fechaTurno) / 86400000)
    : 0;

  return {
    rowIndex,
    // Usamos turnoId como ID único
    id:               String(row[COL.TURNO_ID] || '').trim() || String(rowIndex),
    nroReclamo:       Number(row[COL.RECLAMO_NRO]) || rowIndex,
    // Datos del paciente
    apellido:         String(row[COL.APELLIDO] || '').trim(),
    nombre:           String(row[COL.NOMBRE]   || '').trim(),
    dni:              String(row[COL.DNI]       || '').replace(/\.0$/, '').replace(/\D/,''),
    estudio:          String(row[COL.ESTUDIO]   || '').trim(),
    fechaEstudio:     fmtDate(row[COL.FECHA]),
    hora:             String(row[COL.HORA]      || '').trim(),
    origen:           String(row[COL.ORIGEN]    || '').trim(),
    tipoOrden:        String(row[COL.TIPO_ORDEN]|| '').trim(),
    // Flags de tipo de reclamo
    reclamoDiagnostico: reclDiag,
    reclamoInformado:   reclInform,
    reclamoTurno:       reclTurno,
    // Gestión del reclamo
    estado:             estado || 'pendiente',
    fechaReclamo:       fmtDate(row[COL.RECLAMO_FECHA]),
    comentarioMedico:   String(row[COL.RECLAMO_COMENTARIO] || '').trim(),
    observaciones:      String(row[COL.RECLAMO_OBS]        || '').trim(),
    // Entrega
    entregaInforme:     String(row[COL.ENTREGA_INFORME]    || '').trim(),
    fechaEntrega:       fmtDateTime(row[COL.FECHA_ENTREGA]),
    // Campos heredados para compatibilidad con frontend
    retraso:            retraso,
    informado:          reclInform ? 'Si' : 'No',
    tieneImagen:        '',
    turnoMedico:        reclTurno,
    diagnostico:        String(row[COL.RECLAMO_OBS] || '-').trim(),
    notificadoAt:       '',
    resolvedAt:         '',
    entregadoAt:        fmtDateTime(row[COL.FECHA_ENTREGA]),
    tieneReclamo:       tieneReclamo,
  };
}

// ── Buscar fila por turnoId ───────────────────────────────────
function findRowByTurnoId(turnoId) {
  const rows = getDataRows();
  for (var i = 0; i < rows.length; i++) {
    const id = String(rows[i][COL.TURNO_ID] || '').trim();
    if (id === String(turnoId).trim()) return { rowIndex: i + 2, row: rows[i] };
  }
  return null;
}

// ── LISTAR RECLAMOS ───────────────────────────────────────────
function listReclamos(params) {
  const rows = getDataRows();
  var data = rows
    .map(function(row, i) { return rowToObj(row, i + 2); })
    .filter(function(r) {
      // Solo mostrar filas que tienen reclamo activo
      return r.tieneReclamo && r.apellido !== '';
    });

  if (params && params.estado) {
    data = data.filter(function(r) { return r.estado === params.estado; });
  }

  // Ordenar: urgentes primero (tienen turno médico), luego por fecha reclamo
  data.sort(function(a, b) {
    const aUrgente = a.reclamoTurno ? 1 : 0;
    const bUrgente = b.reclamoTurno ? 1 : 0;
    if (bUrgente !== aUrgente) return bUrgente - aUrgente;
    return (a.fechaReclamo || '').localeCompare(b.fechaReclamo || '');
  });

  return { ok: true, data: data };
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────
function getStats() {
  const rows = getDataRows();
  const data = rows
    .map(function(row, i) { return rowToObj(row, i + 2); })
    .filter(function(r) { return r.tieneReclamo && r.apellido !== ''; });

  return {
    ok: true,
    stats: {
      total:      data.length,
      pendientes: data.filter(function(r){ return r.estado === 'pendiente'; }).length,
      resueltos:  data.filter(function(r){ return r.estado === 'resuelto';  }).length,
      entregados: data.filter(function(r){ return r.estado === 'entregado'; }).length,
      // Urgentes = tienen turno médico próximo y están pendientes
      urgentes:   data.filter(function(r){
        return r.estado === 'pendiente' && r.reclamoTurno;
      }).length,
    }
  };
}

// ── AGREGAR RECLAMO ───────────────────────────────────────────
// En la nueva arquitectura, addReclamo busca el turno por DNI+Estudio
// o crea una fila nueva si no existe
function addReclamo(data) {
  const sheet = getSheet();
  const hoy   = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

  // Buscar fila existente por DNI + estudio para vincular el reclamo
  const rows = getDataRows();
  var targetRow = -1;
  const dniStr = String(data.dni || '').replace(/\D/g,'');

  for (var i = 0; i < rows.length; i++) {
    const rowDni = String(rows[i][COL.DNI] || '').replace(/\.0$/,'').replace(/\D/g,'');
    const rowEst = String(rows[i][COL.ESTUDIO] || '').trim().toLowerCase();
    const datEst = String(data.estudio || '').trim().toLowerCase();
    if (rowDni === dniStr && rowEst === datEst) {
      targetRow = i + 2;
      break;
    }
  }

  // Calcular número de reclamo
  const nroReclamo = rows.filter(function(r){
    return String(r[COL.RECLAMO_ESTADO] || '').trim() !== '';
  }).length + 1;

  if (targetRow !== -1) {
    // Vincular reclamo a fila existente del turno
    sheet.getRange(targetRow, COL.RECLAMO_DIAGNOSTICO + 1).setValue(data.reclamoDiagnostico || '');
    sheet.getRange(targetRow, COL.RECLAMO_INFORMADO   + 1).setValue(data.reclamoInformado   || '');
    sheet.getRange(targetRow, COL.RECLAMO_TURNO       + 1).setValue(data.reclamoTurno       || '');
    sheet.getRange(targetRow, COL.RECLAMO_ESTADO      + 1).setValue('pendiente');
    sheet.getRange(targetRow, COL.RECLAMO_FECHA       + 1).setValue(hoy);
    sheet.getRange(targetRow, COL.RECLAMO_OBS         + 1).setValue(data.observaciones || '');
    sheet.getRange(targetRow, COL.RECLAMO_NRO         + 1).setValue(nroReclamo);
    const turnoId = String(rows[targetRow - 2][COL.TURNO_ID] || '').trim() || String(targetRow);
    return { ok: true, id: turnoId, nroReclamo: nroReclamo, vinculado: true };
  }

  // Si no existe el turno, crear fila nueva
  const newRow = new Array(31).fill('');
  newRow[COL.APELLIDO]           = data.apellido  || '';
  newRow[COL.NOMBRE]             = data.nombre    || '';
  newRow[COL.DNI]                = data.dni       || '';
  newRow[COL.ESTUDIO]            = data.estudio   || '';
  newRow[COL.FECHA]              = data.fechaEstudio ? new Date(data.fechaEstudio) : '';
  newRow[COL.RECLAMO_DIAGNOSTICO]= data.reclamoDiagnostico || '';
  newRow[COL.RECLAMO_INFORMADO]  = data.reclamoInformado   || '';
  newRow[COL.RECLAMO_TURNO]      = data.reclamoTurno       || '';
  newRow[COL.RECLAMO_ESTADO]     = 'pendiente';
  newRow[COL.RECLAMO_FECHA]      = hoy;
  newRow[COL.RECLAMO_OBS]        = data.observaciones || '';
  newRow[COL.RECLAMO_NRO]        = nroReclamo;
  newRow[COL.TURNO_ID]           = 'manual_' + new Date().getTime();

  sheet.appendRow(newRow);
  return { ok: true, id: newRow[COL.TURNO_ID], nroReclamo: nroReclamo, vinculado: false };
}

// ── ACTUALIZAR RECLAMO ────────────────────────────────────────
function updateReclamo(id, changes) {
  const sheet = getSheet();
  const found = findRowByTurnoId(id);
  if (!found) return { ok: false, error: 'Reclamo no encontrado: ' + id };

  const targetRow = found.rowIndex;

  const colMap = {
    reclamoDiagnostico: COL.RECLAMO_DIAGNOSTICO + 1,
    reclamoInformado:   COL.RECLAMO_INFORMADO   + 1,
    reclamoTurno:       COL.RECLAMO_TURNO       + 1,
    estado:             COL.RECLAMO_ESTADO      + 1,
    fechaReclamo:       COL.RECLAMO_FECHA       + 1,
    comentarioMedico:   COL.RECLAMO_COMENTARIO  + 1,
    observaciones:      COL.RECLAMO_OBS         + 1,
    nroReclamo:         COL.RECLAMO_NRO         + 1,
    entregaInforme:     COL.ENTREGA_INFORME     + 1,
    fechaEntrega:       COL.FECHA_ENTREGA       + 1,
    // compatibilidad con frontend anterior
    informado:          COL.RECLAMO_INFORMADO   + 1,
    turnoMedico:        COL.RECLAMO_TURNO       + 1,
    entregadoAt:        COL.FECHA_ENTREGA       + 1,
  };

  for (var key in changes) {
    if (colMap[key] !== undefined) {
      sheet.getRange(targetRow, colMap[key]).setValue(changes[key]);
    }
  }
  return { ok: true };
}

// ── RESOLVER RECLAMO (médico informa) ────────────────────────
function resolverReclamo(id, comentario) {
  const ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  return updateReclamo(id, {
    estado:           'resuelto',
    comentarioMedico: comentario || 'Informe completado',
    entregadoAt:      ahora,
  });
}

// ── ENTREGAR RECLAMO (administrativo entrega) ─────────────────
function entregarReclamo(id) {
  const ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  return updateReclamo(id, {
    estado:       'entregado',
    entregaInforme: 'INFORME',
    fechaEntrega: ahora,
    entregadoAt:  ahora,
  });
}