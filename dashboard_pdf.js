/**
 * dashboard_pdf.js  (archivo NUEVO en GitHub, junto a dashboard.html)
 * Informe ejecutivo en PDF (A4 horizontal) con los filtros que estén en pantalla.
 * Requiere jsPDF 2.5.1 (se carga desde cdnjs en dashboard.html) y usa API_URL / params() del dashboard.
 */
(function () {
  'use strict';

  var PAL = ['#1f4e79', '#08776b', '#4b5d73', '#7a6a4f', '#355c7d', '#5b6b73']; /* un tono sobrio por gráfica */
  var C = { band: '#0d3b36', teal: '#08776b', text: '#18312d', muted: '#72817e', line: '#dfe7e4', card: '#f7faf9', track: '#e7eeec' };
  var nf = new Intl.NumberFormat('es-MX');
  var money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

  function $(id) { return document.getElementById(id); }
  function num(v) { return Number(v) || 0; }
  function dmy(v) {
    var m = String(v == null ? '' : v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v == null ? '' : v);
  }
  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function loadLogo() {
    return fetch('Logo_JV%20International.png')
      .then(function (r) { if (!r.ok) throw new Error('logo'); return r.blob(); })
      .then(function (b) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () {
            var img = new Image();
            img.onload = function () { resolve({ data: fr.result, w: img.naturalWidth, h: img.naturalHeight }); };
            img.onerror = reject;
            img.src = fr.result;
          };
          fr.onerror = reject;
          fr.readAsDataURL(b);
        });
      })
      .catch(function () { return null; });
  }

  function currentFilters() {
    var map = [['folio', 'Folio'], ['corte', 'Corte'], ['estilo', 'Estilo'], ['operacion', 'Operación'], ['personal', 'Personal'],
      ['maquina', 'Máquina'], ['desde', 'Desde'], ['hasta', 'Hasta'], ['semana', 'Semana']];
    var out = [];
    map.forEach(function (m) {
      var el = $(m[0]);
      var v = el ? String(el.value || '').trim() : '';
      if (v) out.push(m[1] + ': ' + (m[0] === 'desde' || m[0] === 'hasta' ? dmy(v) : v));
    });
    return out;
  }

  function fetchData() {
    return fetch(API_URL + '?' + params().toString(), { redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Error HTTP ' + r.status); return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || 'La API devolvió un error.'); return d.dashboard || {}; });
  }

  /* ---------- Dibujo ---------- */

  function Pdf(jsPDF, logo) {
    this.doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    this.W = this.doc.internal.pageSize.getWidth();
    this.H = this.doc.internal.pageSize.getHeight();
    this.M = 36;
    this.logo = logo;
  }

  Pdf.prototype.fill = function (hex) { var c = rgb(hex); this.doc.setFillColor(c[0], c[1], c[2]); };
  Pdf.prototype.stroke = function (hex) { var c = rgb(hex); this.doc.setDrawColor(c[0], c[1], c[2]); };
  Pdf.prototype.color = function (hex) { var c = rgb(hex); this.doc.setTextColor(c[0], c[1], c[2]); };
  Pdf.prototype.font = function (size, bold) { this.doc.setFont('helvetica', bold ? 'bold' : 'normal'); this.doc.setFontSize(size); };

  Pdf.prototype.fit = function (text, maxW) {
    var d = this.doc, t = String(text == null ? '' : text);
    if (d.getTextWidth(t) <= maxW) return t;
    while (t.length > 1 && d.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  Pdf.prototype.header = function (title, rangeText) {
    var d = this.doc, W = this.W;
    this.fill(C.band); d.rect(0, 0, W, 64, 'F');
    // logotipo sobre caja blanca
    this.fill('#ffffff'); d.roundedRect(this.M, 12, 112, 40, 5, 5, 'F');
    if (this.logo) {
      var maxW = 100, maxH = 30, r = Math.min(maxW / this.logo.w, maxH / this.logo.h);
      var w = this.logo.w * r, h = this.logo.h * r;
      d.addImage(this.logo.data, 'PNG', this.M + (112 - w) / 2, 12 + (40 - h) / 2, w, h);
    } else {
      this.color(C.band); this.font(9, true); d.text('JV INTERNATIONAL', this.M + 56, 36, { align: 'center' });
    }
    this.color('#ffffff'); this.font(17, true); d.text(title, W / 2, 38, { align: 'center' });
    this.font(8.5, false); d.text(rangeText, W - this.M, 28, { align: 'right' });
  };

  Pdf.prototype.footers = function (generated) {
    var d = this.doc, n = d.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      d.setPage(i);
      this.stroke(C.line); d.setLineWidth(0.6); d.line(this.M, this.H - 30, this.W - this.M, this.H - 30);
      this.color(C.muted); this.font(7.5, false);
      d.text('JV International Solutions Inc. · Generado: ' + generated, this.M, this.H - 18);
      d.text('Página ' + i + ' de ' + n, this.W - this.M, this.H - 18, { align: 'right' });
      this.color('#ffffff'); this.font(8.5, false);
      d.text('Página ' + i + ' de ' + n, this.W - this.M, 44, { align: 'right' });
    }
  };

  Pdf.prototype.card = function (x, y, w, h, label, value, note, valueSize) {
    var d = this.doc;
    this.fill(C.card); this.stroke(C.line); d.setLineWidth(0.8); d.roundedRect(x, y, w, h, 5, 5, 'FD');
    this.color(C.muted); this.font(7.5, false); d.text(String(label).toUpperCase(), x + 12, y + 16);
    this.color(C.text); this.font(valueSize || 18, true); d.text(this.fit(value, w - 24), x + 12, y + 38);
    if (note) { this.color(C.muted); this.font(7.5, false); d.text(this.fit(note, w - 24), x + 12, y + h - 9); }
  };

  /** Barras horizontales con valor y % del total. rows: [{label, value}] */
  Pdf.prototype.hbars = function (x, y, w, title, rows, unit, color) {
    var d = this.doc, rowH = 21, labelW = 118, valueW = 92;
    this.color(C.text); this.font(11, true); d.text(title, x, y);
    y += 14;
    if (!rows.length) { this.color(C.muted); this.font(9, false); d.text('Sin datos', x, y + 14); return y + 30; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var total = rows.reduce(function (s, r) { return s + r.value; }, 0) || 1;
    var trackX = x + labelW, trackW = w - labelW - valueW;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], cy = y + i * rowH + 8;
      this.color(C.text); this.font(8, false); d.text(this.fit(r.label, labelW - 8), x, cy + 3);
      this.fill(C.track); d.roundedRect(trackX, cy - 3, trackW, 7, 3.5, 3.5, 'F');
      var bw = Math.max(3, trackW * r.value / max);
      this.fill(color || PAL[0]); d.roundedRect(trackX, cy - 3, bw, 7, 3.5, 3.5, 'F');
      this.color(C.text); this.font(8, true); d.text(nf.format(r.value) + (unit || ''), x + w, cy + 3, { align: 'right' });
      this.color(C.muted); this.font(7, false); d.text((r.value * 100 / total).toFixed(1) + '%', x + w - 52, cy + 3, { align: 'right' });
    }
    return y + rows.length * rowH;
  };

  /** Columnas verticales (semanas / fechas). rows: [{label, value}] */
  Pdf.prototype.columns = function (x, y, w, h, title, rows) {
    var d = this.doc;
    this.color(C.text); this.font(11, true); d.text(title, x, y);
    y += 12;
    if (!rows.length) { this.color(C.muted); this.font(9, false); d.text('Sin datos', x, y + 14); return y + 30; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var mag = Math.pow(10, Math.floor(Math.log10(max / 4))), rough = max / 4;
    var niceStep = [1, 2, 2.5, 5, 10].filter(function (n) { return n * mag >= rough; })[0] || 10;
    max = niceStep * mag * 4;
    var ph = h - 34, base = y + ph + 6, left = x + 40, pw = w - 40;
    // rejilla
    for (var g = 0; g <= 4; g++) {
      var gy = base - ph * g / 4;
      this.stroke(C.line); d.setLineWidth(0.5); d.line(left, gy, x + w, gy);
      this.color(C.muted); this.font(7, false); d.text(nf.format(Math.round(max * g / 4)), left - 5, gy + 2.5, { align: 'right' });
    }
    var slot = pw / rows.length, bw = Math.min(26, slot * 0.62);
    var every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(pw / 52))));
    for (var i = 0; i < rows.length; i++) {
      var bh = Math.max(1.5, ph * rows[i].value / max), bx = left + slot * i + (slot - bw) / 2;
      this.fill(C.teal); d.rect(bx, base - bh, bw, bh, 'F');
      if (rows.length <= 16) { this.color(C.text); this.font(6.5, true); d.text(nf.format(rows[i].value), bx + bw / 2, base - bh - 3, { align: 'center' }); }
      if (i % every === 0 || i === rows.length - 1) {
        this.color(C.muted); this.font(7, false); d.text(String(rows[i].label), bx + bw / 2, base + 11, { align: 'center' });
      }
    }
    return base + 16;
  };

  Pdf.prototype.table = function (x, y, w, title, head, cols, rows) {
    var d = this.doc, rowH = 17;
    this.color(C.text); this.font(11, true); d.text(title, x, y);
    y += 8;
    this.fill('#eaf1ef'); d.rect(x, y, w, rowH, 'F');
    this.color('#3f5550'); this.font(7.5, true);
    head.forEach(function (h, i) { d.text(h.toUpperCase(), cols[i].x + (cols[i].right ? cols[i].w : 0) + 6 * (cols[i].right ? -1 : 1), y + 11.5, { align: cols[i].right ? 'right' : 'left' }); });
    y += rowH;
    var self = this;
    if (!rows.length) { this.color(C.muted); this.font(9, false); d.text('Sin datos', x + 6, y + 13); return y + rowH; }
    rows.forEach(function (r, ri) {
      if (ri % 2) { self.fill('#f7faf9'); d.rect(x, y, w, rowH, 'F'); }
      self.color(C.text); self.font(8, false);
      r.forEach(function (cell, i) {
        var c = cols[i];
        d.text(self.fit(cell, c.w - 12), c.x + (c.right ? c.w - 6 : 6), y + 11.5, { align: c.right ? 'right' : 'left' });
      });
      y += rowH;
    });
    self.stroke(C.line); d.setLineWidth(0.6); d.line(x, y, x + w, y);
    return y;
  };

  /* ---------- Informe ---------- */

  function top(list, labelKey, n) {
    return (list || []).slice(0, n).map(function (r) { return { label: String(r[labelKey] == null ? '' : r[labelKey]), value: num(r.piezas) }; });
  }

  function build(jsPDF, logo, data, filters) {
    var p = new Pdf(jsPDF, logo), d = p.doc, M = p.M, W = p.W;
    var k = data.kpis || {};
    var fechas = (data.porFecha || []).map(function (r) { return String(r.fecha || ''); }).filter(Boolean).sort();
    var desde = ($('desde') && $('desde').value) || fechas[0] || '';
    var hasta = ($('hasta') && $('hasta').value) || fechas[fechas.length - 1] || '';
    var rango = desde || hasta ? 'Rango de fechas: ' + (dmy(desde) || '—') + ' - ' + (dmy(hasta) || '—') : 'Rango de fechas: sin registros';
    var title = 'Informe Producción Costura';
    var colW = (W - 2 * M - 24) / 2;

    function firstOf(list, key) { var r = (list || [])[0]; return r ? { name: String(r[key] == null ? '' : r[key]), piezas: num(r.piezas) } : null; }
    /* Página 1: encabezado, 4 indicadores y barras en dos columnas */
    p.header(title, rango);

    var cw = (W - 2 * M - 3 * 12) / 4;
    function cardX(i) { return M + i * (cw + 12); }
    var ops = k.operacionesRealizadas !== undefined ? k.operacionesRealizadas : k.piezas;
    var noProg = num(k.cortesSinPrograma);
    p.card(cardX(0), 84, cw, 62, 'Operaciones', nf.format(num(ops)), 'Operaciones realizadas');
    p.card(cardX(1), 84, cw, 62, 'Piezas', nf.format(num(k.piezas)), noProg ? 'Piezas trabajadas · ' + noProg + ' corte(s) sin programa' : 'Piezas trabajadas');
    p.card(cardX(2), 84, cw, 62, 'Costo total', money.format(num(k.costoTotal)), 'Costo de destajo');
    p.card(cardX(3), 84, cw, 62, 'Estilos', nf.format(num(k.estilos)), 'Estilos trabajados');

    p.hbars(M, 176, colW, 'Producción por estilo (piezas)', top(data.porEstilo, 'estilo', 6), '', PAL[0]);
    p.hbars(M + colW + 24, 176, colW, 'Producción por operador (piezas)', top(data.porOperador, 'operador', 6), '', PAL[1]);
    p.hbars(M, 344, colW, 'Producción por máquina (piezas)', top(data.porMaquina, 'maquina', 6), '', PAL[2]);
    p.hbars(M + colW + 24, 344, colW, 'Producción por operación (piezas)', top(data.porOperacion, 'operacion', 6), '', PAL[3]);

    /* Página 2 */
    d.addPage(); p.header(title, rango);
    p.hbars(M, 96, colW, 'Principales cortes (piezas)', (data.porCorte || []).slice(0, 10).map(function (r) { return { label: String(r.corte == null ? '' : r.corte), value: num(r.piezas) }; }), '', PAL[4]);
    var fe = (data.porFecha || []).slice(-10).map(function (r) { return { label: dmy(r.fecha), value: num(r.piezas) }; });
    p.hbars(M + colW + 24, 96, colW, 'Producción por fecha (piezas)', fe, '', PAL[5]);

    var now = new Date();
    p.footers(now.toLocaleDateString('es-MX') + ', ' + now.toLocaleTimeString('es-MX'));
    return p.doc;
  }

  function exportDashboardPdf() {
    var btn = $('pdfBtn');
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) { if (typeof showError === 'function') showError('No se pudo cargar la librería de PDF. Revisa tu conexión a internet e intenta de nuevo.'); return; }
    if (typeof hideError === 'function') hideError();
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF…'; }
    var filters = currentFilters();
    Promise.all([fetchData(), loadLogo()])
      .then(function (r) {
        var doc = build(jsPDF, r[1], r[0], filters);
        var t = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
        doc.save('JV Informe Produccion Costura.pdf');
      })
      .catch(function (e) { if (typeof showError === 'function') showError('No fue posible generar el PDF: ' + (e && e.message ? e.message : e)); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = old; } });
  }

  window.exportDashboardPdf = exportDashboardPdf;
  var b = $('pdfBtn');
  if (b) b.addEventListener('click', exportDashboardPdf);
})();
