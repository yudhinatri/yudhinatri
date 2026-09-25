# 👕 POS Pakaian — Aplikasi Kasir Toko Pakaian

Aplikasi **Point of Sale (POS)** sederhana dan ringan untuk toko pakaian, berbasis web.
Dibangun **tanpa framework dan tanpa dependensi eksternal** — hanya Node.js bawaan + HTML/CSS/JavaScript vanilla.
Dilengkapi **login PIN** dengan dua peran: **Admin** (kelola semua) dan **Kasir** (hanya melayani penjualan).

---

## 🔐 Peran Pengguna

Saat pertama kali dibuka, aplikasi meminta **PIN 4 angka** agar hanya staf berwenang yang bisa memakainya.

| | 👑 Admin | 🧑‍💼 Kasir |
|---|---|---|
| **Menu samping** | ✅ Semua menu | ❌ Tidak ada (layar penuh) |
| **Kasir (jualan)** | ✅ | ✅ |
| **Produk & stok** | ✅ Tambah/ubah/hapus | 👁 Lihat saja (tidak bisa diubah) |
| **Riwayat transaksi** | ✅ Termasuk void | ❌ |
| **Laporan & laba** | ✅ | ❌ |
| **Pengaturan & pengguna** | ✅ | ❌ |
| **Backup / restore** | ✅ | ❌ |

**Akun bawaan** (segera ganti PIN-nya di **Pengaturan → PIN Saya**):

| Pengguna | Peran | PIN |
|---|---|---|
| Admin | Admin | `1234` |
| Kasir 1 | Kasir | `1111` |

Pengamanan yang sudah diterapkan:
- PIN disimpan **ter-hash (scrypt + salt)**, tidak pernah dikirim ke browser.
- Setiap permintaan API wajib membawa token sesi; sesi kedaluwarsa setelah 12 jam menganggur.
- Nama kasir pada struk **diambil dari akun yang login**, bukan dari data yang dikirim browser — tidak bisa dipalsukan.
- Admin tidak bisa menghapus akunnya sendiri, dan sistem menolak bila akan **tidak ada admin aktif** yang tersisa.
- Kasir yang mencoba membuka halaman admin lewat URL tetap dialihkan ke layar kasir.

---

## ✨ Fitur

| Modul | Kemampuan |
|---|---|
| 🛒 **Kasir** | Katalog produk dengan pencarian & filter kategori, keranjang, ubah jumlah, diskon item/nota, 5 metode bayar (Tunai, QRIS, Transfer, Debit, E-Wallet), tombol uang cepat, hitung kembalian otomatis, cetak struk |
| 👚 **Produk** | CRUD produk lengkap (nama, SKU, kategori, ukuran, warna, harga jual, HPP, stok, batas stok menipis), filter stok menipis, **hapus massal** (centang beberapa produk), **hapus semua produk**, ekspor CSV |
| 🧾 **Transaksi** | Riwayat penjualan dengan filter tanggal/metode/kata kunci, detail nota, cetak ulang struk, **void** transaksi (stok otomatis dikembalikan), ekspor CSV |
| 📊 **Laporan** | KPI penjualan & laba, grafik tren harian, penjualan per kategori, metode pembayaran, produk terlaris, peringatan stok menipis, rincian harian, ekspor laporan |
| 👥 **Pengguna** | Tambah/ubah/hapus akun admin & kasir, atur peran, reset PIN, aktif/nonaktifkan akun, ubah PIN sendiri |
| ⚙️ **Pengaturan** | Identitas toko (nama, alamat, telepon, ucapan struk), biaya layanan, kelola kategori/ukuran/warna, **backup & restore JSON**, hapus semua data |
| 🖨️ **Printer Thermal** | Koneksi langsung ke printer thermal Bluetooth (ESC/POS) untuk **Android & iOS**, format kertas 58mm & 80mm, auto-cetak setelah pembayaran, test print struk, serta opsi cetak sistem/browser fallback |

**Ekstra:** data tersimpan permanen di file JSON, bisa diakses dari HP/tablet lewat jaringan lokal, tampilan responsif, shortcut keyboard (F1–F5 antar halaman, `/` fokus pencarian), dan cetak struk thermal Bluetooth langsung tanpa dialog browser.

---

## 🖨️ Panduan Printer Thermal Bluetooth (Android & iOS)

