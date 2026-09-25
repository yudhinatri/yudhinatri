/* Tampilan Pengaturan: identitas toko, pengguna, biaya, daftar pilihan, backup & reset. */

import { api, getToken } from '../api.js';
import { state, saveSettings, refreshProducts, refreshSummary, bootstrap, isAdmin, clearSession } from '../store.js';
import { $, esc, on, download, todayISO, rupiah, tanggalPendek } from '../utils.js';
import { toast, confirmDialog, promptDialog, openModal, closeModal } from '../ui.js';
import { printerService, detectPlatform } from '../bluetoothPrinter.js';
import { printTestReceipt } from '../receipt.js';

const ROLE_LABEL = { admin: 'Admin', kasir: 'Kasir' };

/* ------------------------------ Editor daftar --------------------------- */

function listEditor(title, key, placeholder) {
  const items = state.settings[key] || [];
  return `
  <div class="card">
    <div class="card-head">
      <h3>${esc(title)}</h3>
      <button class="btn btn-ghost btn-sm" data-list-add="${key}">＋ Tambah</button>
    </div>
    <div class="card-body">
      <div class="chips" id="list-${key}">
        ${
          items.length
            ? items
                .map(
                  (v) => `<span class="chip" style="cursor:default">
                    ${esc(v)}
                    <button data-list-del="${key}" data-value="${esc(v)}"
                      style="border:0;background:transparent;color:inherit;margin-left:6px;font-weight:700;opacity:.6">✕</button>
                  </span>`,
                )
                .join('')
            : `<span style="font-size:12.5px;color:var(--text-3)">Belum ada pilihan. Klik "Tambah".</span>`
        }
      </div>
      <div class="hint" style="font-size:11.5px;color:var(--text-3);margin-top:8px">${esc(placeholder)}</div>
    </div>
  </div>`;
}

/* ----------------------- Printer Thermal Bluetooth ---------------------- */

