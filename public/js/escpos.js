/* Generator perintah ESC/POS untuk printer thermal Bluetooth / Serial.
   Mendukung format 58mm (32 kolom) dan 80mm (48 kolom). */

import { rupiah, tanggalPendek, jamMenit, LABEL_METODE } from './utils.js';

/** Konstanta perintah standar ESC/POS */
export const ESC = 0x1b;
export const GS = 0x1d;

export const CMD = {
  INIT: [ESC, 0x40], // ESC @ - Reset & inisialisasi printer
  ALIGN_LEFT: [ESC, 0x61, 0x00], // Rata kiri
  ALIGN_CENTER: [ESC, 0x61, 0x01], // Rata tengah
  ALIGN_RIGHT: [ESC, 0x61, 0x02], // Rata kanan
  BOLD_ON: [ESC, 0x45, 0x01], // Huruf tebal ON
  BOLD_OFF: [ESC, 0x45, 0x00], // Huruf tebal OFF
  FONT_NORMAL: [GS, 0x21, 0x00], // Ukuran normal (Font A)
  FONT_2X: [GS, 0x21, 0x11], // 2x Tinggi + 2x Lebar
  FONT_2W: [GS, 0x21, 0x20], // 2x Lebar
  FONT_2H: [GS, 0x21, 0x01], // 2x Tinggi
  CUT_FULL: [GS, 0x56, 0x00], // Potong penuh
  CUT_PARTIAL: [GS, 0x56, 0x42, 0x00], // Potong sebagian (kertas tersisa sedikit)
  DRAWER_KICK: [ESC, 0x70, 0x00, 0x19, 0xfa], // Buka laci uang (cash drawer)
  FEED: (lines = 1) => [ESC, 0x64, Math.max(1, Math.min(lines, 10))], // Gulir N baris
};

const encoder = new TextEncoder();

/** Kelas pembangun buffer byte ESC/POS */
export class EscPosBuilder {
  constructor(width = 32) {
    this.width = width === 80 ? 48 : 32;
    this.buffer = [];
    this.init();
  }

  raw(bytes) {
    if (Array.isArray(bytes) || bytes instanceof Uint8Array) {
      for (let i = 0; i < bytes.length; i++) this.buffer.push(bytes[i]);
    }
    return this;
  }

  init() {
    return this.raw(CMD.INIT);
  }

  alignLeft() {
    return this.raw(CMD.ALIGN_LEFT);
  }

  alignCenter() {
    return this.raw(CMD.ALIGN_CENTER);
  }

  alignRight() {
    return this.raw(CMD.ALIGN_RIGHT);
  }

