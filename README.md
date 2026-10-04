# Speed Copy · Calculadora de ventas

Calculadora para Speed Copy 3023, C.A. hecha con [Astro](https://astro.build) y desplegada en Netlify (SSR con `@astrojs/netlify`).

- Login con usuario y clave definidos en `.env`, con una cookie de sesión firmada (12 h).
- Precios en dólares, con conversión a bolívares según la **tasa BCV** del día.
- La tasa se guarda en `localStorage` con la fecha. Si el día cambió, la app pide la tasa nueva.
- El recibo se puede imprimir (formato ticket de 80 mm) o guardar en PDF, y siempre muestra los montos en $ y en Bs.
- Datos del cliente opcionales (nombre, apellido, cédula, teléfono y correo) que se cargan desde un modal. No se guardan en ningún lado y se borran al imprimir o al empezar una nueva venta.
- Diseño oscuro, pensado primero para móviles.
- Funciona sin conexión (PWA): ver abajo.

## Uso sin conexión

Un service worker (`public/sw.js`) guarda una copia de la calculadora para cuando no hay internet:

- La copia solo se guarda cuando la página se abre con una sesión válida. Si el servidor redirige al login, la copia se borra.
- Cerrar sesión también borra la copia.
- La copia vence a los **5 días** sin abrir la app con internet (`MAX_OFFLINE_DAYS` en `public/sw.js`). Después de eso, hay que conectarse e iniciar sesión otra vez.
- Cada vez que se abre con internet se carga la versión más reciente, que reemplaza a la copia anterior.
- Sin conexión siguen funcionando la tasa BCV, el recibo, la impresión y el PDF. Lo único que no funciona es iniciar sesión.
- En el celular se puede instalar con "Agregar a pantalla de inicio".

## Configuración

```bash
cp .env.example .env   # editar AUTH_USER, AUTH_PASSWORD y AUTH_SECRET
npm install
npm run dev            # http://localhost:4321
```

## Despliegue en Netlify

1. En Netlify: **Add new project → Import an existing project → GitHub** y elegir `miguelfiguera/copy-center-calculator`.
2. La configuración de build se toma de `netlify.toml` (`npm run build`, Node 22), así que no hay que cambiar nada.
3. En **Project configuration → Environment variables**, agregar `AUTH_USER`, `AUTH_PASSWORD` y `AUTH_SECRET`. Para el secreto se puede generar una cadena aleatoria con `openssl rand -hex 32`.
4. Hacer el deploy. Si después cambias las variables, hay que volver a desplegar.

Cada push a `main` despliega solo.

## Lista de precios

Los productos y servicios están en [`src/data/precios.json`](src/data/precios.json):

```json
{ "id": "fotocopia-carta", "nombre": "FOTOCOPIA CARTA", "categoria": "Copias e impresiones", "precioUsd": 0.17 }
```

- `precioUsd` siempre va en dólares.
- Si un producto tiene precio `0`, aparece como "Precio por definir" y no se puede agregar al recibo.
- Las categorías se generan solas a partir del campo `categoria`.
- Después de editar el JSON, hay que volver a compilar y desplegar.

La lista inicial se generó a partir de `LISTA DE PRECIOS SPEED COPY 2026.xls`.