function printerSettingsCardHTML() {
  const isConn = printerService.isConnected();
  const name = printerService.getDeviceName();
  const s = printerService.settings;
  const platform = detectPlatform();
  const savedPrinters = printerService.getSavedPrinters();
  const selectedId = s.selectedPrinterId || (savedPrinters[0]?.id) || '';
  const selectedPrinter = savedPrinters.find((p) => p.id === selectedId);

  return `
  <div class="card" id="printerSettingsCard" style="margin-top:16px">
    <div class="card-head">
      <div style="display:flex;align-items:center;gap:10px">
        <h3>🖨️ Pengaturan Printer & Bluetooth</h3>
        <span class="badge ${isConn ? 'badge-ok' : ''}" id="printerBadgeSettings">
          ${isConn ? '● Terhubung' : 'Terputus'}
        </span>
      </div>
      <div style="display:flex;gap:6px">
        ${isConn ? `<button class="btn btn-sm btn-outline" id="btnTestPrintSettings">🧾 Test Cetak</button>` : ''}
      </div>
    </div>

    <div class="card-body">
      <!-- 1. PILIH KONEKSI / MODE PRINTER -->
      <div style="margin-bottom:18px">
        <label style="font-weight:700;font-size:13.5px;margin-bottom:8px;display:block">
          1. Pilih Mode Koneksi
        </label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:10px">
          <label class="conn-mode-item ${s.printerMode === 'bluetooth' ? 'is-active' : ''}" style="cursor:pointer;padding:12px 14px;border:1px solid ${s.printerMode === 'bluetooth' ? 'var(--brand)' : 'var(--border)'};border-radius:10px;display:flex;align-items:flex-start;gap:10px;background:${s.printerMode === 'bluetooth' ? 'var(--brand-soft)' : 'var(--surface)'};transition:all .15s">
            <input type="radio" name="printerMode" value="bluetooth" ${s.printerMode === 'bluetooth' ? 'checked' : ''} style="margin-top:3px" />
            <div>
              <div style="font-weight:700;font-size:13px;color:${s.printerMode === 'bluetooth' ? 'var(--brand)' : 'inherit'}">🔵 Bluetooth Thermal (BLE)</div>
              <div style="font-size:11.5px;color:var(--text-2);margin-top:2px">Untuk HP, tablet, Android & iOS (Bluefy)</div>
            </div>
          </label>

          <label class="conn-mode-item ${s.printerMode === 'serial' ? 'is-active' : ''}" style="cursor:pointer;padding:12px 14px;border:1px solid ${s.printerMode === 'serial' ? 'var(--brand)' : 'var(--border)'};border-radius:10px;display:flex;align-items:flex-start;gap:10px;background:${s.printerMode === 'serial' ? 'var(--brand-soft)' : 'var(--surface)'};transition:all .15s">
            <input type="radio" name="printerMode" value="serial" ${s.printerMode === 'serial' ? 'checked' : ''} style="margin-top:3px" />
            <div>
              <div style="font-weight:700;font-size:13px;color:${s.printerMode === 'serial' ? 'var(--brand)' : 'inherit'}">🔌 Port Serial / USB / SPP</div>
              <div style="font-size:11.5px;color:var(--text-2);margin-top:2px">Untuk Windows, PC & kabel USB</div>
            </div>
          </label>

          <label class="conn-mode-item ${s.printerMode === 'system' ? 'is-active' : ''}" style="cursor:pointer;padding:12px 14px;border:1px solid ${s.printerMode === 'system' ? 'var(--brand)' : 'var(--border)'};border-radius:10px;display:flex;align-items:flex-start;gap:10px;background:${s.printerMode === 'system' ? 'var(--brand-soft)' : 'var(--surface)'};transition:all .15s">
            <input type="radio" name="printerMode" value="system" ${s.printerMode === 'system' ? 'checked' : ''} style="margin-top:3px" />
            <div>
              <div style="font-weight:700;font-size:13px;color:${s.printerMode === 'system' ? 'var(--brand)' : 'inherit'}">📄 Cetak Sistem / Browser</div>
              <div style="font-size:11.5px;color:var(--text-2);margin-top:2px">Dialog cetak bawaan / AirPrint / PDF</div>
            </div>
          </label>
        </div>
      </div>

      <!-- 2. PILIH PERANGKAT PRINTER -->
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <label style="font-weight:700;font-size:13.5px">2. Pilih Perangkat Printer</label>
            <div style="font-size:12px;color:var(--text-2)">Pilih printer yang tersimpan atau cari perangkat Bluetooth baru</div>
          </div>
          <span style="font-size:12px;color:var(--text-3)">
            ${savedPrinters.length} printer tersimpan
          </span>
        </div>

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <select class="select" id="settingsSelectPrinter" style="flex:1;min-width:240px;font-weight:600">
            ${
              savedPrinters.length === 0
                ? `<option value="">-- Belum ada printer tersimpan --</option>`
                : savedPrinters
                    .map(
                      (p) => `
                    <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
                      ${p.type === 'bluetooth' ? '🔵' : '🔌'} ${esc(p.name)} (${p.type === 'bluetooth' ? 'Bluetooth' : 'Serial'})${isConn && p.name === name ? ' — [Sedang Terhubung]' : ''}
                    </option>`,
                    )
                    .join('')
            }
            <option value="__add_bt__">➕ Cari & Pilih Printer Bluetooth Baru...</option>
            ${platform.isSerialSupported ? `<option value="__add_serial__">➕ Pilih Port Serial / SPP Baru...</option>` : ''}
          </select>

          <button class="btn" id="btnConnectSelectedPrinter">
            ${isConn ? '⚡ Sambungkan Ulang' : '⚡ Sambungkan Printer'}
          </button>

          <button class="btn btn-outline" id="btnScanNewBt">
            🔍 Cari Bluetooth Baru
          </button>
        </div>

        <!-- Kartu info printer yang dipilih saat ini -->
        <div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface);border-radius:10px;border:1px solid ${isConn ? '#bbf7d0' : 'var(--border)'};flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:28px;line-height:1">${isConn ? '🖨️' : '🔌'}</div>
            <div>
              <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px">
                <span>${isConn ? esc(name) : selectedPrinter ? esc(selectedPrinter.name) : 'Belum Ada Printer Terpilih'}</span>
                <span class="badge ${isConn ? 'badge-ok' : ''}">${isConn ? '● Terhubung' : 'Terputus'}</span>
              </div>
              <div style="font-size:12px;color:var(--text-2);margin-top:2px">
                ${
                  isConn
                    ? `Format ${s.paperWidth}mm • Siap digunakan mencetak struk belanja kasir`
                    : selectedPrinter
                    ? `Perangkat tersimpan (${selectedPrinter.type === 'bluetooth' ? 'Bluetooth LE' : 'Serial Port'}). Klik "Sambungkan Printer" untuk mengaktifkan.`
                    : 'Pilih printer dari daftar di atas atau klik "Cari Bluetooth Baru".'
                }
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${isConn ? `<button class="btn btn-ghost btn-sm danger" id="btnDisconnectSettings">❌ Putuskan</button>` : ''}
            ${selectedPrinter ? `<button class="btn btn-ghost btn-sm" id="btnDeleteSavedPrinter" title="Hapus printer ini dari daftar tersimpan">🗑 Hapus</button>` : ''}
          </div>
        </div>
      </div>

      <!-- 3. PILIH FORMAT KERTAS & PENGATURAN STRUK -->
      <div style="margin-bottom:18px">
        <label style="font-weight:700;font-size:13.5px;margin-bottom:10px;display:block">
          3. Format Kertas & Struk Belanja
        </label>
        <div class="grid-3" style="gap:14px">
          <div class="field">
            <label>Lebar Kertas Thermal</label>
            <select class="select" id="settingsPaperWidth">
              <option value="58" ${s.paperWidth === 58 ? 'selected' : ''}>58 mm (32 Kolom - Struk Mini Portable)</option>
              <option value="80" ${s.paperWidth === 80 ? 'selected' : ''}>80 mm (48 Kolom - Struk Kasir Besar)</option>
            </select>
            <span class="hint">Kebanyakan printer Bluetooth saku memakai 58 mm.</span>
          </div>

          <div class="field">
            <label>Jarak Kertas Akhir (Feed)</label>
            <select class="select" id="settingsFeedLines">
              <option value="1" ${s.feedLines === 1 ? 'selected' : ''}>1 Baris</option>
              <option value="2" ${s.feedLines === 2 ? 'selected' : ''}>2 Baris</option>
              <option value="3" ${s.feedLines === 3 ? 'selected' : ''}>3 Baris (Disarankan)</option>
              <option value="4" ${s.feedLines === 4 ? 'selected' : ''}>4 Baris</option>
              <option value="5" ${s.feedLines === 5 ? 'selected' : ''}>5 Baris</option>
            </select>
            <span class="hint">Jumlah baris kosong agar struk mudah disobek.</span>
          </div>

          <div class="field">
            <label>Opsi Tambahan</label>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="chkAutoPrintSettings" ${s.autoPrint ? 'checked' : ''} />
                <span style="font-size:12.5px;font-weight:500">Cetak otomatis setelah transaksi</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="chkDrawerSettings" ${s.openCashDrawer ? 'checked' : ''} />
                <span style="font-size:12.5px;font-weight:500">Buka laci uang (Cash Drawer)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. PANDUAN PENGGUNAAN ANDROID & IOS -->
      <div style="padding:14px 16px;border-radius:var(--radius);background:var(--brand-soft);border:1px solid #c7d2fe;font-size:12.5px;line-height:1.6;color:#374151">
        <strong style="color:var(--brand);font-size:13.5px;display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span>${platform.isIOS ? '🍎' : '📱'}</span>
          <span>${platform.isIOS ? 'Panduan Khusus iOS (iPhone / iPad)' : platform.isAndroid ? 'Panduan Khusus Android' : 'Panduan Komputer / Desktop'}</span>
        </strong>
        ${
          platform.isIOS
            ? `
          <ul style="margin:0;padding-left:18px">
            <li><strong>Koneksi Bluetooth Langsung:</strong> Safari bawaan Apple membatasi Web Bluetooth. Pasang browser gratis <strong>"Bluefy - Web BLE Browser"</strong> di App Store lalu buka web POS ini. Bluetooth thermal akan langsung tersambung dan siap cetak!</li>
            <li><strong>Alternatif Tanpa Bluefy:</strong> Pilih mode <em>"Cetak Sistem / Browser"</em> di atas untuk mencetak via AirPrint atau printer yang terpasang di iOS.</li>
          </ul>`
            : platform.isAndroid
            ? `
          <ul style="margin:0;padding-left:18px">
            <li>Didukung langsung di <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, dan <strong>Samsung Internet</strong>.</li>
            <li>Pastikan sakelar <strong>Bluetooth</strong> dan <strong>Lokasi (GPS)</strong> aktif di pengaturan HP sebelum memindai printer thermal.</li>
            <li>Semua printer BLE portable (Panda, Eppos, Iware, BellaV, Zjiang, GOOJPRT, Xprinter, MPT-II, RPP02N) dapat langsung tersambung.</li>
          </ul>`
            : `
          <ul style="margin:0;padding-left:18px">
            <li>Gunakan Google Chrome atau Microsoft Edge untuk Web Bluetooth.</li>
            <li>Jika printer thermal sudah dipasangkan di Windows Bluetooth Settings, Anda juga bisa memilih mode <em>Port Serial / USB / SPP</em>.</li>
          </ul>`
        }
      </div>
    </div>
  </div>`;
}

