import {
  aplicarCambios,
  CATEGORIAS,
  categoriaSugerida,
  eliminarProducto,
  guardarProducto,
  limpiarNombre,
  slug,
  suscribirProductos,
  type Producto,
} from '../lib/catalogo';
import { $, confirmar, escapar, fmtUsd, normalizar, parseNumero, redondear, toast } from '../lib/formato';
import { mensajeError, requerirSesion } from '../lib/sesion';

let productos: Producto[] = [];
let busqueda = '';
let filtroCat = '';
const seleccion = new Set<string>();

const filas = $<HTMLTableSectionElement>('filas');
const vacio = $('productos-vacio');
const filtroSelect = $<HTMLSelectElement>('filtro-cat');

// ---------- Lista ----------

function categorias() {
  return [...new Set([...CATEGORIAS, ...productos.map((p) => p.categoria)])];
}

function renderCategorias() {
  const cats = categorias();
  const actual = filtroSelect.value;
  filtroSelect.innerHTML =
    '<option value="">Todas las categorías</option>' +
    cats.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
  filtroSelect.value = cats.includes(actual) ? actual : '';
  $('categorias').innerHTML = cats.map((c) => `<option value="${escapar(c)}"></option>`).join('');
}

function visibles() {
  const q = normalizar(busqueda);
  return productos.filter((p) => (!filtroCat || p.categoria === filtroCat) && (!q || normalizar(p.nombre).includes(q)));
}

function render() {
  // Quitar de la selección lo que ya no existe
  const ids = new Set(productos.map((p) => p.id));
  for (const id of seleccion) if (!ids.has(id)) seleccion.delete(id);

  const lista = visibles();
  $('conteo').textContent = `${lista.length} de ${productos.length} productos`;
  vacio.hidden = lista.length > 0;
  if (!lista.length) vacio.textContent = productos.length ? 'No hay productos que coincidan.' : 'El catálogo está vacío.';
  filas.innerHTML = lista
    .map(
      (p) => `
      <tr class="${seleccion.has(p.id) ? 'seleccionada' : ''}">
        <td class="col-check"><input type="checkbox" data-sel="${p.id}" ${seleccion.has(p.id) ? 'checked' : ''} aria-label="Seleccionar" /></td>
        <td>${escapar(p.nombre)}</td>
        <td class="muted">${escapar(p.categoria)}</td>
        <td class="num">${p.precioUsd > 0 ? fmtUsd(p.precioUsd) : '<span class="etiqueta warn">Por definir</span>'}</td>
        <td class="acciones"><button class="btn" type="button" data-editar="${p.id}">Editar</button></td>
      </tr>`,
    )
    .join('');
  renderSeleccion(lista);
}

// ---------- Selección múltiple y borrado en lote ----------

const checkTodos = $<HTMLInputElement>('check-todos');

function renderSeleccion(lista = visibles()) {
  const n = seleccion.size;
  $('seleccion').hidden = n === 0;
  $('seleccion-conteo').textContent = n === 1 ? '1 seleccionado' : `${n} seleccionados`;
  const visiblesSel = lista.filter((p) => seleccion.has(p.id)).length;
  checkTodos.checked = lista.length > 0 && visiblesSel === lista.length;
  checkTodos.indeterminate = visiblesSel > 0 && visiblesSel < lista.length;
}

filas.addEventListener('change', (e) => {
  const check = e.target as HTMLInputElement;
  if (check.dataset.sel === undefined) return;
  if (check.checked) seleccion.add(check.dataset.sel);
  else seleccion.delete(check.dataset.sel);
  check.closest('tr')?.classList.toggle('seleccionada', check.checked);
  renderSeleccion();
});

checkTodos.addEventListener('change', () => {
  for (const p of visibles()) {
    if (checkTodos.checked) seleccion.add(p.id);
    else seleccion.delete(p.id);
  }
  render();
});

$('seleccion-limpiar').addEventListener('click', () => {
  seleccion.clear();
  render();
});

