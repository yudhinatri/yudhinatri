/* Driver Printer Thermal Bluetooth (BLE, Android SPP Native, & Web Serial) untuk POS Pakaian.
   Mendukung:
   - Android Native App (via AndroidPOS Bridge - Classic SPP RFCOMM)
   - Android Browser (Google Chrome, Edge via Web Bluetooth)
   - iOS (Bluefy / WebBLE via Web Bluetooth & AirPrint Dialog)
   - Desktop PC (Chrome/Edge via Web Bluetooth & Web Serial / SPP Virtual COM) */

const STORAGE_KEY = 'pos.bluetooth_printer';

// Daftar UUID Layanan GATT BLE yang umum digunakan oleh thermal printer portable (Panda, Eppos, Iware, BellaV, Zjiang, GOOJPRT, Xprinter, dsb.)
export const COMMON_BLE_SERVICES = [
  0x18f0,
  0xffe0,
  0xfff0,
  0xff00,
  0xae00,
  0xfee7,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000e781-0000-1000-8000-00805f9b34fb',
];

// Deteksi platform sistem operasi dan ketersediaan Bluetooth
export function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !window.MSStream;
  const isAndroid = /Android/i.test(ua);
  const isNativeAndroid = Boolean(window.AndroidPOS && typeof window.AndroidPOS.isAndroidApp === 'function' && window.AndroidPOS.isAndroidApp());
  const isBluetoothSupported = isNativeAndroid || ('bluetooth' in navigator);
  const isSerialSupported = 'serial' in navigator;

  let mode = 'desktop';
  if (isIOS) mode = 'ios';
  else if (isAndroid) mode = 'android';

  return {
    os: mode,
    isIOS,
    isAndroid,
    isNativeAndroid,
    isBluetoothSupported,
    isSerialSupported,
    isBluefy: isIOS && ('bluetooth' in navigator),
  };
}

class BluetoothPrinterService {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;

    // Untuk koneksi Web Serial (SPP/COM/USB)
    this.serialPort = null;
    this.serialWriter = null;

    this.connectionType = null; // 'bluetooth' | 'serial' | 'android_native' | null
    this.isConnecting = false;
    this.listeners = new Set();

    this.settings = this.loadSettings();

