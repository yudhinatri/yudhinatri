package com.yudhinatri.pos;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Pengelola printer thermal Bluetooth bawaan Android (Classic SPP).
 * Mendukung semua printer kasir Bluetooth 58mm / 80mm seperti Panda, Eppos, Iware, BellaV, Zjiang, Goojprt, dll.
 */
public class BluetoothPrinterManager {

    private static final String TAG = "POS_Bluetooth";
    // Standar UUID Serial Port Profile (SPP) untuk printer kasir thermal
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int PERMISSION_REQ_CODE = 101;

    private final Context context;
    private final Activity activity;
    private final BluetoothAdapter bluetoothAdapter;
    private final ExecutorService executorService = Executors.newSingleThreadExecutor();

    private BluetoothSocket currentSocket = null;
    private OutputStream currentOutputStream = null;
    private BluetoothDevice currentDevice = null;

    public BluetoothPrinterManager(Context context, Activity activity) {
        this.context = context;
        this.activity = activity;

        BluetoothAdapter adapter = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
                if (manager != null) {
                    adapter = manager.getAdapter();
                }
            }
            if (adapter == null) {
                adapter = BluetoothAdapter.getDefaultAdapter();
            }
        } catch (Exception e) {
            Log.e(TAG, "Gagal inisialisasi BluetoothAdapter", e);
        }
        this.bluetoothAdapter = adapter;
    }

    public boolean isBluetoothAvailable() {
        return bluetoothAdapter != null;
    }

    public boolean isBluetoothEnabled() {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
    }

    public boolean hasPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        } else {
            return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || context.checkSelfPermission(Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED;
        }
    }

    public void requestPermission() {
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                activity.requestPermissions(new String[]{
                        Manifest.permission.BLUETOOTH_CONNECT,
                        Manifest.permission.BLUETOOTH_SCAN
                }, PERMISSION_REQ_CODE);
            } else {
                activity.requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.BLUETOOTH,
                        Manifest.permission.BLUETOOTH_ADMIN
                }, PERMISSION_REQ_CODE);
            }
        });
    }

    public void openBluetoothSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Gagal membuka pengaturan bluetooth", e);
        }
    }

    public String getBondedDevicesJson() {
        JSONArray array = new JSONArray();
        if (bluetoothAdapter == null) {
            return array.toString();
        }

        if (!hasPermission()) {
            requestPermission();
            JSONObject err = new JSONObject();
            try {
                err.put("error", "PERMISSION_DENIED");
                err.put("message", "Izin Bluetooth diperlukan. Silakan izinkan pada dialog yang muncul.");
                array.put(err);
            } catch (Exception ignored) {}
            return array.toString();
        }

        try {
            Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
            if (pairedDevices != null) {
                for (BluetoothDevice device : pairedDevices) {
                    JSONObject obj = new JSONObject();
                    String name = device.getName();
                    if (name == null || name.trim().isEmpty()) {
                        name = "Perangkat Bluetooth (" + device.getAddress() + ")";
                    }
                    obj.put("name", name);
                    obj.put("address", device.getAddress());
                    array.put(obj);
                }
            }
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException saat mengambil bonded devices", se);
            requestPermission();
        } catch (Exception e) {
            Log.e(TAG, "Error saat mengambil bonded devices", e);
        }

        return array.toString();
    }

    public synchronized String connect(String macAddress) {
        JSONObject res = new JSONObject();

        if (bluetoothAdapter == null) {
            return errorJson("Perangkat ini tidak memiliki modul Bluetooth");
        }

        if (!bluetoothAdapter.isEnabled()) {
            return errorJson("Bluetooth di HP sedang nonaktif. Silakan aktifkan Bluetooth terlebih dahulu.");
        }

        if (!hasPermission()) {
            requestPermission();
            return errorJson("Izin Bluetooth belum diberikan. Silakan izinkan akses Bluetooth.");
        }

        if (macAddress == null || macAddress.trim().isEmpty()) {
            return errorJson("Alamat MAC printer tidak boleh kosong");
        }

        // Putuskan koneksi sebelumnya jika ada
        disconnect();

        try {
            // Batalkan discovery agar koneksi cepat dan stabil
            try {
                if (bluetoothAdapter.isDiscovering()) {
                    bluetoothAdapter.cancelDiscovery();
                }
            } catch (SecurityException ignored) {}

            final BluetoothDevice device = bluetoothAdapter.getRemoteDevice(macAddress);

            // Hubungkan dengan batas waktu (timeout) 6 detik agar tidak macet
            Callable<BluetoothSocket> connectTask = () -> {
                BluetoothSocket socket = null;
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                    return socket;
                } catch (IOException e1) {
                    // Fallback refleksi untuk HP/ROM tertentu (Xiaomi/Oppo/Vivo dll)
                    Log.w(TAG, "Koneksi standar SPP gagal, mencoba refleksi fallback: " + e1.getMessage());
                    try {
                        Method m = device.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                        socket = (BluetoothSocket) m.invoke(device, 1);
                        if (socket != null) {
                            socket.connect();
                            return socket;
                        }
                    } catch (Exception e2) {
                        Log.e(TAG, "Fallback refleksi juga gagal", e2);
                    }
                    throw e1;
                }
            };

            Future<BluetoothSocket> future = executorService.submit(connectTask);
            BluetoothSocket connectedSocket = future.get(6, TimeUnit.SECONDS);

            if (connectedSocket != null && connectedSocket.isConnected()) {
                currentSocket = connectedSocket;
                currentOutputStream = connectedSocket.getOutputStream();
                currentDevice = device;

                String deviceName = device.getName();
                if (deviceName == null || deviceName.trim().isEmpty()) {
                    deviceName = "Printer Bluetooth";
                }

                res.put("success", true);
                res.put("name", deviceName);
                res.put("address", macAddress);
                return res.toString();
            } else {
                return errorJson("Koneksi gagal dibuat ke printer");
            }

        } catch (java.util.concurrent.TimeoutException te) {
            disconnect();
            return errorJson("Koneksi ke printer timeout (printer tidak merespons dalam 6 detik). Pastikan printer menyala dan berada dalam jangkauan.");
        } catch (Exception e) {
            disconnect();
            Log.e(TAG, "Gagal konek ke printer " + macAddress, e);
            String msg = e.getMessage();
            if (msg == null || msg.trim().isEmpty()) {
                msg = e.toString();
            }
            return errorJson("Gagal menghubungkan: " + msg + ". Pastikan printer hidup dan sudah dipasangkan (paired) di pengaturan Bluetooth HP.");
        }
    }

    public synchronized String disconnect() {
        JSONObject res = new JSONObject();
        try {
            if (currentOutputStream != null) {
                try {
                    currentOutputStream.flush();
                    currentOutputStream.close();
                } catch (Exception ignored) {}
                currentOutputStream = null;
            }
            if (currentSocket != null) {
                try {
                    currentSocket.close();
                } catch (Exception ignored) {}
                currentSocket = null;
            }
            currentDevice = null;
            res.put("success", true);
        } catch (Exception e) {
            try {
                res.put("success", false);
                res.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return res.toString();
    }

    public synchronized boolean isConnected() {
        return currentSocket != null && currentSocket.isConnected() && currentOutputStream != null;
    }

    public synchronized String getConnectedDeviceName() {
        if (!isConnected() || currentDevice == null) return "";
        try {
            String name = currentDevice.getName();
            return name != null ? name : "Printer Bluetooth";
        } catch (SecurityException e) {
            return "Printer Bluetooth";
        }
    }

    public synchronized String getConnectedDeviceAddress() {
        if (!isConnected() || currentDevice == null) return "";
        return currentDevice.getAddress();
    }

    public synchronized String printEscPos(String base64Data) {
        if (!isConnected()) {
            return errorJson("Printer belum terhubung. Silakan sambungkan printer terlebih dahulu.");
        }

        if (base64Data == null || base64Data.trim().isEmpty()) {
            return errorJson("Data cetak kosong");
        }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) {
                return errorJson("Data cetak tidak valid setelah didekode");
            }

            currentOutputStream.write(bytes);
            currentOutputStream.flush();

            JSONObject res = new JSONObject();
            res.put("success", true);
            res.put("bytesWritten", bytes.length);
            return res.toString();
        } catch (IOException ioe) {
            Log.e(TAG, "Gagal menulis data ke printer, memutuskan koneksi", ioe);
            disconnect();
            return errorJson("Gagal mencetak: Koneksi printer terputus (" + ioe.getMessage() + ")");
        } catch (Exception e) {
            Log.e(TAG, "Error saat mencetak", e);
            return errorJson("Gagal mencetak: " + e.getMessage());
        }
    }

    private String errorJson(String message) {
        JSONObject res = new JSONObject();
        try {
            res.put("success", false);
            res.put("error", message);
        } catch (Exception ignored) {}
        return res.toString();
    }

    public void destroy() {
        disconnect();
        try {
            executorService.shutdownNow();
        } catch (Exception ignored) {}
    }
}
