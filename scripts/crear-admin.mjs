// Crea (o promueve) una cuenta de administrador.
// Uso: npm run crear-admin -- correo@ejemplo.com "Nombre Apellido" [clave]
// Si no se pasa clave, se genera una aleatoria y la persona debe usar "¿Olvidaste tu clave?" en el login.
import { randomBytes } from 'node:crypto';
import { escribirDocumentos, llamar, PROJECT } from './firestore-rest.mjs';

const [email, nombre, claveArg] = process.argv.slice(2);
if (!email || !nombre) {
  console.error('Uso: npm run crear-admin -- correo@ejemplo.com "Nombre Apellido" [clave]');
  process.exit(1);
}

const IDENTITY = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
let uid;
let claveGenerada = false;

try {
  const clave = claveArg ?? randomBytes(12).toString('base64url');
  claveGenerada = !claveArg;
  const res = await llamar(`${IDENTITY}/accounts`, { email, password: clave, displayName: nombre });
  uid = res.localId;
  console.log(`Cuenta creada para ${email}.`);
} catch (e) {
  if (!String(e.message).includes('EMAIL_EXISTS')) throw e;
  const res = await llamar(`${IDENTITY}/accounts:lookup`, { email: [email] });
  uid = res.users[0].localId;
  claveGenerada = false;
  console.log(`La cuenta ${email} ya existía; se actualiza su perfil como administrador.`);
}

await escribirDocumentos('usuarios', [{ id: uid, nombre, email, rol: 'admin', activo: true, creado: new Date() }]);
console.log(`Perfil de administrador guardado (uid ${uid}).`);
if (claveGenerada) {
  console.log('No se indicó clave: en el login, usa "¿Olvidaste tu clave?" para crear una.');
}
