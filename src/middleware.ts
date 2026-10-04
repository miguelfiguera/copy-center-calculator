import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, verifySession } from './lib/auth';

const PUBLIC_PATHS = ['/login', '/api/login'];

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  const user = verifySession(context.cookies.get(SESSION_COOKIE)?.value);
  context.locals.user = user;

  if (PUBLIC_PATHS.includes(pathname)) {
    if (user && pathname === '/login') return context.redirect('/');
    return next();
  }
  if (!user) return context.redirect('/login');
  return next();
});
