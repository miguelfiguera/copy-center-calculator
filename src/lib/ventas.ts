import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase';
import { diaDe } from './formato';

export interface Cliente {
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string;
  correo: string;
}

export interface VentaLinea {
  id: string;
  nombre: string;
  categoria: string | null;
  precioUsd: number;
  cantidad: number;
  usd: number;
  bs: number;
}

export interface Venta {
  id: string;
  vendedorUid: string;
  vendedorNombre: string;
  /** Fecha del dispositivo al momento de la venta (la que se muestra). */
  fechaLocal: Date;
  dia: string;
  cliente: Cliente | null;
  tasas: { usd: number | null; eur: number | null };
  lineas: VentaLinea[];
  totalUsd: number;
  totalBs: number;
  origen: 'impresion' | 'pdf';
}

export type VentaNueva = Omit<Venta, 'id' | 'fechaLocal' | 'dia'>;

export const ventasRef = collection(db, 'ventas');

/**
 * Registra la venta. No espera la confirmación del servidor: con la caché persistente la venta
 * queda guardada en el dispositivo y se envía sola cuando hay internet.
 */
export function registrarVenta(datos: VentaNueva): { id: string; listo: Promise<void> } {
  const ref = doc(ventasRef);
  const ahora = new Date();
  const listo = setDoc(ref, {
    ...datos,
    fecha: serverTimestamp(),
    fechaLocal: Timestamp.fromDate(ahora),
    dia: diaDe(ahora),
  });
  return { id: ref.id, listo };
}

export interface FiltroVentas {
  desde: string;
  hasta: string;
  vendedorUid?: string;
}

export async function buscarVentas(f: FiltroVentas): Promise<Venta[]> {
  const cond: QueryConstraint[] = [];
  if (f.vendedorUid) cond.push(where('vendedorUid', '==', f.vendedorUid));
  cond.push(where('dia', '>=', f.desde), where('dia', '<=', f.hasta), orderBy('dia', 'desc'));
  const snap = await getDocs(query(ventasRef, ...cond));
  const lista = snap.docs.map((d) => {
    const x = d.data();
    const fechaLocal: Date = x.fechaLocal?.toDate?.() ?? x.fecha?.toDate?.() ?? new Date();
    return {
      id: d.id,
      vendedorUid: String(x.vendedorUid ?? ''),
      vendedorNombre: String(x.vendedorNombre ?? ''),
      fechaLocal,
      dia: String(x.dia ?? ''),
      cliente: x.cliente ?? null,
      tasas: { usd: x.tasas?.usd ?? null, eur: x.tasas?.eur ?? null },
      lineas: Array.isArray(x.lineas) ? x.lineas : [],
      totalUsd: Number(x.totalUsd ?? 0),
      totalBs: Number(x.totalBs ?? 0),
      origen: x.origen === 'pdf' ? 'pdf' : 'impresion',
    } satisfies Venta;
  });
  return lista.sort((a, b) => b.fechaLocal.getTime() - a.fechaLocal.getTime());
}

export function eliminarVenta(id: string) {
  return deleteDoc(doc(ventasRef, id));
}
