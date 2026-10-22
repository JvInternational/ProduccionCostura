const SHEET_NAME = 'ProduccionCostura';
const HEADER = [
  'timestamp',
  'fecha',
  'semana',
  'personal',
  'maquina',
  'corte',
  'estilo',
  'proceso',
  'costoUnitario',
  'cantidad',
  'costoTotal'
];

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'Servicio activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(String(e.parameter.payload || e.postData.contents || '{}'));
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER);
    }

    const row = [
      new Date(),
      payload.fecha || '',
      Number(payload.semana || 0),
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
      .createTextOutput(JSON.stringify({ ok: true, message: 'Registro guardado' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err), payload: e && e.parameter ? e.parameter.payload : null }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testGuardar() {
  const sample = {
    fecha: '2026-10-22',
    semana: 43,
    personal: 'GARCIA GUSTAVO',
    maquina: 'OVER',
    corte: 'C-100',
    estilo: 'JR154',
    proceso: 'PEGAR CUELLO',
    costoUnitario: 0.7,
    cantidad: 10,
    costoTotal: 7
  };

  const result = doPost({ parameter: { payload: JSON.stringify(sample) }, postData: { contents: JSON.stringify(sample) } });
  Logger.log(result.getContent());
}
