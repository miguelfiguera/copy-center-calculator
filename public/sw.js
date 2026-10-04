// Service worker de Speed Copy: permite usar la calculadora sin conexión.
//
// - La página principal ("/") se pide primero a la red. Si responde con sesión válida
//   (200 sin redirección), se guarda una copia con la fecha. Sin red, se sirve esa copia.
// - La copia solo existe si hubo sesión válida: si el servidor redirige al login, se borra.
// - La copia vence a los MAX_OFFLINE_DAYS días sin conectarse; luego hay que iniciar sesión.
// - Los archivos de /_astro/ tienen hash en el nombre, así que se sirven desde caché.

const MAX_OFFLINE_DAYS = 5;
const PAGE_CACHE = 'sc-pagina-v1';
const ASSET_CACHE = 'sc-assets-v1';
const CACHED_AT_HEADER = 'x-sc-guardado';
const STATIC_ASSETS = ['/logo.jpeg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

const MAX_AGE_MS = MAX_OFFLINE_DAYS * 24 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const vigentes = [PAGE_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !vigentes.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navegacion(request, url));
    return;
  }

  if (request.method === 'GET' && (url.pathname.startsWith('/_astro/') || STATIC_ASSETS.includes(url.pathname))) {
    event.respondWith(assetCacheFirst(request));
  }
});

// La página envía la lista de recursos que cargó para guardarlos y limpiar los viejos
self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'recursos') {
    event.waitUntil(sincronizarAssets(event.data.urls || []));
  }
});

async function navegacion(request, url) {
  const esInicio = request.method === 'GET' && url.pathname === '/';

  try {
    const res = await fetch(request);
    if (esInicio) {
      // Las navegaciones usan redirect: 'manual', así que una redirección llega como 'opaqueredirect'
      const redirigido = res.redirected || res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
      if (res.ok && !redirigido) {
        await guardarPagina(res.clone());
      } else if (redirigido) {
        // Sesión vencida o inválida: no conservar la copia
        await caches.delete(PAGE_CACHE);
      }
    }
    return res;
  } catch {
    if (esInicio) {
      const copia = await paginaGuardada();
      if (copia) return copia;
    }
    return paginaSinConexion();
  }
}

async function guardarPagina(res) {
  const headers = new Headers(res.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  const body = await res.blob();
  const cache = await caches.open(PAGE_CACHE);
  await cache.put('/', new Response(body, { status: 200, headers }));
}

async function paginaGuardada() {
  const cache = await caches.open(PAGE_CACHE);
  const res = await cache.match('/');
  if (!res) return null;
  const guardado = Number(res.headers.get(CACHED_AT_HEADER));
  if (!guardado || Date.now() - guardado > MAX_AGE_MS) {
    await caches.delete(PAGE_CACHE);
    return null;
  }
  return res;
}

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function sincronizarAssets(urls) {
  const cache = await caches.open(ASSET_CACHE);
  const usados = new Set(
    urls
      .map((u) => new URL(u, self.location.origin))
      .filter((u) => u.origin === self.location.origin && u.pathname.startsWith('/_astro/'))
      .map((u) => u.pathname),
  );

  await Promise.all(
    [...usados].map(async (path) => {
      if (!(await cache.match(path))) {
        try {
          await cache.add(path);
        } catch {}
      }
    }),
  );

  // Borrar archivos de versiones anteriores que la página ya no usa
  if (usados.size) {
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith('/_astro/') && !usados.has(path)) await cache.delete(req);
    }
  }
}

function paginaSinConexion() {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#07090d">
<link rel="icon" href="/logo.jpeg">
<title>Sin conexión · Speed Copy</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 1.25rem; box-sizing: border-box;
    background: #07090d; color: #e8ecf2; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; text-align: center; }
  .card { max-width: 380px; padding: 1.5rem; background: #11151c; border: 1px solid #252c38; border-radius: 14px; }
  img { width: 180px; border-radius: 10px; }
  h1 { font-size: 1.2rem; color: #ffd200; }
  p { color: #8b95a5; line-height: 1.5; }
  button { margin-top: .5rem; padding: .75rem 1.25rem; border: 0; border-radius: 10px; font: inherit; font-weight: 600;
    color: #fff; background: linear-gradient(180deg, #1e90ff, #0b6fd6); cursor: pointer; }
</style>
</head>
<body>
  <div class="card">
    <img src="/logo.jpeg" alt="Speed Copy">
    <h1>Sin conexión</h1>
    <p>Necesitas internet para iniciar sesión. La calculadora funciona sin conexión hasta ${MAX_OFFLINE_DAYS} días después de la última vez que se abrió con internet y una sesión activa.</p>
    <button onclick="location.href='/'">Reintentar</button>
  </div>
</body>
</html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