/* ------------------------------- Template ------------------------------- */

function template() {
  const s = state.settings;
  return `
  <div class="grid-2" style="align-items:start;gap:16px">
    <div class="card">
      <div class="card-head">
        <h3>👥 Pengguna & PIN</h3>
        <button class="btn btn-ghost btn-sm" id="btnAddUser">＋ Tambah</button>
      </div>
      <div class="card-body" style="padding:0">
        <div id="userList"><div class="empty" style="padding:24px"><span>Memuat...</span></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>🔒 PIN Saya</h3></div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-2);margin-bottom:12px">
          Anda masuk sebagai <strong>${esc(state.auth.user?.name || '-')}</strong>
          (${esc(ROLE_LABEL[state.auth.user?.role] || '-')}).
          Setelah PIN diubah, semua perangkat harus masuk ulang.
        </p>
        <div class="grid-2">
          <div class="field">
            <label>PIN lama</label>
            <input class="input" id="pinOld" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
          </div>
          <div class="field">
            <label>PIN baru (4 angka)</label>
            <input class="input" id="pinNew" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
          </div>
        </div>
        <button class="btn btn-block" id="btnChangePin" style="margin-top:12px">🔑 Ubah PIN Saya</button>
      </div>
    </div>
  </div>

  <div class="grid-2" style="margin-top:16px;align-items:start;gap:16px">
    <div class="card">
      <div class="card-head"><h3>🏪 Identitas Toko</h3></div>
      <div class="card-body">
        <div class="field">
          <label>Nama toko</label>
          <input class="input" id="storeName" value="${esc(s.storeName)}" />
        </div>
        <div class="field" style="margin-top:12px">
          <label>Alamat</label>
          <input class="input" id="address" value="${esc(s.address)}" />
        </div>
        <div class="field" style="margin-top:12px">
          <label>Telepon / WhatsApp</label>
          <input class="input" id="phone" value="${esc(s.phone)}" />
        </div>
        <div class="field" style="margin-top:12px">
          <label>Ucapan di struk</label>
          <input class="input" id="receiptFooter" value="${esc(s.receiptFooter)}" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>💵 Biaya & Stok</h3></div>
      <div class="card-body">
        <div class="grid-2">
          <div class="field">
            <label>Biaya layanan (Rp)</label>
            <input class="input" id="serviceCharge" type="number" min="0" value="${s.serviceCharge}" />
            <span class="hint">Ditambahkan ke setiap nota. Isi 0 jika tidak dipakai.</span>
          </div>
          <div class="field">
            <label>Batas stok menipis (default)</label>
            <input class="input" id="lowStockThreshold" type="number" min="0" value="${s.lowStockThreshold}" />
            <span class="hint">Peringatan muncul saat stok ≤ nilai ini.</span>
          </div>
        </div>
        <div class="field" style="margin-top:12px">
          <label>Daftar kasir</label>
          <input class="input" id="cashiers" value="${esc((s.cashiers || []).join(', '))}" />
          <span class="hint">Pisahkan dengan koma. Kasir aktif dipilih dari bilah atas.</span>
        </div>
      </div>
    </div>
  </div>

  <div class="grid-3" style="margin-top:16px;align-items:start">
    ${listEditor('Kategori Produk', 'categories', 'Contoh: Atasan, Bawahan, Dress, Outerwear.')}
    ${listEditor('Ukuran', 'sizes', 'Contoh: S, M, L, XL, All Size.')}
    ${listEditor('Warna', 'colors', 'Warna yang sering dipakai, dipakai sebagai saran input.')}
  </div>

  ${printerSettingsCardHTML()}

  <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
    <button class="btn btn-lg" id="btnSaveSettings">💾 Simpan Pengaturan</button>
    <button class="btn btn-ghost btn-lg" id="btnReload">↺ Muat Ulang</button>
  </div>

  <div class="grid-2" style="margin-top:20px;align-items:start;gap:16px">
    <div class="card">
      <div class="card-head"><h3>🗄 Backup & Restore</h3></div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-2);margin-bottom:12px">
          Backup berisi seluruh produk, transaksi, dan pengaturan dalam satu file JSON.
          Simpan berkala agar data aman.
        </p>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn" id="btnBackup">⬇ Unduh Backup</button>
          <button class="btn btn-ghost" id="btnRestore">⬆ Pulihkan dari File</button>
        </div>
        <input type="file" id="fileRestore" accept="application/json,.json" hidden />
      </div>
    </div>

    <div class="card" style="border-color:#fecaca">
      <div class="card-head"><h3 style="color:var(--danger)">⚠️ Zona Berbahaya</h3></div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-2);margin-bottom:12px">
          Hapus <strong>semua</strong> produk dan transaksi. Tindakan ini tidak bisa dibatalkan —
          pastikan sudah mengunduh backup.
        </p>
        <button class="btn btn-danger" id="btnReset">🗑 Hapus Semua Data</button>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>ℹ️ Informasi Data</h3></div>
    <div class="card-body">
      <div class="grid-3">
        <div><div class="kpi-label">Jumlah produk</div><div style="font-size:18px;font-weight:700">${state.products.length}</div></div>
        <div><div class="kpi-label">Total transaksi</div><div style="font-size:18px;font-weight:700">${state.transactionCount}</div></div>
        <div><div class="kpi-label">Stok menipis</div><div style="font-size:18px;font-weight:700">${state.lowStockCount}</div></div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--text-3)">
        Penjualan hari ini: <strong>${rupiah(state.todayReport.totalSales)}</strong> dari
        ${state.todayReport.transactionCount} transaksi.
      </div>
    </div>
  </div>`;
}

