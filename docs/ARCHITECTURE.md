# Architecture

## Trust boundaries
The React PWA is an untrusted client. Identity, role, department-scope and state-transition checks run in the Worker API. D1 is private to the Worker binding. Secrets are configured with Wrangler secrets, never Vite variables.

## API layers
1. `worker/src/middleware/auth.ts` verifies signed access tokens.
2. `worker/src/middleware/authorize.ts` enforces role and department scope.
3. Route modules validate payloads and call domain operations.
4. Audit events are written for security-sensitive actions.

## SOS lifecycle
`OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED | FALSE_ALARM`. Serious alerts are never resolved by scheduled automation. Closure requires an authorized human actor and a resolution note.

## Offline behavior
Queued SOS is not equivalent to a delivered alert. The UI must clearly show pending/sent/failed states and provide employer-configured emergency instructions.

## Privacy
Request location contextually, store only required precision and retention windows, and restrict history access by role and department. Production rollout requires privacy review and employee notice.
