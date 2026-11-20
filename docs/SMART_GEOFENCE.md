# Smart Geofence — deployment and field test

## What the module does

- Shows active SAFE / WARNING / DANGER zones on the employee map.
- Tracks GPS while the employee keeps the PWA open and permission granted.
- Records transitions at the zone boundary and at 50 m / 200 m / 500 m approach thresholds.
- Creates a HIGH alert at 50 m from a DANGER zone and a CRITICAL alert on entry.
- Shows employee alerts to the direct supervisor and to dispatch / safety / admin roles.
- Refreshes the alert center every 15 seconds.
- Can deliver encrypted Web Push notifications to subscribed supervisor / dispatcher devices.

## Required Cloudflare configuration

Web Push requires a VAPID key pair. Generate a P-256 key pair locally with Node.js:

```bash
node --input-type=module -e "import { generateKeyPairSync } from 'node:crypto'; const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); const p = publicKey.export({ format: 'jwk' }); const d = privateKey.export({ format: 'jwk' }); const b = s => Buffer.from(s, 'base64url'); console.log('VAPID_PUBLIC_KEY=' + Buffer.concat([Buffer.from([4]), b(p.x), b(p.y)]).toString('base64url')); console.log('VAPID_PRIVATE_KEY=' + d.d);"
```

The SafeField production site runs as a **Cloudflare Pages Functions** project named `safefield`. Add the values in Cloudflare Dashboard:

1. Open **Workers & Pages → Pages → safefield → Settings → Environment variables**.
2. Under **Production**, add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as encrypted secrets.
3. Add `VAPID_SUBJECT` as a plain-text variable, using a monitored contact such as `mailto:safety@example.com`.
4. Save the settings and trigger a new production deployment so the Pages Function receives the new bindings.

The public and private values must come from the same generated key pair. Never commit the private key. If deploying the standalone Worker from `wrangler.toml` instead of Pages Functions, configure the same values with `wrangler secret put`.

## Deploy

The `safefield` Cloudflare Pages project is connected to this GitHub repository's `main` branch and builds `dist/` with `npm run build`. Merging this PR triggers the production Pages deployment automatically; the Pages Functions entrypoint imports `worker/src/index.ts`, so the API changes are deployed with the site. Do not run `npm run worker:deploy` for this Pages-hosted production API unless intentionally deploying a separate standalone Worker.

The `0008_smart_geofence.sql` migration has already been applied to the current production D1 database after creating a SQL export backup. For another environment, first confirm the target database and backup, then run:

```bash
npm run db:remote
```

After changing Pages production environment variables (VAPID keys), trigger a new Pages production deployment so the Functions runtime receives the updated bindings.

## Supervisor / dispatcher setup

1. Open SafeField in the browser on each supervisor / dispatcher device and sign in.
2. Open **Дабылдар орталығы** and press **Push хабарламасын қосу**.
3. Allow browser notifications. The browser stores a push subscription for the signed-in account.
4. Repeat on each device that should receive urgent alerts.

The alert is always persisted in `safety_alerts`; delivery attempts are recorded in `notification_logs`. Expired subscriptions (HTTP 404 / 410) are removed automatically.

## Field acceptance test

1. Create a DANGER zone in a test department with a known GPS center and radius.
2. Subscribe a supervisor and a dispatcher to Push on their devices.
3. Start GPS monitoring on a test employee phone and grant location permission.
4. Move the test employee location through the 500 m, 200 m, 50 m and zone boundary thresholds (or use a controlled GPS test environment).
5. Verify the event history, HIGH / CRITICAL alert, supervisor / dispatcher Push notification, and acknowledgement flow.
6. Verify exit events and ensure a new alert is not generated on every GPS sample while the employee remains in the same stage.

## Platform limitation

Browser geolocation is not guaranteed to run after the PWA is backgrounded or the operating system suspends the browser. Reliable continuous background GPS on Android requires a native Android foreground service with a persistent notification and the relevant platform permissions. This web module must not be treated as a replacement for SOS, scheduled check-ins, or local workplace emergency procedures.