/* ---------------------------- Pengguna & PIN ---------------------------- */

let userCache = [];

/** Header otorisasi untuk unduhan yang tidak lewat api.js. */
const authHeaders = () => {
  const token = getToken();
  return token ? { 'X-Auth-Token': token } : {};
};

async function loadUsers(root) {
  const box = $('#userList', root);
  if (!box) return;

  try {
    const { users } = await api.listUsers();
    userCache = users;
  } catch (err) {
    box.innerHTML = `<div class="empty" style="padding:24px"><span>${esc(err.message)}</span></div>`;
    return;
  }

  const me = state.auth.user?.id;

  box.innerHTML = `
    <table class="data" style="min-width:auto">
      <thead>
        <tr><th>Nama</th><th>Peran</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${userCache
          .map(
            (u) => `
          <tr>
            <td>
              <div style="font-weight:600">
                ${u.role === 'admin' ? '🔑' : '👤'} ${esc(u.name)}
                ${u.id === me ? '<span class="badge badge-brand">Anda</span>' : ''}
              </div>
            </td>
            <td>
              <span class="badge ${u.role === 'admin' ? 'badge-brand' : ''}">${ROLE_LABEL[u.role] || u.role}</span>
            </td>
            <td>
              ${u.active ? '<span class="badge badge-ok">Aktif</span>' : '<span class="badge badge-danger">Nonaktif</span>'}
            </td>
            <td>
              <div class="actions">
                <button class="icon-btn" data-user-edit="${u.id}" title="Ubah">✏️</button>
                <button class="icon-btn danger" data-user-del="${u.id}" title="Hapus">🗑</button>
              </div>
            </td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}

