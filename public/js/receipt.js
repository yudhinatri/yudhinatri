/* Render struk belanja (dipakai setelah pembayaran & dari riwayat transaksi).
   Mendukung pencetakan langsung ke printer thermal Bluetooth & dialog browser bawaan. */

import { esc, rupiah, tanggalPendek, jamMenit, LABEL_METODE } from './utils.js';
import { toast } from './ui.js';
import { printerService } from './bluetoothPrinter.js';
import { buildReceiptCommands, buildTestReceiptCommands } from './escpos.js';

export function receiptHTML(trx, settings = {}) {
  const items = (trx.items || [])
    .map(
      (it) => `
      <tr>
        <td colspan="3">${esc(it.name)}${it.size || it.color ? ` <small style="color:var(--text-2)">(${[it.size, it.color].filter(Boolean).join('/')})</small>` : ''}</td>
      </tr>
      <tr>
        <td>${it.qty} x ${rupiah(it.price)}${it.discount ? ` -${rupiah(it.discount)}` : ''}</td>
        <td class="r" colspan="2">${rupiah(it.subtotal)}</td>
      </tr>`,
    )
    .join('');

  const lineDiscount = (trx.items || []).reduce((s, it) => s + (it.discount || 0), 0);

  return `
  <div class="receipt">
    <div class="receipt-center">
      <h4>${esc(settings.storeName || 'Toko Pakaian')}</h4>
      ${settings.address ? `<div>${esc(settings.address)}</div>` : ''}
      ${settings.phone ? `<div>Telp. ${esc(settings.phone)}</div>` : ''}
    </div>
    <hr />
    <table>
      <tr><td>No</td><td class="r" colspan="2">${esc(trx.no)}</td></tr>
      <tr><td>Tanggal</td><td class="r" colspan="2">${tanggalPendek(trx.createdAt)} ${jamMenit(trx.createdAt)}</td></tr>
      <tr><td>Kasir</td><td class="r" colspan="2">${esc(trx.cashier)}</td></tr>
      ${trx.customer ? `<tr><td>Pelanggan</td><td class="r" colspan="2">${esc(trx.customer)}</td></tr>` : ''}
    </table>
    <hr />
    <table>${items}</table>
    <hr />
    <table>
      <tr><td>Subtotal</td><td class="r" colspan="2">${rupiah(trx.subtotal)}</td></tr>
      ${lineDiscount ? `<tr><td>Diskon item</td><td class="r" colspan="2">-${rupiah(lineDiscount)}</td></tr>` : ''}
      ${trx.discount ? `<tr><td>Diskon nota</td><td class="r" colspan="2">-${rupiah(trx.discount)}</td></tr>` : ''}
      ${trx.serviceCharge ? `<tr><td>Biaya layanan</td><td class="r" colspan="2">${rupiah(trx.serviceCharge)}</td></tr>` : ''}
      <tr><td class="big">TOTAL</td><td class="r big" colspan="2">${rupiah(trx.total)}</td></tr>
      <tr><td>${esc(LABEL_METODE[trx.method] || trx.method)}</td><td class="r" colspan="2">${rupiah(trx.paid)}</td></tr>
      ${trx.method === 'cash' ? `<tr><td>Kembali</td><td class="r" colspan="2">${rupiah(trx.change)}</td></tr>` : ''}
    </table>
    <hr />
    <div class="receipt-center">
      <div>${esc(settings.receiptFooter || 'Terima kasih telah berbelanja')}</div>
      <div>${trx.itemCount || (trx.items || []).length} item</div>
      ${trx.status === 'void' ? '<div><strong>*** TRANSAKSI DIBATALKAN ***</strong></div>' : ''}
    </div>
  </div>`;
}

/**
 * Cetak via dialog print browser bawaan (window.print).
 * Tetap didukung penuh sebagai alternatif (misal via AirPrint di iOS atau printer kabel).
 */
export function printBrowserReceipt(trx, settings = {}) {
  const area = document.getElementById('printArea');
  if (!area) return;
  area.innerHTML = receiptHTML(trx, settings);
  window.print();
  setTimeout(() => {
    area.innerHTML = '';
  }, 600);
}

/**
 * Cetak langsung ke printer thermal Bluetooth (ESC/POS).
 */
export async function printBluetoothReceipt(trx, settings = {}) {
  if (!printerService.isConnected()) {
    throw new Error('Printer Bluetooth belum terhubung.');
  }

  const opts = printerService.settings;
  const data = buildReceiptCommands(trx, settings, opts);
  await printerService.printData(data);
}

/**
 * Cetak struk: Otomatis memilih printer thermal Bluetooth jika terhubung,
 * atau jatuh ke dialog cetak browser bila belum terhubung.
 */
export async function printReceipt(trx, settings = {}) {
  const mode = printerService.settings.printerMode || 'bluetooth';

  if (mode !== 'system' && printerService.isConnected()) {
    try {
      toast(`Mencetak ke ${printerService.getDeviceName()}...`, 'info', 2000);
      await printBluetoothReceipt(trx, settings);
      toast('Struk berhasil dicetak', 'ok');
      return true;
    } catch (err) {
      toast(`Gagal mencetak Bluetooth: ${err.message}. Mencoba cetak sistem...`, 'warn', 4000);
      printBrowserReceipt(trx, settings);
      return false;
    }
  } else {
    printBrowserReceipt(trx, settings);
    return false;
  }
}

/**
 * Cetak struk pengujian (test print) ke printer thermal
 */
export async function printTestReceipt(settings = {}) {
  if (!printerService.isConnected()) {
    throw new Error('Printer belum terhubung.');
  }
  const opts = printerService.settings;
  const data = buildTestReceiptCommands(settings, opts);
  await printerService.printData(data);
}
