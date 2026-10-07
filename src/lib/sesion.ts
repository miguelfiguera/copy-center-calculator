import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import { clearIndexedDbPersistence, doc, getDoc, terminate } from 'firebase/firestore';
import { auth, db } from './firebase';
import { $, toast } from './formato';

export type Rol = 'admin' | 'vendedor';

export interface Perfil {
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

export interface Sesion {
  user: User;
  perfil: Perfil;
  esAdmin: boolean;
}

export const PAGE_CACHE = 'sc-paginas-v2';

/** Mensajes en español para los errores más comunes de Firebase. */
export function mensajeError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const tabla: Record<string, string> = {
    'auth/invalid-credential': 'Correo o clave incorrectos.',
    'auth/wrong-password': 'Correo o clave incorrectos.',
    'auth/user-not-found': 'Correo o clave incorrectos.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-disabled': 'Esta cuenta está desactivada.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    'auth/network-request-failed': 'Sin conexión. Revisa el internet e inténtalo de nuevo.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
    'auth/weak-password': 'La clave debe tener al menos 6 caracteres.',
    'auth/requires-recent-login': 'Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la clave.',
    'permission-denied': 'No tienes permiso para hacer esto.',
    unavailable: 'Sin conexión con el servidor. Inténtalo de nuevo con internet.',
  };
  return tabla[code] ?? (e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
}

function usuarioActual(): Promise<User | null> {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      resolve(u);
    });
  });
}

export async function leerPerfil(uid: string): Promise<Perfil | null> {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  if (!snap.exists()) return null;
  const x = snap.data();
  return {
    nombre: String(x.nombre ?? ''),
    email: String(x.email ?? ''),
    rol: x.rol === 'admin' ? 'admin' : 'vendedor',
    activo: x.activo === true,
  };
}

const nunca = () => new Promise<never>(() => {});

function irA(url: string) {
  location.replace(url);
  return nunca();
}

/**
 * Espera a que Firebase restaure la sesión. Si no hay usuario, manda al login.
 * Si la cuenta no existe en `usuarios` o está desactivada, cierra la sesión.
 * Con `admin: true`, los vendedores se devuelven a la calculadora.
 */
export async function requerirSesion(opciones: { admin?: boolean } = {}): Promise<Sesion> {
  const user = await usuarioActual();
  if (!user) return irA('/login');

  let perfil: Perfil | null;
  try {
    perfil = await leerPerfil(user.uid);
  } catch (e) {
    document.body.classList.add('lista');
    toast('No se pudo cargar tu cuenta. Revisa la conexión y recarga la página.', 6000);
    console.error(e);
    return nunca();
  }
  if (!perfil || !perfil.activo) {
    await signOut(auth);
    return irA('/login?error=inactiva');
  }
  if (opciones.admin && perfil.rol !== 'admin') return irA('/');

  const sesion: Sesion = { user, perfil, esAdmin: perfil.rol === 'admin' };
  montarMenu(sesion);
  document.body.classList.add('lista');
  return sesion;
}

/** Cierra la sesión y borra lo guardado en el dispositivo (caché de páginas y datos de Firestore). */
export async function cerrarSesion() {
  await signOut(auth).catch(() => {});
  for (const k of Object.keys(localStorage)) if (k.startsWith('sc_')) localStorage.removeItem(k);
  if ('caches' in window) await caches.delete(PAGE_CACHE).catch(() => {});
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {}
  location.replace('/login');
}

// ---------- Menú de navegación (componente Menu.astro) ----------

function montarMenu(s: Sesion) {
  const btn = document.getElementById('menu-btn');
  const panel = document.getElementById('menu-panel');
  if (!btn || !panel) return;

  $('menu-nombre').textContent = s.perfil.nombre;
  $('menu-rol').textContent = s.esAdmin ? 'Administrador' : 'Vendedor';
  panel.querySelectorAll<HTMLElement>('[data-admin]').forEach((el) => (el.hidden = !s.esAdmin));
  panel.querySelectorAll<HTMLAnchorElement>('a.menu-item').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === location.pathname.replace(/\/$/, '') || (a.getAttribute('href') === '/' && location.pathname === '/'));
  });

  const abrir = (v: boolean) => {
    panel.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
  };
  btn.addEventListener('click', () => abrir(panel.hidden === true));
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) abrir(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') abrir(false);
  });

  $('menu-salir').addEventListener('click', () => void cerrarSesion());

  const dialog = $<HTMLDialogElement>('clave-dialog');
  const form = $<HTMLFormElement>('clave-form');
  const error = $('clave-error');
  $('menu-clave').addEventListener('click', () => {
    abrir(false);
    form.reset();
    error.hidden = true;
    dialog.showModal();
  });
  $('clave-cancelar').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const actual = String(fd.get('actual') ?? '');
    const nueva = String(fd.get('nueva') ?? '');
    const repetir = String(fd.get('repetir') ?? '');
    error.hidden = true;
    if (nueva.length < 6) return mostrarError(error, 'La clave nueva debe tener al menos 6 caracteres.');
    if (nueva !== repetir) return mostrarError(error, 'Las claves no coinciden.');
    const boton = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    boton.disabled = true;
    try {
      await reauthenticateWithCredential(s.user, EmailAuthProvider.credential(s.user.email!, actual));
      await updatePassword(s.user, nueva);
      dialog.close();
      toast('Clave actualizada.');
    } catch (err) {
      mostrarError(error, mensajeError(err));
    } finally {
      boton.disabled = false;
    }
  });
}

function mostrarError(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.hidden = false;
}
