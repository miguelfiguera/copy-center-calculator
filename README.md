# Speed Copy · Calculadora de ventas

Calculadora para Speed Copy 3023, C.A. hecha con [Astro](https://astro.build) (SSR con `@astrojs/node`).

- Login con usuario y clave definidos en `.env`, con una cookie de sesión firmada (12 h).
- Precios en dólares, con conversión a bolívares según la **tasa BCV** del día.
- La tasa se guarda en `localStorage` con la fecha. Si el día cambió, la app pide la tasa nueva.
- El recibo se puede imprimir (formato ticket de 80 mm) o guardar en PDF, y siempre muestra los montos en $ y en Bs.
- Diseño oscuro, pensado primero para móviles.

## Configuración

```bash
cp .env.example .env   # editar AUTH_USER, AUTH_PASSWORD y AUTH_SECRET
npm install
npm run dev            # http://localhost:4321
```

Producción:

```bash
npm run build
npm start              # node ./dist/server/entry.mjs (usa HOST y PORT)
```

Las variables de `.env` se leen al ejecutar la app. En producción tienen que estar definidas en el entorno del proceso.

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