$('seleccion-eliminar').addEventListener('click', async () => {
  const ids = [...seleccion];
  if (!ids.length) return;
  const nombres = productos.filter((p) => seleccion.has(p.id)).map((p) => p.nombre);
  const muestra = nombres.slice(0, 5).join(', ') + (nombres.length > 5 ? ` y ${nombres.length - 5} más` : '');
  const ok = await confirmar(`Se eliminarán ${ids.length} productos del catálogo: ${muestra}. Las ventas ya registradas no cambian.`, {
    titulo: 'Eliminar productos',
    aceptar: `Eliminar ${ids.length}`,
    peligro: true,
  });
  if (!ok) return;
  const btn = $<HTMLButtonElement>('seleccion-eliminar');
  btn.disabled = true;
  try {
    await aplicarCambios([], ids);
    seleccion.clear();
    toast(`${ids.length} productos eliminados.`);
  } catch (err) {
    toast(mensajeError(err), 4000);
  } finally {
    btn.disabled = false;
  }
});

$<HTMLInputElement>('buscar').addEventListener('input', (e) => {
  busqueda = (e.target as HTMLInputElement).value;
  render();
});

filtroSelect.addEventListener('change', () => {
  filtroCat = filtroSelect.value;
  render();
});

// ---------- Alta y edición ----------

const dialog = $<HTMLDialogElement>('prod-dialog');
const form = $<HTMLFormElement>('prod-form');
const errorEl = $('prod-error');
const campo = (n: string) => form.elements.namedItem(n) as HTMLInputElement;

function abrirDialogo(p?: Producto) {
  form.reset();
  errorEl.hidden = true;
  $('prod-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('prod-eliminar').hidden = !p;
  campo('id').value = p?.id ?? '';
  campo('nombre').value = p?.nombre ?? '';
  campo('categoria').value = p?.categoria ?? '';
  campo('precio').value = p ? String(p.precioUsd).replace('.', ',') : '';
  dialog.showModal();
  campo('nombre').focus();
}

$('nuevo').addEventListener('click', () => abrirDialogo());
$('prod-cancelar').addEventListener('click', () => dialog.close());

filas.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-editar]');
  if (!btn) return;
  const p = productos.find((x) => x.id === btn.dataset.editar);
  if (p) abrirDialogo(p);
});

