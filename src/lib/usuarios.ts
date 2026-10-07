import { getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut, updateProfile } from 'firebase/auth';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseConfig } from './firebase';
import type { Perfil, Rol } from './sesion';

export interface Usuario extends Perfil {
  uid: string;
}

export const usuariosRef = collection(db, 'usuarios');

export async function listarUsuarios(): Promise<Usuario[]> {
  const snap = await getDocs(query(usuariosRef, orderBy('nombre')));
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      uid: d.id,
      nombre: String(x.nombre ?? ''),
      email: String(x.email ?? ''),
      rol: x.rol === 'admin' ? 'admin' : 'vendedor',
      activo: x.activo === true,
    };
  });
}

/**
 * Crea la cuenta en Firebase Auth con una instancia secundaria de la app, para que la sesión
 * del administrador no se reemplace por la del usuario nuevo, y luego guarda su perfil.
 */
export async function crearUsuario(datos: { nombre: string; email: string; clave: string; rol: Rol }) {
  const secundaria = getApps().find((a) => a.name === 'secundaria') ?? initializeApp(firebaseConfig, 'secundaria');
  const auth2 = getAuth(secundaria);
  const cred = await createUserWithEmailAndPassword(auth2, datos.email, datos.clave);
  try {
    await updateProfile(cred.user, { displayName: datos.nombre });
  } finally {
    await signOut(auth2);
  }
  await setDoc(doc(usuariosRef, cred.user.uid), {
    nombre: datos.nombre,
    email: datos.email,
    rol: datos.rol,
    activo: true,
    creado: serverTimestamp(),
  });
  return cred.user.uid;
}

export function actualizarUsuario(uid: string, cambios: Partial<Pick<Perfil, 'nombre' | 'rol' | 'activo'>>) {
  return updateDoc(doc(usuariosRef, uid), cambios);
}

export function enviarRestablecerClave(email: string) {
  return sendPasswordResetEmail(auth, email);
}
