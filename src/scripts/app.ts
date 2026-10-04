import { jsPDF } from 'jspdf';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precioUsd: number;
}

interface Linea {
  id: string;
  nombre: string;
  categoria?: string;
  precioUsd: number;
  cantidad: number;
}

interface Datos {
  negocio: { nombre: string; rif: string };
  productos: Producto[];
}

type Moneda = 'usd' | 'eur';
const MONEDAS: Moneda[] = ['usd', 'eur'];
const TASA_KEYS: Record<Moneda, string> = { usd: 'sc_tasa_bcv', eur: 'sc_tasa_eur' };
/** Con las dos tasas cargadas, esta categoría se cobra con el euro y el resto con el dólar. */
const CATEGORIA_EURO = 'Papelería y útiles';
const CARRITO_KEY = 'sc_carrito';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const datos: Datos = JSON.parse($('precios-data').textContent || '{}');
const productos = datos.productos;
const porId = new Map(productos.map((p) => [p.id, p]));

// ---------- Formato y cálculos (en céntimos para evitar errores de redondeo) ----------

const fmtNum = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => `$${fmtNum.format(n)}`;
const fmtBs = (n: number) => `Bs ${fmtNum.format(n)}`;
const centimos = (n: number) => Math.round(n * 100);

/** Acepta "36,50", "36.50", "1.234,56" o "1,234.56". */
function parseNumero(valor: string): number {
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

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- Tasas BCV de dólar y euro (localStorage, una por día) ----------

interface TasaGuardada {
  fecha: string;
  valor: number;
}

type Tasas = Record<Moneda, number | null>;

function leerTasa(moneda: Moneda): TasaGuardada | null {
  try {
    const t = JSON.parse(localStorage.getItem(TASA_KEYS[moneda]) || 'null');
    return t && typeof t.valor === 'number' && t.valor > 0 ? t : null;
  } catch {
    return null;
  }
}

/** Solo devuelve las tasas registradas hoy. */
function tasasDeHoy(): Tasas {
  const deHoy = (m: Moneda) => {
    const t = leerTasa(m);
    return t && t.fecha === hoy() ? t.valor : null;
  };
  return { usd: deHoy('usd'), eur: deHoy('eur') };
}

const hayTasa = (t: Tasas) => t.usd !== null || t.eur !== null;

function guardarTasa(moneda: Moneda, valor: number) {
  localStorage.setItem(TASA_KEYS[moneda], JSON.stringify({ fecha: hoy(), valor }));
}

function borrarTasa(moneda: Moneda) {
  localStorage.removeItem(TASA_KEYS[moneda]);
}

/** Si solo hay una tasa, se usa para todo. Si están las dos, el euro es para papelería y útiles. */
function tasaPara(categoria: string | undefined, t: Tasas): number | null {
  if (t.usd !== null && t.eur !== null) return categoria === CATEGORIA_EURO ? t.eur : t.usd;
  return t.usd ?? t.eur;
}

/** Las líneas guardadas antes de este cambio no traen categoría: se busca en el catálogo. */
const categoriaDe = (l: Linea) => l.categoria ?? porId.get(l.id)?.categoria;

/** Tasas en uso, con la etiqueta que se muestra en pantalla y en el recibo. */
function tasasAplicadas(t: Tasas): [string, number][] {
  if (t.usd !== null && t.eur !== null) return [['Dólar BCV', t.usd], ['Euro BCV (papelería)', t.eur]];
  if (t.usd !== null) return [['Dólar BCV', t.usd]];
  if (t.eur !== null) return [['Euro BCV', t.eur]];
  return [];
}

const aBs = (usd: number, tasa: number) => centimos(usd * tasa) / 100;

// ---------- Estado del recibo ----------

let lineas: Linea[] = cargarCarrito();
let filtroCategoria = '';
let busqueda = '';

function cargarCarrito(): Linea[] {
  try {
    const l = JSON.parse(localStorage.getItem(CARRITO_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

function guardarCarrito() {
  localStorage.setItem(CARRITO_KEY, JSON.stringify(lineas));
}

function cantidadDe(id: string) {
  return lineas.find((l) => l.id === id)?.cantidad ?? 0;
}

function setCantidad(id: string, cantidad: number, base?: Omit<Linea, 'cantidad'>) {
  cantidad = Math.max(0, Math.min(99999, Math.floor(cantidad || 0)));
  const existente = lineas.find((l) => l.id === id);
  if (cantidad === 0) {
    lineas = lineas.filter((l) => l.id !== id);
  } else if (existente) {
    existente.cantidad = cantidad;
  } else {
    const p = base ?? porId.get(id);
    if (!p) return;
    lineas.push({ id, nombre: p.nombre, categoria: p.categoria, precioUsd: p.precioUsd, cantidad });
  }
  guardarCarrito();
  render();
}

function totales(t: Tasas) {
  let usdCent = 0;
  let bsCent = 0;
  for (const l of lineas) {
    const sub = centimos(l.precioUsd * l.cantidad);
    usdCent += sub;
    const tasa = tasaPara(categoriaDe(l), t);
    if (tasa) bsCent += centimos((sub / 100) * tasa);
  }
  return { usd: usdCent / 100, bs: hayTasa(t) ? bsCent / 100 : null };
}

// ---------- Render ----------

const listaEl = $('productos');
const lineasEl = $('lineas');

function stepperHtml(id: string, cantidad: number, conQuitar = false) {
  return `
    <div class="stepper" data-id="${id}">
      ${conQuitar ? '<button type="button" class="quitar" data-accion="quitar">Quitar</button>' : ''}
      <button type="button" data-accion="menos" aria-label="Restar">−</button>
      <input type="number" inputmode="numeric" min="0" value="${cantidad}" aria-label="Cantidad" />
      <button type="button" class="mas" data-accion="mas" aria-label="Sumar">+</button>
    </div>`;
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function renderProductos(t: Tasas) {
  const q = normalizar(busqueda);
  const visibles = productos.filter(
    (p) => (!filtroCategoria || p.categoria === filtroCategoria) && (!q || normalizar(p.nombre).includes(q)),
  );

  if (!visibles.length) {
    listaEl.innerHTML = '<li class="sin-resultados">No hay productos que coincidan.</li>';
    return;
  }

  listaEl.innerHTML = visibles
    .map((p) => {
      const cant = cantidadDe(p.id);
      const sinPrecio = p.precioUsd <= 0;
      const tasa = tasaPara(p.categoria, t);
      return `
      <li class="producto ${cant ? 'en-recibo' : ''} ${sinPrecio ? 'sin-precio' : ''}">
        <div class="producto-info">
          <span class="producto-nombre">${escapar(p.nombre)}</span>
          <span class="producto-precio">
            ${
              sinPrecio
                ? '<span class="bs">Precio por definir</span>'
                : `<span class="usd">${fmtUsd(p.precioUsd)}</span>
                   <span class="bs">${tasa ? fmtBs(aBs(p.precioUsd, tasa)) : 'Bs —'}</span>`
            }
          </span>
        </div>
        ${sinPrecio ? '' : stepperHtml(p.id, cant)}
      </li>`;
    })
    .join('');
}

function renderRecibo(t: Tasas) {
  $('recibo-fecha').textContent = new Date().toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  $('vacio').hidden = lineas.length > 0;
  lineasEl.innerHTML = lineas
    .map((l) => {
      const sub = centimos(l.precioUsd * l.cantidad) / 100;
      const tasa = tasaPara(categoriaDe(l), t);
      return `
      <li class="linea">
        <span class="linea-nombre">${escapar(l.nombre)}</span>
        <span class="linea-total">${fmtUsd(sub)}</span>
        <span class="linea-detalle">${l.cantidad} × ${fmtUsd(l.precioUsd)}</span>
        <span class="linea-bs">${tasa ? fmtBs(aBs(sub, tasa)) : ''}</span>
        ${stepperHtml(l.id, l.cantidad, true)}
      </li>`;
    })
    .join('');

  const tot = totales(t);
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  $('total-usd').textContent = fmtUsd(tot.usd);
  $('total-bs').textContent = tot.bs !== null ? fmtBs(tot.bs) : 'Falta tasa BCV';
  $('tasa-aplicada').textContent = tasasAplicadas(t)
    .map(([k, v]) => `${k}: ${fmtBs(v)}`)
    .join(' · ');
  $('mb-count').textContent = String(unidades);
  $('mb-usd').textContent = fmtUsd(tot.usd);
  $('mb-bs').textContent = tot.bs !== null ? fmtBs(tot.bs) : 'Bs — (falta tasa)';

  const vacio = lineas.length === 0;
  for (const id of ['btn-imprimir', 'btn-pdf', 'btn-nueva']) $<HTMLButtonElement>(id).disabled = vacio;
}

function renderTasa(t: Tasas) {
  for (const m of MONEDAS) {
    const input = $<HTMLInputElement>(`tasa-${m}`);
    const v = t[m];
    if (document.activeElement !== input) input.value = v ? fmtNum.format(v) : '';
  }
  const fechaEl = $('tasa-fecha');
  if (hayTasa(t)) {
    fechaEl.textContent = 'Tasa de hoy';
    fechaEl.classList.remove('warn');
  } else {
    fechaEl.textContent = ultimaTasa() ? 'Tasa vencida, actualízala' : 'Sin tasa para hoy';
    fechaEl.classList.add('warn');
  }
}

function render() {
  const t = tasasDeHoy();
  renderTasa(t);
  renderProductos(t);
  renderRecibo(t);
}

// ---------- Eventos de cantidades ----------

function manejarStepper(e: Event) {
  const target = e.target as HTMLElement;
  const stepper = target.closest<HTMLElement>('.stepper');
  if (!stepper) return;
  const id = stepper.dataset.id!;
  const linea = lineas.find((l) => l.id === id);
  const base = linea ?? porId.get(id);

  if (e.type === 'click') {
    const accion = (target.closest('button') as HTMLButtonElement | null)?.dataset.accion;
    if (!accion) return;
    const actual = cantidadDe(id);
    if (accion === 'mas') setCantidad(id, actual + 1, base);
    if (accion === 'menos') setCantidad(id, actual - 1, base);
    if (accion === 'quitar') setCantidad(id, 0);
  } else if (e.type === 'change' && target instanceof HTMLInputElement) {
    setCantidad(id, Number(target.value), base);
  }
}

for (const el of [listaEl, lineasEl]) {
  el.addEventListener('click', manejarStepper);
  el.addEventListener('change', manejarStepper);
  el.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLInputElement) e.target.select();
  });
}

// ---------- Filtros ----------

$<HTMLInputElement>('buscar').addEventListener('input', (e) => {
  busqueda = (e.target as HTMLInputElement).value;
  renderProductos(tasasDeHoy());
});

$('chips').addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!chip) return;
  filtroCategoria = chip.dataset.cat ?? '';
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  renderProductos(tasasDeHoy());
});

