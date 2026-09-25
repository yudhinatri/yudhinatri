/* Tampilan Produk: kelola daftar pakaian (CRUD). */

import { api } from '../api.js';
import { state, refreshProducts, stokRendah, subscribe } from '../store.js';
import { $, $$, esc, rupiah, on, debounce, download, todayISO } from '../utils.js';
import { openModal, closeModal, toast, confirmDialog } from '../ui.js';

const filter = { query: '', category: 'Semua', onlyLow: false, sort: 'name' };
const selected = new Set(); // id produk yang dicentang untuk aksi massal

/* ------------------------------- Template ------------------------------- */

function template() {
  return `
  <div class="toolbar">
    <div class="search-wrap">
      <input class="input" id="q" type="search" placeholder="Cari produk, SKU, warna..." autocomplete="off" />
    </div>
    <select class="select" id="fCat" style="width:auto;min-width:150px"></select>
    <button class="btn btn-ghost btn-sm" id="fLow">⚠️ Stok menipis</button>
    <select class="select" id="fSort" style="width:auto">
      <option value="name">Urut: Nama</option>
      <option value="stock">Urut: Stok terkecil</option>
      <option value="price">Urut: Harga tertinggi</option>
      <option value="sold">Urut: Kategori</option>
    </select>
    <div class="toolbar-actions">
      <button class="btn btn-ghost btn-sm" id="btnExport">⬇ Ekspor CSV</button>
      <button class="btn btn-ghost btn-sm" id="btnDeleteAll" title="Hapus semua produk">🗑 Hapus Semua</button>
      <button class="btn" id="btnAdd">＋ Tambah Produk</button>
    </div>
  </div>

  <div class="bulk-bar" id="bulkBar" hidden>
    <span><strong id="bulkCount">0</strong> produk dipilih</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" id="bulkClear">Batal pilih</button>
      <button class="btn btn-danger btn-sm" id="bulkDelete">🗑 Hapus Terpilih</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h3>Daftar Produk <span class="badge" id="countBadge">0</span></h3>
      <span style="font-size:12px;color:var(--text-2)" id="stockValue"></span>
    </div>
    <div class="table-wrap"><div id="tableBox"></div></div>
  </div>`;
}

/* -------------------------------- Tabel --------------------------------- */

function filtered() {
  const q = filter.query.trim().toLowerCase();
  let list = state.products.filter((p) => {
    if (filter.category !== 'Semua' && p.category !== filter.category) return false;
    if (filter.onlyLow && !stokRendah(p)) return false;
    if (!q) return true;
    return `${p.name} ${p.sku} ${p.category} ${p.size} ${p.color}`.toLowerCase().includes(q);
  });

  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name),
    stock: (a, b) => a.stock - b.stock,
    price: (a, b) => b.price - a.price,
    sold: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  }[filter.sort];
  return list.sort(cmp);
}

function stockBadge(p) {
  if (p.stock <= 0) return '<span class="badge badge-danger">Habis</span>';
  if (stokRendah(p)) return `<span class="badge badge-warn">Menipis</span>`;
  return '<span class="badge badge-ok">Tersedia</span>';
}

