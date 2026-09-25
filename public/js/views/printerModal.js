/* Modal Pengaturan & Pemilihan Printer Thermal Bluetooth untuk Android & iOS */

import { $, esc, on } from '../utils.js';
import { openModal, closeModal, toast } from '../ui.js';
import { state } from '../store.js';
import { printerService, detectPlatform } from '../bluetoothPrinter.js';
import { printTestReceipt, printBrowserReceipt } from '../receipt.js';

export function openPrinterModal(initialTrx = null) {
  const body = document.createElement('div');
  body.className = 'printer-modal-content';

  function renderBody() {
    const connected = printerService.isConnected();
    const currentName = printerService.getDeviceName();
    const currentSettings = printerService.settings;
    const platform = detectPlatform();
    const savedPrinters = printerService.getSavedPrinters();
    const selectedId = currentSettings.selectedPrinterId || (savedPrinters[0]?.id) || '';
    const selectedPrinter = savedPrinters.find((p) => p.id === selectedId);

    body.innerHTML = `
      <!-- 1. PILIH MODE KONEKSI -->
      <div style="margin-bottom:14px">
        <label style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:block">
          1. Mode Koneksi Printer
        </label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">
          <label style="cursor:pointer;padding:8px 10px;border:1px solid ${currentSettings.printerMode === 'bluetooth' ? 'var(--brand)' : 'var(--border)'};border-radius:8px;display:flex;align-items:center;gap:6px;background:${currentSettings.printerMode === 'bluetooth' ? 'var(--brand-soft)' : 'var(--surface)'};font-size:12px">
            <input type="radio" name="modalPrinterMode" value="bluetooth" ${currentSettings.printerMode === 'bluetooth' ? 'checked' : ''} />
            <span style="font-weight:600;color:${currentSettings.printerMode === 'bluetooth' ? 'var(--brand)' : 'inherit'}">🔵 Bluetooth</span>
          </label>

          <label style="cursor:pointer;padding:8px 10px;border:1px solid ${currentSettings.printerMode === 'serial' ? 'var(--brand)' : 'var(--border)'};border-radius:8px;display:flex;align-items:center;gap:6px;background:${currentSettings.printerMode === 'serial' ? 'var(--brand-soft)' : 'var(--surface)'};font-size:12px">
            <input type="radio" name="modalPrinterMode" value="serial" ${currentSettings.printerMode === 'serial' ? 'checked' : ''} />
            <span style="font-weight:600;color:${currentSettings.printerMode === 'serial' ? 'var(--brand)' : 'inherit'}">🔌 Serial / USB</span>
          </label>

          <label style="cursor:pointer;padding:8px 10px;border:1px solid ${currentSettings.printerMode === 'system' ? 'var(--brand)' : 'var(--border)'};border-radius:8px;display:flex;align-items:center;gap:6px;background:${currentSettings.printerMode === 'system' ? 'var(--brand-soft)' : 'var(--surface)'};font-size:12px">
            <input type="radio" name="modalPrinterMode" value="system" ${currentSettings.printerMode === 'system' ? 'checked' : ''} />
            <span style="font-weight:600;color:${currentSettings.printerMode === 'system' ? 'var(--brand)' : 'inherit'}">📄 Dialog Sistem</span>
          </label>
        </div>
      </div>

      <!-- 2. PILIH PERANGKAT PRINTER -->
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px">
          <label style="font-size:12.5px;font-weight:700">2. Pilih Perangkat Printer</label>
          <span style="font-size:11px;color:var(--text-3)">${savedPrinters.length} tersimpan</span>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select class="select" id="modalSelectPrinter" style="flex:1;min-width:180px;font-size:12.5px;font-weight:600">
            ${
              savedPrinters.length === 0
                ? `<option value="">-- Belum ada printer tersimpan --</option>`
                : savedPrinters
                    .map(
                      (p) => `
                    <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
                      ${p.type === 'bluetooth' ? '🔵' : '🔌'} ${esc(p.name)} ${connected && p.name === currentName ? '— [Terhubung]' : ''}
                    </option>`,
                    )
                    .join('')
            }
            <option value="__add_bt__">➕ Cari Bluetooth Baru...</option>
            ${platform.isSerialSupported ? `<option value="__add_serial__">➕ Pilih Serial Baru...</option>` : ''}
          </select>

          <button class="btn btn-sm" id="btnModalConnectSel">
            ${connected ? '⚡ Sambungkan Ulang' : '⚡ Sambungkan'}
          </button>
          <button class="btn btn-sm btn-outline" id="btnModalScanBt">
            🔍 Cari Baru
          </button>
        </div>

        <!-- Detail status printer -->
        <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface);border-radius:8px;border:1px solid ${connected ? '#bbf7d0' : 'var(--border)'};gap:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">${connected ? '🖨️' : '⚪'}</span>
            <div>
              <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">
                <span>${connected ? esc(currentName) : selectedPrinter ? esc(selectedPrinter.name) : 'Belum Ada Printer'}</span>
                <span class="badge ${connected ? 'badge-ok' : ''}">${connected ? '● Terhubung' : 'Terputus'}</span>
              </div>
              <div style="font-size:11px;color:var(--text-2)">
                ${connected ? `Format ${currentSettings.paperWidth}mm • Siap cetak` : 'Klik "Sambungkan" untuk mengaktifkan'}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:6px">
            ${connected ? `<button class="btn btn-sm" id="btnTestPrint">🧾 Test Cetak</button>` : ''}
            ${connected ? `<button class="btn btn-ghost btn-sm danger" id="btnDisconnect">❌ Putuskan</button>` : ''}
            ${selectedPrinter && !connected ? `<button class="btn btn-ghost btn-sm" id="btnModalDelPrinter" title="Hapus dari daftar">🗑</button>` : ''}
          </div>
        </div>
      </div>

      <!-- 3. PENGATURAN KERTAS & STRUK -->
      <div class="card" style="background:var(--surface-2);border-radius:var(--radius);margin-bottom:14px">
        <div class="card-head" style="padding:8px 12px;border-bottom:1px solid var(--border)">
          <h4 style="font-size:12.5px">3. Pengaturan Kertas & Struk</h4>
        </div>
        <div class="card-body" style="padding:10px 12px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <label style="font-size:12.5px;font-weight:600">Lebar Kertas Thermal</label>
            <div style="display:flex;gap:12px">
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px">
                <input type="radio" name="paperWidth" value="58" ${currentSettings.paperWidth === 58 ? 'checked' : ''} />
                <span>58 mm (Mini)</span>
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px">
                <input type="radio" name="paperWidth" value="80" ${currentSettings.paperWidth === 80 ? 'checked' : ''} />
                <span>80 mm (Besar)</span>
              </label>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:12.5px;font-weight:600">Cetak Otomatis</div>
              <div style="font-size:11px;color:var(--text-2)">Langsung cetak struk selesai bayar</div>
            </div>
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="chkAutoPrint" ${currentSettings.autoPrint ? 'checked' : ''} />
              <span style="font-size:12px">Aktif</span>
            </label>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <label style="font-size:12.5px;font-weight:600">Jarak Kertas Akhir (Feed)</label>
            <select class="select" id="selFeedLines" style="width:105px;padding:3px 6px;font-size:12px">
              <option value="1" ${currentSettings.feedLines === 1 ? 'selected' : ''}>1 Baris</option>
              <option value="2" ${currentSettings.feedLines === 2 ? 'selected' : ''}>2 Baris</option>
              <option value="3" ${currentSettings.feedLines === 3 ? 'selected' : ''}>3 Baris</option>
              <option value="4" ${currentSettings.feedLines === 4 ? 'selected' : ''}>4 Baris</option>
              <option value="5" ${currentSettings.feedLines === 5 ? 'selected' : ''}>5 Baris</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Panduan Singkat -->
      <div style="padding:10px 12px;background:var(--brand-soft);border-radius:var(--radius);border:1px solid #c7d2fe;font-size:11.5px;line-height:1.5;color:#374151">
        ${
          platform.isIOS
            ? `<strong>🍎 Info iOS (iPhone/iPad):</strong> Gunakan browser <strong>Bluefy</strong> di App Store untuk koneksi Bluetooth langsung, atau pilih mode <em>Dialog Sistem / AirPrint</em>.`
            : platform.isAndroid
            ? `<strong>📱 Info Android:</strong> Pastikan <strong>Bluetooth</strong> dan <strong>Lokasi (GPS)</strong> aktif sebelum mencari printer.`
            : `<strong>💻 Info Komputer:</strong> Didukung di Chrome/Edge via Bluetooth atau Port Serial/SPP.`
        }
      </div>
    `;

    bindActions();
  }

  function bindActions() {
    // Mode radio
    const modeRadios = body.querySelectorAll('input[name="modalPrinterMode"]');
    modeRadios.forEach((r) => {
      r.addEventListener('change', (e) => {
        printerService.saveSettings({ printerMode: e.target.value });
        renderBody();
      });
    });

    // Dropdown pilih printer
    const selPrinter = $('#modalSelectPrinter', body);
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
          renderBody();
        } else if (val === '__add_serial__') {
          try {
            await printerService.connectSerial();
            toast('Printer Serial terhubung', 'ok');
          } catch (err) {
            toast(err.message, 'err');
          }
          renderBody();
        } else if (val) {
          printerService.selectPrinter(val);
          renderBody();
        }
      });
    }

    // Tombol sambungkan yang dipilih
    const btnConnectSel = $('#btnModalConnectSel', body);
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
          renderBody();
        } catch (err) {
          toast(err.message, 'err', 4500);
          btnConnectSel.disabled = false;
          btnConnectSel.textContent = '⚡ Sambungkan';
        }
      });
    }

    // Tombol cari Bluetooth baru
    const btnScan = $('#btnModalScanBt', body);
    if (btnScan) {
      btnScan.addEventListener('click', async () => {
        btnScan.disabled = true;
        btnScan.textContent = '⏳ Mencari...';
        try {
          const res = await printerService.connectBluetooth();
          toast(`Printer ${res.deviceName} terhubung`, 'ok');
          renderBody();
        } catch (err) {
          toast(err.message, 'err', 4500);
          btnScan.disabled = false;
          btnScan.textContent = '🔍 Cari Baru';
        }
      });
    }

    // Tombol hapus printer tersimpan
    const btnDel = $('#btnModalDelPrinter', body);
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        const targetId = printerService.settings.selectedPrinterId;
        if (targetId) {
          printerService.removeSavedPrinter(targetId);
          toast('Printer dihapus dari daftar', 'info');
          renderBody();
        }
      });
    }

    // Tombol Test Print
    const btnTest = $('#btnTestPrint', body);
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

    // Tombol Disconnect
    const btnDis = $('#btnDisconnect', body);
    if (btnDis) {
      btnDis.addEventListener('click', async () => {
        await printerService.disconnect();
        toast('Printer diputuskan', 'info');
        renderBody();
      });
    }

    // Lebar Kertas
    const radios = body.querySelectorAll('input[name="paperWidth"]');
    radios.forEach((r) => {
      r.addEventListener('change', (e) => {
        printerService.saveSettings({ paperWidth: Number(e.target.value) });
        toast(`Format kertas diubah ke ${e.target.value}mm`, 'info');
      });
    });

    // Auto Print
    const chkAuto = $('#chkAutoPrint', body);
    if (chkAuto) {
      chkAuto.addEventListener('change', (e) => {
        printerService.saveSettings({ autoPrint: e.target.checked });
        toast(e.target.checked ? 'Cetak otomatis aktif' : 'Cetak otomatis nonaktif', 'info');
      });
    }

    // Feed Lines
    const selFeed = $('#selFeedLines', body);
    if (selFeed) {
      selFeed.addEventListener('change', (e) => {
        printerService.saveSettings({ feedLines: Number(e.target.value) });
      });
    }
  }

  renderBody();

  const foot = document.createElement('div');
  foot.innerHTML = `
    ${
      initialTrx
        ? `<button class="btn btn-outline" id="btnModalPrintFallback">📄 Cetak Sistem / PDF</button>`
        : ''
    }
    <button class="btn btn-ghost" data-close>Tutup</button>
  `;

  if (initialTrx) {
    on(foot, 'click', '#btnModalPrintFallback', () => {
      closeModal();
      printBrowserReceipt(initialTrx, state.settings);
    });
  }

  const unsub = printerService.subscribe(() => {
    if (body.isConnected) {
      renderBody();
    }
  });

  const modal = openModal({
    title: '🖨️ Pilih Bluetooth & Printer',
    body,
    footer: foot,
    wide: true,
    onClose: () => {
      unsub();
    },
  });

  return modal;
}
