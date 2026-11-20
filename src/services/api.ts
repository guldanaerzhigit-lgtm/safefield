import { useAuthStore } from '../stores/authStore';
const API = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || `Request failed (${response.status})`);
  return body as T;
}
