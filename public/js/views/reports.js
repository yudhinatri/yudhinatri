/* Tampilan Laporan: ringkasan penjualan, produk terlaris, metode bayar, stok menipis. */

import { api } from '../api.js';
import { state } from '../store.js';
import {
  $, esc, rupiah, angka, on, todayISO, addDaysISO, startOfMonthISO,
  namaHariAngka, LABEL_METODE, IKON_METODE, download, tanggalPanjang,
} from '../utils.js';
import { toast } from '../ui.js';

const range = { from: addDaysISO(-6), to: todayISO() };
let current = null;

/* ------------------------------- Template ------------------------------- */

function template() {
  return `
  <div class="toolbar">
    <div class="chips" style="flex:1">
      <button class="chip" data-preset="today">Hari ini</button>
      <button class="chip" data-preset="7">7 hari</button>
      <button class="chip" data-preset="30">30 hari</button>
      <button class="chip" data-preset="month">Bulan ini</button>
    </div>
    <div class="field" style="min-width:145px">
      <label>Dari</label>
      <input class="input" type="date" id="rFrom" value="${range.from}" />
    </div>
    <div class="field" style="min-width:145px">
      <label>Sampai</label>
      <input class="input" type="date" id="rTo" value="${range.to}" />
    </div>
    <div class="field">
      <label>&nbsp;</label>
      <button class="btn btn-ghost" id="btnExportReport">⬇ Ekspor</button>
    </div>
  </div>

  <div id="reportBody"></div>`;
}

/* ------------------------------- Rendering ------------------------------ */

function barChart(days, from, to) {
  if (!days.length) return `<div class="empty" style="padding:26px"><span>Belum ada data harian</span></div>`;

  // Lengkapi hari tanpa transaksi dengan nilai 0 agar tren terbaca utuh.
  const map = new Map(days.map((d) => [d.date, d]));
  const filled = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const key = todayISO(cursor);
    filled.push(map.get(key) || { date: key, sales: 0, profit: 0, trx: 0, items: 0 });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  const series = filled.length ? filled : days;

  const max = Math.max(...series.map((d) => d.sales), 1);
  const peak = series.reduce((a, b) => (b.sales > a.sales ? b : a), series[0]);
  const step = Math.ceil(series.length / 16); // batasi jumlah label agar tidak tumpang tindih

  return `
  <div class="bar-chart">
    ${series
      .map(
        (d, i) => `
      <div class="bar-col ${d.sales > 0 && d.date === peak.date ? 'is-peak' : ''}" title="${d.date}: ${rupiah(d.sales)} • ${d.trx} nota">
        <div class="bar" style="height:${Math.max(d.sales > 0 ? 4 : 2, (d.sales / max) * 100)}%"></div>
        <div class="bar-label">${i % step === 0 ? namaHariAngka(d.date) : ''}</div>
      </div>`,
      )
      .join('')}
  </div>
  <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-3);padding:4px 2px">
    <span>Puncak: <strong style="color:var(--warn)">${peak.date}</strong> (${rupiah(peak.sales)})</span>
    <span>Skala maks: ${rupiah(max)}</span>
  </div>`;
}

function progressList(rows, valueKey, labelKey, formatter = rupiah) {
  if (!rows.length) return `<div class="empty" style="padding:20px"><span>Belum ada data</span></div>`;
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);

  return `<div class="progress-list">
    ${rows
      .map(
        (r) => `
      <div class="progress-item">
        <div class="progress-top">
          <span>${esc(r[labelKey])}</span>
          <span>${formatter(r[valueKey])}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${(r[valueKey] / max) * 100}%"></div></div>
      </div>`,
      )
      .join('')}
  </div>`;
}

