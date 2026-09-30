# 📱 POS Pakaian — Proyek Android Studio

Aplikasi Android native (Java + WebView Kiosk) untuk sistem kasir **POS Pakaian**, siap dibuka dan di-build menggunakan **Android Studio**.

---

## ✨ Fitur Aplikasi Android
1. **Live Cloud Sync**: Terhubung langsung ke `https://yudhinatri.vercel.app`. Setiap kali ada pembaruan kode di GitHub/Vercel, aplikasi Android otomatis menampilkan fitur terbaru tanpa perlu install ulang APK!
2. **Printer Thermal Bluetooth**: Dilengkapi konfigurasi izin Bluetooth lengkap (`BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, dan `LOCATION`) sehingga pencetakan struk thermal tanpa kabel berjalan mulus di Android 8 hingga Android 14+.
3. **Navigasi Tombol Back Cerdas**: Tombol back fisik Android kembali ke riwayat halaman web, dan tekan 2x berturut-turut untuk konfirmasi keluar.
4. **Pull to Refresh**: Tarik layar ke bawah untuk memuat ulang data terbaru kasir.
5. **Ganti URL Server**: Jika ingin mencoba di jaringan lokal (misal: `http://192.168.1.10:3000`), tersedia tombol untuk mengubah alamat server langsung dari aplikasi.
6. **Error Handling**: Tampilan ramah pengguna saat koneksi internet terputus dengan tombol *Coba Lagi*.

---

## 🚀 Cara Membuka di Android Studio

1. **Buka Android Studio**.
2. Di halaman pembuka (Welcome to Android Studio) atau menu atas:
   - Klik **File** → **Open...**
   - Arahkan ke folder:
     ```
     c:\yudhi\coding\POS\android
     ```
   - Klik **OK**.
3. Android Studio akan otomatis mengunduh dependensi Gradle dan melakukan sinkronisasi proyek (*Sync Project with Gradle Files*). Tunggu hingga indikator di bawah selesai (sekitar 1–2 menit pertama kali).

---

## 📲 Cara Menjalankan ke HP / Tablet Kasir

### 1. Hubungkan HP / Tablet
1. Aktifkan **Developer Options** dan **USB Debugging** di pengaturan HP Android Anda:
   - *Pengaturan* → *Tentang Ponsel* → ketuk **Nomor Bentukan (Build Number)** sebanyak 7 kali.
   - Masuk ke *Opsi Pengembang (Developer Options)* → aktifkan **Debugging USB**.
2. Sambungkan HP ke laptop/PC menggunakan kabel data.
3. Di HP akan muncul notifikasi "Izinkan Debugging USB?", centang selalu izinkan dan klik **OK**.

### 2. Jalankan dari Android Studio
1. Di bilah atas Android Studio, pastikan perangkat HP Anda sudah terdeteksi di dropdown target device.
2. Klik tombol hijau **Run 'app'** (ikon segitiga hijau Play `▶` atau tekan `Shift + F10`).
3. Aplikasi akan otomatis ter-install dan terbuka di HP Anda!

---

## 📦 Cara Membuat File APK (Untuk Dibagikan ke Kasir)

Jika ingin membagikan file installer APK langsung tanpa kabel:
1. Di Android Studio, klik menu **Build** di bilah atas.
2. Pilih **Build Bundle(s) / APK(s)** → klik **Build APK(s)**.
3. Tunggu beberapa detik hingga muncul notifikasi di pojok kanan bawah:
   > *APK(s) generated successfully for module 'app'.*
4. Klik tulisan biru **`locate`** pada notifikasi tersebut.
5. File **`app-debug.apk`** siap Anda kirim via WhatsApp / kabel ke HP kasir untuk di-install langsung!

---

## ⚙️ Struktur Folder Proyek Android

```
android/
├── build.gradle                  # Konfigurasi Gradle level proyek
├── settings.gradle               # Modul aplikasi (:app)
├── gradle.properties             # Pengaturan memori JVM & AndroidX
├── gradlew.bat                   # Wrapper build Windows
└── app/
    ├── build.gradle              # Dependensi & target SDK (SDK 34)
    ├── proguard-rules.pro        # Aturan obfuscation
    └── src/main/
        ├── AndroidManifest.xml   # Izin Bluetooth, Internet, dan konfigurasi layar
        ├── java/com/yudhinatri/pos/
        │   ├── MainActivity.java    # Logika utama WebView, Bluetooth, & navigasi
        │   └── WebAppInterface.java # Jembatan JS ke native Android
        └── res/
            ├── layout/activity_main.xml  # Tampilan WebView + Progress + Error View
            ├── values/
            │   ├── colors.xml            # Warna tema (#4F46E5)
            │   ├── strings.xml           # Teks antarmuka aplikasi
            │   └── themes.xml            # Tema Material Design
            └── xml/
                ├── network_security_config.xml # Izin akses HTTP lokal
                ├── data_extraction_rules.xml
                └── backup_rules.xml
```
