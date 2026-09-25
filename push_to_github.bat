@echo off
setlocal EnableDelayedExpansion
set PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PATH%
title Push POS ke GitHub - yudhinatri/yudhinatri

echo ================================================================
echo   SINKRONISASI REPOSITORI POS KE GITHUB (yudhinatri/yudhinatri)
echo ================================================================
echo.
cd /d "%~dp0"

echo Memeriksa konfigurasi git...
git config user.name "yudhinatri"
git config user.email "yudhinatri@gmail.com"
git branch -M main

echo Remote repository: https://github.com/yudhinatri/yudhinatri.git
git remote set-url origin https://github.com/yudhinatri/yudhinatri.git 2>nul || git remote add origin https://github.com/yudhinatri/yudhinatri.git

echo.
echo ================================================================
echo Sedang melakukan Git Push ke branch main...
echo (Jika jendela login browser muncul, silakan klik 'Sign in with your browser')
echo ================================================================
echo.

git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo [BERHASIL!] Seluruh kode POS berhasil diunggah ke GitHub!
    echo Repositori: https://github.com/yudhinatri/yudhinatri
    echo.
    echo Langkah berikutnya untuk online:
    echo 1. Buka https://vercel.com/new
    echo 2. Pilih repository "yudhinatri"
    echo 3. Masukkan Environment Variables Redis Upstash
    echo 4. Klik Deploy!
    echo ================================================================
) else (
    echo.
    echo ================================================================
    echo [GAGAL ATAU BUTUH LOGIN]
    echo.
    echo Jika muncul error otentikasi atau browser tidak terbuka,
    echo Anda bisa langsung memasukkan Personal Access Token (PAT) GitHub.
    echo.
    echo Buat token di: https://github.com/settings/tokens/new
    echo (Centang pilihan "repo", lalu klik "Generate token")
    echo ================================================================
    echo.
    set /p "GITHUB_TOKEN=Tempel Token GitHub di sini (atau tekan Enter untuk keluar): "
    if defined GITHUB_TOKEN (
        echo.
        echo Mencoba push menggunakan Token...
        git push https://!GITHUB_TOKEN!@github.com/yudhinatri/yudhinatri.git main -u
        if !errorlevel% equ 0 (
            echo.
            echo ================================================================
            echo [BERHASIL!] Push dengan token berhasil!
            echo Repositori: https://github.com/yudhinatri/yudhinatri
            echo ================================================================
        ) else (
            echo.
            echo [GAGAL] Token salah atau tidak memiliki izin akses repo.
        )
    )
)

echo.
pause