  bold(on = true) {
    return this.raw(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
  }

  fontNormal() {
    return this.raw(CMD.FONT_NORMAL);
  }

  fontDouble() {
    return this.raw(CMD.FONT_2X);
  }

  fontDoubleWidth() {
    return this.raw(CMD.FONT_2W);
  }

  fontDoubleHeight() {
    return this.raw(CMD.FONT_2H);
  }

  text(str) {
    if (!str) return this;
    const clean = String(str).replace(/[\r]/g, '');
    const bytes = encoder.encode(clean);
    return this.raw(bytes);
  }

  line(str = '') {
    return this.text(str + '\n');
  }

  divider(char = '-') {
    return this.line(char.repeat(this.width));
  }

  twoCols(left, right) {
    left = String(left ?? '');
    right = String(right ?? '');
    const w = this.width;
    const space = w - left.length - right.length;
    if (space <= 0) {
      if (left.length + right.length > w) {
        left = left.slice(0, Math.max(0, w - right.length - 1));
      }
      return this.line(left + ' ' + right);
    }
    return this.line(left + ' '.repeat(space) + right);
  }

  feed(lines = 3) {
    return this.raw(CMD.FEED(lines));
  }

  cut() {
    return this.raw(CMD.CUT_PARTIAL);
  }

  openDrawer() {
    return this.raw(CMD.DRAWER_KICK);
  }

  build() {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format struk belanja POS pakaian menjadi perintah ESC/POS.
 * @param {object} trx Data transaksi
 * @param {object} settings Pengaturan toko
 * @param {object} options Opsi cetak { paperWidth: 58|80, feedLines: 3, openCashDrawer: false }
 * @returns {Uint8Array}
 */
export function buildReceiptCommands(trx, settings = {}, options = {}) {
  const paperWidth = options.paperWidth === 80 ? 80 : 58;
  const colWidth = paperWidth === 80 ? 48 : 32;
  const feedLines = Number(options.feedLines) >= 0 ? Number(options.feedLines) : 3;

  const b = new EscPosBuilder(colWidth);

  // Opsional buka laci uang
  if (options.openCashDrawer) {
    b.openDrawer();
  }

  // Header Toko (Rata tengah)
  b.alignCenter();
  b.fontDouble();
  b.bold(true);
  b.line(settings.storeName || 'TOKO PAKAIAN');
  b.fontNormal();
  b.bold(false);

  if (settings.address) {
    b.line(settings.address);
  }
  if (settings.phone) {
    b.line('Telp: ' + settings.phone);
  }

  // Garis pemisah
  b.alignLeft();
  b.divider('-');

  // Meta Transaksi
  b.twoCols('No. Struk', trx.no || '-');
  const tglStr = `${tanggalPendek(trx.createdAt)} ${jamMenit(trx.createdAt)}`;
  b.twoCols('Waktu', tglStr);
  b.twoCols('Kasir', trx.cashier || '-');
  if (trx.customer) {
    b.twoCols('Pelanggan', trx.customer);
  }

  b.divider('-');

  // Daftar Item
  const items = trx.items || [];
  for (const it of items) {
    // Baris 1: Nama item + varian jika ada
    let name = it.name;
    const variantParts = [it.size, it.color].filter(Boolean);
    if (variantParts.length) {
      name += ` (${variantParts.join('/')})`;
    }
    b.line(name);

    // Baris 2: Qty x Harga - Diskon dan Subtotal di kanan
    const qtyPrice = `${it.qty} x ${rupiah(it.price)}${it.discount ? ` (-${rupiah(it.discount)})` : ''}`;
    b.twoCols('  ' + qtyPrice, rupiah(it.subtotal));
  }

  b.divider('-');

  // Rincian Pembayaran
  b.twoCols('Subtotal', rupiah(trx.subtotal));

  const lineDiscount = items.reduce((s, it) => s + (it.discount || 0), 0);
  if (lineDiscount > 0) {
    b.twoCols('Diskon Item', '-' + rupiah(lineDiscount));
  }
  if (trx.discount > 0) {
    b.twoCols('Diskon Nota', '-' + rupiah(trx.discount));
  }
  if (trx.serviceCharge > 0) {
    b.twoCols('Biaya Layanan', rupiah(trx.serviceCharge));
  }

  // TOTAL (Tebal)
  b.bold(true);
  b.twoCols('TOTAL', rupiah(trx.total));
  b.bold(false);

  const metodeLabel = LABEL_METODE[trx.method] || trx.method || 'Tunai';
  b.twoCols(metodeLabel, rupiah(trx.paid));

  if (trx.method === 'cash') {
    b.twoCols('Kembali', rupiah(trx.change));
  }

  b.divider('-');

  // Footer & Catatan
  b.alignCenter();
  b.line(settings.receiptFooter || 'Terima kasih telah berbelanja');
  b.line(`${trx.itemCount || items.length} item barang`);

  if (trx.status === 'void') {
    b.bold(true);
    b.line('*** TRANSAKSI DIBATALKAN ***');
    if (trx.voidReason) {
      b.line('Alasan: ' + trx.voidReason);
    }
    b.bold(false);
  }

  // Gulir baris ekstra agar struk mudah disobek
  if (feedLines > 0) {
    b.feed(feedLines);
  }

  // Potong kertas
  b.cut();

  return b.build();
}

/**
 * Buat struk tes uji cetak thermal printer
 * @param {object} settings
 * @param {object} options
 * @returns {Uint8Array}
 */
export function buildTestReceiptCommands(settings = {}, options = {}) {
  const paperWidth = options.paperWidth === 80 ? 80 : 58;
  const colWidth = paperWidth === 80 ? 48 : 32;
  const b = new EscPosBuilder(colWidth);

  b.alignCenter();
  b.fontDouble();
  b.bold(true);
  b.line('TEST PRINTER');
  b.fontNormal();
  b.bold(false);

  b.line(settings.storeName || 'POS Pakaian');
  b.line('Koneksi Bluetooth Berhasil!');
  b.divider('=');

  b.alignLeft();
  b.twoCols('Ukuran Kertas', `${paperWidth} mm (${colWidth} kolom)`);
  b.twoCols('Mode', 'Thermal ESC/POS');
  b.twoCols('Tanggal', tanggalPendek(new Date().toISOString()));
  b.twoCols('Jam', jamMenit(new Date().toISOString()));
  b.divider('-');

  b.line('Pengujian Huruf:');
  b.bold(true);
  b.line('1. Teks Tebal (Bold): AKTIF');
  b.bold(false);
  b.line('2. Rata Kiri / Kanan:');
  b.twoCols('  Item Demo 1', 'Rp 50.000');
  b.twoCols('  Item Demo 2', 'Rp 75.000');
  b.divider('-');

  b.alignCenter();
  b.line('Printer Siap Digunakan');
  b.line('POS Pakaian Android & iOS');
  b.feed(Number(options.feedLines) || 3);
  b.cut();

  return b.build();
}
