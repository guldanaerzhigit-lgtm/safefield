# SAFEFIELD deployment checklist

## Cloudflare resources
- D1 database: `safefield-db`
- D1 binding: `DB`
- Worker name: `safefield-api`
- Worker config: `wrangler.toml`

## Required Worker secrets
Set a strong random value (at least 32 characters) as `JWT_SECRET`:

```bash
npx wrangler secret put JWT_SECRET --config wrangler.toml
```

Never put the JWT secret in `.env`, Vite variables, GitHub source files, or the repository.

## CORS
Set `CORS_ORIGIN` in the Worker environment to the exact HTTPS origin of the deployed frontend (for example, the Cloudflare Pages domain). Keep localhost only for local development.

## GitHub Actions
For manual Worker deployment, add repository Actions secrets:
- `CLOUDFLARE_API_TOKEN` — token with Workers Scripts edit and D1 read permissions.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.

Then run **Deploy SAFEFIELD API** from the Actions tab.

## Database
The initial schema is already applied to the remote D1 database. Do not re-run the initial SQL manually against production. Use versioned migrations for all subsequent changes.

## First administrator
There is not yet a self-service registration or public admin bootstrap route. Create the first administrator through a controlled, one-time provisioning procedure; do not expose a public registration endpoint or commit a default password.

## Emergency readiness
This foundation is not an independently certified emergency response service. Before operational rollout, configure escalation recipients, push delivery, monitoring, incident procedures, privacy notices and employee training. Test SOS delivery end-to-end before relying on it.