Aplikasi POS ini mendukung pencetakan struk langsung ke **printer thermal Bluetooth portable (58mm / 80mm)** dengan protokol standar **ESC/POS** (seperti merk Panda, Eppos, Iware, BellaV, Zjiang, GOOJPRT, Xprinter, MPT-II, RPP02N, dsb.).

### 📱 1. Panduan di Android (Chrome, Edge, Samsung Internet)
1. Nyalakan printer thermal Bluetooth Anda.
2. Pastikan **Bluetooth** dan **Lokasi (GPS)** aktif di pengaturan HP / tablet Android.
3. Buka aplikasi POS di browser **Google Chrome** atau **Samsung Internet**.
4. Klik tombol **Printer** di bilah atas (atau buka menu **Pengaturan → Printer Thermal Bluetooth**).
5. Klik **"Cari & Hubungkan Bluetooth"**, lalu pilih printer thermal Anda dari daftar perangkat.
6. Status akan berubah menjadi **🟢 Terhubung**. Klik **"Test Cetak"** untuk mencoba.
7. Saat kasir menyelesaikan transaksi, struk dapat dicetak langsung atau otomatis jika opsi *Cetak Otomatis* diaktifkan!

### 🍎 2. Panduan di iOS (iPhone & iPad)
Safari bawaan Apple pada iOS belum mengizinkan Web Bluetooth secara langsung karena kebijakan WebKit. Untuk mencetak langsung tanpa kabel ke printer thermal Bluetooth di iPhone/iPad:
- **Cara Rekomendasi (Bluetooth Langsung)**:
  1. Pasang browser gratis **"Bluefy - Web BLE Browser"** dari App Store.
  2. Buka alamat web POS Anda di dalam aplikasi **Bluefy**.
  3. Klik tombol **Printer** di bilah atas → **"Cari & Hubungkan Bluetooth"**.
  4. Web Bluetooth langsung aktif dan struk dicetak seketika tanpa kabel!
- **Cara Alternatif (Cetak Sistem / AirPrint)**:
  - Jika membuka lewat Safari biasa, gunakan tombol **"📄 Cetak Browser / Sistem"**. Tampilan struk sudah dioptimasi khusus untuk format kertas thermal (58mm/80mm) tanpa margin berlebih.

---

## 🚀 Cara Menjalankan

### 1. Prasyarat
- **Node.js versi 18 atau lebih baru** — cek dengan `node -v`
- Tidak perlu `npm install`, tidak ada dependensi.

### 2. Jalankan
```bash
node server.js
```

Atau lewat npm (alternatif):
```bash
npm start        # atau: npm run dev   (auto-reload saat file diubah)
```

> **Windows — error "running scripts is disabled on this system"?**
> PowerShell memblokir `npm.ps1`. Gunakan salah satu solusi berikut:
> - Jalankan langsung dengan Node: `node server.js`
> - Atau pakai `npm.cmd start`
> - Atau izinkan skrip lokal sekali saja: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 3. Buka di browser
```
http://localhost:3000
```

Saat pertama dijalankan, server otomatis membuat folder `data/` dan mengisi:
- **16 produk pakaian contoh**
- **2 akun bawaan**: `Admin` (PIN `1234`) dan `Kasir 1` (PIN `1111`)

> ⚠️ **Segera ganti PIN bawaan** lewat **Pengaturan → PIN Saya** setelah login pertama.

### 4. Masuk ke aplikasi
Pilih nama akun, lalu ketik PIN 4 angka (bisa lewat tombol di layar atau keyboard).
Setelah masuk, tampilan menyesuaikan peran: **Admin** mendapat menu lengkap di kiri,
**Kasir** langsung masuk ke layar penjualan tanpa menu samping.

### 5. Akses dari HP / tablet kasir
Saat server menyala, terminal menampilkan alamat jaringan, contoh:
```
Lokal   : http://localhost:3000
Jaringan: http://192.168.18.87:3000
```
Buka alamat **Jaringan** dari perangkat lain yang tersambung ke WiFi yang sama.

> **Tips:** tambahkan ke Home Screen di HP agar terasa seperti aplikasi.

---

## 📁 Struktur Proyek

