/* Tampilan Transaksi: riwayat penjualan, detail, cetak ulang, dan void. */

import { api } from '../api.js';
import { state, refreshProducts, refreshSummary } from '../store.js';
import {
  $, esc, rupiah, on, debounce, todayISO, tanggalPendek, jamMenit,
  LABEL_METODE, IKON_METODE, addDaysISO, download,
} from '../utils.js';
import { openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { receiptHTML, printReceipt, printBrowserReceipt } from '../receipt.js';
import { printerService } from '../bluetoothPrinter.js';

const filter = {
  from: addDaysISO(-29),
  to: todayISO(),
  q: '',
  method: '',
};

let cache = [];
let cacheSum = 0;

/* ------------------------------- Template ------------------------------- */

function template() {
  return `
  <div class="toolbar">
    <div class="field" style="min-width:150px">
      <label>Dari tanggal</label>
      <input class="input" type="date" id="fFrom" value="${filter.from}" />
    </div>
    <div class="field" style="min-width:150px">
      <label>Sampai tanggal</label>
      <input class="input" type="date" id="fTo" value="${filter.to}" />
    </div>
    <div class="field" style="min-width:150px">
      <label>Metode</label>
      <select class="select" id="fMethod">
        <option value="">Semua metode</option>
        <option value="cash">Tunai</option>
        <option value="qris">QRIS</option>
        <option value="transfer">Transfer</option>
        <option value="debit">Kartu Debit</option>
        <option value="ewallet">E-Wallet</option>
      </select>
    </div>
    <div class="field" style="flex:1;min-width:200px">
      <label>Cari</label>
      <div class="search-wrap"><input class="input" id="fQ" type="search" placeholder="No. nota, pelanggan, nama produk..." /></div>
    </div>
    <div class="field">
      <label>&nbsp;</label>
      <button class="btn btn-ghost" id="btnToday">Hari ini</button>
    </div>
    <div class="field">
      <label>&nbsp;</label>
      <button class="btn btn-ghost" id="btnExport">⬇ CSV</button>
    </div>
  </div>

  <div class="kpis" id="trxKpi"></div>

  <div class="card">
    <div class="card-head">
      <h3>Riwayat Transaksi</h3>
      <span class="badge" id="trxCount">0</span>
    </div>
    <div class="table-wrap"><div id="trxBox"></div></div>
  </div>`;
}

/* --------------------------------- Data --------------------------------- */

async function load(root) {
  try {
    const { transactions, total, sum } = await api.listTransactions({
      from: filter.from,
      to: filter.to,
      q: filter.q,
    });

    cache = filter.method ? transactions.filter((t) => t.method === filter.method) : transactions;
    cacheSum = cache.filter((t) => t.status === 'paid').reduce((s, t) => s + t.total, 0);

    const paid = cache.filter((t) => t.status === 'paid');
    const voided = cache.filter((t) => t.status === 'void');
    const profit = paid.reduce((s, t) => s + t.profit, 0);

    $('#trxKpi', root).innerHTML = `
      <div class="kpi accent">
        <div class="kpi-label">Total penjualan</div>
        <div class="kpi-value">${rupiah(cacheSum)}</div>
        <div class="kpi-sub">${paid.length} transaksi lunas</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Laba kotor</div>
        <div class="kpi-value">${rupiah(profit)}</div>
        <div class="kpi-sub">dari HPP tercatat</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Rata-rata / nota</div>
        <div class="kpi-value">${rupiah(paid.length ? cacheSum / paid.length : 0)}</div>
        <div class="kpi-sub">${total} nota pada rentang ini</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Dibatalkan</div>
        <div class="kpi-value">${voided.length}</div>
        <div class="kpi-sub">nota void</div>
      </div>`;

    renderTable(root);
  } catch (err) {
    toast(err.message, 'err');
  }
}

function renderTable(root) {
  const box = $('#trxBox', root);
  $('#trxCount', root).textContent = `${cache.length} nota`;

  if (!cache.length) {
    box.innerHTML = `<div class="empty">
      <span class="empty-icon">🧾</span>
      <strong>Tidak ada transaksi</strong>
      <span>Belum ada penjualan pada rentang tanggal ini.</span>
    </div>`;
    return;
  }

  box.innerHTML = `
  <table class="data">
    <thead>
      <tr>
        <th>No. Nota</th>
        <th>Waktu</th>
        <th>Pelanggan</th>
        <th>Kasir</th>
        <th>Item</th>
        <th>Metode</th>
        <th class="num">Total</th>
        <th>Status</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${cache
        .map(
          (t) => `
        <tr style="${t.status === 'void' ? 'opacity:.55' : ''}">
          <td><code style="font-size:11.5px;font-weight:600">${esc(t.no)}</code></td>
          <td style="white-space:nowrap;font-size:12.5px;color:var(--text-2)">
            ${tanggalPendek(t.createdAt)}<br /><span style="color:var(--text-3)">${jamMenit(t.createdAt)}</span>
          </td>
          <td>${esc(t.customer) || '<span style="color:var(--text-3)">Umum</span>'}</td>
          <td style="font-size:12.5px">${esc(t.cashier)}</td>
          <td class="num">${t.itemCount}</td>
          <td><span class="badge">${IKON_METODE[t.method] || ''} ${esc(LABEL_METODE[t.method] || t.method)}</span></td>
          <td class="num" style="font-weight:700">${rupiah(t.total)}</td>
          <td>${t.status === 'void' ? '<span class="badge badge-danger">Void</span>' : '<span class="badge badge-ok">Lunas</span>'}</td>
          <td>
            <div class="actions">
              <button class="icon-btn" data-view="${t.id}" title="Detail">👁</button>
              <button class="icon-btn" data-print="${t.id}" title="Cetak ulang">🖨</button>
              ${t.status === 'void' ? '' : `<button class="icon-btn danger" data-void="${t.id}" title="Batalkan">⊘</button>`}
            </div>
          </td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

/* -------------------------------- Detail -------------------------------- */

function detailModal(trx) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="grid-2" style="margin-bottom:14px">
      <div><div class="kpi-label">No. Nota</div><div style="font-weight:700">${esc(trx.no)}</div></div>
      <div><div class="kpi-label">Waktu</div><div style="font-weight:700">${tanggalPendek(trx.createdAt)} ${jamMenit(trx.createdAt)}</div></div>
      <div><div class="kpi-label">Kasir</div><div style="font-weight:700">${esc(trx.cashier)}</div></div>
      <div><div class="kpi-label">Pelanggan</div><div style="font-weight:700">${esc(trx.customer) || 'Umum'}</div></div>
    </div>

    <div class="table-wrap" style="border:1px solid var(--border);border-radius:10px">
      <table class="data" style="min-width:auto">
        <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th></tr></thead>
        <tbody>
          ${trx.items
            .map(
              (it) => `<tr>
                <td>${esc(it.name)}<div style="font-size:11.5px;color:var(--text-3)">${esc(it.sku)} • ${esc(it.size)} • ${esc(it.color)}</div></td>
                <td class="num">${it.qty}</td>
                <td class="num">${rupiah(it.price)}</td>
                <td class="num" style="font-weight:600">${rupiah(it.subtotal)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top:14px;margin-left:auto;max-width:290px">
      <div class="sum-row muted"><span>Subtotal</span><span>${rupiah(trx.subtotal)}</span></div>
      ${trx.discount ? `<div class="sum-row muted"><span>Diskon nota</span><span>-${rupiah(trx.discount)}</span></div>` : ''}
      ${trx.serviceCharge ? `<div class="sum-row muted"><span>Biaya layanan</span><span>${rupiah(trx.serviceCharge)}</span></div>` : ''}
      <div class="sum-row total"><span>Total</span><span>${rupiah(trx.total)}</span></div>
      <div class="sum-row muted"><span>${esc(LABEL_METODE[trx.method] || trx.method)}</span><span>${rupiah(trx.paid)}</span></div>
      <div class="sum-row muted"><span>Kembalian</span><span>${rupiah(trx.change)}</span></div>
      <div class="sum-row muted"><span>Laba kotor</span><span style="color:var(--ok)">${rupiah(trx.profit)}</span></div>
    </div>

    ${trx.note ? `<div style="margin-top:12px;padding:10px 12px;background:var(--surface-2);border-radius:10px;font-size:12.5px"><strong>Catatan:</strong> ${esc(trx.note)}</div>` : ''}
    ${trx.status === 'void' ? `<div style="margin-top:12px;padding:10px 12px;background:var(--danger-soft);color:#7f1d1d;border-radius:10px;font-size:12.5px"><strong>Dibatalkan:</strong> ${esc(trx.voidReason)}</div>` : ''}`;

  const isConn = printerService.isConnected();
  const foot = document.createElement('div');
  foot.innerHTML = `
    <button class="btn btn-ghost" data-close>Tutup</button>
    ${isConn ? `<button class="btn btn-outline" id="btnPrintDetailBrowser">📄 Cetak Browser</button>` : ''}
    <button class="btn" id="btnPrintDetail">${isConn ? '🖨️ Cetak Struk (Bluetooth)' : '🖨️ Cetak Struk'}</button>`;

  const modal = openModal({ title: 'Detail Transaksi', body, footer: foot, wide: true });
  $('#btnPrintDetail', modal).addEventListener('click', () => printReceipt(trx, state.settings));

  const btnBrowser = $('#btnPrintDetailBrowser', modal);
  if (btnBrowser) {
    btnBrowser.addEventListener('click', () => printBrowserReceipt(trx, state.settings));
  }
}

/* --------------------------------- CSV ---------------------------------- */

function exportCsv() {
  const rows = [
    ['No', 'Tanggal', 'Jam', 'Kasir', 'Pelanggan', 'Item', 'Subtotal', 'Diskon', 'Total', 'Laba', 'Metode', 'Status'],
    ...cache.map((t) => [
      t.no, t.date, t.time, t.cashier, t.customer, t.itemCount,
      t.subtotal, t.discount, t.total, t.profit, t.method, t.status,
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`transaksi-${filter.from}_${filter.to}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
  toast('Riwayat transaksi diekspor', 'ok');
}

/* ------------------------------- View utama ----------------------------- */

export function transactionsView(root) {
  root.innerHTML = template();

  $('#fFrom', root).addEventListener('change', (e) => {
    filter.from = e.target.value;
    load(root);
  });
  $('#fTo', root).addEventListener('change', (e) => {
    filter.to = e.target.value;
    load(root);
  });
  $('#fMethod', root).addEventListener('change', (e) => {
    filter.method = e.target.value;
    load(root);
  });
  $('#fQ', root).addEventListener(
    'input',
    debounce((e) => {
      filter.q = e.target.value;
      load(root);
    }, 250),
  );

  $('#btnToday', root).addEventListener('click', () => {
    filter.from = todayISO();
    filter.to = todayISO();
    $('#fFrom', root).value = filter.from;
    $('#fTo', root).value = filter.to;
    load(root);
  });

  $('#btnExport', root).addEventListener('click', exportCsv);

  on(root, 'click', '[data-view]', (e, btn) => {
    const t = cache.find((x) => x.id === btn.dataset.view);
    if (t) detailModal(t);
  });

  on(root, 'click', '[data-print]', (e, btn) => {
    const t = cache.find((x) => x.id === btn.dataset.print);
    if (t) printReceipt(t, state.settings);
  });

  on(root, 'click', '[data-void]', async (e, btn) => {
    const t = cache.find((x) => x.id === btn.dataset.void);
    if (!t) return;

    const ok = await confirmDialog(
      'Batalkan transaksi?',
      `Nota <strong>${esc(t.no)}</strong> senilai <strong>${rupiah(t.total)}</strong> akan ditandai void dan stok produk dikembalikan.`,
      { okLabel: 'Batalkan transaksi' },
    );
    if (!ok) return;

    try {
      await api.voidTransaction(t.id, 'Dibatalkan oleh kasir');
      await refreshProducts();
      await refreshSummary();
      toast('Transaksi dibatalkan & stok dikembalikan', 'ok');
      load(root);
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  load(root);
  return () => {};
}