    // Auto-detect status jika berjalan di Native Android
    this.checkNativeStatus();
  }

  isNativeAndroidApp() {
    return Boolean(window.AndroidPOS && typeof window.AndroidPOS.isAndroidApp === 'function' && window.AndroidPOS.isAndroidApp());
  }

  checkNativeStatus() {
    if (this.isNativeAndroidApp()) {
      try {
        if (window.AndroidPOS.isPrinterConnected && window.AndroidPOS.isPrinterConnected()) {
          this.connectionType = 'android_native';
        }
      } catch {
        /* abaikan */
      }
    }
  }

  loadSettings() {
    const def = {
      printerMode: 'bluetooth', // 'bluetooth' | 'serial' | 'system'
      paperWidth: 58, // 58 atau 80 mm
      autoPrint: false, // otomatis cetak setelah bayar berhasil
      feedLines: 3, // baris kosong di akhir struk
      openCashDrawer: false, // buka laci uang
      lastDeviceName: '',
      lastDeviceId: '',
      savedPrinters: [], // [{ id, name, type, lastUsed }]
      selectedPrinterId: '',
    };

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...def, ...saved };
    } catch {
      return def;
    }
  }

  saveSettings(patch = {}) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* abaikan */
    }
    this.emitChange();
    return this.settings;
  }

  getSavedPrinters() {
    return Array.isArray(this.settings.savedPrinters) ? this.settings.savedPrinters : [];
  }

  addSavedPrinter(printer) {
    if (!printer || !printer.id) return;
    const list = this.getSavedPrinters().filter((p) => p.id !== printer.id);
    list.unshift({
      id: printer.id,
      name: printer.name || 'Printer Thermal',
      type: printer.type || 'bluetooth',
      lastUsed: new Date().toISOString(),
    });
    this.saveSettings({
      savedPrinters: list,
      selectedPrinterId: printer.id,
      lastDeviceName: printer.name || '',
      lastDeviceId: printer.id,
    });
  }

  removeSavedPrinter(printerId) {
    const list = this.getSavedPrinters().filter((p) => p.id !== printerId);
    const patch = { savedPrinters: list };
    if (this.settings.selectedPrinterId === printerId) {
      patch.selectedPrinterId = list.length > 0 ? list[0].id : '';
    }
    this.saveSettings(patch);
  }

  selectPrinter(printerId) {
    this.saveSettings({ selectedPrinterId: printerId });
  }

  /**
   * Mengambil daftar printer Bluetooth yang sudah dipasangkan di HP / browser
   */
  async getPairedBluetoothDevices() {
    // 1. Android Native App (mengambil daftar paired / bonded devices dari sistem Android)
    if (this.isNativeAndroidApp()) {
      try {
        const jsonStr = window.AndroidPOS.getBondedDevices();
        const list = JSON.parse(jsonStr || '[]');
        if (Array.isArray(list)) {
          return list
            .filter((d) => d && d.address && !d.error)
            .map((d) => ({
              id: d.address,
              name: d.name || 'Printer Bluetooth',
              address: d.address,
              type: 'android_native',
            }));
        }
      } catch (e) {
        console.error('Gagal mengambil daftar paired devices Android:', e);
      }
      return [];
    }

    // 2. Browser Chrome / Edge Web Bluetooth
    if (navigator.bluetooth && typeof navigator.bluetooth.getDevices === 'function') {
      try {
        return await navigator.bluetooth.getDevices();
      } catch {
        return [];
      }
    }
    return [];
  }

  isConnected() {
    if (this.connectionType === 'android_native') {
      try {
        return Boolean(window.AndroidPOS && window.AndroidPOS.isPrinterConnected && window.AndroidPOS.isPrinterConnected());
      } catch {
        return false;
      }
    }
    if (this.connectionType === 'bluetooth') {
      return Boolean(this.device && this.server && this.server.connected && this.characteristic);
    }
    if (this.connectionType === 'serial') {
      return Boolean(this.serialPort && this.serialWriter);
    }
    return false;
  }

  getDeviceName() {
    if (this.connectionType === 'android_native') {
      try {
        const name = window.AndroidPOS?.getConnectedPrinterName?.();
        return name || this.settings.lastDeviceName || 'Printer Bluetooth';
      } catch {
        return this.settings.lastDeviceName || 'Printer Bluetooth';
      }
    }
    if (!this.isConnected()) {
      return this.settings.lastDeviceName || '';
    }
    if (this.connectionType === 'bluetooth') {
      return this.device?.name || this.settings.lastDeviceName || 'Printer Bluetooth';
    }
    if (this.connectionType === 'serial') {
      return 'Printer Serial / SPP';
    }
    return '';
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emitChange() {
    const status = {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      deviceName: this.getDeviceName(),
      type: this.connectionType,
      settings: { ...this.settings },
      platform: detectPlatform(),
      savedPrinters: this.getSavedPrinters(),
    };
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (e) {
        console.error('Printer listener error:', e);
      }
    });
  }

  /**
   * Hubungkan printer di aplikasi Android Native (Classic Bluetooth SPP)
   */
  async connectNative(macAddress, deviceName = '') {
    if (!this.isNativeAndroidApp()) {
      throw new Error('Aplikasi Android POS tidak terdeteksi');
    }

    this.isConnecting = true;
    this.emitChange();

    try {
      await this.disconnect();

      // Beri jeda sejenak agar status UI terupdate
      const resJson = await new Promise((resolve) => {
        setTimeout(() => {
          try {
            resolve(window.AndroidPOS.connectPrinter(macAddress));
          } catch (err) {
            resolve(JSON.stringify({ success: false, error: err.message }));
          }
        }, 60);
      });

      const res = typeof resJson === 'string' ? JSON.parse(resJson || '{}') : resJson;
      if (!res || !res.success) {
        throw new Error(res?.error || 'Gagal menyambungkan ke printer Bluetooth');
      }

      this.connectionType = 'android_native';
      this.isConnecting = false;

      const finalName = res.name || deviceName || 'Printer Bluetooth';
      this.addSavedPrinter({
        id: macAddress,
        name: finalName,
        type: 'android_native',
      });

      this.saveSettings({
        printerMode: 'bluetooth',
        selectedPrinterId: macAddress,
        lastDeviceId: macAddress,
        lastDeviceName: finalName,
      });

      this.emitChange();
      return { success: true, deviceName: finalName };
    } catch (err) {
      this.isConnecting = false;
      this.emitChange();
      throw err;
    }
  }

  /**
   * Buka menu pengaturan Bluetooth di HP Android agar kasir dapat memasangkan printer baru
   */
  openNativeBluetoothSettings() {
    if (this.isNativeAndroidApp() && window.AndroidPOS.openBluetoothSettings) {
      window.AndroidPOS.openBluetoothSettings();
      return true;
    }
    return false;
  }

  /**
   * Hubungkan printer lewat Bluetooth (Otomatis mendeteksi Android Native atau Web Bluetooth BLE)
   * @param {BluetoothDevice|string} [targetDevice] Jika sudah ada objek BluetoothDevice atau MAC Address
   */
  async connectBluetooth(targetDevice = null) {
    const platform = detectPlatform();

    // 1. KONEKSI DI ANDROID NATIVE
    if (platform.isNativeAndroid) {
      if (typeof targetDevice === 'string') {
        return await this.connectNative(targetDevice);
      }
      if (targetDevice && (targetDevice.id || targetDevice.address)) {
        return await this.connectNative(targetDevice.id || targetDevice.address, targetDevice.name);
      }

      // Ambil daftar perangkat yang dipasangkan di HP Android
      const paired = await this.getPairedBluetoothDevices();
      if (paired.length === 1) {
        return await this.connectNative(paired[0].id, paired[0].name);
      } else if (paired.length > 1) {
        const target = paired.find((p) => p.id === this.settings.selectedPrinterId) || paired[0];
        return await this.connectNative(target.id, target.name);
      } else {
        // Belum ada perangkat berpasangan di HP
        this.openNativeBluetoothSettings();
        throw new Error(
          'Belum ada printer Bluetooth yang dipasangkan (paired) di HP. Pengaturan Bluetooth HP telah dibuka. Silakan pasangkan printer Anda (PIN 1234 atau 0000), lalu kembali ke aplikasi POS dan pilih printer.'
        );
      }
    }

    // 2. KONEKSI DI BROWSER BIASA (Web Bluetooth API)
    if (!('bluetooth' in navigator)) {
      if (platform.isIOS) {
        throw new Error(
          'Safari di iOS belum mendukung Web Bluetooth secara bawaan. Silakan gunakan browser "Bluefy" (gratis di App Store) untuk koneksi Bluetooth langsung, atau gunakan tombol Cetak Sistem.'
        );
      }
      throw new Error('Browser ini belum mendukung Web Bluetooth. Silakan gunakan Google Chrome di Android atau PC.');
    }

    this.isConnecting = true;
    this.emitChange();

    try {
      await this.disconnect();

      let device = targetDevice;
      if (!device) {
        // Minta pengguna memilih perangkat Bluetooth
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: COMMON_BLE_SERVICES,
        });
      }

      if (!device) throw new Error('Perangkat printer tidak dipilih');

      device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnected();
      });

      // Hubungkan ke GATT Server
      const server = await device.gatt.connect();

      // Cari characteristic yang bisa ditulisi perintah cetak
      let targetChar = null;

      // Cara 1: Periksa semua primary services yang tersedia
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          try {
            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                targetChar = char;
                break;
              }
            }
          } catch {
            /* abaikan service yang tidak bisa dibaca */
          }
          if (targetChar) break;
        }
      } catch {
        /* jika getPrimaryServices() ditolak browser, gunakan pencarian per UUID di bawah */
      }

      // Cara 2: Coba cari service dari daftar UUID umum bila cara 1 belum menemukan
      if (!targetChar) {
        for (const svcId of COMMON_BLE_SERVICES) {
          try {
            const service = await server.getPrimaryService(svcId);
            const chars = await service.getCharacteristics();
            for (const char of chars) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                targetChar = char;
                break;
              }
            }
          } catch {
            /* coba UUID berikutnya */
          }
          if (targetChar) break;
        }
      }

      if (!targetChar) {
        throw new Error('Tidak ditemukan saluran tulis (characteristic) yang cocok pada printer ini');
      }

      this.device = device;
      this.server = server;
      this.characteristic = targetChar;
      this.connectionType = 'bluetooth';
      this.isConnecting = false;

      // Simpan printer ke daftar printer tersimpan
      this.addSavedPrinter({
        id: device.id,
        name: device.name || 'Printer Bluetooth',
        type: 'bluetooth',
      });

      this.saveSettings({ printerMode: 'bluetooth' });
      this.emitChange();
      return { success: true, deviceName: this.getDeviceName() };
    } catch (err) {
      this.isConnecting = false;
      this.emitChange();
      throw err;
    }
  }

  /**
   * Hubungkan printer dari daftar printer tersimpan
   */
  async connectSavedPrinter(printerId) {
    const list = this.getSavedPrinters();
    const item = list.find((p) => p.id === printerId);

    // Jika di Android Native atau tipe android_native
    if (this.isNativeAndroidApp() || item?.type === 'android_native') {
      const name = item ? item.name : '';
      return await this.connectNative(printerId, name);
    }

    if (!item) throw new Error('Perangkat printer tidak ditemukan dalam daftar');

    if (item.type === 'serial') {
      return await this.connectSerial();
    }

    // Jika bluetooth di Web Bluetooth browser
    const devices = await this.getPairedBluetoothDevices();
    const match = devices.find((d) => d.id === printerId);
    if (match) {
      return await this.connectBluetooth(match);
    }

    // Jika tidak ditemukan langsung, buka dialog requestDevice
    return await this.connectBluetooth();
  }

  /**
   * Hubungkan printer via Web Serial API (Bluetooth SPP Virtual COM atau USB OTG di PC)
   */
  async connectSerial(baudRate = 9600) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API tidak didukung di browser ini.');
    }

    this.isConnecting = true;
    this.emitChange();

    try {
      await this.disconnect();

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: Number(baudRate) || 9600 });

      const writer = port.writable.getWriter();

      this.serialPort = port;
      this.serialWriter = writer;
      this.connectionType = 'serial';
      this.isConnecting = false;

      this.addSavedPrinter({
        id: 'serial_' + Date.now(),
        name: 'Printer Serial / SPP',
        type: 'serial',
      });

      this.saveSettings({ printerMode: 'serial' });
      this.emitChange();
      return { success: true, deviceName: 'Printer Serial / SPP' };
    } catch (err) {
      this.isConnecting = false;
      this.emitChange();
      throw err;
    }
  }

  handleDisconnected() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.serialPort = null;
    this.serialWriter = null;
    this.connectionType = null;
    this.isConnecting = false;
    this.emitChange();
  }

  async disconnect() {
    // Putuskan Android Native
    if (this.connectionType === 'android_native' || this.isNativeAndroidApp()) {
      try {
        if (window.AndroidPOS?.disconnectPrinter) {
          window.AndroidPOS.disconnectPrinter();
        }
      } catch {
        /* abaikan */
      }
    }

    // Putuskan Web Bluetooth
    try {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } catch {
      /* abaikan */
    }

    // Putuskan Serial
    try {
      if (this.serialWriter) {
        this.serialWriter.releaseLock();
      }
      if (this.serialPort) {
        await this.serialPort.close();
      }
    } catch {
      /* abaikan */
    }

    this.handleDisconnected();
  }

  /**
   * Kirim data biner (Uint8Array) ke printer thermal
   */
  async printData(uint8Array) {
    if (!this.isConnected()) {
      throw new Error('Printer thermal belum terhubung.');
    }

    const data = uint8Array instanceof Uint8Array ? uint8Array : new Uint8Array(uint8Array);

    // 1. JALUR NATIVE ANDROID SPP
    if (this.connectionType === 'android_native') {
      let binary = '';
      const len = data.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
      }
      const base64 = btoa(binary);

      const resJson = window.AndroidPOS.printEscPos(base64);
      const res = typeof resJson === 'string' ? JSON.parse(resJson || '{}') : resJson;
      if (!res || !res.success) {
        throw new Error(res?.error || 'Gagal mengirim data cetak ke printer');
      }
      return true;
    }

    // 2. JALUR WEB BLUETOOTH (BLE)
    if (this.connectionType === 'bluetooth') {
      const char = this.characteristic;
      const CHUNK_SIZE = 60; // Ukuran paket aman untuk BLE thermal printer portable
      const canWithoutResponse = Boolean(char.properties.writeWithoutResponse);

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        if (canWithoutResponse) {
          await char.writeValueWithoutResponse(chunk);
        } else {
          await char.writeValueWithResponse(chunk);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      return true;
    }

    // 3. JALUR WEB SERIAL
    if (this.connectionType === 'serial') {
      await this.serialWriter.write(data);
      return true;
    }

    throw new Error('Metode koneksi printer tidak dikenal');
  }
}

export const printerService = new BluetoothPrinterService();
