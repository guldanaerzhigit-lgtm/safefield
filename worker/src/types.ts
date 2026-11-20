export type Role = 'EMPLOYEE' | 'SUPERVISOR' | 'DISPATCHER' | 'SAFETY_MANAGER' | 'ADMIN';
export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success?: boolean }>;
  run(): Promise<{ meta: { changes: number } }>;
};
export type D1Database = { prepare(query: string): D1PreparedStatement };
export type Env = { DB: D1Database; JWT_SECRET: string; BOOTSTRAP_SECRET?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string; APP_ENV?: string; CORS_ORIGIN?: string };
export type AuthUser = { id: string; email: string; fullName: string; role: Role; roleId: string; departmentId: string | null; supervisorId: string | null };