/** Id único a partir del nombre: si ya existe, agrega un sufijo. */
function idNuevo(nombre: string) {
  const base = slug(nombre) || 'producto';
  const ids = new Set(productos.map((p) => p.id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const nombre = limpiarNombre(campo('nombre').value);
  const categoria = campo('categoria').value.trim();
  const precioTexto = campo('precio').value.trim();
  const precio = precioTexto ? parseNumero(precioTexto) : 0;
  if (!nombre) return mostrarError('Escribe el nombre del producto.');
  if (!categoria) return mostrarError('Elige o escribe una categoría.');
  if (!(precio >= 0)) return mostrarError('El precio no es válido.');

  const existente = productos.find((p) => p.id === campo('id').value);
  const id = existente?.id ?? idNuevo(nombre);
  const orden = existente?.orden ?? Math.max(0, ...productos.map((p) => p.orden)) + 1;

  const btn = $<HTMLButtonElement>('prod-guardar');
  btn.disabled = true;
  try {
    await guardarProducto(id, { nombre, categoria, precioUsd: redondear(precio), orden });
    dialog.close();
    toast(existente ? 'Producto actualizado.' : 'Producto agregado.');
  } catch (err) {
    mostrarError(mensajeError(err));
  } finally {
    btn.disabled = false;
  }
});

$('prod-eliminar').addEventListener('click', async () => {
  const p = productos.find((x) => x.id === campo('id').value);
  if (!p) return;
  const ok = await confirmar(`"${p.nombre}" se quitará del catálogo. Las ventas ya registradas no cambian.`, {
    titulo: 'Eliminar producto',
    aceptar: 'Eliminar',
    peligro: true,
  });
  if (!ok) return;
  try {
    await eliminarProducto(p.id);
    dialog.close();
    toast('Producto eliminado.');
  } catch (err) {
    mostrarError(mensajeError(err));
  }
});

function mostrarError(msg: string) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

// ---------- Importar Excel ----------

interface FilaImportada {
  nombre: string;
  precioUsd: number;
  orden: number;
  existente: Producto | null;
  categoria: string;
  estado: 'nuevo' | 'cambia' | 'igual';
}

const importDialog = $<HTMLDialogElement>('import-dialog');
const archivoInput = $<HTMLInputElement>('archivo');
let importadas: FilaImportada[] = [];
let faltantes: Producto[] = [];

$('importar').addEventListener('click', () => archivoInput.click());
$('import-cancelar').addEventListener('click', () => importDialog.close());

archivoInput.addEventListener('change', async () => {
  const archivo = archivoInput.files?.[0];
  archivoInput.value = '';
  if (!archivo) return;
  toast('Leyendo el archivo…');
  try {
    const lista = await leerExcel(archivo);
    if (!lista.length) return toast('No se encontraron productos. Revisa que haya una columna de nombre y otra de precio en $.', 5000);
    prepararImportacion(lista);
  } catch (e) {
    console.error(e);
    toast('No se pudo leer el archivo.', 4000);
  }
});

/** Los CSV exportados desde Excel en español suelen venir separados por ";" en vez de ",". */
function detectarSeparador(texto: string) {
  const primera = texto.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const cuenta = (c: string) => primera.split(c).length - 1;
  return cuenta(';') > cuenta(',') ? ';' : cuenta('\t') > cuenta(',') ? '\t' : ',';
}

/** Busca la fila de encabezados y devuelve [nombre, precio $] por cada fila con nombre. */
async function leerExcel(archivo: File): Promise<[string, number][]> {
  const XLSX = await import('xlsx');
  const esCsv = /\.csv$/i.test(archivo.name) || archivo.type === 'text/csv';
  const wb = esCsv
    ? // raw: los precios quedan como texto ("1,25") y los interpreta parseNumero; si no, "1,25" se leería como 125
      XLSX.read(await archivo.text(), { type: 'string', raw: true, FS: detectarSeparador(await archivo.text()) })
    : XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filasHoja: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let colNombre = -1;
  let colPrecio = -1;
  let inicio = 0;
  for (let i = 0; i < Math.min(filasHoja.length, 30); i++) {
    const celdas = filasHoja[i].map((c) => normalizar(String(c)));
    const n = celdas.findIndex((c) => c.includes('nombre') || c.includes('producto') || c.includes('descripcion'));
    const p = celdas.findIndex((c) => c.includes('precio') && (c.includes('$') || c.includes('usd') || c.includes('dolar')) && !c.includes('bs'));
    if (n >= 0 && p >= 0) {
      colNombre = n;
      colPrecio = p;
      inicio = i + 1;
      break;
    }
  }
  // Sin encabezados reconocibles: primera columna de texto y primera numérica
  if (colNombre < 0) {
    colNombre = 0;
    colPrecio = 1;
  }

  const resultado: [string, number][] = [];
  for (const fila of filasHoja.slice(inicio)) {
    const nombre = limpiarNombre(String(fila[colNombre] ?? ''));
    if (!nombre) continue;
    const celda = fila[colPrecio];
    const precio = typeof celda === 'number' ? celda : parseNumero(String(celda ?? ''));
    resultado.push([nombre, Number.isFinite(precio) && precio > 0 ? redondear(precio) : 0]);
  }
  return resultado;
}

function prepararImportacion(lista: [string, number][]) {
  const porNombre = new Map(productos.map((p) => [normalizar(p.nombre), p]));
  const porId = new Map(productos.map((p) => [p.id, p]));
  const vistos = new Set<string>();
  importadas = [];

  lista.forEach(([nombre, precioUsd], i) => {
    const clave = normalizar(nombre);
    if (vistos.has(clave)) return; // nombre repetido en el Excel
    vistos.add(clave);
    const existente = porNombre.get(clave) ?? porId.get(slug(nombre)) ?? null;
    // El orden se actualiza siempre en silencio; solo se avisa cuando cambia el precio
    const estado = !existente ? 'nuevo' : existente.precioUsd !== precioUsd ? 'cambia' : 'igual';
    importadas.push({
      nombre,
      precioUsd,
      orden: i + 1,
      existente,
      categoria: existente?.categoria ?? categoriaSugerida(nombre),
      estado,
    });
  });

  const idsImportados = new Set(importadas.filter((f) => f.existente).map((f) => f.existente!.id));
  faltantes = productos.filter((p) => !idsImportados.has(p.id));

  const nuevos = importadas.filter((f) => f.estado === 'nuevo').length;
  const cambian = importadas.filter((f) => f.estado === 'cambia').length;
  $('import-resumen').textContent =
    `${importadas.length} productos en el archivo: ${nuevos} nuevos, ${cambian} con cambio de precio, ` +
    `${importadas.length - nuevos - cambian} sin cambios. ${faltantes.length} del catálogo no aparecen en el archivo.`;

  const cats = categorias();
  const opciones = (sel: string) =>
    cats.map((c) => `<option value="${escapar(c)}" ${c === sel ? 'selected' : ''}>${escapar(c)}</option>`).join('');
  const etiqueta = { nuevo: '<span class="etiqueta ok">Nuevo</span>', cambia: '<span class="etiqueta info">Cambia</span>', igual: '<span class="etiqueta">Igual</span>' };

  $('import-filas').innerHTML = importadas
    .map(
      (f, i) => `
      <tr>
        <td>${escapar(f.nombre)}</td>
        <td>${
          f.estado === 'nuevo'
            ? `<select class="input" data-cat="${i}">${opciones(f.categoria)}</select>`
            : `<span class="muted">${escapar(f.categoria)}</span>`
        }</td>
        <td class="num">${f.precioUsd > 0 ? fmtUsd(f.precioUsd) : '<span class="muted">0,00</span>'}${
          f.estado === 'cambia' && f.existente ? `<br><small class="muted">antes ${fmtUsd(f.existente.precioUsd)}</small>` : ''
        }</td>
        <td>${etiqueta[f.estado]}</td>
      </tr>`,
    )
    .join('');

  $('import-faltantes').hidden = faltantes.length === 0;
  $('import-faltantes-lista').innerHTML = faltantes
    .map(
      (p) => `<label><input type="checkbox" value="${p.id}" /> ${escapar(p.nombre)} <span class="muted">(${fmtUsd(p.precioUsd)})</span></label>`,
    )
    .join('');

  $('import-error').hidden = true;
  importDialog.showModal();
}

$('import-filas').addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  if (sel.dataset.cat === undefined) return;
  importadas[Number(sel.dataset.cat)].categoria = sel.value;
});

