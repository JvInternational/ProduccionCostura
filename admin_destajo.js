/**
 * admin_destajo.js  (archivo NUEVO en GitHub, junto a admin.html)
 * Pestañas "Destajo" e "Historial" de Administración (usan el PIN de Gerencia capturado al entrar al módulo):
 * consulta de destajo por rango de fechas, exportación a Excel (.xlsx con formato precargado) y PDF,
 * y consulta del historial de cambios por IP.
 * Usa req(), esc(), show() y money de admin.html; jsPDF 2.5.1 se carga en admin.html.
 */
(function () {
  'use strict';

  var PAL = ['#1f4e79', '#08776b', '#4b5d73', '#7a6a4f', '#355c7d', '#5b6b73'];
  var C = { band: '#0d3b36', teal: '#08776b', text: '#18312d', muted: '#72817e', line: '#dfe7e4', card: '#f7faf9', track: '#e7eeec' };
  var nf = new Intl.NumberFormat('es-MX');
  var money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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
      this.color(C.text); this.font(8, true); d.text(typeof unit === 'function' ? unit(r.value) : nf.format(r.value) + (unit || ''), x + w, cy + 3, { align: 'right' });
      this.color(C.muted); this.font(7, false); d.text((r.value * 100 / total).toFixed(1) + '%', x + w - 52, cy + 3, { align: 'right' });
    }
    return y + rows.length * rowH;
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


  /* ---------- Excel (.xlsx propio, sin librerías) ---------- */

  var CRC = (function () {
    var t = [], n, c, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  /** ZIP sin compresión. files: [{name, data(string)}] -> Uint8Array */
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >> 8) & 255]; }
    function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += local.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) {
      var h = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      parts.push(new Uint8Array(h), c.name);
      cdSize += h.length + c.name.length;
    });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0))));
    var total = parts.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(total), pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function xesc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function unit(x) { return x.costoUnitario != null ? num(x.costoUnitario) : (num(x.operaciones) ? num(x.costo) / num(x.operaciones) : 0); }
  function colL(i) { return String.fromCharCode(65 + i); }

  /* estilos: 0 normal, 1 título, 2 subtítulo, 3 encabezado, 4 texto, 5 entero, 6 moneda, 7 %, 8 total texto, 9 total entero, 10 total moneda, 11 total %, 12 etiqueta, 13 valor KPI moneda, 14 valor KPI entero */
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
    '<fonts count="7">' +
    '<font><sz val="10"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="9"/><color rgb="FF72817E"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF18312D"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="8"/><color rgb="FF72817E"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><color rgb="FF0B2926"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0D3B36"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF08776B"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF1EF"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFDFE7E4"/></left><right style="thin"><color rgb="FFDFE7E4"/></right><top style="thin"><color rgb="FFDFE7E4"/></top><bottom style="thin"><color rgb="FFDFE7E4"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="15">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="3" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '<xf numFmtId="3" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /** Hoja: cells = [{r, c, v, s, f}] ; opts {widths, merges, freeze, filter, heights} */
  function sheetXml(cells, o) {
    var byRow = {};
    cells.forEach(function (c) { (byRow[c.r] = byRow[c.r] || []).push(c); });
    var rows = Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; }).map(function (r) {
      var h = o.heights && o.heights[r] ? ' ht="' + o.heights[r] + '" customHeight="1"' : '';
      return '<row r="' + r + '"' + h + '>' + byRow[r].sort(function (a, b) { return a.c - b.c; }).map(function (c) {
        var ref = colL(c.c) + r, s = ' s="' + (c.s || 0) + '"';
        if (c.v == null && !c.f) return '<c r="' + ref + '"' + s + '/>';
        if (typeof c.v === 'number' || (c.f && typeof c.v !== 'string')) return '<c r="' + ref + '"' + s + '>' + (c.f ? '<f>' + xesc(c.f) + '</f>' : '') + '<v>' + (Number(c.v) || 0) + '</v></c>';
        return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(c.v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    var pane = o.freeze ? '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="' + o.freeze + '" topLeftCell="A' + (o.freeze + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' + pane + '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + o.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
      '<sheetData>' + rows + '</sheetData>' +
      (o.filter ? '<autoFilter ref="' + o.filter + '"/>' : '') +
      (o.merges && o.merges.length ? '<mergeCells count="' + o.merges.length + '">' + o.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }

  function buildXlsx(d) {
    var ops = d.operadores || [], n = ops.length;
    var rango = 'Rango de fechas: ' + dmy(d.desde) + ' - ' + dmy(d.hasta);
    var now = new Date();
    var cells = [], H = 7, first = H + 1, last = H + n, tot = last + 1;
    function put(r, c, v, s, f) { cells.push({ r: r, c: c, v: v, s: s, f: f }); }
    for (var i = 0; i < 6; i++) put(1, i, i ? null : 'JV INTERNATIONAL SOLUTIONS INC. · INFORME DE DESTAJO', 1);
    put(2, 0, rango, 2); put(3, 0, 'Generado: ' + now.toLocaleDateString('es-MX') + ' ' + now.toLocaleTimeString('es-MX') + ' · Solo Gerencia General', 2);
    put(4, 0, 'COSTO DE DESTAJO', 12); put(4, 2, 'OPERACIONES REALIZADAS', 12); put(4, 4, 'OPERADORES', 12);
    put(5, 0, d.total.costo, 13, 'D' + tot); put(5, 2, d.total.operaciones, 14, 'C' + tot); put(5, 4, d.total.operadores, 14, 'COUNTA(A' + first + ':A' + Math.max(first, last) + ')');
    ['Operador', 'Registros', 'Operaciones realizadas', 'Costo de destajo', '% del costo', 'Costo promedio por operación'].forEach(function (h, c) { put(H, c, h, 3); });
    ops.forEach(function (o, k) {
      var r = first + k;
      put(r, 0, o.personal, 4); put(r, 1, o.registros, 5); put(r, 2, o.operaciones, 5); put(r, 3, o.costo, 6);
      put(r, 4, d.total.costo ? o.costo / d.total.costo : 0, 7, 'IF($D$' + tot + '=0,0,D' + r + '/$D$' + tot + ')');
      put(r, 5, o.operaciones ? o.costo / o.operaciones : 0, 6, 'IF(C' + r + '=0,0,D' + r + '/C' + r + ')');
    });
    var rng = function (c) { return n ? 'SUM(' + c + first + ':' + c + last + ')' : '0'; };
    put(tot, 0, 'TOTAL', 8); put(tot, 1, d.total.registros, 9, rng('B')); put(tot, 2, d.total.operaciones, 9, rng('C')); put(tot, 3, d.total.costo, 10, rng('D'));
    put(tot, 4, n ? 1 : 0, 11, n ? rng('E') : '0'); put(tot, 5, d.total.operaciones ? d.total.costo / d.total.operaciones : 0, 10, 'IF(C' + tot + '=0,0,D' + tot + '/C' + tot + ')');
    var s1 = sheetXml(cells, { widths: [34, 12, 22, 20, 14, 26], merges: ['A1:F1', 'A2:F2', 'A3:F3'], freeze: H, heights: { 1: 30, 7: 32 } });

    var c2 = [], r2 = 5;
    function put2(r, c, v, s, f) { c2.push({ r: r, c: c, v: v, s: s, f: f }); }
    for (var j = 0; j < 6; j++) put2(1, j, j ? null : 'DETALLE POR OPERADOR Y OPERACIÓN', 1);
    put2(2, 0, rango, 2); put2(3, 0, 'Generado: ' + now.toLocaleDateString('es-MX') + ' ' + now.toLocaleTimeString('es-MX'), 2);
    ['Operador', 'Operación', 'Costo unitario', 'Registros', 'Operaciones realizadas', 'Costo de destajo'].forEach(function (h, c) { put2(4, c, h, 3); });
    ops.forEach(function (o) { o.detalle.forEach(function (x) {
      put2(r2, 0, o.personal, 4); put2(r2, 1, x.operacion, 4); put2(r2, 2, unit(x), 6); put2(r2, 3, x.registros, 5); put2(r2, 4, x.operaciones, 5); put2(r2, 5, x.costo, 6); r2++;
    }); });
    var l2 = r2 - 1, t2 = r2, sum2 = function (c) { return l2 >= 5 ? 'SUM(' + c + '5:' + c + l2 + ')' : '0'; };
    put2(t2, 0, 'TOTAL', 8); put2(t2, 1, null, 8); put2(t2, 2, null, 8); put2(t2, 3, d.total.registros, 9, sum2('D')); put2(t2, 4, d.total.operaciones, 9, sum2('E')); put2(t2, 5, d.total.costo, 10, sum2('F'));
    var s2 = sheetXml(c2, { widths: [34, 34, 16, 12, 22, 20], merges: ['A1:F1', 'A2:F2', 'A3:F3'], freeze: 4, filter: l2 >= 5 ? 'A4:F' + l2 : null, heights: { 1: 30, 4: 32 } });

    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Destajo por operador" sheetId="1" r:id="rId1"/><sheet name="Detalle por operación" sheetId="2" r:id="rId2"/></sheets><definedNames>' + '<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">\'Detalle por operación\'!$A$4:$F$' + Math.max(5, l2) + '</definedName></definedNames></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: STYLES },
      { name: 'xl/worksheets/sheet1.xml', data: s1 },
      { name: 'xl/worksheets/sheet2.xml', data: s2 }
    ];
    if (l2 < 5) files[2].data = files[2].data.replace(/<definedNames>.*<\/definedNames>/, '');
    return zip(files);
  }

  function download(bytes, name, type) {
    var blob = new Blob([bytes], { type: type }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function fname(d, ext) { return 'JV Destajo ' + d.desde + ' a ' + d.hasta + '.' + ext; }

  /* ---------- PDF (misma estructura que el Informe Producción Costura) ---------- */

  function buildPdf(jsPDF, logo, d) {
    var p = new Pdf(jsPDF, logo), doc = p.doc, M = p.M, W = p.W, H = p.H;
    var ops = d.operadores || [], t = d.total || {};
    var title = 'Informe de Destajo';
    var rango = 'Rango de fechas: ' + dmy(d.desde) + ' - ' + dmy(d.hasta);
    var colW = (W - 2 * M - 24) / 2, cw = (W - 2 * M - 3 * 12) / 4;
    function cx(i) { return M + i * (cw + 12); }
    var fm = function (v) { return money.format(v); };

    p.header(title, rango);
    p.color(C.muted); p.font(8.5, false);
    doc.text(p.fit('Sección de uso exclusivo de Gerencia General. Las operaciones realizadas son las piezas capturadas por operación; el costo es el costo de destajo.', W - 2 * M), M, 82);
    var lead = ops[0];
    p.card(cx(0), 96, cw, 62, 'Costo de destajo', fm(num(t.costo)), 'Total del rango');
    p.card(cx(1), 96, cw, 62, 'Operaciones realizadas', nf.format(num(t.operaciones)), nf.format(num(t.registros)) + ' registros');
    p.card(cx(2), 96, cw, 62, 'Operadores', nf.format(num(t.operadores)), 'Con producción en el rango');
    p.card(cx(3), 96, cw, 62, 'Mayor destajo', lead ? fm(lead.costo) : '—', lead ? lead.personal : 'Sin datos');

    /* tablas con paginación */
    var rowH = 17, bottom = H - 44;
    function paged(titleT, head, cols, rows, totalRow, onFirstPage) {
      var y, i = 0, started = false;
      while (i < rows.length || !started) {
        if (onFirstPage && !started) { y = 190; } else { doc.addPage(); p.header(title, rango); y = 96; }
        p.color(C.text); p.font(11, true); doc.text(titleT + (started ? ' (continuación)' : ''), M, y);
        started = true; y += 8;
        p.fill('#eaf1ef'); doc.rect(M, y, W - 2 * M, rowH, 'F'); p.color('#3f5550'); p.font(7.5, true);
        head.forEach(function (h, k) { var c = cols[k]; doc.text(h.toUpperCase(), c.right ? c.x + c.w - 6 : c.x + 6, y + 11.5, { align: c.right ? 'right' : 'left' }); });
        y += rowH;
        var n = 0;
        while (i < rows.length && y + rowH <= bottom - (i === rows.length - 1 ? rowH : 0)) {
          if (n % 2) { p.fill('#f7faf9'); doc.rect(M, y, W - 2 * M, rowH, 'F'); }
          p.color(C.text); p.font(8, false);
          rows[i].forEach(function (cell, k) { var c = cols[k]; doc.text(p.fit(cell, c.w - 12), c.right ? c.x + c.w - 6 : c.x + 6, y + 11.5, { align: c.right ? 'right' : 'left' }); });
          y += rowH; i++; n++;
        }
        if (i >= rows.length) {
          p.fill('#eaf1ef'); doc.rect(M, y, W - 2 * M, rowH, 'F'); p.color(C.text); p.font(8, true);
          totalRow.forEach(function (cell, k) { var c = cols[k]; doc.text(p.fit(cell, c.w - 12), c.right ? c.x + c.w - 6 : c.x + 6, y + 11.5, { align: c.right ? 'right' : 'left' }); });
          y += rowH; p.stroke(C.line); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
          break;
        }
      }
    }
    var tw = W - 2 * M;
    var c1 = [{ x: M, w: 270 }, { x: M + 270, w: 100, right: 1 }, { x: M + 370, w: 130, right: 1 }, { x: M + 500, w: 150, right: 1 }, { x: M + 650, w: tw - 650, right: 1 }];
    paged('Destajo por operador', ['Operador', 'Registros', 'Operaciones', 'Costo de destajo', '% del costo'], c1,
      ops.map(function (o) { return [o.personal, nf.format(o.registros), nf.format(o.operaciones), fm(o.costo), (t.costo ? o.costo * 100 / t.costo : 0).toFixed(1) + '%']; }),
      ['TOTAL', nf.format(num(t.registros)), nf.format(num(t.operaciones)), fm(num(t.costo)), ops.length ? '100.0%' : '0.0%'], true);
    var det = [];
    ops.forEach(function (o) { o.detalle.forEach(function (x) { det.push([o.personal, x.operacion, fm(unit(x)), nf.format(x.registros), nf.format(x.operaciones), fm(x.costo)]); }); });
    var c2 = [{ x: M, w: 190 }, { x: M + 190, w: 210 }, { x: M + 400, w: 100, right: 1 }, { x: M + 500, w: 80, right: 1 }, { x: M + 580, w: 100, right: 1 }, { x: M + 680, w: tw - 680, right: 1 }];
    paged('Detalle por operador y operación', ['Operador', 'Operación', 'Costo unitario', 'Registros', 'Operaciones', 'Costo'], c2, det,
      ['TOTAL', '', '', nf.format(num(t.registros)), nf.format(num(t.operaciones)), fm(num(t.costo))]);

    var now = new Date();
    p.footers(now.toLocaleDateString('es-MX') + ', ' + now.toLocaleTimeString('es-MX'));
    return doc;
  }

  /* ---------- Interfaz ---------- */

  var S = { data: null };

  function g(id) { return document.getElementById(id); }
  function iso(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
  function msg(t, ok) { if (typeof show === 'function') show(t, ok); }
  function pin() { return window.JVGate ? JVGate.pin() : ''; }
  function badPin(e) { if (/PIN de Gerencia|no está configurado/i.test(e.message) && window.JVGate) { JVGate.lock(e.message); return true; } return false; }

  function renderData(d) {
    S.data = d;
    var t = d.total, ops = d.operadores;
    g('dz-k-costo').textContent = money.format(t.costo);
    g('dz-k-ops').textContent = nf.format(t.operaciones);
    g('dz-k-reg').textContent = nf.format(t.registros);
    g('dz-k-opr').textContent = nf.format(t.operadores);
    g('dz-rows').innerHTML = ops.map(function (o, i) {
      var pct = t.costo ? o.costo * 100 / t.costo : 0;
      var det = o.detalle.map(function (x) {
        return '<tr class="dz-d" data-g="' + i + '" hidden><td>' + esc(x.operacion) + ' · ' + money.format(unit(x)) + ' c/u</td><td class="num">' + nf.format(x.registros) + '</td><td class="num">' + nf.format(x.operaciones) + '</td><td class="num">' + money.format(x.costo) + '</td><td></td></tr>';
      }).join('');
      return '<tr class="dz-o"><td><button type="button" class="dz-t" data-i="' + i + '" aria-expanded="false">▸</button> <b>' + esc(o.personal) + '</b></td><td class="num">' + nf.format(o.registros) + '</td><td class="num">' + nf.format(o.operaciones) + '</td><td class="num">' + money.format(o.costo) + '</td><td class="num">' + pct.toFixed(1) + '%</td></tr>' + det;
    }).join('');
    g('dz-foot').innerHTML = '<td><b>TOTAL</b></td><td class="num"><b>' + nf.format(t.registros) + '</b></td><td class="num"><b>' + nf.format(t.operaciones) + '</b></td><td class="num"><b>' + money.format(t.costo) + '</b></td><td class="num"><b>' + (ops.length ? '100.0%' : '0.0%') + '</b></td>';
    g('dz-empty').hidden = !!ops.length;
    g('dz-range').textContent = dmy(d.desde) + ' - ' + dmy(d.hasta);
    document.querySelectorAll('#dz-rows .dz-t').forEach(function (b) {
      b.onclick = function () {
        var open = b.getAttribute('aria-expanded') !== 'true';
        document.querySelectorAll('#dz-rows tr[data-g="' + b.dataset.i + '"]').forEach(function (r) { r.hidden = !open; });
        b.textContent = open ? '▾' : '▸'; b.setAttribute('aria-expanded', open);
      };
    });
  }

  function query() {
    var desde = g('dz-desde').value, hasta = g('dz-hasta').value;
    if (!desde || !hasta) { msg('Selecciona la fecha desde y la fecha hasta.', false); return Promise.resolve(false); }
    if (desde > hasta) { msg('La fecha desde no puede ser posterior a la fecha hasta.', false); return Promise.resolve(false); }
    g('dz-go').disabled = true;
    return req('destajo', { gpin: pin(), fechaDesde: desde, fechaHasta: hasta }).then(function (r) {
      renderData(r.destajo); msg('Consulta lista.', true); return true;
    }).catch(function (e) {
      if (!badPin(e)) msg(e.message, false);
      return false;
    }).then(function (ok) { g('dz-go').disabled = false; return ok; });
  }

  function exportXlsx() {
    if (!S.data) return msg('Primero consulta un rango de fechas.', false);
    try { download(buildXlsx(S.data), fname(S.data, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); msg('Excel generado.', true); }
    catch (e) { msg('No fue posible generar el Excel: ' + e.message, false); }
  }

  function exportPdf() {
    if (!S.data) return msg('Primero consulta un rango de fechas.', false);
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) return msg('No se pudo cargar la librería de PDF. Revisa tu conexión a internet e intenta de nuevo.', false);
    var b = g('dz-pdf'), old = b.textContent; b.disabled = true; b.textContent = 'Generando PDF…';
    loadLogo().then(function (logo) { buildPdf(jsPDF, logo, S.data).save(fname(S.data, 'pdf')); msg('PDF generado.', true); })
      .catch(function (e) { msg('No fue posible generar el PDF: ' + (e && e.message ? e.message : e), false); })
      .then(function () { b.disabled = false; b.textContent = old; });
  }

  /* ---------- Historial de cambios (por IP) ---------- */

  function renderHist(h) {
    g('hs-rows').innerHTML = h.registros.map(function (r) {
      return '<tr><td>' + dmy(r.fecha) + ' ' + esc(r.hora) + '</td><td><b>' + esc(r.ip) + '</b></td><td>' + esc(r.modulo) + '</td><td>' + esc(r.accion) + '</td><td style="word-break:break-word">' + esc(r.detalle) + '</td></tr>';
    }).join('');
    g('hs-empty').hidden = !!h.registros.length;
    g('hs-count').textContent = h.total > h.registros.length ? h.registros.length + ' de ' + nf.format(h.total) + ' cambios' : nf.format(h.total) + ' cambios';
    var cur = g('hs-ip').value;
    g('hs-ips').innerHTML = (h.ips || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
    g('hs-ip').value = cur;
  }

  function histQuery() {
    var desde = g('hs-desde').value, hasta = g('hs-hasta').value;
    if (desde && hasta && desde > hasta) return msg('La fecha desde no puede ser posterior a la fecha hasta.', false);
    g('hs-go').disabled = true;
    return req('history', { gpin: pin(), ip: g('hs-ip').value.trim(), fechaDesde: desde, fechaHasta: hasta }).then(function (r) { renderHist(r.historial); })
      .catch(function (e) { if (!badPin(e)) msg(e.message, false); })
      .then(function () { g('hs-go').disabled = false; });
  }

  function init() {
    var now = new Date();
    g('dz-desde').value = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    g('dz-hasta').value = iso(now);
    g('dz-go').addEventListener('click', query);
    g('dz-xlsx').addEventListener('click', exportXlsx);
    g('dz-pdf').addEventListener('click', exportPdf);
    g('hs-go').addEventListener('click', histQuery);
    g('hs-clear').addEventListener('click', function () { g('hs-ip').value = ''; g('hs-desde').value = ''; g('hs-hasta').value = ''; histQuery(); });
  }

  window.Destajo = { init: init, open: function () { if (!S.data) query(); }, reset: function () { S.data = null; }, _buildXlsx: buildXlsx };
  window.Historial = { open: histQuery };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
