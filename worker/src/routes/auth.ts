import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

const bootstrapSchema = z.object({
  email: z.email().max(254),
  fullName: z.string().min(2).max(160),
  password: z.string().min(12).max(128),
});

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

// Workers Web Crypto supports PBKDF2 with at most 100,000 iterations.
async function hashPassword(password: string): Promise<string> {
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  ));
  return `pbkdf2$${iterations}$${encodeBase64Url(salt)}$${encodeBase64Url(bits)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Support bcrypt hashes from the intermediate deployment.
  if (/^\$2[aby]\$/.test(stored)) {
    return compare(password, stored);
  }

  if (!stored.startsWith('pbkdf2$')) return false;

  const [, rawIterations, rawSalt, rawHash] = stored.split('$');
  const iterations = Number(rawIterations);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations !== 100000 ||
    !rawSalt ||
    !rawHash
  ) {
    return false;
  }

  try {
    const salt = decodeBase64Url(rawSalt);
    const expected = decodeBase64Url(rawHash);
    if (salt.length !== 16 || expected.length !== 32) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    // Copy into a concrete ArrayBuffer to satisfy the Web Crypto BufferSource type.
    const saltBuffer = new ArrayBuffer(salt.length);
    new Uint8Array(saltBuffer).set(salt);
    const actual = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
      key,
      expected.length * 8,
    ));

    let mismatch = 0;
    for (let i = 0; i < actual.length; i++) {
      mismatch |= actual[i] ^ expected[i];
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

app.post('/bootstrap', async c => {
  const configuredSecret = c.env.BOOTSTRAP_SECRET;
  const suppliedSecret = c.req.header('x-bootstrap-secret') || '';

  if (
    !configuredSecret ||
    configuredSecret.length < 32 ||
    !safeEqual(configuredSecret, suppliedSecret)
  ) {
    return c.json({
      error: { code: 'NOT_FOUND', message: 'Bootstrap is unavailable' },
    }, 404);
  }

  const existing = await c.env.DB
    .prepare('SELECT COUNT(*) AS n FROM users')
    .first<{ n: number }>();

  if ((existing?.n ?? 0) > 0) {
    return c.json({
      error: {
        code: 'BOOTSTRAP_CLOSED',
        message: 'An account already exists; bootstrap is permanently closed',
      },
    }, 409);
  }

  const parsed = bootstrapSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Provide a valid email, full name and password of at least 12 characters',
      },
    }, 400);
  }

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    return c.json({
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Authentication is not configured',
      },
    }, 503);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO users (id,email,password_hash,full_name,role_id,status,locale) VALUES (?,?,?,?,'role_admin','ACTIVE','ru')",
  ).bind(
    id,
    email,
    passwordHash,
    parsed.data.fullName.trim(),
  ).run();

  await c.env.DB.prepare(
    "INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,'ADMIN_BOOTSTRAPPED','USER',?)",
  ).bind(crypto.randomUUID(), id, id).run();

  return c.json({
    ok: true,
    user: {
      id,
      email,
      fullName: parsed.data.fullName.trim(),
      role: 'ADMIN',
    },
  }, 201);
});

app.post('/login', async c => {
  const parsed = loginSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Enter a valid email and password',
      },
    }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const row = await c.env.DB.prepare(
    "SELECT u.id,u.email,u.password_hash,u.full_name,u.role_id,u.department_id,u.supervisor_id,u.status,r.code AS role,d.name AS department_name FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id WHERE u.email=? COLLATE NOCASE LIMIT 1",
  ).bind(email).first<Record<string, string | null>>();

  if (
    !row ||
    row.status !== 'ACTIVE' ||
    !row.password_hash ||
    !(await verifyPassword(parsed.data.password, row.password_hash))
  ) {
    return c.json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      },
    }, 401);
  }

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    return c.json({
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Authentication is not configured. Contact your administrator.',
      },
    }, 503);
  }

  const token = await new SignJWT({
    email: row.email,
    name: row.full_name,
    role: row.role,
    roleId: row.role_id,
    departmentId: row.department_id,
    supervisorId: row.supervisor_id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(row.id!)
    .setIssuer('safefield')
    .setAudience('safefield-api')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(jwtSecret));

  await c.env.DB.prepare(
    "UPDATE users SET last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  ).bind(row.id).run();

  await c.env.DB.prepare(
    "INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id,department_id) VALUES (lower(hex(randomblob(16))),?,'AUTH_LOGIN','USER',?,?)",
  ).bind(row.id, row.id, row.department_id).run();

  return c.json({
    token,
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      departmentName: row.department_name,
    },
  });
});

app.get('/me', authMiddleware, c => c.json({ user: c.get('user') }));
app.post('/logout', authMiddleware, c => c.json({
  ok: true,
  message: 'Client session cleared',
}));

export default app;
