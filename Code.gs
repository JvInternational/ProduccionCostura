function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, status: 'ready' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const payload = body.payload || body;

    if (!payload || !payload.fecha || !payload.personal) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Payload inválido.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = body.sheetName || 'Produccion';
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        'Folio',
        'Fecha',
        'Semana',
        'Nombre Personal',
        'Máquina',
        'No. Corte',
        'Estilo',
        'Proceso',
        'Costo Unitario',
        'Cantidad',
        'Costo Total'
      ]);
    }

    const headers = sheet.getDataRange().getValues()[0] || [];
    if (!headers.length) {
      sheet.appendRow([
        'Folio',
        'Fecha',
        'Semana',
        'Nombre Personal',
        'Máquina',
        'No. Corte',
        'Estilo',
        'Proceso',
        'Costo Unitario',
        'Cantidad',
        'Costo Total'
      ]);
    }

    const row = [
      payload.folio || '',
      payload.fecha || '',
      payload.semana || 0,
      payload.personal || '',
      payload.maquina || '',
      payload.corte || '',
      payload.estilo || '',
      payload.proceso || '',
      Number(payload.costoUnitario || 0),
      Number(payload.cantidad || 0),
      Number(payload.costoTotal || 0)
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'Registro guardado en Sheets.', row }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err && err.toString ? err.toString() : 'Error desconocido.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
