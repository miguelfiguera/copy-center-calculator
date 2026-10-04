import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../lib/auth';

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  const res = redirect('/login');
  // Borra la copia sin conexión de la calculadora en los navegadores que lo soportan
  res.headers.set('Clear-Site-Data', '"cache"');
  return res;
};
