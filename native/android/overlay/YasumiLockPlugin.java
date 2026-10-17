package com.yasumi.app;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * やすみタイム用の Android 専用機能
 *  - setLock       : 休憩ロック中の全画面表示・画面固定・（許可があれば）端末ロック
 *  - openExternal  : Googleログイン用にブラウザを開く
 *  - requestAdmin  : 端末ロックの権限をお願いする画面を開く
 *  - authToken(イベント) : ブラウザから yasumi://auth#id=...&at=... で戻ってきたログイン情報
 */
@CapacitorPlugin(name = "YasumiLock")
public class YasumiLockPlugin extends Plugin {

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri u = intent.getData();
        if (u == null || !"yasumi".equals(u.getScheme())) return;
        String f = u.getFragment();
        if (f == null) return;
        Uri q = Uri.parse("http://x/?" + f);
        JSObject o = new JSObject();
        o.put("id", q.getQueryParameter("id"));
        o.put("at", q.getQueryParameter("at"));
        notifyListeners("authToken", o, true);
        intent.setData(null);
    }

    @PluginMethod
    public void setLock(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final boolean deviceLock = Boolean.TRUE.equals(call.getBoolean("deviceLock", false));
        final Activity a = getActivity();
        a.runOnUiThread(() -> {
            Window w = a.getWindow();
            if (on) {
                if (!deviceLock) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (Build.VERSION.SDK_INT >= 27) {
                    try { a.setShowWhenLocked(true); } catch (Exception e) { }
                }
                w.getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
                try { a.startLockTask(); } catch (Exception e) { }
                if (deviceLock) lockDevice(a);
            } else {
                w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (Build.VERSION.SDK_INT >= 27) {
                    try { a.setShowWhenLocked(false); } catch (Exception e) { }
                }
                w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                try { a.stopLockTask(); } catch (Exception e) { }
            }
        });
        call.resolve();
    }

    private void lockDevice(Context c) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName cn = new ComponentName(c, AdminReceiver.class);
            if (dpm != null && dpm.isAdminActive(cn)) dpm.lockNow();
        } catch (Exception e) { }
    }

    @PluginMethod
    public void requestAdmin(PluginCall call) {
        Context c = getContext();
        DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName cn = new ComponentName(c, AdminReceiver.class);
        JSObject r = new JSObject();
        if (dpm != null && dpm.isAdminActive(cn)) {
            r.put("active", true);
            call.resolve(r);
            return;
        }
        Intent i = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
        i.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, cn);
        i.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "休憩の時間に、この端末の画面をロックするために使います。");
        getActivity().startActivity(i);
        r.put("active", false);
        call.resolve(r);
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) {
            call.reject("https only");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(i);
        call.resolve();
    }
}
