import type { APIRoute } from 'astro';
import { checkCredentials, createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const user = String(form.get('usuario') ?? '').trim();
  const password = String(form.get('clave') ?? '');

  if (!checkCredentials(user, password)) {
    return redirect('/login?error=1');
  }

  cookies.set(SESSION_COOKIE, createSession(user), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: SESSION_MAX_AGE,
  });
  return redirect('/');
};
