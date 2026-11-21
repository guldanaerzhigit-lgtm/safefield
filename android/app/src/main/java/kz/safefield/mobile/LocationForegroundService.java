package kz.safefield.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationForegroundService extends Service implements LocationListener {
    public static final String EXTRA_TOKEN = "auth_token";
    private static final String CHANNEL_ID = "safefield_location";
    private static final int NOTIFICATION_ID = 7301;
    private static final String TRACK_URL = "https://safefield.pages.dev/api/v1/zones/track";
    private static final String TAG = "SafeFieldGPS";
    private LocationManager locationManager;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private String token = "";

    @Override public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra(EXTRA_TOKEN)) {
            token = intent.getStringExtra(EXTRA_TOKEN);
            getSharedPreferences("safefield_gps", MODE_PRIVATE).edit().putString(EXTRA_TOKEN, token).apply();
        } else if (token.isEmpty()) {
            token = getSharedPreferences("safefield_gps", MODE_PRIVATE).getString(EXTRA_TOKEN, "");
        }
        if (token == null || token.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        getSharedPreferences("safefield_gps", MODE_PRIVATE).edit().putBoolean("active", true).apply();
        startForeground(NOTIFICATION_ID, buildNotification("Геолокация жіберілуде"));
        startLocationUpdates();
        return START_STICKY;
    }

    private void startLocationUpdates() {
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) { stopSelf(); return; }
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 10f, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30000L, 25f, this);
            }
            Location last = locationManager.getLastKnownLocation(fine ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER);
            if (last != null) onLocationChanged(last);
        } catch (SecurityException error) {
            Log.e(TAG, "Location permission was revoked", error);
            stopSelf();
        }
    }

    @Override public void onLocationChanged(Location location) {
        Intent update = new Intent("kz.safefield.GPS_LOCATION");
        update.setPackage(getPackageName());
        update.putExtra("latitude", location.getLatitude()); update.putExtra("longitude", location.getLongitude()); update.putExtra("accuracy", (double) location.getAccuracy());
        sendBroadcast(update);
        final String currentToken = token;
        network.execute(() -> sendLocation(currentToken, location));
    }

    private void sendLocation(String authToken, Location location) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(TRACK_URL);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + authToken);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            JSONObject body = new JSONObject();
            body.put("latitude", location.getLatitude());
            body.put("longitude", location.getLongitude());
            body.put("accuracy", (double) location.getAccuracy());
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int code = connection.getResponseCode();
            if (code >= 200 && code < 300) {
                updateNotification("Соңғы координат: " + location.getLatitude() + ", " + location.getLongitude());
            } else {
                Log.w(TAG, "Location API returned HTTP " + code);
                updateNotification("Серверге жіберу сәтсіз • қайта әрекет жасалады");
            }
        } catch (Exception error) {
            Log.w(TAG, "Location upload failed; next GPS update will retry", error);
            updateNotification("Байланыс жоқ • қайта жіберіледі");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SafeField GPS бақылауы", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Қызметкер қосқан кезде геолокация жіберіліп тұрғанын көрсетеді");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String message) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return builder.setContentTitle("SafeField • GPS белсенді")
                .setContentText(message)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    private void updateNotification(String message) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(message));
    }

    @Override public void onDestroy() {
        getSharedPreferences("safefield_gps", MODE_PRIVATE).edit().putBoolean("active", false).apply();
        if (locationManager != null) locationManager.removeUpdates(this);
        network.shutdown();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) { updateNotification("GPS провайдері өшірулі"); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
}
