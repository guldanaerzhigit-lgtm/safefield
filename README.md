# SAFEFIELD

Enterprise Field Worker Safety & Lone Worker Protection Platform.

SAFEFIELD is an independent platform for field-worker safety, lone-worker check-ins, SOS response, location awareness and safety operations. It is a new project and does not reuse STOP WORK code, APIs, migrations or databases.

## Stack
- React, TypeScript, Vite, Tailwind CSS, React Router
- Cloudflare Workers + Hono API
- Cloudflare D1 database
- PWA manifest and service worker

## Development
```bash
npm install
cp .env.example .env
npm run dev
npm run worker:dev
```

Apply migrations with `npm run db:local` or `npm run db:remote`. Configure `JWT_SECRET` with Wrangler secrets, never commit secrets.

## Security
- Authorization and department scoping are enforced server-side.
- SOS alerts require an authorized human to resolve them.
- Browser background execution and push delivery are not guaranteed emergency channels.
- Location collection must be transparent and purpose-limited.

## Status
Stage 1 foundation. Authentication and operational flows are being built incrementally. Not production-ready yet.
