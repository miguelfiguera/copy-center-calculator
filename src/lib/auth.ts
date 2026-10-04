import { createHmac, timingSafeEqual } from 'node:crypto';
import { AUTH_USER, AUTH_PASSWORD, AUTH_SECRET } from 'astro:env/server';

export const SESSION_COOKIE = 'sc_session';
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 horas

const secret = () => AUTH_SECRET || `${AUTH_USER}:${AUTH_PASSWORD}`;

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkCredentials(user: string, password: string): boolean {
  // Evaluar ambos para no filtrar cuál de los dos falló por tiempo de respuesta
  const okUser = safeEqual(user, AUTH_USER);
  const okPass = safeEqual(password, AUTH_PASSWORD);
  return okUser && okPass;
}

export function createSession(user: string): string {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${Buffer.from(user).toString('base64url')}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userB64, expires, signature] = parts;
  const payload = `${userB64}.${expires}`;
  if (!safeEqual(signature, sign(payload))) return null;
  if (Number(expires) < Date.now()) return null;
  return Buffer.from(userB64, 'base64url').toString();
}
