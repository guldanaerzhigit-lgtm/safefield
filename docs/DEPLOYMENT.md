# SAFEFIELD deployment checklist

## Cloudflare resources
- D1 database: `safefield-db`
- D1 binding: `DB`
- Cloudflare Pages project: `safefield`
- Production URL: `https://safefield.pages.dev`
- API is deployed as a Pages Function from `functions/api/[[path]].ts`; it reuses the Hono API in `worker/src`.

## Required production secrets
Configure these as encrypted Pages production environment variables:
- `JWT_SECRET` — a random secret with at least 32 characters.
- `BOOTSTRAP_SECRET` — a separate random secret with at least 32 characters. It is used only for the first administrator account.

Never put either secret in `.env`, Vite variables, GitHub source files, or the repository.

## Pages bindings and variables
Production Functions need D1 binding `DB` pointing to database UUID `7774bdc4-e46c-4e6f-a7e7-8ecf18dc47aa`.
Set the build variable `VITE_API_BASE_URL=/api/v1`. The API and UI use the same origin, so browser CORS is not required for production.

## First administrator
After the first deployment, send a POST request to `/api/v1/auth/bootstrap` with header `x-bootstrap-secret` and JSON body:
`{"email":"admin@example.com","fullName":"SAFEFIELD Administrator","password":"use-a-unique-password-of-at-least-12-characters"}`
The endpoint is permanently closed as soon as the first user is created. Remove `BOOTSTRAP_SECRET` from the Pages production environment after successful bootstrap.

## Local development
```bash
npm install
cp .env.example .env
npm run dev
npm run worker:dev
```
Vite proxies `/api/*` to the local Worker at `http://localhost:8787`.

## Emergency readiness
This foundation is not an independently certified emergency response service. Before operational rollout, configure escalation recipients, push delivery, monitoring, incident procedures, privacy notices and employee training. Test SOS delivery end-to-end before relying on it.
