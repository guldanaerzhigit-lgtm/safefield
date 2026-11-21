# SafeField Android

Native Android shell for the existing SafeField web application.

## What it does
- Opens the production SafeField web application inside Android WebView.
- The employee signs in with the existing SafeField account.
- The employee explicitly starts and stops GPS sharing.
- A visible Android location foreground-service notification remains while sharing is active.
- Location updates are sent to the existing authenticated endpoint: `POST /api/v1/zones/track`.

## Build
From this directory, with JDK 17 and Android SDK installed:

```bash
gradle :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions also builds and uploads this APK as an artifact.

## Permissions and privacy
The app requests foreground location and notification permissions when the employee starts tracking. Tracking does not start automatically at login. The employee can stop it from the app. Android shows an ongoing notification while the foreground service is active.

This first build sends each new location fix directly to the API. If the network is unavailable, the next location fix retries; a durable offline queue and production signing are follow-up tasks. Device testing is required before operational rollout.
