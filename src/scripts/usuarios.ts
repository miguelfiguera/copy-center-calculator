import { $, escapar, toast } from '../lib/formato';
import { mensajeError, requerirSesion, type Rol, type Sesion } from '../lib/sesion';
import { actualizarUsuario, crearUsuario, enviarRestablecerClave, listarUsuarios, type Usuario } from '../lib/usuarios';

let sesion: Sesion;
let usuarios: Usuario[] = [];

const filas = $<HTMLTableSectionElement>('filas');
const vacio = $('usuarios-vacio');
const dialog = $<HTMLDialogElement>('user-dialog');
const form = $<HTMLFormElement>('user-form');
const errorEl = $('user-error');
const campo = (n: string) => form.elements.namedItem(n) as HTMLInputElement;

async function cargar() {
  try {
    usuarios = await listarUsuarios();
    render();
  } catch (e) {
    vacio.textContent = mensajeError(e);
    vacio.hidden = false;
  }
}

function render() {
  vacio.hidden = usuarios.length > 0;
  filas.innerHTML = usuarios
    .map(
      (u) => `
      <tr>
        <td>${escapar(u.nombre)}${u.uid === sesion.user.uid ? ' <span class="muted">(tú)</span>' : ''}</td>
        <td class="muted">${escapar(u.email)}</td>
        <td>${u.rol === 'admin' ? '<span class="etiqueta info">Admin</span>' : 'Vendedor'}</td>
        <td>${u.activo ? '<span class="etiqueta ok">Activo</span>' : '<span class="etiqueta danger">Inactivo</span>'}</td>
        <td class="acciones"><button class="btn" type="button" data-editar="${u.uid}">Editar</button></td>
      </tr>`,
    )
    .join('');
}

function mostrarError(msg: string) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function abrirDialogo(u?: Usuario) {
  form.reset();
  errorEl.hidden = true;
  const esEdicion = !!u;
  const esYo = u?.uid === sesion.user.uid;
  $('user-titulo').textContent = esEdicion ? 'Editar usuario' : 'Nuevo usuario';
  campo('uid').value = u?.uid ?? '';
  campo('nombre').value = u?.nombre ?? '';
  campo('email').value = u?.email ?? '';
  campo('email').readOnly = esEdicion;
  $('campo-clave').hidden = esEdicion;
  campo('clave').required = !esEdicion;
  campo('rol').value = u?.rol ?? 'vendedor';
  campo('rol').disabled = esYo;
  $('campo-activo').hidden = !esEdicion;
  campo('activo').checked = u?.activo ?? true;
  campo('activo').disabled = esYo;
  $('user-reset').hidden = !esEdicion;
  dialog.showModal();
  campo('nombre').focus();
}

$('nuevo').addEventListener('click', () => abrirDialogo());
$('user-cancelar').addEventListener('click', () => dialog.close());

filas.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-editar]');
  if (!btn) return;
  const u = usuarios.find((x) => x.uid === btn.dataset.editar);
  if (u) abrirDialogo(u);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const uid = campo('uid').value;
  const nombre = campo('nombre').value.trim();
  const email = campo('email').value.trim().toLowerCase();
  const clave = campo('clave').value;
  const rol = campo('rol').value as Rol;
  const activo = campo('activo').checked;
  if (!nombre) return mostrarError('Escribe el nombre.');
  if (!email) return mostrarError('Escribe el correo.');
  if (!uid && clave.length < 6) return mostrarError('La clave debe tener al menos 6 caracteres.');

  const btn = $<HTMLButtonElement>('user-guardar');
  btn.disabled = true;
  try {
    if (uid) {
      const esYo = uid === sesion.user.uid;
      await actualizarUsuario(uid, esYo ? { nombre } : { nombre, rol, activo });
      toast('Usuario actualizado.');
    } else {
      await crearUsuario({ nombre, email, clave, rol });
      toast(`Cuenta creada para ${nombre}.`);
    }
    dialog.close();
    await cargar();
  } catch (err) {
    mostrarError(mensajeError(err));
  } finally {
    btn.disabled = false;
  }
});

$('user-reset').addEventListener('click', async () => {
  const email = campo('email').value.trim();
  try {
    await enviarRestablecerClave(email);
    toast(`Se envió un correo a ${email} para crear una clave nueva.`, 4000);
  } catch (err) {
    mostrarError(mensajeError(err));
  }
});

// ---------- Arranque ----------

function renderConexion() {
  $('sin-conexion').hidden = navigator.onLine;
}
window.addEventListener('online', renderConexion);
window.addEventListener('offline', renderConexion);
renderConexion();

requerirSesion({ admin: true }).then((s) => {
  sesion = s;
  void cargar();
});
