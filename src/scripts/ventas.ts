import { $, confirmar, descargarArchivo, diaDe, diaLegible, escapar, fmtBs, fmtNum, fmtUsd, horaDe, toast } from '../lib/formato';
import { mensajeError, requerirSesion, type Sesion } from '../lib/sesion';
import { listarUsuarios } from '../lib/usuarios';
import { buscarVentas, eliminarVenta, type Venta } from '../lib/ventas';

let sesion: Sesion;
let ventas: Venta[] = [];

const desde = $<HTMLInputElement>('desde');
const hasta = $<HTMLInputElement>('hasta');
const vendedor = $<HTMLSelectElement>('vendedor');
const filas = $<HTMLTableSectionElement>('filas');
const vacio = $('ventas-vacio');
const btnBuscar = $<HTMLButtonElement>('buscar');
const btnCsv = $<HTMLButtonElement>('csv');

// ---------- Rangos rápidos ----------

function rango(tipo: string): [Date, Date] {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  const a = new Date(h);
  const b = new Date(h);
  if (tipo === 'ayer') {
    a.setDate(a.getDate() - 1);
    b.setDate(b.getDate() - 1);
  } else if (tipo === 'semana') {
    // Semana de lunes a domingo
    const dow = (h.getDay() + 6) % 7;
    a.setDate(a.getDate() - dow);
  } else if (tipo === 'mes') {
    a.setDate(1);
  }
  return [a, b];
}

document.querySelectorAll<HTMLButtonElement>('[data-rango]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const [a, b] = rango(btn.dataset.rango!);
    desde.value = diaDe(a);
    hasta.value = diaDe(b);
    void buscar();
  }),
);

// ---------- Búsqueda ----------

async function buscar() {
  if (!desde.value || !hasta.value) return toast('Elige las dos fechas.');
  if (desde.value > hasta.value) return toast('La fecha "desde" no puede ser mayor que "hasta".');
  btnBuscar.disabled = true;
  vacio.textContent = 'Buscando…';
  vacio.hidden = false;
  filas.innerHTML = '';
  try {
    ventas = await buscarVentas({
      desde: desde.value,
      hasta: hasta.value,
      vendedorUid: sesion.esAdmin ? vendedor.value || undefined : sesion.user.uid,
    });
    render();
  } catch (e) {
    console.error(e);
    vacio.textContent = mensajeError(e);
  } finally {
    btnBuscar.disabled = false;
  }
}

btnBuscar.addEventListener('click', () => void buscar());
vendedor.addEventListener('change', () => void buscar());

// ---------- Render ----------

const nombreCliente = (v: Venta) => {
  if (!v.cliente) return '';
  return `${v.cliente.nombre} ${v.cliente.apellido}`.trim() || v.cliente.cedula || v.cliente.telefono || v.cliente.correo;
};

function render() {
  const cantidad = ventas.length;
  const totUsd = ventas.reduce((a, v) => a + v.totalUsd, 0);
  const totBs = ventas.reduce((a, v) => a + v.totalBs, 0);
  $('res-cantidad').textContent = String(cantidad);
  $('res-usd').textContent = fmtUsd(totUsd);
  $('res-bs').textContent = fmtBs(totBs);
  btnCsv.disabled = cantidad === 0;

  vacio.hidden = cantidad > 0;
  if (!cantidad) vacio.textContent = 'No hay ventas en ese rango.';

  filas.innerHTML = ventas
    .map((v) => {
      const unidades = v.lineas.reduce((a, l) => a + (l.cantidad || 0), 0);
      return `
      <tr class="fila-click" data-id="${v.id}">
        <td>${diaLegible(v.dia)} <span class="muted">${horaDe(v.fechaLocal)}</span></td>
        <td>${escapar(v.vendedorNombre)}</td>
        <td>${escapar(nombreCliente(v)) || '<span class="muted">—</span>'}</td>
        <td class="num">${unidades}</td>
        <td class="num">${fmtUsd(v.totalUsd)}</td>
        <td class="num">${fmtBs(v.totalBs)}</td>
      </tr>`;
    })
    .join('');
}

