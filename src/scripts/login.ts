import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { $ } from '../lib/formato';
import { mensajeError } from '../lib/sesion';

const form = $<HTMLFormElement>('login-form');
const errorEl = $('login-error');
const avisoEl = $('login-aviso');
const btn = $<HTMLButtonElement>('login-btn');
const emailInput = form.elements.namedItem('email') as HTMLInputElement;
const claveInput = form.elements.namedItem('clave') as HTMLInputElement;

function mostrar(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.hidden = false;
}

function limpiar() {
  errorEl.hidden = true;
  avisoEl.hidden = true;
}

// Mensajes que vienen de otras páginas (cuenta desactivada, etc.)
const motivo = new URLSearchParams(location.search).get('error');
if (motivo === 'inactiva') mostrar(errorEl, 'Tu cuenta no está activa. Habla con el administrador.');

// Si ya hay sesión, ir directo a la calculadora
const off = onAuthStateChanged(auth, (u) => {
  off();
  if (u) location.replace('/');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiar();
  const email = emailInput.value.trim();
  const clave = claveInput.value;
  if (!email || !clave) return mostrar(errorEl, 'Ingresa tu correo y tu clave.');

  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    await signInWithEmailAndPassword(auth, email, clave);
    location.replace('/');
  } catch (err) {
    mostrar(errorEl, mensajeError(err));
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

$('olvide-btn').addEventListener('click', async () => {
  limpiar();
  const email = emailInput.value.trim();
  if (!email) {
    emailInput.focus();
    return mostrar(errorEl, 'Escribe tu correo y vuelve a pulsar "¿Olvidaste tu clave?".');
  }
  try {
    await sendPasswordResetEmail(auth, email);
    mostrar(avisoEl, `Si ${email} tiene cuenta, recibirá un correo con un enlace para crear una clave nueva.`);
  } catch (err) {
    mostrar(errorEl, mensajeError(err));
  }
});