```
POS/
├── server.js                 # Server lokal (pengembangan)
├── api/
│   └── index.js              # Titik masuk serverless Vercel
├── lib/
│   ├── handler.js            # Routing: REST API + penyajian file statis
│   ├── core.js               # Logika bisnis murni (harga, stok, laporan, PIN)
│   ├── auth.js               # Login PIN, sesi, dan pengelolaan pengguna
│   ├── store.js              # Penyimpanan: otomatis pilih Redis atau file
│   └── redis.js              # Klien Upstash Redis lewat REST
├── tools/
│   └── mock-redis.js         # Mock Redis untuk uji mode serverless di lokal
├── vercel.json               # Konfigurasi routing & aset untuk Vercel
├── .env.example              # Contoh variabel lingkungan
├── package.json
├── data/                     # Hanya dipakai mode file (lokal)
│   ├── products.json
│   ├── transactions.json
│   ├── users.json            # Akun & PIN (ter-hash)
│   └── settings.json
└── public/
    ├── index.html            # Kerangka aplikasi
    ├── styles.css            # Seluruh tampilan
    └── js/
        ├── app.js            # Gerbang login, router, dan peran pengguna
        ├── api.js            # Klien REST API + token sesi
        ├── store.js          # State global, sesi, & logika keranjang
        ├── ui.js             # Modal, konfirmasi, toast
        ├── receipt.js        # Render & cetak struk
        ├── utils.js          # Format Rupiah, tanggal, helper DOM
        └── views/
            ├── login.js          # Layar PIN
            ├── cashier.js        # Halaman Kasir
            ├── products.js       # Halaman Produk
            ├── transactions.js   # Halaman Transaksi
            ├── reports.js        # Halaman Laporan
            └── settings.js       # Halaman Pengaturan & pengguna
```

---

## 🔌 Konfigurasi

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server lokal |
| `HOST` | `0.0.0.0` | Bind address (agar bisa diakses dari jaringan) |
| `TZ` | waktu server | Zona waktu untuk tanggal nota & laporan harian, mis. `Asia/Jakarta` |
| `UPSTASH_REDIS_REST_URL` | — | URL REST Redis. **Kosong = mode file lokal** |
| `UPSTASH_REDIS_REST_TOKEN` | — | Token REST Redis |
| `POS_DATA_DIR` | `./data` | Lokasi folder data pada mode file |
| `POS_PUBLIC_DIR` | `./public` | Lokasi folder aset statis |

Contoh menjalankan lokal di port lain:
```powershell
$env:PORT=8080; node server.js
```

Cek status penyimpanan yang sedang aktif:
```
GET /api/health   →   {"ok":true,"mode":"file","writable":true,...}
```

---

## 🧮 Perhitungan Harga

```
Subtotal       = Σ (harga jual × qty) − diskon item
Setelah diskon = Subtotal − diskon nota
Total          = Setelah diskon + biaya layanan
Kembalian      = Uang diterima − Total
Laba kotor     = Σ ((harga jual − HPP) × qty − diskon item)
```

Biaya layanan diatur di **Pengaturan → Biaya & Stok**. Isi `0` jika tidak dipakai.

---

## ☁️ Deploy ke Vercel

Aplikasi ini sudah disiapkan untuk Vercel, **tetapi wajib memakai database Redis**.
Alasannya: filesystem Vercel bersifat *read-only* dan serverless function tidak
menyimpan memori antar-request, jadi menyimpan data ke file JSON tidak mungkin.

Di Vercel, penyimpanan otomatis beralih ke **Upstash Redis** (gratis, tanpa kartu kredit)
begitu dua variabel lingkungan di bawah diisi. Tidak ada perubahan kode yang perlu Anda lakukan.

### 1. Buat database Redis (gratis)