function detalleHtml(v: Venta) {
  const tasas: string[] = [];
  if (v.tasas.usd) tasas.push(`Dólar BCV ${fmtBs(v.tasas.usd)}`);
  if (v.tasas.eur) tasas.push(`Euro BCV ${fmtBs(v.tasas.eur)}`);
  const cliente = v.cliente
    ? [v.cliente.nombre && `${v.cliente.nombre} ${v.cliente.apellido}`.trim(), v.cliente.cedula, v.cliente.telefono, v.cliente.correo]
        .filter(Boolean)
        .join(' · ')
    : '';
  return `
    <div class="venta-detalle">
      <table>
        ${v.lineas
          .map(
            (l) => `<tr>
              <td>${escapar(l.nombre)}</td>
              <td class="num muted">${l.cantidad} × ${fmtUsd(l.precioUsd)}</td>
              <td class="num">${fmtUsd(l.usd)}</td>
              <td class="num muted">${fmtBs(l.bs)}</td>
            </tr>`,
          )
          .join('')}
      </table>
      <div class="meta">
        ${cliente ? `<span>Cliente: ${escapar(cliente)}</span>` : ''}
        ${tasas.map((t) => `<span>${t}</span>`).join('')}
        <span>Recibo: ${v.origen === 'pdf' ? 'PDF' : 'impreso'}</span>
        <span>Ref. ${v.id.slice(0, 8)}</span>
      </div>
      ${sesion.esAdmin ? `<div class="acciones-detalle"><button class="btn btn-ghost btn-danger" data-eliminar="${v.id}">Eliminar venta</button></div>` : ''}
    </div>`;
}

filas.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const eliminar = target.closest<HTMLButtonElement>('[data-eliminar]');
  if (eliminar) {
    const id = eliminar.dataset.eliminar!;
    const ok = await confirmar('Esta venta se borrará del historial. Esta acción no se puede deshacer.', {
      titulo: 'Eliminar venta',
      aceptar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await eliminarVenta(id);
      ventas = ventas.filter((v) => v.id !== id);
      render();
      toast('Venta eliminada.');
    } catch (err) {
      toast(mensajeError(err), 4000);
    }
    return;
  }

  const fila = target.closest<HTMLTableRowElement>('tr.fila-click');
  if (!fila) return;
  const abierta = fila.nextElementSibling as HTMLTableRowElement | null;
  if (abierta?.classList.contains('detalle')) {
    abierta.remove();
    return;
  }
  const v = ventas.find((x) => x.id === fila.dataset.id);
  if (!v) return;
  const tr = document.createElement('tr');
  tr.className = 'detalle';
  tr.innerHTML = `<td colspan="6">${detalleHtml(v)}</td>`;
  fila.after(tr);
});

// ---------- CSV ----------

const csvCelda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

btnCsv.addEventListener('click', () => {
  const cab = ['Fecha', 'Hora', 'Vendedor', 'Cliente', 'Cédula', 'Teléfono', 'Ítems', 'Total $', 'Total Bs', 'Tasa $', 'Tasa €', 'Recibo', 'Ref.'];
  const filasCsv = ventas.map((v) =>
    [
      diaLegible(v.dia),
      horaDe(v.fechaLocal),
      v.vendedorNombre,
      v.cliente ? `${v.cliente.nombre} ${v.cliente.apellido}`.trim() : '',
      v.cliente?.cedula ?? '',
      v.cliente?.telefono ?? '',
      v.lineas.map((l) => `${l.cantidad}× ${l.nombre}`).join('; '),
      fmtNum.format(v.totalUsd),
      fmtNum.format(v.totalBs),
      v.tasas.usd ? fmtNum.format(v.tasas.usd) : '',
      v.tasas.eur ? fmtNum.format(v.tasas.eur) : '',
      v.origen === 'pdf' ? 'PDF' : 'Impreso',
      v.id,
    ]
      .map(csvCelda)
      .join(';'),
  );
  descargarArchivo(`ventas-${desde.value}-a-${hasta.value}.csv`, [cab.map(csvCelda).join(';'), ...filasCsv].join('\n'));
});

// ---------- Arranque ----------

function renderConexion() {
  $('sin-conexion').hidden = navigator.onLine;
}
window.addEventListener('online', renderConexion);
window.addEventListener('offline', renderConexion);
renderConexion();

requerirSesion().then(async (s) => {
  sesion = s;
  const [a, b] = rango('hoy');
  desde.value = diaDe(a);
  hasta.value = diaDe(b);

  if (s.esAdmin) {
    $('campo-vendedor').hidden = false;
    try {
      const usuarios = await listarUsuarios();
      vendedor.innerHTML =
        '<option value="">Todos</option>' +
        usuarios.map((u) => `<option value="${u.uid}">${escapar(u.nombre)}</option>`).join('');
    } catch (e) {
      console.error(e);
    }
  }
  void buscar();
});
