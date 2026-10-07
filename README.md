# Speed Copy · Calculadora de ventas

Calculadora y registro de ventas para Speed Copy 3023, C.A. Hecha con [Astro](https://astro.build) como sitio estático desplegado en Netlify, con [Firebase](https://console.firebase.google.com/project/speed-copy-calculadora) (Authentication y Firestore) para usuarios, catálogo e historial de ventas.

- **Usuarios individuales**: cada persona entra con su correo y clave. Hay dos roles:
  - *Vendedor*: usa la calculadora y ve sus propias ventas.
  - *Administrador*: además gestiona productos, usuarios y ve todas las ventas.
- **Catálogo en Firestore**: los administradores agregan, editan y eliminan productos desde la app (uno a uno o varios a la vez), o importan la lista de precios desde Excel o CSV.
- **Registro de ventas**: con **Guardar venta** (o al guardar el PDF del recibo) la venta queda guardada con sus líneas, montos en $ y Bs, tasas usadas, datos del cliente y quién la atendió. Guardar el PDF y luego la venta no la duplica.
- **Historial de ventas**: por rango de fechas (hoy, ayer, semana, mes) y por vendedor, con totales y exportación a CSV para cuadrar con las facturas.
- Precios en dólares, con conversión a bolívares según la **tasa BCV del dólar** y/o la **tasa BCV del euro** del día:
  - Si solo hay una tasa cargada, se usa esa para todos los productos.
  - Si están las dos, la del euro se usa para la categoría **Papelería y útiles** y la del dólar para todo lo demás (incluidos los conceptos libres).
  - Para quitar una tasa basta con dejar su campo vacío.
- Las tasas se guardan en `localStorage` con la fecha. Si el día cambió, la app pide las tasas nuevas.
- El recibo se puede guardar en PDF (formato ticket de 80 mm) y siempre muestra los montos en $ y en Bs.
- Datos del cliente opcionales (nombre, apellido, cédula, teléfono y correo) que se cargan desde un modal y se borran al guardar la venta o al empezar una nueva.
- Diseño oscuro, pensado primero para móviles.
- Funciona sin conexión (PWA): ver abajo.

## Páginas

| Ruta         | Quién         | Qué hace                                                                        |
| ------------ | ------------- | ------------------------------------------------------------------------------- |
| `/login`     | Todos         | Inicio de sesión y "¿Olvidaste tu clave?" (envía un correo).                    |
| `/`          | Todos         | Calculadora y recibo.                                                           |
| `/ventas`    | Todos         | Historial. Los vendedores solo ven las suyas.                                   |
| `/productos` | Administrador | Catálogo: alta, edición, eliminación (individual o en lote) e importación.      |
| `/usuarios`  | Administrador | Crear cuentas, cambiar rol, activar o desactivar, enviar correo de nueva clave. |

Desde el menú (☰) cualquier usuario puede cambiar su propia clave.

## Importar la lista de precios

En **Productos → Importar Excel o CSV** se sube el archivo (`.xls`, `.xlsx` o `.csv`, separado por coma, punto y coma o tabulador). La app busca la fila de encabezados con una columna de nombre (`Nombre Producto`) y una de precio en dólares (`PRECIO $`), y muestra una vista previa antes de aplicar nada:

- **Nuevo**: no existe en el catálogo. Se le propone una categoría que se puede cambiar.
- **Cambia**: ya existe y el precio es distinto.
- **Igual**: sin cambios de precio (el orden de la lista se actualiza igual).
- **No están en el Excel**: productos del catálogo que no aparecen en el archivo. Se conservan a menos que se marquen para eliminar.

Los productos se emparejan por nombre, así que si en el archivo se renombra uno, aparecerá como nuevo y el anterior en la lista de faltantes.

Para borrar varios productos a la vez, se marcan con las casillas de la tabla (la casilla del encabezado selecciona todos los visibles) y se pulsa **Eliminar seleccionados**.

## Uso sin conexión

Un service worker (`public/sw.js`) guarda las páginas y los archivos de la app. Los datos (sesión, catálogo y ventas) los guarda Firebase en el navegador:

- Para iniciar sesión hace falta internet. Una vez dentro, la sesión queda guardada en el dispositivo.
- El catálogo se mantiene en caché y se actualiza solo cuando hay conexión.
- Las ventas registradas sin internet quedan en el dispositivo y se envían solas al reconectarse.
- Cerrar sesión borra la caché de páginas y los datos de Firestore guardados en el dispositivo.
- En el celular se puede instalar con "Agregar a pantalla de inicio".

## Firebase

Proyecto: `speed-copy-calculadora`. La configuración web está en `src/lib/firebase.ts` (es pública; la seguridad la dan las reglas).

- **Authentication**: proveedor "Correo electrónico/contraseña".
- **Firestore**: colecciones `usuarios/{uid}` (nombre, email, rol, activo), `productos/{id}` (nombre, categoria, precioUsd, orden) y `ventas/{id}`.
- **Reglas**: `firestore.rules`. Los vendedores solo pueden crear ventas a su nombre y leer las suyas; los administradores gestionan todo. Un administrador no puede quitarse su propio rol ni desactivarse.
- **Índices**: `firestore.indexes.json` (ventas por vendedor y día).

Para desplegar reglas e índices después de cambiarlos:

```bash
npm run deploy:firestore    # requiere `firebase login`
```

### Scripts de administración

Usan la sesión de `gcloud auth login` (no hace falta clave de cuenta de servicio):

```bash
npm run seed                                                 # carga src/data/precios.json en productos
npm run crear-admin -- correo@ejemplo.com "Nombre" [clave]   # crea o promueve un administrador
```

Si no se pasa clave, la persona debe usar "¿Olvidaste tu clave?" en el login para crear una.

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:4321
npm run check          # tipos
npm run build          # genera dist/
```

## Despliegue en Netlify

1. En Netlify: **Add new project → Import an existing project → GitHub** y elegir `miguelfiguera/copy-center-calculator`.
2. La configuración de build se toma de `netlify.toml` (`npm run build`, Node 22). No hacen falta variables de entorno.
3. En Firebase Authentication → **Settings → Authorized domains**, agregar el dominio de Netlify si no está (`*.netlify.app` o el dominio propio).

Cada push a `main` despliega solo.

## Lista de precios inicial

`src/data/precios.json` es la semilla que se cargó a Firestore con `npm run seed`, generada a partir de `LISTA DE PRECIOS SPEED COPY 2026.xls`. El catálogo vivo está en Firestore; el JSON solo sirve para volver a cargarlo desde cero.