1. Buka [upstash.com](https://upstash.com) → daftar (bisa pakai akun Google/GitHub)
2. **Create Database** → pilih region **Singapore** (terdekat dari Indonesia)
3. Setelah dibuat, buka tab **REST API** dan salin dua nilai:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

> Alternatif: di dashboard Vercel, buka **Storage → Create Database → Upstash Redis**.
> Vercel otomatis mengisi variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN` —
> aplikasi ini menerima kedua penamaan tersebut.

### 2. Unggah kode ke GitHub

```powershell
cd c:\yudhi\coding\POS
git remote add origin https://github.com/yudhinatri/yudhinatri.git
git branch -M main
git push -u origin main
```

Pastikan folder `data/` **tidak** ikut terunggah — sudah dikecualikan di `.gitignore`.

### 3. Impor ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new) → pilih repository `yudhinatri`
2. Framework Preset: **Other** (biarkan Build Command & Output Directory kosong)
3. Buka **Environment Variables**, tambahkan:

   | Name | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | tempel dari Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | tempel dari Upstash |
   | `TZ` | `Asia/Jakarta` *(opsional, agar tanggal nota sesuai WIB)* |

4. Klik **Deploy**

### 4. Verifikasi

Buka `https://nama-proyek.vercel.app/api/health`. Harus muncul:

```json
{ "ok": true, "mode": "redis", "redis": "PONG", ... }
```

Bila `"mode"` masih `"file"`, berarti variabel lingkungan belum terbaca — periksa
penulisannya lalu **Redeploy**.

> **Muncul `ENOENT: no such file or directory, mkdir '/var/task/data'` atau tulisan
> "Server tidak terjangkau"?**
> Itu tanda aplikasi berjalan di Vercel **tanpa** Redis, sehingga mencoba menulis ke
> folder aplikasi yang read-only. Buka `/api/health`; di sana akan terlihat:
>
> ```json
> { "mode": "file", "serverless": true, "writable": false,
>   "redis": { "detected": null, "names": [] } }
> ```
>
> `"names"` menampilkan nama variabel Redis yang **terbaca** (tanpa nilainya):
> - `[]` → variabelnya belum ada/terbaca. Tambahkan di
>   **Vercel → Settings → Environment Variables**, centang semua environment
>   (Production, Preview, Development), lalu **Redeploy**.
> - `"problem": "url-bukan-rest"` → URL yang ditempel adalah `redis://…` (koneksi TCP).
>   Ambil yang dari tab **REST API** di Upstash, yang berawalan `https://`.
> - `"problem": "pasangan-tidak-lengkap"` → hanya salah satu variabel terisi;
>   URL dan TOKEN harus diisi berpasangan.
>
> Setelah variabel benar, `"mode"` berubah menjadi `"redis"` dengan `"redis": "PONG"`.

Setelah itu buka alamat utama, login dengan **Admin / `1234`**, dan langsung ganti PIN-nya.

### 5. Deploy ulang

Setiap `git push` ke `main`, Vercel otomatis membangun ulang. Tidak perlu langkah manual.

### Catatan penting untuk Vercel

| Hal | Keterangan |
|---|---|
| **Data** | Tersimpan di Redis, tetap ada meski function tidur atau di-deploy ulang |
| **Login** | Token sesi berlaku 12 jam; karena di Redis, sesi tetap valid antar-instance |
| **Cold start** | Permintaan pertama setelah menganggur bisa terasa ~1 detik lebih lambat |
| **Backup** | Tetap berfungsi: **Pengaturan → Unduh Backup** menghasilkan file JSON |
| **Kuota gratis** | Upstash free tier: 10.000 perintah/hari — sangat cukup untuk toko kecil |
| **Hapus data** | **Pengaturan → Hapus Semua Data** mengosongkan produk & transaksi, akun tetap |
| **Keamanan** | Aplikasi belum memakai HTTPS khusus, tapi Vercel otomatis menyediakan HTTPS |

### Menguji mode Redis di lokal (opsional)

Ada mock Redis di `tools/mock-redis.js` supaya Anda bisa mencoba jalur serverless
tanpa akun Upstash:

```powershell
# Terminal 1 — jalankan mock Redis
node tools/mock-redis.js 6380

# Terminal 2 — jalankan aplikasi memakai mock tersebut
$env:UPSTASH_REDIS_REST_URL='http://localhost:6380'
$env:UPSTASH_REDIS_REST_TOKEN='uji-token'
$env:PORT='3100'
node server.js
```

Buka `http://localhost:3100/api/health` — `"mode"` harus bernilai `"redis"`.

### Kalau tidak ingin memakai Vercel

Aplikasi berjalan apa adanya di penyedia yang punya disk permanen — misalnya
**Railway**, **Render**, atau **VPS** — tanpa perlu Redis sama sekali:

```powershell
node server.js
```

---

## 🗄 Data & Backup

Penyimpanan **dipilih otomatis** sesuai lingkungan yang dipakai:

| Lingkungan | Penyimpanan | Keterangan |
|---|---|---|
| Lokal (`node server.js`) | File JSON di `data/` | Tidak perlu memasang apa pun |
| Vercel | Redis (Upstash) | Dipilih otomatis bila variabel `UPSTASH_REDIS_REST_*` terisi |

Cek penyimpanan yang sedang aktif lewat `GET /api/health`.

**Backup rutin sangat disarankan:**
- **Pengaturan → Unduh Backup** menghasilkan satu file JSON berisi produk, transaksi, dan pengaturan.
- **Pengaturan → Pulihkan dari File** mengembalikan data dari file backup tersebut.

> ℹ️ Data pengguna & PIN **tidak** ikut dalam backup agar PIN tidak berpindah perangkat.
> Catat PIN setiap kasir di tempat aman.

Pada mode file, salin folder `data/` secara berkala ke flashdisk / cloud sebagai
cadangan tambahan.

> ⚠️ Folder `data/` tidak ikut masuk Git (lihat `.gitignore`) agar data toko tidak terunggah.

---

## ⌨️ Shortcut Keyboard

| Tombol | Fungsi |
|---|---|
| `F1` | Kasir |
| `F2` | Produk — *admin* |
| `F3` | Transaksi — *admin* |
| `F4` | Laporan — *admin* |
| `F5` | Pengaturan — *admin* |
| `/` | Fokus ke kolom pencarian (di halaman Kasir) |
| `Esc` | Tutup dialog |

Saat berada di layar PIN, angka `0`–`9` di keyboard langsung mengisi PIN,
`Backspace` menghapus satu angka, dan `Esc` kembali ke daftar akun.

---

## 🖨 Cetak Struk

Tombol **Cetak Struk** memakai dialog print bawaan browser. Untuk printer thermal 58/80 mm:

1. Buka dialog print, pilih printer thermal Anda.
2. Atur ukuran kertas ke `58mm` atau `80mm` (atau `Roll Paper`).
3. Matikan *Headers and footers*, dan set margin ke **None** / Minimum.
4. Untuk hasil terbaik, gunakan mode **Save as PDF** lalu cetak, atau aktifkan "Print backgrounds".

---

## 🌐 Ringkasan REST API

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| `GET` | `/api/health` | publik | Status server & mode penyimpanan |
| `GET` | `/api/auth/users` | publik | Daftar akun untuk layar login (nama & peran saja) |
| `POST` | `/api/auth/login` | publik | Masuk dengan `{ userId, pin }` |
| `POST` | `/api/auth/logout` | semua | Akhiri sesi |
| `GET` | `/api/auth/me` | semua | Data pengguna yang sedang masuk |
| `POST` | `/api/auth/pin` | semua | Ubah PIN sendiri |
| `GET`/`POST` | `/api/users` | admin | Daftar / tambah pengguna |
| `PUT`/`DELETE` | `/api/users/:id` | admin | Ubah / hapus pengguna |
| `GET` | `/api/bootstrap` | semua | Data awal (isinya disesuaikan peran) |
| `GET` | `/api/products` | semua | Daftar produk |
| `POST` | `/api/products` | admin | Tambah produk |
| `PUT` | `/api/products/:id` | admin | Ubah produk |
| `DELETE` | `/api/products/:id` | admin | Hapus produk |
| `POST` | `/api/products/bulk-delete` | admin | Hapus banyak produk (`{ ids: [...] }`) |
| `POST` | `/api/products/delete-all` | admin | Kosongkan seluruh katalog produk |
| `POST` | `/api/products/import` | admin | Impor produk massal (JSON) |
| `GET` | `/api/transactions?from=&to=&q=` | admin | Riwayat transaksi |
| `POST` | `/api/transactions` | semua | Buat transaksi baru (stok otomatis berkurang) |
| `POST` | `/api/transactions/:id/void` | admin | Batalkan transaksi (stok dikembalikan) |
| `GET` | `/api/reports?from=&to=` | admin | Laporan penjualan |
| `GET`/`PUT` | `/api/settings` | admin | Baca / simpan pengaturan |
| `GET` | `/api/backup` | admin | Unduh seluruh data sebagai JSON |
| `POST` | `/api/restore` | admin | Pulihkan data dari backup |

Semua endpoint (kecuali yang bertanda *publik*) memerlukan header `X-Auth-Token` berisi token dari `/api/auth/login`.

---

## ❓ Pertanyaan Umum

**Bagaimana cara menambah kasir baru?**
Login sebagai **Admin** → **Pengaturan → Pengguna & PIN → ＋ Tambah** → isi nama, pilih peran
**Kasir**, dan tentukan PIN 4 angka. Akun baru langsung muncul di layar masuk.

**Bagaimana kalau kasir lupa PIN-nya?**
Admin membuka **Pengaturan → Pengguna & PIN**, klik ✏️ pada akun tersebut, lalu isi kolom
**PIN baru**. Tidak perlu tahu PIN lama.

**Bagaimana cara menonaktifkan kasir yang sudah berhenti?**
Edit akunnya dan hilangkan centang **Akun aktif**. Akun itu hilang dari layar masuk,
tetapi riwayat transaksinya tetap tersimpan.

**Apakah kasir bisa mengubah harga atau stok?**
Tidak. Server menolak semua permintaan perubahan produk dari akun kasir, dan tombolnya
memang tidak ditampilkan. Kasir hanya bisa melihat daftar produk dan membuat transaksi.

**Bagaimana cara menghapus produk contoh?**
Ada tiga cara di halaman **Produk** (khusus Admin):
1. Klik ikon 🗑 pada baris produk untuk menghapus satu per satu.
2. Centang beberapa produk (atau centang kotak di kepala tabel untuk memilih semua), lalu klik **🗑 Hapus Terpilih**.
3. Klik **🗑 Hapus Semua** di kanan atas untuk mengosongkan seluruh katalog sekaligus.

Perlu diingat: **Pengaturan → Hapus Semua Data** juga menghapus riwayat transaksi, sedangkan tombol di halaman Produk hanya menghapus produk.

**Apakah stok berkurang otomatis saat penjualan?**
Ya. Stok berkurang saat transaksi dibuat, dan kembali otomatis jika transaksi di-void.

**Bisakah beberapa kasir memakai bersamaan?**
Bisa — setiap orang masuk dengan akun & PIN masing-masing, dan semua perangkat terhubung
ke server yang sama. Nama kasir pada setiap nota tercatat otomatis sesuai akun yang dipakai.
Namun pencatatan file JSON cocok untuk toko dengan 1–3 kasir. Untuk trafik tinggi, disarankan
memakai Redis (mode Vercel) atau migrasi ke database (PostgreSQL).

**Kenapa data saya hilang setelah deploy ke Vercel?**
Kemungkinan variabel `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` belum terisi,
sehingga aplikasi jatuh ke mode file yang tidak bisa menulis di Vercel. Cek
`https://proyek-anda.vercel.app/api/health` — nilai `mode` harus `redis`. Bila masih `file`,
tambahkan variabelnya di **Vercel → Settings → Environment Variables** lalu **Redeploy**.

**Aplikasi menampilkan "Server tidak terjangkau" / error `ENOENT ... mkdir '/var/task/data'`?**
Sama penyebabnya: di Vercel tidak ada tempat menulis berkas. Sejak versi ini aplikasi
mengenali situasi tersebut dan menampilkan pesan yang menjelaskan solusinya, bukan lagi
error filesystem mentah. Buka `/api/health` untuk melihat variabel Redis mana yang
terbaca (`"names"`), apakah `"writable"` bernilai `true`, dan apakah ada `"problem"`
pada konfigurasi Redis. Perbaiki variabelnya lalu **Redeploy**.

**Apakah data di Vercel aman kalau saya deploy ulang?**
Aman. Data berada di Redis, terpisah dari kode. Deploy ulang hanya mengganti kode,
bukan isi database. Tetap lakukan backup berkala lewat **Pengaturan → Unduh Backup**.

**Berapa biaya menjalankannya di Vercel?**
Untuk toko kecil, keduanya gratis: Vercel Hobby plan dan Upstash free tier
(10.000 perintah Redis per hari). Satu transaksi memakai sekitar 5–10 perintah,
jadi kuota harian setara ratusan transaksi.

**Bagaimana cara menaikkan harga semua produk sekaligus?**
Ekspor CSV dari halaman Produk, ubah di Excel, lalu pulihkan lewat fitur restore (format JSON).

**Kenapa laporan laba kosong?**
Isi kolom **HPP / harga modal** pada setiap produk. Laba dihitung dari `harga jual − HPP`.

---

## 📄 Lisensi

MIT — bebas digunakan dan dimodifikasi untuk kebutuhan toko Anda.
