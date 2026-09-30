/* Tampilan Kasir: katalog produk + keranjang + proses pembayaran. */

import { api } from '../api.js';
import {
  state, subscribe, addToCart, setQty, removeFromCart, clearCart,
  cartTotals, filteredProducts, productById, refreshProducts, refreshSummary, emit,
} from '../store.js';
import {
  $, $$, esc, rupiah, angka, on, debounce, LABEL_METODE, IKON_METODE,
} from '../utils.js';
import { receiptHTML, printReceipt, printBrowserReceipt, printBluetoothReceipt } from '../receipt.js';
import { openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { printerService } from '../bluetoothPrinter.js';
import { openPrinterModal } from './printerModal.js';

const METODE = ['cash', 'qris', 'transfer', 'debit', 'ewallet'];
const QUICK_CASH = [50000, 100000, 150000, 200000, 300000, 500000];

let localOrderDiscount = 0;

/* ------------------------------- Template ------------------------------- */

function template() {
  return `
  <div class="cashier">
    <section class="catalog">
      <div class="toolbar">
        <div class="search-wrap">
          <input class="input" id="q" type="search" placeholder="Cari nama, SKU, warna, ukuran... (tekan /)" autocomplete="off" />
        </div>
        <button class="btn btn-ghost btn-sm" id="btnReset" title="Bersihkan filter">↺ Reset</button>
      </div>
      <div class="chips" id="chips"></div>
      <div class="product-grid" id="pgrid"></div>
    </section>

    <aside class="cart" id="cartPanel"></aside>
  </div>`;
}

/* ------------------------------ Katalog --------------------------------- */

function productCard(p) {
  const out = p.stock <= 0;
  const low = !out && p.stock <= (p.minStock ?? state.settings.lowStockThreshold);
  const inCart = state.cart.find((l) => l.productId === p.id);
  const sisa = p.stock - (inCart ? inCart.qty : 0);

  return `
  <button class="p-card" data-add="${p.id}" ${out || sisa <= 0 ? 'disabled' : ''}>
    <div class="p-card-top">
      <span class="p-card-sku">${esc(p.sku)}</span>
      ${inCart ? `<span class="badge badge-brand">${inCart.qty} di keranjang</span>` : ''}
    </div>
    <div class="p-card-name">${esc(p.name)}</div>
    <div class="p-card-meta">
      <span class="badge">${esc(p.size)}</span>
      <span class="badge">${esc(p.color)}</span>
    </div>
    <div class="p-card-foot">
      <span class="p-card-price">${rupiah(p.price)}</span>
      <span class="p-card-stock ${out ? 'out' : low ? 'low' : ''}">
        ${out ? 'Habis' : `Stok ${sisa}`}
      </span>
    </div>
  </button>`;
}

function renderGrid(root) {
  const grid = $('#pgrid', root);
  const chips = $('#chips', root);
  const list = filteredProducts();
  const cats = ['Semua', ...state.settings.categories.filter((c) => state.products.some((p) => p.category === c))];

  chips.innerHTML = cats
    .map(
      (c) => `<button class="chip ${state.catalogFilter.category === c ? 'is-active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`,
    )
    .join('');

  grid.innerHTML = list.length
    ? list.map(productCard).join('')
    : `<div class="empty" style="grid-column:1/-1">
         <span class="empty-icon">🔍</span>
         <strong>Produk tidak ditemukan</strong>
         <span>Ubah kata kunci atau tambah produk baru di menu Produk.</span>
       </div>`;
}

/* ------------------------------ Keranjang ------------------------------- */

function renderCart(root) {
  const panel = $('#cartPanel', root);
  const t = cartTotals(localOrderDiscount);

  const lines = state.cart.length
    ? state.cart
        .map(
          (l) => `
        <div class="cart-line">
          <div>
            <div class="cart-line-name">${esc(l.name)}</div>
            <div class="cart-line-meta">${esc(l.sku)} • ${esc(l.size)} • ${esc(l.color)}</div>
            <div class="qty">
              <button data-dec="${l.productId}" title="Kurangi">−</button>
              <input type="number" min="0" max="${l.stock}" value="${l.qty}" data-qty="${l.productId}" />
              <button data-inc="${l.productId}" title="Tambah">+</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="cart-line-total">${rupiah(l.price * l.qty - l.discount)}</div>
            <div class="cart-line-price">@ ${rupiah(l.price)}</div>
            <button class="icon-btn danger" data-cart-del="${l.productId}" title="Hapus" style="width:26px;height:26px;font-size:13px">🗑</button>
          </div>
        </div>`,
        )
        .join('')
    : `<div class="empty" style="padding:34px 14px">
         <span class="empty-icon">🛒</span>
         <strong>Keranjang kosong</strong>
         <span>Klik produk di sebelah kiri untuk menambahkan.</span>
       </div>`;

  panel.innerHTML = `
    <div class="cart-head">
      <h3>🛒 Keranjang <span class="badge badge-brand">${t.itemCount} item</span></h3>
      <button class="icon-btn danger" id="btnClear" title="Kosongkan keranjang" ${state.cart.length ? '' : 'disabled'}>🗑</button>
    </div>

    <div class="cart-list">${lines}</div>

    <div class="cart-foot">
      <div class="sum-row muted"><span>Subtotal</span><span>${rupiah(t.subtotal)}</span></div>
      ${t.lineDiscount ? `<div class="sum-row muted"><span>Diskon item</span><span>-${rupiah(t.lineDiscount)}</span></div>` : ''}

      <div class="disc-row">
        <span style="font-size:12px;color:var(--text-2);font-weight:600">Diskon nota</span>
        <input class="input" id="orderDisc" type="number" min="0" inputmode="numeric" placeholder="0"
               value="${localOrderDiscount || ''}" style="text-align:right" />
      </div>

      ${t.serviceCharge ? `<div class="sum-row muted"><span>Biaya layanan</span><span>${rupiah(t.serviceCharge)}</span></div>` : ''}

      <div class="sum-row total"><span>Total</span><span>${rupiah(t.total)}</span></div>

      <button class="btn btn-lg btn-block" id="btnPay" style="margin-top:12px" ${state.cart.length ? '' : 'disabled'}>
        💳 Bayar Sekarang
      </button>
    </div>`;
}

/* ------------------------------ Pembayaran ------------------------------ */

function paymentModal() {
  const t = cartTotals(localOrderDiscount);
  let method = 'cash';
  let paid = t.total;

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="pay-total">
      <small>Total yang harus dibayar</small>
      <strong id="payTotal">${rupiah(t.total)}</strong>
    </div>

    <div class="field" style="margin-bottom:10px">
      <label>Metode pembayaran</label>
      <div class="pay-methods" id="payMethods">
        ${METODE.map(
          (m) => `<button class="pay-method ${m === method ? 'is-active' : ''}" data-method="${m}">
                    <span class="pm-icon">${IKON_METODE[m]}</span>${LABEL_METODE[m]}
                  </button>`,
        ).join('')}
      </div>
    </div>

    <div id="cashBox">
      <div class="field">
        <label>Uang diterima</label>
        <input class="input" id="payPaid" type="number" min="0" inputmode="numeric" value="${paid}" style="font-size:17px;font-weight:700" />
        <div class="quick-cash" id="quickCash">
          ${QUICK_CASH.map((v) => `<button data-cash="${v}">${angka(v)}</button>`).join('')}
          <button data-cash="pas">Uang pas</button>
        </div>
      </div>
      <div class="change-box" id="changeBox">
        <span>Kembalian</span><span id="changeVal">Rp 0</span>
      </div>
    </div>

    <div class="grid-2" style="margin-top:14px">
      <div class="field">
        <label>Nama pelanggan <span class="hint">(opsional)</span></label>
        <input class="input" id="payCustomer" placeholder="Umum" />
      </div>
      <div class="field">
        <label>Catatan <span class="hint">(opsional)</span></label>
        <input class="input" id="payNote" placeholder="-" />
      </div>
    </div>`;

  const foot = document.createElement('div');
  foot.innerHTML = `
    <button class="btn btn-ghost" data-close>Batal</button>
    <button class="btn btn-ok btn-lg" id="btnConfirm">✓ Selesaikan Pembayaran</button>`;

  const modal = openModal({ title: 'Pembayaran', body, footer: foot, wide: false });

  const paidInput = $('#payPaid', modal);
  const changeBox = $('#changeBox', modal);
  const changeVal = $('#changeVal', modal);
  const cashBox = $('#cashBox', modal);

  const refreshChange = () => {
    const diff = paid - t.total;
    const kurang = diff < 0;
    changeBox.classList.toggle('less', kurang);
    changeBox.firstElementChild.textContent = kurang ? 'Kurang bayar' : 'Kembalian';
    changeVal.textContent = rupiah(Math.abs(diff));
    $('#btnConfirm', modal).disabled = kurang;
  };

  paidInput.addEventListener('input', () => {
    paid = Number(paidInput.value) || 0;
    refreshChange();
  });

  on(modal, 'click', '[data-method]', (e, btn) => {
    method = btn.dataset.method;
    $$('[data-method]', modal).forEach((b) => b.classList.toggle('is-active', b.dataset.method === method));
    cashBox.hidden = method !== 'cash';
    paid = method === 'cash' ? Number(paidInput.value) || 0 : t.total;
    refreshChange();
  });

  on(modal, 'click', '[data-cash]', (e, btn) => {
    const v = btn.dataset.cash;
    paid = v === 'pas' ? t.total : Number(v);
    paidInput.value = paid;
    refreshChange();
  });

  refreshChange();
  setTimeout(() => paidInput.select(), 60);

  $('#btnConfirm', modal).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    try {
      const { transaction } = await api.createTransaction({
        items: state.cart.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          price: l.price,
          discount: l.discount,
        })),
        discount: localOrderDiscount,
        method,
        paid: method === 'cash' ? paid : t.total,
        cashier: state.settings.activeCashier,
        customer: $('#payCustomer', modal).value.trim(),
        note: $('#payNote', modal).value.trim(),
      });

      closeModal();
      localOrderDiscount = 0;
      clearCart();

      // Sinkronkan stok terbaru + ringkasan penjualan hari ini
      await refreshProducts();
      await refreshSummary();
      emit();

      toast(`Transaksi ${transaction.no} berhasil`, 'ok');
      showSuccess(transaction);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = '✓ Selesaikan Pembayaran';
    }
  });
}

async function showSuccess(trx) {
  const isConn = printerService.isConnected();
  const devName = printerService.getDeviceName();
  const auto = printerService.settings.autoPrint;

  // Jika printer Bluetooth terhubung & pengaturan auto-print aktif, cetak otomatis
  if (isConn && auto) {
    try {
      await printBluetoothReceipt(trx, state.settings);
      toast(`Struk transaksi ${trx.no} otomatis dicetak`, 'ok');
    } catch (e) {
      toast(`Gagal cetak otomatis: ${e.message}`, 'warn');
    }
  }

  const body = document.createElement('div');
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-size:42px;line-height:1">✅</div>
      <h3 style="font-size:16px;margin-top:6px">Pembayaran berhasil</h3>
      <p style="color:var(--text-2);font-size:13px">Kembalian: <strong>${rupiah(trx.change)}</strong></p>
    </div>

    <!-- Mini status printer thermal -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin-bottom:12px;background:var(--surface-2);border-radius:10px;font-size:12px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:6px">
        <span>${isConn ? '🟢' : '⚪'}</span>
        <span>${isConn ? `Printer: <strong>${esc(devName)}</strong> (${printerService.settings.paperWidth}mm)` : 'Printer Bluetooth belum terhubung'}</span>
      </div>
      <button class="btn btn-ghost btn-sm" id="btnQuickPrinterModal" style="padding:2px 8px;font-size:11.5px">
        ${isConn ? '⚙️ Kelola' : '🔍 Hubungkan'}
      </button>
    </div>

    <div style="border:1px dashed var(--border-strong);border-radius:12px;overflow:hidden">
      ${receiptHTML(trx, state.settings)}
    </div>`;

  const foot = document.createElement('div');
  foot.innerHTML = `
    <button class="btn btn-ghost" data-close>Tutup</button>
    ${isConn ? `<button class="btn btn-outline" id="btnPrintBrowser">📄 Cetak Browser</button>` : ''}
    <button class="btn" id="btnPrint">${isConn ? '🖨️ Cetak Struk (Bluetooth)' : '🖨️ Cetak Struk'}</button>`;

  const modal = openModal({ title: `Struk ${trx.no}`, body, footer: foot });

  $('#btnPrint', modal).addEventListener('click', async () => {
    await printReceipt(trx, state.settings);
  });

  const btnBrowser = $('#btnPrintBrowser', modal);
  if (btnBrowser) {
    btnBrowser.addEventListener('click', () => {
      printBrowserReceipt(trx, state.settings);
    });
  }

  $('#btnQuickPrinterModal', modal).addEventListener('click', () => {
    openPrinterModal(trx);
  });
}

/* ------------------------------- View utama ----------------------------- */

export function cashierView(root) {
  root.innerHTML = template();

  const searchInput = $('#q', root);
  searchInput.value = state.catalogFilter.query;

  searchInput.addEventListener(
    'input',
    debounce((e) => {
      state.catalogFilter.query = e.target.value;
      renderGrid(root);
    }, 150),
  );

  on(root, 'click', '[data-cat]', (e, btn) => {
    state.catalogFilter.category = btn.dataset.cat;
    renderGrid(root);
  });

  $('#btnReset', root).addEventListener('click', () => {
    state.catalogFilter = { category: 'Semua', query: '' };
    searchInput.value = '';
    renderGrid(root);
  });

  on(root, 'click', '[data-add]', (e, btn) => {
    const p = productById(btn.dataset.add);
    if (!p) return;
    if (!addToCart(p, 1)) toast(`Stok ${p.name} tidak mencukupi`, 'warn');
  });

  on(root, 'click', '[data-inc]', (e, btn) => {
    const id = btn.dataset.inc;
    const line = state.cart.find((l) => l.productId === id);
    if (!line) return;
    if (line.qty + 1 > line.stock) {
      toast('Jumlah melebihi stok tersedia', 'warn');
      return;
    }
    setQty(id, line.qty + 1);
  });

  on(root, 'click', '[data-dec]', (e, btn) => {
    const id = btn.dataset.dec;
    const line = state.cart.find((l) => l.productId === id);
    if (line) setQty(id, line.qty - 1);
  });

  // Selector sengaja dibedakan dari halaman Produk ([data-del]) agar tidak
  // pernah bertabrakan.
  on(root, 'click', '[data-cart-del]', (e, btn) => removeFromCart(btn.dataset.cartDel));

  on(root, 'change', '[data-qty]', (e, input) => {
    setQty(input.dataset.qty, input.value);
  });

  on(root, 'change', '#orderDisc', (e) => {
    localOrderDiscount = Math.max(0, Number(e.target.value) || 0);
    renderCart(root);
  });

  on(root, 'click', '#btnClear', async (e, btn) => {
    if (!state.cart.length) return;
    const ok = await confirmDialog('Kosongkan keranjang?', 'Semua item akan dihapus dari keranjang.');
    if (ok) {
      localOrderDiscount = 0;
      clearCart();
    }
  });

  on(root, 'click', '#btnPay', () => paymentModal());

  // Shortcut: "/" fokus ke kolom pencarian (kecuali sedang mengetik di input lain)
  const hotkey = (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === '/' && !typing) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  };
  document.addEventListener('keydown', hotkey);

  const render = () => {
    renderGrid(root);
    renderCart(root);
  };
  const unsubscribe = subscribe(render);
  render();

  return () => {
    document.removeEventListener('keydown', hotkey);
    unsubscribe();
  };
}