function userForm(user) {
  const isEdit = Boolean(user);
  const u = user || { name: '', role: 'kasir', active: true };

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="field">
      <label>Nama pengguna *</label>
      <input class="input" id="uName" value="${esc(u.name)}" placeholder="cth. Siti" />
    </div>

    <div class="field" style="margin-top:12px">
      <label>Peran</label>
      <select class="select" id="uRole">
        <option value="kasir" ${u.role === 'kasir' ? 'selected' : ''}>Kasir — hanya melayani penjualan</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin — kelola produk, stok, laporan</option>
      </select>
      <span class="hint">Kasir hanya melihat layar kasir: pilih produk lalu bayar.</span>
    </div>

    <div class="field" style="margin-top:12px">
      <label>${isEdit ? 'PIN baru (kosongkan bila tidak diubah)' : 'PIN (4 angka) *'}</label>
      <input class="input" id="uPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
    </div>

    ${
      isEdit
        ? `<div class="field" style="margin-top:12px">
             <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
               <input type="checkbox" id="uActive" ${u.active ? 'checked' : ''} />
               <span>Akun aktif (boleh masuk)</span>
             </label>
           </div>`
        : ''
    }`;

  const foot = document.createElement('div');
  foot.innerHTML = `
    <button class="btn btn-ghost" data-close>Batal</button>
    <button class="btn" id="btnSaveUser">${isEdit ? 'Simpan Perubahan' : 'Tambah Pengguna'}</button>`;

  const modal = openModal({
    title: isEdit ? `Ubah Pengguna — ${u.name}` : 'Tambah Pengguna',
    body,
    footer: foot,
  });

  $('#btnSaveUser', modal).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payload = {
      name: $('#uName', modal).value.trim(),
      role: $('#uRole', modal).value,
    };

    const pin = $('#uPin', modal).value;
    if (pin) payload.pin = pin;
    if (isEdit) payload.active = $('#uActive', modal).checked;

    if (!payload.name) return toast('Nama pengguna wajib diisi', 'warn');
    if (!isEdit && !pin) return toast('PIN wajib diisi untuk pengguna baru', 'warn');
    if (pin && !/^\d{4}$/.test(pin)) return toast('PIN harus 4 angka', 'warn');

    btn.disabled = true;
    try {
      if (isEdit) await api.updateUser(u.id, payload);
      else await api.createUser(payload);
      closeModal();
      toast(isEdit ? 'Pengguna diperbarui' : 'Pengguna ditambahkan', 'ok');
      loadUsers(document.getElementById('view'));
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  // Modal bisa sudah ditutup sebelum timeout jalan, jadi cek dulu keberadaannya.
  setTimeout(() => $('#uName', modal)?.focus(), 80);
}

/* ------------------------------- View utama ----------------------------- */

export function settingsView(root) {
  root.innerHTML = template();

  $('#btnSaveSettings', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await saveSettings({
        storeName: $('#storeName', root).value.trim(),
        address: $('#address', root).value.trim(),
        phone: $('#phone', root).value.trim(),
        receiptFooter: $('#receiptFooter', root).value,
        serviceCharge: Number($('#serviceCharge', root).value) || 0,
        lowStockThreshold: Number($('#lowStockThreshold', root).value) || 0,
        cashiers: $('#cashiers', root)
          .value.split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      });
      toast('Pengaturan disimpan', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('#btnReload', root).addEventListener('click', async () => {
    await bootstrap();
    settingsView(root);
    toast('Pengaturan dimuat ulang', 'info');
  });

  /* ----- editor daftar (kategori/ukuran/warna) ----- */

  on(root, 'click', '[data-list-add]', async (e, btn) => {
    const key = btn.dataset.listAdd;
    const value = await promptDialog(`Tambah ${key}`, { label: 'Nama pilihan', placeholder: 'cth. Kemeja' });
    if (!value || !value.trim()) return;

    const list = [...(state.settings[key] || [])];
    if (list.some((v) => v.toLowerCase() === value.trim().toLowerCase())) {
      toast('Pilihan sudah ada', 'warn');
      return;
    }
    list.push(value.trim());
    await saveSettings({ [key]: list });
    settingsView(root);
    toast('Pilihan ditambahkan', 'ok');
  });

  on(root, 'click', '[data-list-del]', async (e, btn) => {
    const key = btn.dataset.listDel;
    const value = btn.dataset.value;
    const list = (state.settings[key] || []).filter((v) => v !== value);
    if (!list.length) {
      toast('Minimal harus ada satu pilihan', 'warn');
      return;
    }
    await saveSettings({ [key]: list });
    settingsView(root);
    toast('Pilihan dihapus', 'ok');
  });

  /* ----- pengguna & PIN ----- */

  loadUsers(root);

  $('#btnAddUser', root).addEventListener('click', () => userForm(null));

  on(root, 'click', '[data-user-edit]', (e, btn) => {
    const u = userCache.find((x) => x.id === btn.dataset.userEdit);
    if (u) userForm(u);
  });

  on(root, 'click', '[data-user-del]', async (e, btn) => {
    const u = userCache.find((x) => x.id === btn.dataset.userDel);
    if (!u) return;

    const ok = await confirmDialog(
      'Hapus pengguna?',
      `Akun <strong>${esc(u.name)}</strong> akan dihapus dan tidak bisa lagi masuk ke aplikasi.`,
      { okLabel: 'Hapus akun' },
    );
    if (!ok) return;

    try {
      await api.deleteUser(u.id);
      toast('Pengguna dihapus', 'ok');
      loadUsers(root);
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('#btnChangePin', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const oldPin = $('#pinOld', root).value;
    const newPin = $('#pinNew', root).value;

    if (!oldPin || !newPin) return toast('Isi PIN lama dan PIN baru', 'warn');

    btn.disabled = true;
    try {
      await api.changeOwnPin(oldPin, newPin);
      toast('PIN berhasil diubah. Silakan masuk ulang.', 'ok');
      // PIN berubah → sesi lama tidak berlaku lagi.
      clearSession();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });

  /* ----- backup / restore / reset ----- */

  $('#btnBackup', root).addEventListener('click', async () => {
    try {
      // Diunduh lewat fetch agar token sesi ikut terkirim.
      const res = await fetch('/api/backup', { headers: authHeaders() });
      if (!res.ok) throw new Error('Gagal membuat backup');
      const blob = await res.blob();
      download(`backup-pos-${todayISO()}.json`, blob);
      toast('Backup sedang diunduh...', 'info');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  const fileInput = $('#fileRestore', root);
  $('#btnRestore', root).addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const ok = await confirmDialog(
        'Pulihkan data dari backup?',
        `File berisi <strong>${(payload.products || []).length} produk</strong> dan
         <strong>${(payload.transactions || []).length} transaksi</strong>.
         Data saat ini akan <strong>ditimpa</strong>.`,
        { okLabel: 'Ya, pulihkan' },
      );
      if (!ok) return;

      await api.restore(payload);
      await bootstrap();
      await refreshProducts();
      settingsView(root);
      toast('Data berhasil dipulihkan', 'ok');
    } catch (err) {
      toast(`Gagal memulihkan: ${err.message}`, 'err');
    } finally {
      fileInput.value = '';
    }
  });

  $('#btnReset', root).addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Hapus semua data?',
      'Seluruh produk dan riwayat transaksi akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
      { okLabel: 'Hapus semua' },
    );
    if (!ok) return;

    try {
      await api.reset();
      await bootstrap();
      await refreshProducts();
      await refreshSummary();
      settingsView(root);
      toast('Semua data telah dihapus', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  /* ----- printer thermal bluetooth ----- */

  function bindPrinterEvents() {
    // 1. Pilihan Mode Koneksi (Radio)
    const modeRadios = root.querySelectorAll('input[name="printerMode"]');
    modeRadios.forEach((r) => {
      r.addEventListener('change', (e) => {
        const val = e.target.value;
        printerService.saveSettings({ printerMode: val });
        toast(
          `Mode printer: ${
            val === 'bluetooth' ? 'Bluetooth (BLE)' : val === 'serial' ? 'Port Serial / USB' : 'Cetak Sistem (Browser)'
          }`,
          'info',
        );
        refreshPrinterCard();
      });
    });

    // 2. Dropdown Pilih Perangkat Printer
    const selPrinter = $('#settingsSelectPrinter', root);
    if (selPrinter) {
      selPrinter.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (val === '__add_bt__') {
          try {
            const res = await printerService.connectBluetooth();
            toast(`Printer ${res.deviceName} terhubung`, 'ok');
          } catch (err) {
            toast(err.message, 'err');
          }
          refreshPrinterCard();
        } else if (val === '__add_serial__') {
          try {
            await printerService.connectSerial();
            toast('Printer Serial terhubung', 'ok');
          } catch (err) {
            toast(err.message, 'err');
          }
          refreshPrinterCard();
        } else if (val) {
          printerService.selectPrinter(val);
          refreshPrinterCard();
        }
      });
    }

    // Tombol Sambungkan Printer Terpilih
    const btnConnectSel = $('#btnConnectSelectedPrinter', root);
    if (btnConnectSel) {
      btnConnectSel.addEventListener('click', async () => {
        btnConnectSel.disabled = true;
        btnConnectSel.textContent = '⏳ Menghubungkan...';
        try {
          const targetId = printerService.settings.selectedPrinterId;
          if (targetId) {
            await printerService.connectSavedPrinter(targetId);
          } else {
            await printerService.connectBluetooth();
          }
          toast('Printer berhasil tersambung', 'ok');
          refreshPrinterCard();
        } catch (err) {
          toast(err.message, 'err', 4500);
          btnConnectSel.disabled = false;
          btnConnectSel.textContent = '⚡ Sambungkan Printer';
        }
      });
    }

    // Tombol Cari Bluetooth Baru
    const btnScan = $('#btnScanNewBt', root);
    if (btnScan) {
      btnScan.addEventListener('click', async () => {
        btnScan.disabled = true;
        btnScan.textContent = '⏳ Mencari...';
        try {
          const res = await printerService.connectBluetooth();
          toast(`Printer ${res.deviceName} terhubung`, 'ok');
          refreshPrinterCard();
        } catch (err) {
          toast(err.message, 'err', 4500);
          btnScan.disabled = false;
          btnScan.textContent = '🔍 Cari Bluetooth Baru';
        }
      });
    }

    // Tombol Hapus Printer dari Daftar
    const btnDel = $('#btnDeleteSavedPrinter', root);
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        const targetId = printerService.settings.selectedPrinterId;
        if (targetId) {
          printerService.removeSavedPrinter(targetId);
          toast('Printer dihapus dari daftar tersimpan', 'info');
          refreshPrinterCard();
        }
      });
    }

    // Tombol Test Print
    const btnTest = $('#btnTestPrintSettings', root);
    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        btnTest.disabled = true;
        btnTest.textContent = '⏳ Mencetak...';
        try {
          await printTestReceipt(state.settings);
          toast('Struk test berhasil dicetak', 'ok');
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          btnTest.disabled = false;
          btnTest.textContent = '🧾 Test Cetak';
        }
      });
    }

    // Tombol Putuskan
    const btnDis = $('#btnDisconnectSettings', root);
    if (btnDis) {
      btnDis.addEventListener('click', async () => {
        await printerService.disconnect();
        toast('Printer diputuskan', 'info');
        refreshPrinterCard();
      });
    }

    // Pilihan Lebar Kertas
    const selWidth = $('#settingsPaperWidth', root);
    if (selWidth) {
      selWidth.addEventListener('change', (e) => {
        printerService.saveSettings({ paperWidth: Number(e.target.value) });
        toast(`Format kertas diubah ke ${e.target.value}mm`, 'info');
      });
    }

    // Jarak Feed Kertas
    const selFeed = $('#settingsFeedLines', root);
    if (selFeed) {
      selFeed.addEventListener('change', (e) => {
        printerService.saveSettings({ feedLines: Number(e.target.value) });
      });
    }

    // Auto-Print Checkbox
    const chkAuto = $('#chkAutoPrintSettings', root);
    if (chkAuto) {
      chkAuto.addEventListener('change', (e) => {
        printerService.saveSettings({ autoPrint: e.target.checked });
        toast(e.target.checked ? 'Cetak otomatis diaktifkan' : 'Cetak otomatis dinonaktifkan', 'info');
      });
    }

    // Cash Drawer Checkbox
    const chkDrawer = $('#chkDrawerSettings', root);
    if (chkDrawer) {
      chkDrawer.addEventListener('change', (e) => {
        printerService.saveSettings({ openCashDrawer: e.target.checked });
        toast(e.target.checked ? 'Buka laci kasir otomatis diaktifkan' : 'Buka laci kasir dinonaktifkan', 'info');
      });
    }
  }

  function refreshPrinterCard() {
    const card = $('#printerSettingsCard', root);
    if (card) {
      const dummy = document.createElement('div');
      dummy.innerHTML = printerSettingsCardHTML();
      const newCard = dummy.firstElementChild;
      card.replaceWith(newCard);
      bindPrinterEvents();
    }
  }

  bindPrinterEvents();
  const unsubPrinter = printerService.subscribe(refreshPrinterCard);

  return () => {
    unsubPrinter();
  };
}