function renderTable(root) {
  const list = filtered();
  const box = $('#tableBox', root);

  // Buang pilihan yang produknya sudah tidak ada / tidak tampil lagi
  const visibleIds = new Set(list.map((p) => p.id));
  [...selected].forEach((id) => {
    if (!visibleIds.has(id)) selected.delete(id);
  });

  $('#countBadge', root).textContent = `${list.length} produk`;
  const nilai = state.products.reduce((s, p) => s + p.stock * p.cost, 0);
  $('#stockValue', root).textContent = `Nilai stok (HPP): ${rupiah(nilai)}`;

  renderBulkBar(root);

  if (!list.length) {
    box.innerHTML = `<div class="empty">
      <span class="empty-icon">👚</span>
      <strong>Belum ada produk</strong>
      <span>Tambahkan produk pakaian pertama Anda.</span>
    </div>`;
    return;
  }

  const allChecked = list.every((p) => selected.has(p.id));

  box.innerHTML = `
  <table class="data">
    <thead>
      <tr>
        <th style="width:34px">
          <input type="checkbox" id="checkAll" ${allChecked ? 'checked' : ''} title="Pilih semua" />
        </th>
        <th>SKU</th>
        <th>Produk</th>
        <th>Kategori</th>
        <th>Varian</th>
        <th class="num">Harga Jual</th>
        <th class="num">HPP</th>
        <th class="num">Margin</th>
        <th class="num">Stok</th>
        <th>Status</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${list
        .map((p) => {
          const margin = p.price - p.cost;
          const pct = p.price ? Math.round((margin / p.price) * 100) : 0;
          return `
        <tr class="${selected.has(p.id) ? 'is-selected' : ''}">
          <td><input type="checkbox" data-check="${p.id}" ${selected.has(p.id) ? 'checked' : ''} /></td>
          <td><code style="font-size:11.5px;color:var(--text-2)">${esc(p.sku)}</code></td>
          <td>
            <div style="font-weight:600">${esc(p.name)}</div>
          </td>
          <td><span class="badge">${esc(p.category)}</span></td>
          <td style="font-size:12px;color:var(--text-2)">${esc(p.size)} • ${esc(p.color)}</td>
          <td class="num" style="font-weight:600">${rupiah(p.price)}</td>
          <td class="num" style="color:var(--text-2)">${rupiah(p.cost)}</td>
          <td class="num" style="color:${margin > 0 ? 'var(--ok)' : 'var(--danger)'}">${pct}%</td>
          <td class="num" style="font-weight:700">${p.stock}</td>
          <td>${stockBadge(p)}</td>
          <td>
            <div class="actions">
              <button class="icon-btn" data-edit="${p.id}" title="Ubah">✏️</button>
              <button class="icon-btn danger" data-del="${p.id}" title="Hapus">🗑</button>
            </div>
          </td>
        </tr>`;
        })
        .join('')}
    </tbody>
  </table>`;
}

/** Bar aksi massal muncul saat ada produk yang dicentang. */
function renderBulkBar(root) {
  const bar = $('#bulkBar', root);
  if (!bar) return;
  bar.hidden = selected.size === 0;
  $('#bulkCount', root).textContent = selected.size;
}

/**
 * Selaraskan tampilan centang dengan isi `selected` tanpa me-render ulang tabel
 * (render ulang akan menghapus node yang sedang di-klik pengguna).
 */
function syncSelection(root) {
  $$('[data-check]', root).forEach((cb) => {
    const on_ = selected.has(cb.dataset.check);
    cb.checked = on_;
    cb.closest('tr')?.classList.toggle('is-selected', on_);
  });

  const list = filtered();
  const all = $('#checkAll', root);
  if (all) {
    all.checked = list.length > 0 && list.every((p) => selected.has(p.id));
    all.indeterminate = selected.size > 0 && !all.checked;
  }
  renderBulkBar(root);
}

/** Hapus sekumpulan produk lalu segarkan daftar. */
async function deleteProducts(root, ids, { label } = {}) {
  try {
    if (ids.length === 1) await api.deleteProduct(ids[0]);
    else await api.bulkDeleteProducts(ids);
    ids.forEach((id) => selected.delete(id));
    await refreshProducts();
    toast(label || (ids.length === 1 ? 'Produk dihapus' : `${ids.length} produk dihapus`), 'ok');
  } catch (err) {
    toast(err.message, 'err');
  }
  renderTable(root);
}

/* ------------------------------- Form modal ----------------------------- */

