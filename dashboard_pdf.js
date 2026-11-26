/**
 * dashboard_pdf.js  (archivo NUEVO en GitHub, junto a dashboard.html)
 * Informe ejecutivo en PDF (A4 horizontal, una página) con los filtros que estén en pantalla.
 * Un día: desglose por operador / operación / estilo. Varios días: detalle por fecha. Un mes o más: detalle por semana
 * (por mes si el rango pasa de ~3 meses). Marca días sin producción (rojo cenizo) y feriados (gris azulado, se administran en Administración > Feriados).
 * Requiere jsPDF 2.5.1 (se carga desde cdnjs en dashboard.html) y usa API_URL / params() del dashboard.
 */
(function () {
  'use strict';

  var PAL = { piezas: '#1f5f8b', costo: '#7a6a4f', ops: '#08776b', estilos: '#44546a' }; /* un tono sobrio por gráfica */
  var ASH = '#a8625c', ASH_T = '#f6e9e7', HOL = '#5d7391', HOL_T = '#e8edf4'; /* días sin producción (rojo cenizo) y feriados (gris azulado) */
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DOW3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], DOW1 = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
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

  /** Barras horizontales con valor y % del total. rows: [{label, value}]; fmtFn opcional para el valor. */
  Pdf.prototype.hbars = function (x, y, w, title, rows, unit, color, fmtFn) {
    var d = this.doc, rowH = 21, labelW = 118, valueW = 92;
    var fmt = fmtFn || function (v) { return nf.format(v) + (unit || ''); };
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
      this.fill(color); d.roundedRect(trackX, cy - 3, bw, 7, 3.5, 3.5, 'F');
      this.color(C.text); this.font(8, true); d.text(fmt(r.value), x + w, cy + 3, { align: 'right' });
      this.color(C.muted); this.font(7, false); d.text((r.value * 100 / total).toFixed(1) + '%', x + w - 62, cy + 3, { align: 'right' });
    }
    return y + rows.length * rowH;
  };

  /**
   * Columnas verticales por fecha / semana / mes.
   * items: [{ l1, l2, v, kind: 'ok'|'zero'|'hol', holWithData, notes: [[texto, color]] }]
   */
  Pdf.prototype.cols = function (x, y, w, h, title, items, color, fmtV) {
    var d = this.doc, n = items.length;
    this.color(C.text); this.font(11, true); d.text(title, x, y);
    if (!n) { this.color(C.muted); this.font(9, false); d.text('Sin datos', x, y + 28); return; }
    var noteRows = 0;
    items.forEach(function (it) { noteRows = Math.max(noteRows, (it.notes || []).length); });
    var slot = w / n, bw = Math.min(slot * 0.62, 38), narrow = slot < 24;
    var top = y + 16, base = y + h - 24 - noteRows * 8.5 - 4;
    var max = Math.max.apply(null, items.map(function (i) { return i.v; })) || 1;
    var ph = base - top - 8;
    for (var i = 0; i < n; i++) {
      var it = items[i], cx = x + slot * i + slot / 2, bx = cx - bw / 2;
      if (it.kind === 'zero' || it.kind === 'hol') {
        var zc = it.kind === 'zero' ? ASH : HOL;
        this.fill(it.kind === 'zero' ? ASH_T : HOL_T); d.roundedRect(x + slot * i + 1, top - 6, slot - 2, base - top + 8, 2.5, 2.5, 'F');
        this.fill(zc); d.rect(bx, base - 2, bw, 2, 'F');
        this.color(zc); this.font(narrow || it.kind === 'zero' ? 7.5 : 6.5, true);
        d.text(it.kind === 'zero' ? fmtV(0, narrow) : (slot >= 30 ? 'Feriado' : 'F'), cx, base - 7, { align: 'center' });
      } else {
        var bh = Math.max(1.5, ph * it.v / max);
        this.fill(color); d.rect(bx, base - bh, bw, bh, 'F');
        this.color(C.text); this.font(narrow ? 6 : 7, false);
        d.text(fmtV(it.v, narrow), cx, base - bh - 2.5, { align: 'center' });
      }
      var lc = it.kind === 'zero' ? ASH : (it.kind === 'hol' || it.holWithData ? HOL : C.muted), bold = it.kind !== 'ok' || it.holWithData;
      this.color(lc); this.font(narrow ? 6.5 : 7.5, bold); d.text(it.l1, cx, base + 10, { align: 'center' });
      if (it.l2) { this.color(C.muted); this.font(narrow ? 5.5 : 6.5, false); d.text(it.l2, cx, base + 19, { align: 'center' }); }
      (it.notes || []).forEach(function (nt, j) { this.color(nt[1]); this.font(6.5, true); d.text(nt[0], cx, base + 29 + j * 8.5, { align: 'center' }); }, this);
    }
    this.stroke(C.line); d.setLineWidth(0.5); d.line(x, base, x + w, base);
  };

  /** Texto con tramos de distinto estilo en una línea. runs: [{t, bold, color}] */
  Pdf.prototype.runs = function (x, y, runs) {
    var d = this.doc;
    runs.forEach(function (r) {
      this.color(r.color || C.muted); this.font(8, !!r.bold); d.text(r.t, x, y);
      x += d.getTextWidth(r.t);
    }, this);
  };

  Pdf.prototype.legend = function (xRight, y) {
    var d = this.doc, items = [['Feriado', HOL, HOL_T], ['Día sin producción (0)', ASH, ASH_T]], x = xRight;
    this.font(8, false);
    items.forEach(function (it) {
      var tw = d.getTextWidth(it[0]);
      x -= tw; this.color(C.muted); d.text(it[0], x, y);
      x -= 14; this.fill(it[2]); this.stroke(it[1]); d.setLineWidth(0.7); d.roundedRect(x, y - 7, 9, 9, 1.5, 1.5, 'FD');
      x -= 14;
    }, this);
  };

  /* ---------- Informe ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseIso(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }
  function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }

  /** Un renglón por día natural del rango, con producción, feriado y si es lunes-viernes. */
  function buildDays(data, desde, hasta) {
    var P = {}, O = {}, Cst = {}, H = {};
    (data.porFecha || []).forEach(function (r) { var k = String(r.fecha || '').slice(0, 10); P[k] = (P[k] || 0) + num(r.piezas); Cst[k] = (Cst[k] || 0) + num(r.costo); });
    (data.porFechaOps || []).forEach(function (r) { var k = String(r.fecha || '').slice(0, 10); O[k] = (O[k] || 0) + num(r.operaciones); });
    (data.feriados || []).forEach(function (h) { H[String(h.fecha || '').slice(0, 10)] = h.descripcion || 'Feriado'; });
    var days = [], s = parseIso(desde), e = parseIso(hasta);
    if (!s || !e || e < s) return days;
    for (var i = 0; i < 800; i++) {
      var d = addDays(s, i);
      if (d > e) break;
      var k = isoOf(d), wd = d.getDay();
      days.push({ iso: k, date: d, weekday: wd >= 1 && wd <= 5, hol: H.hasOwnProperty(k), p: P[k] || 0, o: O[k] || 0, c: Cst[k] || 0, has: (P[k] || 0) > 0 || (O[k] || 0) > 0 || (Cst[k] || 0) > 0 });
    }
    return days;
  }

  function dayKind(d) { return d.has ? 'ok' : (d.hol ? 'hol' : 'zero'); }

  /** Lunes a viernes que se muestran; sábado y domingo solo si tuvieron producción (para que las barras sumen el total). */
  function shown(days) { return days.filter(function (d) { return d.weekday || d.has; }); }

  function dayCounts(days) {
    var lab = days.filter(function (d) { return d.weekday && !d.hol; });
    var con = lab.filter(function (d) { return d.has; }).length;
    return { lab: lab.length, con: con, sin: lab.length - con, hol: days.filter(function (d) { return d.weekday && d.hol; }).length };
  }

  function rangeLabel(a, b) {
    return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
      ? (a.getDate() === b.getDate() ? a.getDate() + ' ' + MES[a.getMonth()] : a.getDate() + '–' + b.getDate() + ' ' + MES[a.getMonth()])
      : a.getDate() + ' ' + MES[a.getMonth()] + '–' + b.getDate() + ' ' + MES[b.getMonth()];
  }

  function groupNotes(group) {
    var c = dayCounts(group), notes = [];
    if (c.sin) notes.push([c.sin + (c.sin === 1 ? ' día sin prod.' : ' días sin prod.'), ASH]);
    if (c.hol) notes.push([c.hol + (c.hol === 1 ? ' feriado' : ' feriados'), HOL]);
    return notes;
  }

  /** Series [{l1, l2, v, kind, notes}] por fecha, semana o mes. field: p | o | c */
  function series(days, mode, field, wide) {
    if (mode === 'fecha') {
      return shown(days).map(function (d) {
        return { l1: wide ? pad2(d.date.getDate()) + '/' + pad2(d.date.getMonth() + 1) : String(d.date.getDate()), l2: wide ? DOW3[d.date.getDay()] : DOW1[d.date.getDay()], v: d[field], kind: dayKind(d), holWithData: d.hol && d.has };
      });
    }
    var groups = [], idx = {};
    days.forEach(function (d) {
      var key = mode === 'semana' ? isoOf(mondayOf(d.date)) : d.date.getFullYear() + '-' + pad2(d.date.getMonth() + 1);
      if (!idx.hasOwnProperty(key)) { idx[key] = groups.length; groups.push({ key: key, days: [] }); }
      groups[idx[key]].days.push(d);
    });
    return groups.filter(function (g) { return shown(g.days).length; }).map(function (g) {
      var sh = shown(g.days), ref = sh.length ? sh : g.days, first = ref[0].date, last = ref[ref.length - 1].date;
      var v = g.days.reduce(function (s, d) { return s + d[field]; }, 0);
      var it = mode === 'semana'
        ? { l1: 'Sem ' + isoWeek(first), l2: rangeLabel(first, last) }
        : { l1: MES[first.getMonth()].charAt(0).toUpperCase() + MES[first.getMonth()].slice(1) + ' ' + first.getFullYear(), l2: '' };
      it.v = v; it.kind = v > 0 ? 'ok' : 'zero'; it.notes = groupNotes(g.days);
      return it;
    });
  }

  function top(list, labelKey, field, n) {
    return (list || []).slice().sort(function (a, b) { return num(b[field]) - num(a[field]); }).slice(0, n).map(function (r) { return { label: String(r[labelKey] == null ? '' : r[labelKey]), value: num(r[field]) }; });
  }

  function build(jsPDF, logo, data, filters) {
    var p = new Pdf(jsPDF, logo), d = p.doc, M = p.M, W = p.W, H = p.H;
    var k = data.kpis || {};
    var fechas = (data.porFecha || []).map(function (r) { return String(r.fecha || '').slice(0, 10); }).filter(Boolean).sort();
    var desde = ($('desde') && $('desde').value) || fechas[0] || '';
    var hasta = ($('hasta') && $('hasta').value) || fechas[fechas.length - 1] || '';
    if (desde && !hasta) hasta = fechas[fechas.length - 1] || desde;
    if (hasta && !desde) desde = fechas[0] || hasta;
    var s = parseIso(desde), e = parseIso(hasta);
    var nDays = s && e && e >= s ? Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - new Date(s.getFullYear(), s.getMonth(), s.getDate())) / 86400000) + 1 : 0;
    var mode = nDays <= 1 ? 'dia' : (nDays < 28 ? 'fecha' : (nDays <= 92 ? 'semana' : 'mes'));
    var rango;
    if (!s || !e) rango = 'Rango de fechas: sin registros';
    else if (mode === 'dia') rango = 'Fecha: ' + dmy(desde);
    else if (s.getDate() === 1 && e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear() && e.getDate() === new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate())
      rango = 'Mes: ' + MES_L[s.getMonth()] + ' ' + s.getFullYear() + ' (' + dmy(desde) + ' - ' + dmy(hasta) + ')';
    else rango = 'Rango de fechas: ' + dmy(desde) + ' - ' + dmy(hasta);
    var title = 'Informe Producción Costura';
    p.header(title, rango);

    var days = mode === 'dia' ? [] : buildDays(data, desde, hasta);
    var ops = k.operacionesRealizadas !== undefined ? k.operacionesRealizadas : k.piezas;
    var noProg = num(k.cortesSinPrograma);

    /* Línea de resumen / leyenda */
    var ly = 83;
    if (mode === 'semana' || mode === 'mes') {
      var c = dayCounts(days);
      p.runs(M, ly, [{ t: 'Días laborables: ' }, { t: String(c.lab), bold: true, color: C.text }, { t: '   ·   Con producción: ' }, { t: String(c.con), bold: true, color: C.text },
        { t: '   ·   Sin producción: ', color: ASH, bold: true }, { t: String(c.sin), bold: true, color: ASH }, { t: '   ·   Feriados: ', color: HOL, bold: true }, { t: String(c.hol), bold: true, color: HOL }]);
    }
    if (mode !== 'dia') p.legend(W - M, ly);

    var top0 = mode === 'dia' ? 82 : 94, gap = 12, pw = (W - 2 * M - 18) / 2, ph = (H - 40 - top0 - gap) / 2;
    function px(i) { return M + (i % 2) * (pw + 18); }
    function py(i) { return top0 + Math.floor(i / 2) * (ph + gap); }
    function panel(i, label, value, note) {
      var x = px(i), y = py(i);
      p.fill('#ffffff'); p.stroke(C.line); d.setLineWidth(0.8); d.roundedRect(x, y, pw, ph, 5, 5, 'FD');
      p.color(C.muted); p.font(7.5, false); d.text(String(label).toUpperCase(), x + 14, y + 17);
      p.color(C.text); p.font(21, true); d.text(p.fit(value, pw - 28), x + 14, y + 41);
      p.color(C.muted); p.font(7.5, false); d.text(p.fit(note, pw - 28), x + 14, y + 53);
      p.stroke(C.line); d.setLineWidth(0.6); d.line(x + 14, y + 60, x + pw - 14, y + 60);
      return { x: x + 14, y: y + 76, w: pw - 28, h: ph - 76 - 6 };
    }
    var moneyRound = function (v, narrow) { return '$' + nf.format(Math.round(v)).replace(narrow ? /,/g : /^$/, ''); };
    var intV = function (v, narrow) { var r = Math.round(v); return narrow ? String(r) : nf.format(r); };
    var costV = function (v, narrow) { return moneyRound(v, narrow); };

    var a = panel(0, 'Piezas', nf.format(num(k.piezas)), noProg ? 'Piezas trabajadas · ' + noProg + ' corte(s) sin programa' : 'Piezas trabajadas');
    var b = panel(1, 'Costo total', money.format(num(k.costoTotal)), 'Costo de destajo');
    var o = panel(2, 'Operaciones', nf.format(num(ops)), 'Operaciones realizadas');
    var st = panel(3, 'Estilos', nf.format(num(k.estilos)), 'Estilos trabajados');

    if (mode === 'dia') {
      p.hbars(a.x, a.y, a.w, 'Piezas por operador', top(data.porOperador, 'operador', 'piezas', 6), '', PAL.piezas);
      p.hbars(b.x, b.y, b.w, 'Costo de destajo por operador', top(data.porOperador, 'operador', 'costo', 6), '', PAL.costo, function (v) { return money.format(v); });
      p.hbars(o.x, o.y, o.w, 'Operaciones por tipo de operación', top(data.porOperacion, 'operacion', 'piezas', 6), '', PAL.ops);
    } else {
      var by = mode === 'fecha' ? 'fecha' : (mode === 'semana' ? 'semana' : 'mes'), wide = mode === 'fecha' && (a.w / Math.max(1, shown(days).length)) >= 30;
      p.cols(a.x, a.y, a.w, a.h, 'Piezas por ' + by, series(days, mode, 'p', wide), PAL.piezas, intV);
      p.cols(b.x, b.y, b.w, b.h, 'Costo de destajo por ' + by, series(days, mode, 'c', wide), PAL.costo, costV);
      p.cols(o.x, o.y, o.w, o.h, 'Operaciones por ' + by, series(days, mode, 'o', wide), PAL.ops, intV);
    }
    p.hbars(st.x, st.y, st.w, 'Piezas por estilo', top(data.porEstilo, 'estilo', 'piezas', 6), '', PAL.estilos);

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
