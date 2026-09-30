package com.yudhinatri.pos;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * JavaScript Interface untuk komunikasi dua arah antara Web POS dan Native Android.
 * Dapat dipanggil di JS via: window.AndroidPOS.*
 */
public class WebAppInterface {

    private final Context context;
    private final MainActivity activity;
    private final BluetoothPrinterManager printerManager;

    public WebAppInterface(Context context, MainActivity activity, BluetoothPrinterManager printerManager) {
        this.context = context;
        this.activity = activity;
        this.printerManager = printerManager;
    }

    @JavascriptInterface
    public void showToast(String message) {
        if (message == null || message.trim().isEmpty()) return;
        activity.runOnUiThread(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    @JavascriptInterface
    public String getAppVersion() {
        return "1.0.0";
    }

    @JavascriptInterface
    public void reloadApp() {
        activity.runOnUiThread(activity::reloadCurrentPage);
    }

    // ==========================================
    // NATIVE BLUETOOTH PRINTER JAVASCRIPT BRIDGE
    // ==========================================

    @JavascriptInterface
    public boolean isBluetoothAvailable() {
        return printerManager != null && printerManager.isBluetoothAvailable();
    }

    @JavascriptInterface
    public boolean isBluetoothEnabled() {
        return printerManager != null && printerManager.isBluetoothEnabled();
    }

    @JavascriptInterface
    public boolean hasBluetoothPermission() {
        return printerManager != null && printerManager.hasPermission();
    }

    @JavascriptInterface
    public void requestBluetoothPermission() {
        if (printerManager != null) {
            printerManager.requestPermission();
        }
    }

    @JavascriptInterface
    public void openBluetoothSettings() {
        if (printerManager != null) {
            printerManager.openBluetoothSettings();
        }
    }

    @JavascriptInterface
    public String getBondedDevices() {
        if (printerManager == null) return "[]";
        return printerManager.getBondedDevicesJson();
    }

    @JavascriptInterface
    public String connectPrinter(String macAddress) {
        if (printerManager == null) {
            return "{\"success\":false,\"error\":\"Printer manager tidak tersedia\"}";
        }
        return printerManager.connect(macAddress);
    }

    @JavascriptInterface
    public String disconnectPrinter() {
        if (printerManager == null) {
            return "{\"success\":true}";
        }
        return printerManager.disconnect();
    }

    @JavascriptInterface
    public boolean isPrinterConnected() {
        return printerManager != null && printerManager.isConnected();
    }

    @JavascriptInterface
    public String getConnectedPrinterName() {
        return printerManager != null ? printerManager.getConnectedDeviceName() : "";
    }

    @JavascriptInterface
    public String getConnectedPrinterAddress() {
        return printerManager != null ? printerManager.getConnectedDeviceAddress() : "";
    }

    @JavascriptInterface
    public String printEscPos(String base64Data) {
        if (printerManager == null) {
            return "{\"success\":false,\"error\":\"Printer manager tidak tersedia\"}";
        }
        return printerManager.printEscPos(base64Data);
    }
}