function productForm(product) {
  const isEdit = Boolean(product);
  const p = product || {
    sku: '', name: '', category: state.settings.categories[0] || 'Lainnya',
    size: 'All Size', color: '', price: 0, cost: 0, stock: 0, minStock: 3, active: true,
  };

  const opt = (arr, sel) =>
    arr.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="grid-2">
      <div class="field">
        <label>Nama produk *</label>
        <input class="input" name="name" value="${esc(p.name)}" placeholder="cth. Kemeja Flanel Lengan Panjang" />
      </div>
      <div class="field">
        <label>SKU / Kode</label>
        <input class="input" name="sku" value="${esc(p.sku)}" placeholder="otomatis jika kosong" style="text-transform:uppercase" />
      </div>
    </div>

    <div class="grid-3" style="margin-top:12px">
      <div class="field">
        <label>Kategori</label>
        <select class="select" name="category">${opt(state.settings.categories, p.category)}</select>
      </div>
      <div class="field">
        <label>Ukuran</label>
        <select class="select" name="size">${opt(state.settings.sizes, p.size)}</select>
      </div>
      <div class="field">
        <label>Warna</label>
        <input class="input" name="color" value="${esc(p.color)}" list="colorList" placeholder="cth. Navy" />
        <datalist id="colorList">${state.settings.colors.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
    </div>

    <div class="grid-2" style="margin-top:12px">
      <div class="field">
        <label>Harga jual (Rp) *</label>
        <input class="input" name="price" type="number" min="0" inputmode="numeric" value="${p.price}" />
      </div>
      <div class="field">
        <label>Harga modal / HPP (Rp)</label>
        <input class="input" name="cost" type="number" min="0" inputmode="numeric" value="${p.cost}" />
      </div>
    </div>

    <div class="grid-2" style="margin-top:12px">
      <div class="field">
        <label>Stok</label>
        <input class="input" name="stock" type="number" min="0" inputmode="numeric" value="${p.stock}" />
      </div>
      <div class="field">
        <label>Batas stok menipis</label>
        <input class="input" name="minStock" type="number" min="0" inputmode="numeric" value="${p.minStock ?? 3}" />
      </div>
    </div>

    <div class="field" style="margin-top:12px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''} />
        <span>Tampilkan produk ini di halaman kasir</span>
      </label>
    </div>`;

  const foot = document.createElement('div');
  foot.innerHTML = `
    <button class="btn btn-ghost" data-close>Batal</button>
    <button class="btn" id="btnSave">${isEdit ? 'Simpan Perubahan' : 'Tambah Produk'}</button>`;

  const modal = openModal({
    title: isEdit ? 'Ubah Produk' : 'Tambah Produk',
    body,
    footer: foot,
    wide: true,
  });

  const val = (n) => modal.querySelector(`[name="${n}"]`);

  $('#btnSave', modal).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: val('name').value.trim(),
      sku: val('sku').value.trim(),
      category: val('category').value,
      size: val('size').value,
      color: val('color').value.trim(),
      price: Number(val('price').value),
      cost: Number(val('cost').value),
      stock: Number(val('stock').value),
      minStock: Number(val('minStock').value),
      active: val('active').checked,
    };

    if (!payload.name) return toast('Nama produk wajib diisi', 'warn');
    if (!payload.price) return toast('Harga jual wajib diisi', 'warn');

    btn.disabled = true;
    try {
      if (isEdit) await api.updateProduct(product.id, payload);
      else await api.createProduct(payload);
      closeModal();
      await refreshProducts();
      toast(isEdit ? 'Produk diperbarui' : 'Produk ditambahkan', 'ok');
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  // Modal bisa sudah ditutup sebelum timeout jalan, jadi cek dulu keberadaannya.
  setTimeout(() => val('name')?.focus(), 80);
}

/* ------------------------------- Ekspor CSV ----------------------------- */

function exportCsv() {
  const rows = [
    ['SKU', 'Nama', 'Kategori', 'Ukuran', 'Warna', 'Harga', 'HPP', 'Stok', 'BatasStok', 'Aktif'],
    ...state.products.map((p) => [
      p.sku, p.name, p.category, p.size, p.color, p.price, p.cost, p.stock, p.minStock, p.active ? 'Ya' : 'Tidak',
    ]),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  download(`produk-${todayISO()}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
  toast('Data produk diekspor', 'ok');
}

/* ------------------------------- View utama ----------------------------- */

export function productsView(root) {
  root.innerHTML = template();

  const catSel = $('#fCat', root);
  const fillCats = () => {
    catSel.innerHTML =
      `<option value="Semua">Semua kategori</option>` +
      state.settings.categories.map((c) => `<option>${esc(c)}</option>`).join('');
    catSel.value = filter.category;
  };
  fillCats();

  const search = $('#q', root);
  search.value = filter.query;
  search.addEventListener(
    'input',
    debounce((e) => {
      filter.query = e.target.value;
      renderTable(root);
    }, 150),
  );

  catSel.addEventListener('change', (e) => {
    filter.category = e.target.value;
    renderTable(root);
  });

  $('#fSort', root).addEventListener('change', (e) => {
    filter.sort = e.target.value;
    renderTable(root);
  });

  $('#fLow', root).addEventListener('click', (e) => {
    filter.onlyLow = !filter.onlyLow;
    e.currentTarget.classList.toggle('btn-danger', filter.onlyLow);
    e.currentTarget.classList.toggle('btn-ghost', !filter.onlyLow);
    renderTable(root);
  });

  $('#btnAdd', root).addEventListener('click', () => productForm(null));
  $('#btnExport', root).addEventListener('click', exportCsv);

  on(root, 'click', '[data-edit]', (e, btn) => {
    const p = state.products.find((x) => x.id === btn.dataset.edit);
    if (!p) {
      toast('Produk tidak ditemukan, muat ulang halaman', 'err');
      return;
    }
    productForm(p);
  });

  /* ----- hapus satu produk ----- */

  on(root, 'click', '[data-del]', async (e, btn) => {
    const p = state.products.find((x) => x.id === btn.dataset.del);
    if (!p) {
      toast('Produk tidak ditemukan, muat ulang halaman', 'err');
      return;
    }

    const ok = await confirmDialog(
      'Hapus produk?',
      `<strong>${esc(p.name)}</strong> (${esc(p.sku)}) akan dihapus permanen dari daftar produk. Riwayat transaksi lama tidak terpengaruh.`,
      { okLabel: 'Hapus' },
    );
    if (!ok) return;

    await deleteProducts(root, [p.id]);
  });

  /* ----- pilih banyak & hapus massal ----- */

  on(root, 'change', '[data-check]', (e, input) => {
    const id = input.dataset.check;
    if (input.checked) selected.add(id);
    else selected.delete(id);
    syncSelection(root);
  });

  on(root, 'change', '#checkAll', (e, input) => {
    if (input.checked) filtered().forEach((p) => selected.add(p.id));
    else selected.clear();
    syncSelection(root);
  });

  on(root, 'click', '#bulkClear', () => {
    selected.clear();
    syncSelection(root);
  });

  on(root, 'click', '#bulkDelete', async () => {
    const ids = [...selected];
    if (!ids.length) return;

    const ok = await confirmDialog(
      `Hapus ${ids.length} produk?`,
      `${ids.length} produk yang dipilih akan dihapus permanen. Riwayat transaksi lama tidak terpengaruh.`,
      { okLabel: `Hapus ${ids.length} produk` },
    );
    if (!ok) return;

    await deleteProducts(root, ids);
  });

  /* ----- kosongkan seluruh katalog ----- */

  $('#btnDeleteAll', root).addEventListener('click', async () => {
    const total = state.products.length;
    if (!total) {
      toast('Belum ada produk untuk dihapus', 'info');
      return;
    }

    const ok = await confirmDialog(
      'Hapus semua produk?',
      `Seluruh <strong>${total} produk</strong> akan dihapus permanen dari katalog. Riwayat transaksi lama tetap tersimpan. Tindakan ini tidak bisa dibatalkan.`,
      { okLabel: `Hapus ${total} produk` },
    );
    if (!ok) return;

    try {
      const { removed } = await api.deleteAllProducts();
      selected.clear();
      await refreshProducts();
      toast(`${removed} produk dihapus`, 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
    renderTable(root);
  });

  const render = () => renderTable(root);
  const unsub = subscribe(render);
  render();

  return () => unsub();
}