$('import-aplicar').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('import-aplicar');
  const borrar = [...$('import-faltantes-lista').querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
  const guardar: Producto[] = [];
  const ids = new Set(productos.map((p) => p.id));
  for (const f of importadas) {
    if (f.estado === 'igual' && f.existente?.orden === f.orden) continue;
    let id = f.existente?.id;
    if (!id) {
      const base = slug(f.nombre) || 'producto';
      id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
      ids.add(id);
    }
    guardar.push({ id, nombre: f.nombre, categoria: f.categoria, precioUsd: f.precioUsd, orden: f.orden });
  }
  if (!guardar.length && !borrar.length) {
    importDialog.close();
    return toast('No había nada que cambiar.');
  }
  btn.disabled = true;
  try {
    await aplicarCambios(guardar, borrar);
    importDialog.close();
    toast(`Catálogo actualizado: ${guardar.length} guardados, ${borrar.length} eliminados.`, 4000);
  } catch (err) {
    const el = $('import-error');
    el.textContent = mensajeError(err);
    el.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Arranque ----------

function renderConexion() {
  $('sin-conexion').hidden = navigator.onLine;
}
window.addEventListener('online', renderConexion);
window.addEventListener('offline', renderConexion);
renderConexion();

requerirSesion({ admin: true }).then(() => {
  suscribirProductos(
    (lista) => {
      productos = lista;
      renderCategorias();
      render();
    },
    (e) => {
      vacio.textContent = mensajeError(e);
      vacio.hidden = false;
    },
  );
});
