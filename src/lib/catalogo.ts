import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizar } from './formato';

export const NEGOCIO = { nombre: 'Speed Copy 3023, C.A.', rif: 'J-31350957-4' };

export const CATEGORIAS = ['Copias e impresiones', 'Papelería y útiles', 'Servicios'];
/** Con las dos tasas cargadas, esta categoría se cobra con el euro y el resto con el dólar. */
export const CATEGORIA_EURO = 'Papelería y útiles';

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precioUsd: number;
  orden: number;
}

export type ProductoDatos = Omit<Producto, 'id'>;

/** "IMPRESIÓN GLASSE 115 GR" → "impresion-glasse-115-gr" */
export function slug(nombre: string) {
  return normalizar(nombre)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function limpiarNombre(nombre: string) {
  return nombre.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Categoría sugerida para un producto nuevo según su nombre. */
export function categoriaSugerida(nombre: string) {
  const n = normalizar(nombre);
  if (/fotocopia|impresion|plastificado|fondo negro|escaneo|scan/.test(n)) return 'Copias e impresiones';
  if (/arancel|registro|referencia|curriculum|transcrip|tramite|carta de/.test(n)) return 'Servicios';
  return CATEGORIA_EURO;
}

export const productosRef = collection(db, 'productos');

export function suscribirProductos(
  cb: (productos: Producto[], desdeCache: boolean) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(productosRef, orderBy('orden')),
    (snap) => {
      const lista = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          nombre: String(x.nombre ?? ''),
          categoria: String(x.categoria ?? ''),
          precioUsd: Number(x.precioUsd ?? 0),
          orden: Number(x.orden ?? 0),
        } satisfies Producto;
      });
      cb(lista, snap.metadata.fromCache);
    },
    (e) => onError?.(e),
  );
}

export function guardarProducto(id: string, datos: ProductoDatos) {
  return setDoc(doc(productosRef, id), { ...datos, actualizado: serverTimestamp() });
}

export function eliminarProducto(id: string) {
  return deleteDoc(doc(productosRef, id));
}

/** Escribe y borra en lotes de 400 operaciones (el máximo de Firestore es 500). */
export async function aplicarCambios(guardar: Producto[], borrar: string[]) {
  const ops: ((b: WriteBatch) => void)[] = [
    ...guardar.map((p) => (b: WriteBatch) => {
      const { id, ...datos } = p;
      b.set(doc(productosRef, id), { ...datos, actualizado: serverTimestamp() });
    }),
    ...borrar.map((id) => (b: WriteBatch) => b.delete(doc(productosRef, id))),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
  }
}
