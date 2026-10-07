// Service worker de Speed Copy: permite usar la app sin conexión.
//
// - Las páginas (/, /login, /ventas, /productos, /usuarios) se piden primero a la red y se guarda
//   una copia. Sin red, se sirve la copia; si no hay copia, una página de aviso.
// - Los archivos de /_astro/ tienen hash en el nombre, así que se sirven desde caché.
// - Los datos (catálogo, ventas, sesión) no pasan por aquí: los guarda Firebase en IndexedDB.
// - Al cerrar sesión, la app borra la caché de páginas.

const PAGE_CACHE = 'sc-paginas-v2';
const ASSET_CACHE = 'sc-assets-v2';
const STATIC_ASSETS = ['/logo.jpeg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
const PAGINAS = ['/', '/login', '/ventas', '/productos', '/usuarios'];

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
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(navegacion(request, url));
    return;
  }

  if (url.pathname.startsWith('/_astro/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(assetCacheFirst(request));
  }
});

// La página envía la lista de recursos que cargó para guardarlos y limpiar los viejos
self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'recursos') {
    event.waitUntil(sincronizarAssets(event.data.urls || []));
  }
});

const clavePagina = (url) => url.pathname.replace(/\/+$/, '') || '/';

async function navegacion(request, url) {
  const clave = clavePagina(url);
  const esPagina = PAGINAS.includes(clave);
  try {
    const res = await fetch(request);
    if (esPagina && res.ok) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(clave, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    const copia = await cache.match(clave);
    if (copia) return copia;
    return paginaSinConexion();
  }
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
    <p>Esta página todavía no se ha guardado en el dispositivo. Conéctate a internet, inicia sesión y vuelve a intentarlo.</p>
    <button onclick="location.href='/'">Reintentar</button>
  </div>
</body>
</html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
