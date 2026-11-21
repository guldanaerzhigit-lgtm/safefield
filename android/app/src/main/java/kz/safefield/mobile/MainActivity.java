package kz.safefield.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONTokener;

public class MainActivity extends Activity {
    private static final int REQUEST_PERMISSIONS = 410;
    private static final String APP_URL = "https://safefield.pages.dev";
    private WebView webView;
    private TextView status;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(12, 29, 51));
        getWindow().setNavigationBarColor(Color.rgb(12, 29, 51));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(245, 248, 252));
        // Android 15 enforces edge-to-edge for target SDK 35. Keep app content
        // below the status bar and above the navigation bar.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top = 0, bottom = 0;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(0, top, 0, bottom);
            return insets;
        });

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setPadding(dp(14), dp(10), dp(14), dp(10));
        bar.setBackgroundColor(Color.rgb(12, 29, 51));

        TextView brand = new TextView(this);
        brand.setText("SAFEFIELD  •  ҚАУІПСІЗ ЖҰМЫС");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(14);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(brand);

        status = new TextView(this);
        status.setText("GPS бақылауы өшірулі");
        status.setTextColor(Color.rgb(190, 208, 228));
        status.setTextSize(12);
        status.setPadding(0, dp(5), 0, dp(8));
        bar.addView(status);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button start = new Button(this);
        start.setText("GPS-ті қосу");
        Button stop = new Button(this);
        stop.setText("Тоқтату");
        actions.addView(start, new LinearLayout.LayoutParams(0, dp(46), 1));
        LinearLayout.LayoutParams stopParams = new LinearLayout.LayoutParams(0, dp(46), 1);
        stopParams.setMargins(dp(8), 0, 0, 0);
        actions.addView(stop, stopParams);
        bar.addView(actions);
        root.addView(bar);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        webView.loadUrl(APP_URL);

        start.setOnClickListener(v -> requestTracking());
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, LocationForegroundService.class));
            status.setText("GPS бақылауы тоқтатылды");
            Toast.makeText(this, "Геолокация жіберу тоқтатылды", Toast.LENGTH_SHORT).show();
        });
    }

    private void requestTracking() {
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}, REQUEST_PERMISSIONS);
            } else {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_PERMISSIONS);
            }
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_PERMISSIONS);
            return;
        }
        readTokenAndStart();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_PERMISSIONS) {
            boolean allowed = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (allowed) readTokenAndStart();
            else Toast.makeText(this, "GPS бақылауын қосу үшін геолокация рұқсаты қажет", Toast.LENGTH_LONG).show();
        }
    }

    private void readTokenAndStart() {
        webView.evaluateJavascript("(function(){return localStorage.getItem('safefield-auth') || '';})()", value -> {
            try {
                Object decoded = new JSONTokener(value).nextValue();
                if (!(decoded instanceof String) || ((String) decoded).isEmpty()) {
                    Toast.makeText(this, "Алдымен SafeField жүйесіне кіріңіз", Toast.LENGTH_LONG).show();
                    return;
                }
                JSONObject persisted = new JSONObject((String) decoded);
                String token = persisted.optJSONObject("state") == null ? null : persisted.getJSONObject("state").optString("token", "");
                if (token == null || token.isEmpty() || "null".equals(token)) {
                    Toast.makeText(this, "Кіру сессиясы табылмады. Қайта кіріңіз.", Toast.LENGTH_LONG).show();
                    return;
                }
                Intent service = new Intent(this, LocationForegroundService.class);
                service.putExtra(LocationForegroundService.EXTRA_TOKEN, token);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service); else startService(service);
                status.setText("GPS бақылауы қосылды • экран сөнсе де жұмыс істейді");
                Toast.makeText(this, "GPS бақылауы қосылды", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "Кіру дерегін оқу мүмкін болмады. Жүйеге қайта кіріңіз.", Toast.LENGTH_LONG).show();
            }
        });
    }

    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
