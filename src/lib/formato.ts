export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const fmtNum = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtUsd = (n: number) => `$${fmtNum.format(n)}`;
export const fmtBs = (n: number) => `Bs ${fmtNum.format(n)}`;
export const centimos = (n: number) => Math.round(n * 100);
export const redondear = (n: number) => centimos(n) / 100;

/** Acepta "36,50", "36.50", "1.234,56" o "1,234.56". */
export function parseNumero(valor: string): number {
  let s = valor.trim().replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa > ultimoPunto) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  return Number(s);
}

/** Fecha local en formato YYYY-MM-DD. */
export function diaDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const hoy = () => diaDe();

/** "2026-10-06" → "06/10/2026" */
export const diaLegible = (dia: string) => dia.split('-').reverse().join('/');

export const horaDe = (d: Date) => d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

export const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, duracion = 2200) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), duracion);
}

/** Diálogo de confirmación propio (los confirm() del navegador no combinan con el diseño). */
export function confirmar(mensaje: string, opciones: { titulo?: string; aceptar?: string; peligro?: boolean } = {}) {
  return new Promise<boolean>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <form method="dialog">
        <h2>${escapar(opciones.titulo ?? 'Confirmar')}</h2>
        <p>${escapar(mensaje)}</p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" value="no" type="submit">Cancelar</button>
          <button class="btn ${opciones.peligro ? 'btn-danger' : 'btn-primary'}" value="si" type="submit">${escapar(
            opciones.aceptar ?? 'Aceptar',
          )}</button>
        </div>
      </form>`;
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'si');
      dialog.remove();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

export function descargarArchivo(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
