// Carga el catálogo inicial en Firestore a partir de src/data/precios.json.
// Uso: npm run seed   (requiere `gcloud auth login` con acceso al proyecto)
import { readFileSync } from 'node:fs';
import { escribirDocumentos } from './firestore-rest.mjs';

const datos = JSON.parse(readFileSync(new URL('../src/data/precios.json', import.meta.url), 'utf8'));
const docs = datos.productos.map((p, i) => ({
  id: p.id,
  nombre: p.nombre,
  categoria: p.categoria,
  precioUsd: p.precioUsd,
  orden: i + 1,
  actualizado: new Date(),
}));

await escribirDocumentos('productos', docs);
console.log(`Listo: ${docs.length} productos cargados en Firestore.`);