function renderReport(root, report) {
  const s = report.summary;
  const body = $('#reportBody', root);

  body.innerHTML = `
    <div class="kpis">
      <div class="kpi accent">
        <div class="kpi-label">💰 Total penjualan</div>
        <div class="kpi-value">${rupiah(s.totalSales)}</div>
        <div class="kpi-sub">${s.transactionCount} transaksi lunas</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">📈 Laba kotor</div>
        <div class="kpi-value">${rupiah(s.totalProfit)}</div>
        <div class="kpi-sub">${s.totalSales ? Math.round((s.totalProfit / s.totalSales) * 100) : 0}% margin</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">👕 Item terjual</div>
        <div class="kpi-value">${angka(s.totalItems)}</div>
        <div class="kpi-sub">pcs</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">🧾 Rata-rata / nota</div>
        <div class="kpi-value">${rupiah(s.avgPerTransaction)}</div>
        <div class="kpi-sub">${report.voidCount || 0} nota void</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">🏷 Total diskon</div>
        <div class="kpi-value">${rupiah(s.totalDiscount)}</div>
        <div class="kpi-sub">item + nota</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:16px;align-items:start">
      <div class="card">
        <div class="card-head"><h3>Tren Penjualan Harian</h3><span class="badge">${report.days.length} hari</span></div>
        <div class="card-body">${barChart(report.days, report.range.from, report.range.to)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Metode Pembayaran</h3></div>
        <div class="card-body">
          ${progressList(report.byMethod.map((m) => ({ ...m, label: LABEL_METODE[m.method] || m.method })), 'total', 'label')}
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:16px;align-items:start">
      <div class="card">
        <div class="card-head"><h3>Penjualan per Kategori</h3></div>
        <div class="card-body">${progressList(report.byCategory, 'sales', 'category')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>⚠️ Stok Menipis</h3><span class="badge badge-warn">${report.lowStock.length}</span></div>
        <div class="card-body" style="padding:0">
          ${
            report.lowStock.length
              ? `<div class="table-wrap"><table class="data" style="min-width:auto">
                  <thead><tr><th>Produk</th><th>Varian</th><th class="num">Stok</th></tr></thead>
                  <tbody>${report.lowStock
                    .map(
                      (p) => `<tr>
                        <td style="font-weight:600">${esc(p.name)}</td>
                        <td style="font-size:12px;color:var(--text-2)">${esc(p.size)} • ${esc(p.color)}</td>
                        <td class="num"><span class="badge ${p.stock <= 0 ? 'badge-danger' : 'badge-warn'}">${p.stock}</span></td>
                      </tr>`,
                    )
                    .join('')}</tbody>
                </table></div>`
              : `<div class="empty" style="padding:26px"><span class="empty-icon">👍</span><strong>Semua stok aman</strong></div>`
          }
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Produk Terlaris</h3><span class="badge">Top ${report.topProducts.length}</span></div>
      <div class="table-wrap">
        ${
          report.topProducts.length
            ? `<table class="data">
                <thead><tr><th>#</th><th>Produk</th><th>Kategori</th><th class="num">Terjual</th><th class="num">Omzet</th><th class="num">Laba</th></tr></thead>
                <tbody>${report.topProducts
                  .map(
                    (p, i) => `<tr>
                      <td style="font-weight:700;color:var(--text-3)">${i + 1}</td>
                      <td>
                        <div style="font-weight:600">${esc(p.name)}</div>
                        <div style="font-size:11.5px;color:var(--text-3)">${esc(p.sku)} • ${esc(p.size)} • ${esc(p.color)}</div>
                      </td>
                      <td><span class="badge">${esc(p.category)}</span></td>
                      <td class="num" style="font-weight:700">${p.qty}</td>
                      <td class="num">${rupiah(p.sales)}</td>
                      <td class="num" style="color:var(--ok);font-weight:600">${rupiah(p.profit)}</td>
                    </tr>`,
                  )
                  .join('')}</tbody>
              </table>`
            : `<div class="empty"><span class="empty-icon">📦</span><strong>Belum ada produk terjual</strong></div>`
        }
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Rincian Harian</h3></div>
      <div class="table-wrap">
        ${
          report.days.length
            ? `<table class="data">
                <thead><tr><th>Tanggal</th><th class="num">Nota</th><th class="num">Item</th><th class="num">Penjualan</th><th class="num">Laba</th></tr></thead>
                <tbody>${[...report.days]
                  .reverse()
                  .map(
                    (d) => `<tr>
                      <td>${tanggalPanjang(`${d.date}T00:00:00`)}</td>
                      <td class="num">${d.trx}</td>
                      <td class="num">${d.items}</td>
                      <td class="num" style="font-weight:600">${rupiah(d.sales)}</td>
                      <td class="num" style="color:var(--ok)">${rupiah(d.profit)}</td>
                    </tr>`,
                  )
                  .join('')}</tbody>
              </table>`
            : `<div class="empty"><span class="empty-icon">📅</span><strong>Tidak ada data pada rentang ini</strong></div>`
        }
      </div>
    </div>`;
}

/* --------------------------------- Muat --------------------------------- */

async function load(root) {
  try {
    const { report } = await api.report(range.from, range.to);
    current = report;
    renderReport(root, report);
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* -------------------------------- Ekspor -------------------------------- */

function exportReport() {
  if (!current) return;
  const lines = [
    `Laporan Penjualan;${state.settings.storeName}`,
    `Periode;${current.range.from};${current.range.to}`,
    '',
    'Ringkasan',
    `Total penjualan;${current.summary.totalSales}`,
    `Laba kotor;${current.summary.totalProfit}`,
    `Jumlah transaksi;${current.summary.transactionCount}`,
    `Item terjual;${current.summary.totalItems}`,
    `Total diskon;${current.summary.totalDiscount}`,
    '',
    'Produk Terlaris',
    'SKU;Nama;Kategori;Ukuran;Warna;Terjual;Omzet;Laba',
    ...current.topProducts.map((p) =>
      [p.sku, p.name, p.category, p.size, p.color, p.qty, p.sales, p.profit].join(';'),
    ),
    '',
    'Rincian Harian',
    'Tanggal;Nota;Item;Penjualan;Laba',
    ...current.days.map((d) => [d.date, d.trx, d.items, d.sales, d.profit].join(';')),
  ];

  download(`laporan-${range.from}_${range.to}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Laporan diekspor ke CSV', 'ok');
}

/* ------------------------------- View utama ----------------------------- */

export function reportsView(root) {
  root.innerHTML = template();

  const applyPreset = (preset) => {
    const today = todayISO();
    if (preset === 'today') {
      range.from = today;
      range.to = today;
    } else if (preset === '7') {
      range.from = addDaysISO(-6);
      range.to = today;
    } else if (preset === '30') {
      range.from = addDaysISO(-29);
      range.to = today;
    } else if (preset === 'month') {
      range.from = startOfMonthISO();
      range.to = today;
    }
    $('#rFrom', root).value = range.from;
    $('#rTo', root).value = range.to;
    markPreset(root, preset);
    load(root);
  };

  const markPreset = (root, active) => {
    root.querySelectorAll('[data-preset]').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.preset === active),
    );
  };

  on(root, 'click', '[data-preset]', (e, btn) => applyPreset(btn.dataset.preset));

  $('#rFrom', root).addEventListener('change', (e) => {
    range.from = e.target.value;
    markPreset(root, null);
    load(root);
  });
  $('#rTo', root).addEventListener('change', (e) => {
    range.to = e.target.value;
    markPreset(root, null);
    load(root);
  });
  $('#btnExportReport', root).addEventListener('click', exportReport);

  markPreset(root, '7');
  load(root);

  return () => {};
}