// ---------- Concepto libre ----------

$<HTMLFormElement>('libre-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const nombre = String(new FormData(form).get('nombre') || '').trim();
  const precio = parseNumero(String(new FormData(form).get('precio') || ''));
  if (!nombre || !(precio > 0)) {
    toast('Ingresa una descripción y un precio válido.');
    return;
  }
  const id = `libre-${Date.now()}`;
  setCantidad(id, 1, { id, nombre: nombre.toUpperCase(), precioUsd: Math.round(precio * 100) / 100 });
  form.reset();
  toast('Concepto agregado al recibo.');
});

// ---------- Tasas BCV: inputs y diálogo diario ----------

/** La última tasa registrada (de cualquier moneda), para avisar que está vencida. */
function ultimaTasa(): TasaGuardada | null {
  const guardadas = MONEDAS.map(leerTasa).filter((t): t is TasaGuardada => t !== null);
  return guardadas.sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
}

for (const m of MONEDAS) {
  const input = $<HTMLInputElement>(`tasa-${m}`);
  input.addEventListener('input', () => {
    // Dejar el campo vacío quita esa tasa, para poder trabajar solo con la otra
    if (!input.value.trim()) borrarTasa(m);
    else {
      const v = parseNumero(input.value);
      if (!(v > 0)) return;
      guardarTasa(m, v);
    }
    render();
  });
  input.addEventListener('blur', () => renderTasa(tasasDeHoy()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
}

const dialog = $<HTMLDialogElement>('tasa-dialog');
const dialogInputs = Object.fromEntries(
  MONEDAS.map((m) => [m, $<HTMLInputElement>(`tasa-dialog-${m}`)]),
) as Record<Moneda, HTMLInputElement>;
let alGuardarTasa: (() => void) | null = null;

function pedirTasa(mensaje?: string, despues?: () => void) {
  $('tasa-dialog-msg').textContent =
    mensaje ?? 'Ingresa la tasa BCV de hoy del dólar, del euro o de ambos para calcular los montos en bolívares.';
  $('tasa-dialog-error').hidden = true;
  for (const m of MONEDAS) {
    const anterior = leerTasa(m);
    dialogInputs[m].value = anterior ? fmtNum.format(anterior.valor) : '';
  }
  alGuardarTasa = despues ?? null;
  dialog.showModal();
  dialogInputs.usd.focus();
  dialogInputs.usd.select();
}

$<HTMLFormElement>('tasa-form').addEventListener('submit', (e) => {
  const valores = MONEDAS.map((m) => {
    const texto = dialogInputs[m].value.trim();
    return [m, texto ? parseNumero(texto) : null] as const;
  });
  // Al menos una tasa, y las que se llenaron tienen que ser válidas
  const invalida = valores.some(([, v]) => v !== null && !(v > 0));
  if (invalida || valores.every(([, v]) => v === null)) {
    e.preventDefault();
    $('tasa-dialog-error').hidden = false;
    return;
  }
  for (const [m, v] of valores) {
    if (v === null) borrarTasa(m);
    else guardarTasa(m, v);
  }
  render();
  const cb = alGuardarTasa;
  alGuardarTasa = null;
  if (cb) setTimeout(cb, 50);
});

$('tasa-luego').addEventListener('click', () => {
  alGuardarTasa = null;
  dialog.close();
});

/** Ejecuta la acción solo si hay alguna tasa de hoy; si no, la pide primero. */
function conTasa(accion: (t: Tasas) => void) {
  const t = tasasDeHoy();
  if (hayTasa(t)) return accion(t);
  pedirTasa('El recibo siempre muestra los montos en bolívares. Ingresa la tasa BCV de hoy para continuar.', () => {
    const nuevas = tasasDeHoy();
    if (hayTasa(nuevas)) accion(nuevas);
  });
}

// Revisar al cargar y cuando la pestaña vuelve a estar visible (por si cambió el día)
function revisarTasaDelDia() {
  if (!hayTasa(tasasDeHoy()) && !dialog.open) {
    const anterior = ultimaTasa();
    pedirTasa(
      anterior
        ? `La última tasa registrada fue del ${anterior.fecha.split('-').reverse().join('/')}. Ingresa la tasa BCV de hoy.`
        : undefined,
    );
  }
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') revisarTasaDelDia();
});

// ---------- Hoja del recibo en móvil ----------

const ticket = $('ticket');
$('abrir-ticket').addEventListener('click', () => ticket.classList.add('open'));
$('cerrar-ticket').addEventListener('click', () => ticket.classList.remove('open'));

// ---------- Datos del cliente (solo en memoria, se borran al imprimir o en nueva venta) ----------

interface Cliente {
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string;
  correo: string;
}

const clienteVacio = (): Cliente => ({ nombre: '', apellido: '', cedula: '', telefono: '', correo: '' });
let cliente = clienteVacio();

/** Pares [etiqueta, valor] con los datos que el cliente llenó, en orden de impresión. */
function filasCliente(): [string, string][] {
  const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`.trim();
  const filas: [string, string][] = [
    ['Cliente', nombreCompleto],
    ['C.I.', cliente.cedula],
    ['Teléfono', cliente.telefono],
    ['Correo', cliente.correo],
  ];
  return filas.filter(([, v]) => v);
}

function renderCliente() {
  const filas = filasCliente();
  const resumen = $('cliente-resumen');
  resumen.hidden = filas.length === 0;
  resumen.innerHTML = filas.map(([k, v]) => `<dt>${k}</dt><dd>${escapar(v)}</dd>`).join('');
  $('btn-cliente').textContent = filas.length ? 'Editar datos del cliente' : 'Agregar datos del cliente';
}

function borrarCliente() {
  cliente = clienteVacio();
  renderCliente();
}

const clienteDialog = $<HTMLDialogElement>('cliente-dialog');
const clienteForm = $<HTMLFormElement>('cliente-form');

$('btn-cliente').addEventListener('click', () => {
  for (const [k, v] of Object.entries(cliente)) {
    (clienteForm.elements.namedItem(k) as HTMLInputElement).value = v;
  }
  clienteDialog.showModal();
});

clienteForm.addEventListener('submit', () => {
  const fd = new FormData(clienteForm);
  const valor = (k: keyof Cliente) => String(fd.get(k) ?? '').trim();
  cliente = {
    nombre: valor('nombre'),
    apellido: valor('apellido'),
    cedula: valor('cedula').toUpperCase(),
    telefono: valor('telefono'),
    correo: valor('correo').toLowerCase(),
  };
  renderCliente();
});

$('cliente-cancelar').addEventListener('click', () => clienteDialog.close());
$('cliente-borrar').addEventListener('click', () => {
  clienteForm.reset();
  borrarCliente();
  clienteDialog.close();
});

// ---------- Recibo: datos comunes ----------

function datosRecibo(t: Tasas) {
  const ahora = new Date();
  return {
    archivo: `recibo-${hoy()}-${String(ahora.getHours()).padStart(2, '0')}${String(ahora.getMinutes()).padStart(2, '0')}`,
    fecha: ahora.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: ahora.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
    cliente: filasCliente(),
    tasas: tasasAplicadas(t),
    lineas: lineas.map((l) => {
      const usd = centimos(l.precioUsd * l.cantidad) / 100;
      return { ...l, usd, bs: aBs(usd, tasaPara(categoriaDe(l), t)!) };
    }),
    totales: totales(t) as { usd: number; bs: number },
  };
}

// ---------- Imprimir ----------

function imprimir(t: Tasas) {
  const r = datosRecibo(t);
  const filas = r.lineas
    .map(
      (l) => `
      <tr><td colspan="2" class="b">${escapar(l.nombre)}</td></tr>
      <tr class="item-sub">
        <td>${l.cantidad} × ${fmtUsd(l.precioUsd)}</td>
        <td class="r">${fmtUsd(l.usd)}<br>${fmtBs(l.bs)}</td>
      </tr>`,
    )
    .join('');

  $('print-area').innerHTML = `
    <div class="recibo">
      <img src="/logo.jpeg" alt="">
      <div class="c b">${escapar(datos.negocio.nombre)}</div>
      <div class="c">RIF ${escapar(datos.negocio.rif)}</div>
      <hr>
      <table>
        <tr><td>Fecha</td><td class="r">${r.fecha} ${r.hora}</td></tr>
        ${r.cliente.map(([k, v]) => `<tr><td>${k}</td><td class="r wrap">${escapar(v)}</td></tr>`).join('')}
        ${r.tasas.map(([k, v]) => `<tr><td>${k}</td><td class="r">${fmtBs(v)}</td></tr>`).join('')}
      </table>
      <hr>
      <table>${filas}</table>
      <hr>
      <table>
        <tr class="total"><td>TOTAL $</td><td class="r">${fmtUsd(r.totales.usd)}</td></tr>
        <tr class="total"><td>TOTAL Bs</td><td class="r">${fmtBs(r.totales.bs)}</td></tr>
      </table>
      <hr>
      <div class="c">¡Gracias por su compra!</div>
      <div class="c item-sub">Documento no fiscal</div>
    </div>`;

  const img = $('print-area').querySelector('img')!;
  const lanzar = () => {
    window.print();
    // Los datos del cliente no se conservan después de imprimir
    borrarCliente();
  };
  if (img.complete) lanzar();
  else {
    img.onload = lanzar;
    img.onerror = lanzar;
  }
}

// ---------- PDF ----------

let logoDataUrl: string | null = null;

async function cargarLogo(): Promise<string | null> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const blob = await (await fetch('/logo.jpeg')).blob();
    logoDataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    return logoDataUrl;
  } catch {
    return null;
  }
}

async function guardarPdf(t: Tasas) {
  const r = datosRecibo(t);
  const ancho = 80;
  const margen = 5;
  const util = ancho - margen * 2;

  // Calcular alto aproximado según la cantidad de líneas
  const medir = new jsPDF({ unit: 'mm', format: [ancho, 200] });
  medir.setFont('courier', 'bold').setFontSize(8.5);
  const lineasNombre = r.lineas.map((l) => medir.splitTextToSize(l.nombre, util) as string[]);
  const altoItems = lineasNombre.reduce((a, n) => a + n.length * 3.6 + 8, 0);
  medir.setFont('courier', 'normal');
  const lineasCliente = r.cliente.map(([k, v]) => medir.splitTextToSize(`${k}: ${v}`, util) as string[]);
  const altoCliente = lineasCliente.reduce((a, l) => a + l.length * 3.8, 0);
  const alto = Math.max(120, 95 + altoItems + altoCliente + r.tasas.length * 3.8);

  const doc = new jsPDF({ unit: 'mm', format: [ancho, alto] });
  let y = margen;

  const logo = await cargarLogo();
  if (logo) {
    const w = 40;
    const h = w * 0.75;
    doc.addImage(logo, 'JPEG', (ancho - w) / 2, y, w, h);
    y += h + 3;
  }

  const centro = (t: string, size = 9, estilo: 'normal' | 'bold' = 'normal') => {
    doc.setFont('courier', estilo).setFontSize(size);
    doc.text(t, ancho / 2, y, { align: 'center' });
    y += size * 0.45;
  };
  const par = (izq: string, der: string, size = 8.5, estilo: 'normal' | 'bold' = 'normal') => {
    doc.setFont('courier', estilo).setFontSize(size);
    doc.text(izq, margen, y);
    doc.text(der, ancho - margen, y, { align: 'right' });
    y += size * 0.45;
  };
  const separador = () => {
    y += 0.5;
    doc.setLineDashPattern([1, 1], 0).setLineWidth(0.2).line(margen, y, ancho - margen, y);
    y += 4;
  };

  centro(datos.negocio.nombre, 10, 'bold');
  centro(`RIF ${datos.negocio.rif}`, 8.5);
  separador();
  par('Fecha', `${r.fecha} ${r.hora}`);
  doc.setFont('courier', 'normal').setFontSize(8.5);
  for (const t of lineasCliente.flat()) {
    doc.text(t, margen, y);
    y += 3.8;
  }
  for (const [k, v] of r.tasas) par(k, fmtBs(v));
  separador();

  r.lineas.forEach((l, i) => {
    doc.setFont('courier', 'bold').setFontSize(8.5);
    for (const t of lineasNombre[i]) {
      doc.text(t, margen, y);
      y += 3.6;
    }
    par(`${l.cantidad} x ${fmtUsd(l.precioUsd)}`, fmtUsd(l.usd), 8);
    par('', fmtBs(l.bs), 8);
    y += 1;
  });

  separador();
  par('TOTAL $', fmtUsd(r.totales.usd), 10.5, 'bold');
  y += 1;
  par('TOTAL Bs', fmtBs(r.totales.bs), 10.5, 'bold');
  separador();
  centro('¡Gracias por su compra!', 8.5);
  centro('Documento no fiscal', 7.5);

  doc.save(`${r.archivo}.pdf`);
}

// ---------- Botones de acción ----------

$('btn-imprimir').addEventListener('click', () => conTasa(imprimir));
$('btn-pdf').addEventListener('click', () => conTasa((t) => void guardarPdf(t)));
$('btn-nueva').addEventListener('click', () => {
  lineas = [];
  guardarCarrito();
  borrarCliente();
  ticket.classList.remove('open');
  render();
  toast('Nueva venta iniciada.');
});

// ---------- Sin conexión (service worker) ----------

const PAGE_CACHE = 'sc-pagina-v1';

function renderConexion() {
  $('sin-conexion').hidden = navigator.onLine;
}
window.addEventListener('online', renderConexion);
window.addEventListener('offline', renderConexion);
renderConexion();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      const sw = (await navigator.serviceWorker.ready).active;
      // Enviar los recursos cargados para que queden guardados y se limpien los de versiones viejas
      const urls = performance.getEntriesByType('resource').map((e) => e.name);
      sw?.postMessage({ tipo: 'recursos', urls });
    } catch (err) {
      console.warn('No se pudo registrar el service worker', err);
    }
  });
}

// Al cerrar sesión se borra la copia guardada para uso sin conexión
$<HTMLFormElement>('logout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if ('caches' in window) await caches.delete(PAGE_CACHE).catch(() => {});
  form.submit();
});

// ---------- Utilidades ----------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

revisarTasaDelDia();
