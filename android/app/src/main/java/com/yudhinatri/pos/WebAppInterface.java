package com.yudhinatri.pos;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * JavaScript Interface untuk komunikasi dua arah antara Web POS dan Native Android.
 * Dapat dipanggil di JS via: window.AndroidPOS.showToast(...)
 */
public class WebAppInterface {

    private final Context context;
    private final MainActivity activity;

    public WebAppInterface(Context context, MainActivity activity) {
        this.context = context;
        this.activity = activity;
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
}
