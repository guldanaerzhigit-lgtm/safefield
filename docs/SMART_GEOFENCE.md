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

Copy the generated values and add them as Worker secrets from the repository root:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

For `VAPID_SUBJECT`, use a monitored contact such as `mailto:safety@example.com`. The public and private values must come from the same generated key pair. Never commit the private key.

## Deploy

After merging this PR into `main`:

```bash
npm ci
npm run db:remote
npm run worker:deploy
npm run build
```

Publish the generated frontend `dist/` directory using the repository's configured Pages deployment pipeline. Do not apply the migration against production before reviewing the target D1 database and backup policy.

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
