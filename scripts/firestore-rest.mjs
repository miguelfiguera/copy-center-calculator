// Utilidades para hablar con Firebase desde la terminal usando la sesión de gcloud
// (`gcloud auth login`). No hace falta clave de cuenta de servicio.
import { execSync } from 'node:child_process';

export const PROJECT = 'speed-copy-calculadora';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

let token;
export function accessToken() {
  if (!token) {
    try {
      token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
    } catch {
      console.error('No se pudo obtener un token. Ejecuta primero: gcloud auth login');
      process.exit(1);
    }
  }
  return token;
}

export async function llamar(url, body, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'x-goog-user-project': PROJECT,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Convierte un valor de JS al formato de valores de la API REST de Firestore. */
export function valor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
}

const docPath = (coleccion, id) => `projects/${PROJECT}/databases/(default)/documents/${coleccion}/${id}`;

/** Escribe documentos (reemplazando los existentes) en lotes de 400. */
export async function escribirDocumentos(coleccion, docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const writes = docs.slice(i, i + 400).map(({ id, ...campos }) => ({
      update: { name: docPath(coleccion, id), fields: valor(campos).mapValue.fields },
    }));
    await llamar(`${FIRESTORE}:commit`, { writes });
  }
}

export async function leerDocumento(coleccion, id) {
  const res = await fetch(`${FIRESTORE}/${coleccion}/${id}`, {
    headers: { Authorization: `Bearer ${accessToken()}`, 'x-goog-user-project': PROJECT },
  });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}
