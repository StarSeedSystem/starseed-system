// ════════════════════════════════════════════════════════════════
// Aurora · Control de Pantalla — Acciones (pulsar, escribir, desplazar)
// ----------------------------------------------------------------
// Ejecutores REALES sobre el DOM para que Aurora maneje la pantalla por
// voz: pulsar un elemento por número o nombre (con matching fuzzy sin
// acentos), escribir en campos (value nativo + evento input, compatible
// con React), desplazar la página o el contenedor central, deslizar,
// atrás/adelante en el historial y alternar pantalla completa.
//
// Todas las funciones devuelven un ScreenActionOutcome honesto con una
// frase corta en español pensada para leerse en voz alta. Los errores
// son amables y siempre recuerdan el camino: «di "ver pantalla"…».
//
// SSR-safe: nada toca window/document a nivel de módulo; fuera del
// navegador cada función degrada con un mensaje honesto. Nada lanza.
// ════════════════════════════════════════════════════════════════

import {
  AURORA_EXCLUDE_SELECTOR,
  findByNumber,
  formatScanSummary,
  getLastScan,
  scanScreen,
  type ScreenElement,
} from "./screen-scanner";
import { hide as hideOverlayBadges, highlight, showBadges } from "./screen-overlay";

/** Resultado honesto de una acción de pantalla (frase decible). */
export interface ScreenActionOutcome {
  ok: boolean;
  /** Frase corta en español para leer en voz alta. */
  message: string;
  /** Datos serializables opcionales (ids, etiquetas…). */
  data?: Record<string, unknown>;
}

/** Recordatorio amable que acompaña a los errores de búsqueda. */
const HINT = "Di «ver pantalla» para enumerar los botones y enlaces visibles.";

// ── Utilidades ──────────────────────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function ok(message: string, data?: Record<string, unknown>): ScreenActionOutcome {
  return data ? { ok: true, message, data } : { ok: true, message };
}

function fail(message: string): ScreenActionOutcome {
  return { ok: false, message };
}

function clip(s: string, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/** Normaliza texto para comparar: minúsculas, sin acentos, espacios simples. */
export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Matching fuzzy por nombre ───────────────────────────────────────────────

/** Umbral mínimo para aceptar una coincidencia por nombre. */
const MATCH_THRESHOLD = 0.45;

/** Puntúa cuánto se parece una consulta a una etiqueta (0..1). */
function scoreLabel(query: string, label: string): number {
  const q = normalizeText(query);
  const l = normalizeText(label);
  if (!q || !l) return 0;
  if (q === l) return 1;
  if (l.startsWith(q)) return 0.92;
  if (l.includes(q)) return 0.84;
  if (q.includes(l) && l.length >= 3) return 0.8;
  // Solapamiento de palabras (tolera órdenes distintos y palabras de más).
  const qTokens = q.split(" ").filter(Boolean);
  const lTokens = l.split(" ").filter(Boolean);
  if (qTokens.length > 0 && lTokens.length > 0) {
    let hits = 0;
    for (const t of qTokens) {
      if (lTokens.includes(t)) hits += 1;
      else if (lTokens.some((w) => w.startsWith(t) || t.startsWith(w))) hits += 0.6;
    }
    const ratio = hits / qTokens.length;
    if (ratio > 0) return Math.min(0.78, 0.3 + ratio * 0.45);
  }
  return 0;
}

/**
 * Busca el elemento cuya etiqueta mejor casa con `nombre` (fuzzy, sin
 * acentos ni mayúsculas). Devuelve null si nada supera el umbral.
 */
export function matchByName(
  nombre: string,
  items: ScreenElement[] = getLastScan(),
): { item: ScreenElement; score: number } | null {
  let best: { item: ScreenElement; score: number } | null = null;
  for (const item of items) {
    const score = scoreLabel(nombre, item.label);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { item, score };
      if (score >= 1) break;
    }
  }
  return best;
}

// ── Resolución de objetivo (número o nombre) ────────────────────────────────

/** Interpreta "3", 3, "el 3", "número 3"… como id efímero. */
function parseTargetNumber(target: unknown): number | null {
  if (typeof target === "number" && Number.isFinite(target)) {
    return target > 0 ? Math.trunc(target) : null;
  }
  const s = normalizeText(target);
  const m = s.match(/^(?:el |la |numero |num |n[º°] ?|n )?(\d{1,3})$/);
  return m ? Number(m[1]) : null;
}

function resolveTarget(target: unknown): { item: ScreenElement | null; error?: string } {
  if (!isClient()) {
    return { item: null, error: "Solo puedo controlar la pantalla en el navegador." };
  }
  if (target === null || target === undefined || String(target).trim() === "") {
    return { item: null, error: `Dime el número o el nombre del elemento. ${HINT}` };
  }
  const asNumber = parseTargetNumber(target);
  if (asNumber !== null) {
    let item = findByNumber(asNumber);
    if (!item) {
      // Quizá no había escaneo previo (o la página cambió): reintenta.
      scanScreen();
      item = findByNumber(asNumber);
    }
    if (!item) return { item: null, error: `No veo un elemento con el número ${asNumber}. ${HINT}` };
    return { item };
  }
  const name = String(target).trim();
  let items = getLastScan();
  if (items.length === 0) items = scanScreen();
  let best = matchByName(name, items);
  if (!best) {
    // La pantalla pudo cambiar desde el último escaneo: escanea de nuevo.
    items = scanScreen();
    best = matchByName(name, items);
  }
  if (!best) return { item: null, error: `No encuentro ese botón («${clip(name, 40)}»). ${HINT}` };
  return { item: best.item };
}

// ── Ver pantalla (escanear + insignias) ─────────────────────────────────────

/**
 * Escanea el viewport, pinta las insignias numeradas y devuelve la lista
 * corta decible («1 Publicar · 2 Perfil…»).
 */
export function verPantalla(): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo ver la pantalla en el navegador.");
  try {
    const items = scanScreen();
    if (items.length === 0) {
      return ok("No veo botones ni enlaces visibles ahora mismo. Prueba a desplazar la pantalla y pídeme «ver pantalla» otra vez.");
    }
    showBadges(items);
    const summary = formatScanSummary(items, 10);
    return ok(
      `Veo ${items.length} elemento${items.length === 1 ? "" : "s"}: ${summary}. Dime «pulsa» y el número o el nombre.`,
      {
        total: items.length,
        elementos: items.map((i) => ({ numero: i.id, nombre: i.label, tipo: i.kind })),
      },
    );
  } catch {
    return fail("No pude escanear la pantalla.");
  }
}

// ── Pulsar ──────────────────────────────────────────────────────────────────

/**
 * Pulsa un elemento por su número efímero o por su nombre (fuzzy):
 * lo trae a la vista (scrollIntoView), lo resalta y hace click REAL.
 */
export function clickElement(idOrName: unknown): ScreenActionOutcome {
  const { item, error } = resolveTarget(idOrName);
  if (!item) return fail(error ?? `No encuentro ese botón. ${HINT}`);
  const el = item.el;
  try {
    if ((el as HTMLButtonElement).disabled === true) {
      return fail(`«${item.label}» está desactivado ahora mismo.`);
    }
    try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* noop */ }
    hideOverlayBadges(); // las insignias quedan obsoletas tras pulsar
    highlight(el);
    try { el.focus({ preventScroll: true }); } catch { /* noop */ }
    el.click();
    return ok(`Pulsé «${item.label}».`, { numero: item.id, nombre: item.label });
  } catch {
    return fail(`No pude pulsar «${item.label}».`);
  }
}

// ── Desplazamiento ──────────────────────────────────────────────────────────

type ScrollDir = "arriba" | "abajo" | "izquierda" | "derecha" | "inicio" | "final";

function parseDirection(d: unknown): ScrollDir | null {
  const s = normalizeText(d);
  if (!s) return null;
  // Primero los extremos (para que "abajo del todo" no caiga en "abajo").
  if (/(inicio|principio|comienzo|arriba del todo|top)/.test(s)) return "inicio";
  if (/(final|fondo|del todo|bottom|hasta abajo)/.test(s)) return "final";
  if (/(arriba|subir|sube|up)/.test(s)) return "arriba";
  if (/(abajo|bajar|baja|down)/.test(s)) return "abajo";
  if (/(izquierda|left)/.test(s)) return "izquierda";
  if (/(derecha|right)/.test(s)) return "derecha";
  return null;
}

/** Convierte {cantidad} en píxeles: número, "poco", "pagina", "mucho"… */
function parseAmount(cantidad: unknown, pageSize: number): number {
  if (typeof cantidad === "number" && Number.isFinite(cantidad) && cantidad > 0) {
    return Math.round(cantidad);
  }
  const s = normalizeText(cantidad);
  if (!s) return Math.round(pageSize * 0.75);
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(24, Math.round(Number(s)));
  if (s.includes("poco") || s.includes("poquito")) return Math.round(pageSize * 0.3);
  if (s.includes("mucho") || s.includes("bastante")) return Math.round(pageSize * 1.5);
  if (s.includes("pagina") || s.includes("pantalla") || s.includes("completa")) {
    return Math.round(pageSize * 0.9);
  }
  return Math.round(pageSize * 0.75);
}

/**
 * Contenedor scrolleable "central": parte del elemento bajo el centro del
 * viewport y sube buscando overflow desplazable. null → usar window.
 */
function findScrollContainer(horizontal: boolean): HTMLElement | null {
  if (!isClient()) return null;
  try {
    const cx = Math.floor(window.innerWidth / 2);
    const cy = Math.floor(window.innerHeight / 2);
    let node = document.elementFromPoint(cx, cy) as HTMLElement | null;
    let hops = 0;
    while (node && node !== document.body && node !== document.documentElement && hops < 30) {
      const st = window.getComputedStyle(node);
      const oy = st.overflowY;
      const ox = st.overflowX;
      const canY = (oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 8;
      const canX = (ox === "auto" || ox === "scroll" || ox === "overlay") && node.scrollWidth > node.clientWidth + 8;
      if (horizontal ? canX : canY) return node;
      node = node.parentElement;
      hops += 1;
    }
  } catch { /* noop */ }
  return null;
}

const DIR_LABEL: Record<ScrollDir, string> = {
  arriba: "arriba",
  abajo: "abajo",
  izquierda: "la izquierda",
  derecha: "la derecha",
  inicio: "el principio",
  final: "el final",
};

/**
 * Desplaza la ventana o el contenedor scrolleable central.
 * {direccion}: arriba | abajo | izquierda | derecha | inicio | final.
 * {cantidad}: píxeles o "poco" | "pagina" | "mucho" (por defecto ~3/4 de página).
 */
export function scrollPage(direccion: unknown, cantidad?: unknown): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo desplazar la pantalla en el navegador.");
  const dir = parseDirection(direccion);
  if (!dir) {
    return fail("¿Hacia dónde desplazo? Dime arriba, abajo, izquierda, derecha, inicio o final.");
  }
  try {
    const horizontal = dir === "izquierda" || dir === "derecha";
    const container = findScrollContainer(horizontal);
    const pageSize = container
      ? (horizontal ? container.clientWidth : container.clientHeight)
      : (horizontal ? window.innerWidth : window.innerHeight);

    if (dir === "inicio" || dir === "final") {
      const maxTop = container
        ? container.scrollHeight
        : (document.scrollingElement?.scrollHeight ?? document.body.scrollHeight);
      const top = dir === "inicio" ? 0 : maxTop;
      if (container) container.scrollTo({ top, behavior: "smooth" });
      else window.scrollTo({ top, behavior: "smooth" });
      return ok(dir === "inicio" ? "Fui al principio de la página." : "Fui al final de la página.");
    }

    const px = parseAmount(cantidad, pageSize);
    const delta = dir === "arriba" || dir === "izquierda" ? -px : px;
    const opts: ScrollToOptions = horizontal
      ? { left: delta, behavior: "smooth" }
      : { top: delta, behavior: "smooth" };
    if (container) container.scrollBy(opts);
    else window.scrollBy(opts);
    return ok(`Desplacé la pantalla hacia ${DIR_LABEL[dir]}.`);
  } catch {
    return fail("No pude desplazar la pantalla.");
  }
}

/**
 * Desliza (gesto táctil por voz): deslizar hacia X muestra el contenido
 * del lado contrario, como con el dedo. Una "página" por gesto.
 */
export function swipe(direccion: unknown): ScreenActionOutcome {
  const dir = parseDirection(direccion);
  if (!dir || dir === "inicio" || dir === "final") {
    return fail("¿En qué dirección deslizo? arriba, abajo, izquierda o derecha.");
  }
  const opposite: Record<ScrollDir, ScrollDir> = {
    arriba: "abajo",
    abajo: "arriba",
    izquierda: "derecha",
    derecha: "izquierda",
    inicio: "inicio",
    final: "final",
  };
  const res = scrollPage(opposite[dir], "pagina");
  return res.ok ? ok(`Deslicé hacia ${DIR_LABEL[dir]}.`) : res;
}

// ── Escritura en campos ─────────────────────────────────────────────────────

/** Devuelve el nodo editable del objetivo (él mismo o un campo interior). */
function editableFrom(el: HTMLElement): HTMLElement | null {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el;
  }
  if (el.isContentEditable) return el;
  try {
    return el.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [contenteditable=""]',
    );
  } catch {
    return null;
  }
}

/**
 * Fija el valor con el setter NATIVO del prototipo. React parchea `.value`,
 * así que esta vía garantiza que el evento `input` posterior sí actualice
 * el estado de los componentes controlados.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  try {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
  } catch {
    try { el.value = value; } catch { /* noop */ }
  }
}

/** Dispara input (InputEvent si existe) + change, ambos burbujeando. */
function fireInput(el: HTMLElement, data: string): void {
  try {
    const ev = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, data, inputType: "insertText" })
      : new Event("input", { bubbles: true });
    el.dispatchEvent(ev);
  } catch {
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch { /* noop */ }
  }
  try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch { /* noop */ }
}

/** Enfoca un campo por número o nombre (lo trae a la vista y lo resalta). */
export function focusInput(idOrName: unknown): ScreenActionOutcome {
  const { item, error } = resolveTarget(idOrName);
  if (!item) return fail(error ?? `No encuentro ese campo. ${HINT}`);
  const field = editableFrom(item.el);
  if (!field) return fail(`«${item.label}» no es un campo donde se pueda escribir. ${HINT}`);
  try {
    try { field.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* noop */ }
    highlight(field);
    try { field.focus({ preventScroll: true }); } catch { field.focus(); }
    return ok(`Enfoqué «${item.label}». Dime qué escribo.`, { numero: item.id, nombre: item.label });
  } catch {
    return fail(`No pude enfocar «${item.label}».`);
  }
}

/**
 * Escribe texto en un campo (por número o nombre). Inputs/textareas usan
 * value nativo + evento input (compatible React); los <select> eligen la
 * opción que mejor case; contenteditable recibe el texto directamente.
 */
export function typeInto(idOrName: unknown, texto: unknown): ScreenActionOutcome {
  const text = typeof texto === "string" ? texto : texto === null || texto === undefined ? "" : String(texto);
  if (!text.trim()) return fail("¿Qué texto quieres que escriba?");
  const { item, error } = resolveTarget(idOrName);
  if (!item) return fail(error ?? `No encuentro ese campo. ${HINT}`);
  const field = editableFrom(item.el);
  if (!field) return fail(`«${item.label}» no es un campo de texto. ${HINT}`);
  try {
    try { field.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* noop */ }
    highlight(field);
    try { field.focus({ preventScroll: true }); } catch { /* noop */ }

    if (field instanceof HTMLSelectElement) {
      const wanted = normalizeText(text);
      const options = Array.from(field.options);
      const opt =
        options.find((o) => normalizeText(o.label || o.text) === wanted || normalizeText(o.value) === wanted) ||
        options.find((o) => normalizeText(o.label || o.text).includes(wanted));
      if (!opt) return fail(`No encontré la opción «${clip(text, 40)}» en «${item.label}».`);
      field.value = opt.value;
      fireInput(field, opt.value);
      return ok(`Elegí «${opt.label || opt.text}» en «${item.label}».`, { numero: item.id, nombre: item.label });
    }

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      if (field instanceof HTMLInputElement) {
        const t = (field.type || "text").toLowerCase();
        if (t === "checkbox" || t === "radio") {
          return fail(`«${item.label}» es una casilla; dime «pulsa ${item.id}» para marcarla.`);
        }
      }
      setNativeValue(field, text);
      fireInput(field, text);
      return ok(`Escribí «${clip(text, 60)}» en «${item.label}».`, { numero: item.id, nombre: item.label });
    }

    if (field.isContentEditable) {
      field.textContent = text;
      fireInput(field, text);
      return ok(`Escribí «${clip(text, 60)}» en «${item.label}».`, { numero: item.id, nombre: item.label });
    }

    return fail(`«${item.label}» no es un campo de texto. ${HINT}`);
  } catch {
    return fail(`No pude escribir en «${item.label}».`);
  }
}

// ── Resaltar (highlight sin pulsar) ─────────────────────────────────────────

/**
 * Resalta un elemento por número o nombre SIN pulsarlo: lo trae a la vista y
 * dibuja el marco ámbar del overlay. Útil para «señálame el 3» / «¿dónde está
 * Publicar?» antes de decidir. No dispara ningún click.
 */
export function highlightElement(idOrName: unknown): ScreenActionOutcome {
  const { item, error } = resolveTarget(idOrName);
  if (!item) return fail(error ?? `No encuentro ese elemento. ${HINT}`);
  try {
    try { item.el.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* noop */ }
    highlight(item.el);
    return ok(`Te señalo «${item.label}».`, { numero: item.id, nombre: item.label });
  } catch {
    return fail(`No pude señalar «${item.label}».`);
  }
}

// ── Leer pantalla (describir textos y elementos en voz) ──────────────────────

/** Selector de bloques de texto legibles para el resumen de «leer pantalla». */
const READ_TEXT_SELECTOR = [
  "h1", "h2", "h3",
  '[role="heading"]',
  "p", "li",
  "figcaption", "blockquote",
  "[data-aurora-read]",
].join(", ");

/** Texto directo y visible de un nodo (sin volcar subárboles enormes). */
function visibleTextOf(el: HTMLElement, max = 160): string {
  try {
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return "";
    if (Number(st.opacity || "1") < 0.05) return "";
  } catch { return ""; }
  try {
    const r = el.getBoundingClientRect();
    // Solo lo que está (al menos parcialmente) dentro del viewport.
    if (r.width < 4 || r.height < 4) return "";
    if (r.bottom <= 2 || r.right <= 2 || r.top >= window.innerHeight - 2 || r.left >= window.innerWidth - 2) return "";
  } catch { /* noop */ }
  let t = "";
  try { t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); } catch { return ""; }
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Describe en un resumen decible lo que se ve en pantalla: el título/encabezados
 * y los primeros textos principales visibles, más un recuento de botones,
 * enlaces y campos. Pensado para leerse en voz alta («leer pantalla»).
 */
export function readScreen(): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo leer la pantalla en el navegador.");
  try {
    // 1) Textos principales (encabezados y párrafos) visibles, sin duplicar.
    const textos: string[] = [];
    const seen = new Set<string>();
    let nodes: HTMLElement[] = [];
    try {
      nodes = Array.from(document.querySelectorAll<HTMLElement>(READ_TEXT_SELECTOR));
    } catch { nodes = []; }
    for (const el of nodes) {
      if (textos.length >= 8) break;
      try { if (el.closest(AURORA_EXCLUDE_SELECTOR)) continue; } catch { /* noop */ }
      const txt = visibleTextOf(el);
      if (!txt) continue;
      const key = normalizeText(txt);
      if (!key || seen.has(key)) continue;
      // Descarta si ya hay un texto que lo contiene (subcadena de otro mayor).
      if (textos.some((prev) => normalizeText(prev).includes(key))) continue;
      seen.add(key);
      textos.push(txt);
    }

    // 2) Recuento de elementos interactivos (reutiliza el escáner).
    let items = getLastScan();
    if (items.length === 0) items = scanScreen();
    const nBotones = items.filter((i) => i.kind === "boton").length;
    const nEnlaces = items.filter((i) => i.kind === "enlace" || i.kind === "pestana" || i.kind === "menu").length;
    const nCampos = items.filter((i) => i.kind === "campo" || i.kind === "selector" || i.kind === "control").length;

    const partes: string[] = [];
    let titulo = "";
    try {
      const h = document.querySelector<HTMLElement>('h1, [role="heading"][aria-level="1"]');
      if (h) titulo = visibleTextOf(h, 80);
      if (!titulo && document.title) titulo = clip(document.title, 80);
    } catch { /* noop */ }
    if (titulo) partes.push(`Estás en «${titulo}».`);

    if (textos.length > 0) {
      partes.push(`Veo: ${textos.slice(0, 6).join(". ")}.`);
    } else if (!titulo) {
      partes.push("No veo textos destacados en esta parte de la pantalla.");
    }

    const conteo: string[] = [];
    if (nBotones > 0) conteo.push(`${nBotones} ${nBotones === 1 ? "botón" : "botones"}`);
    if (nEnlaces > 0) conteo.push(`${nEnlaces} ${nEnlaces === 1 ? "enlace" : "enlaces"}`);
    if (nCampos > 0) conteo.push(`${nCampos} ${nCampos === 1 ? "campo" : "campos"}`);
    if (conteo.length > 0) {
      partes.push(`Hay ${conteo.join(", ")}. Di «ver pantalla» para numerarlos.`);
    }

    return ok(partes.join(" ") || "No hay mucho que leer aquí ahora mismo.", {
      titulo,
      textos,
      botones: nBotones,
      enlaces: nEnlaces,
      campos: nCampos,
    });
  } catch {
    return fail("No pude leer la pantalla.");
  }
}

// ── Copiar el texto de un elemento ───────────────────────────────────────────

/** Escribe en el portapapeles con degradado a execCommand. Defensivo. */
function writeClipboard(text: string): boolean {
  if (!isClient() || !text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      // Puede rechazar (permiso/insecure context): lo dejamos correr sin await.
      void navigator.clipboard.writeText(text).catch(() => { /* fallback abajo */ });
      return true;
    }
  } catch { /* noop */ }
  // Fallback clásico: textarea temporal + execCommand('copy').
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    try { ta.remove(); } catch { /* noop */ }
    return copied;
  } catch {
    return false;
  }
}

/**
 * Copia al portapapeles el texto de un elemento (por número o nombre). Para
 * campos usa su valor; para el resto, su texto visible. Devuelve un extracto
 * decible de lo copiado.
 */
export function copyElementText(idOrName: unknown): ScreenActionOutcome {
  const { item, error } = resolveTarget(idOrName);
  if (!item) return fail(error ?? `No encuentro ese elemento. ${HINT}`);
  let text = "";
  try {
    const field = editableFrom(item.el);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      text = field.value || "";
    } else if (field instanceof HTMLSelectElement) {
      const opt = field.selectedOptions?.[0];
      text = (opt?.label || opt?.text || field.value || "").trim();
    }
    if (!text) {
      text = ((item.el.innerText || item.el.textContent || "") as string).replace(/\s+/g, " ").trim();
    }
    // Enlaces sin texto: copia la URL de destino.
    if (!text && item.el instanceof HTMLAnchorElement && item.el.href) text = item.el.href;
  } catch { /* noop */ }
  if (!text) return fail(`«${item.label}» no tiene texto que copiar.`);
  try { highlight(item.el); } catch { /* noop */ }
  const done = writeClipboard(text);
  if (!done) return fail(`No pude copiar el texto de «${item.label}».`);
  return ok(`Copié «${clip(text, 80)}».`, { numero: item.id, nombre: item.label, texto: text });
}

// ── Seleccionar una opción de un desplegable ─────────────────────────────────

/**
 * Elige una opción en un <select> (por número/nombre del selector) casando la
 * {opcion} por etiqueta o valor (fuzzy, sin acentos). Si el objetivo no es un
 * <select>, lo dice con amabilidad.
 */
export function selectOption(idOrName: unknown, opcion: unknown): ScreenActionOutcome {
  const wanted = String(opcion ?? "").trim();
  if (!wanted) return fail("¿Qué opción quieres elegir?");
  const { item, error } = resolveTarget(idOrName);
  if (!item) return fail(error ?? `No encuentro ese selector. ${HINT}`);
  const field = editableFrom(item.el);
  if (!(field instanceof HTMLSelectElement)) {
    return fail(`«${item.label}» no es un desplegable. ${HINT}`);
  }
  try {
    try { field.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* noop */ }
    highlight(field);
    try { field.focus({ preventScroll: true }); } catch { /* noop */ }
    const w = normalizeText(wanted);
    const options = Array.from(field.options);
    const opt =
      options.find((o) => normalizeText(o.label || o.text) === w || normalizeText(o.value) === w) ||
      options.find((o) => normalizeText(o.label || o.text).includes(w) || normalizeText(o.value).includes(w));
    if (!opt) return fail(`No encontré la opción «${clip(wanted, 40)}» en «${item.label}».`);
    field.value = opt.value;
    fireInput(field, opt.value);
    return ok(`Elegí «${opt.label || opt.text}» en «${item.label}».`, {
      numero: item.id, nombre: item.label, opcion: opt.label || opt.text,
    });
  } catch {
    return fail(`No pude elegir la opción en «${item.label}».`);
  }
}

// ── Rellenar un formulario (varios campos por etiqueta) ──────────────────────

/** Un par campo→valor tal como llega desde la voz/el modelo. */
export interface FormFieldInput {
  /** Etiqueta, placeholder, nombre o número del campo. */
  campo: unknown;
  /** Valor a escribir/elegir. */
  valor: unknown;
}

/** Normaliza la lista de campos aceptando varias formas de entrada. */
function normalizeFieldList(campos: unknown): FormFieldInput[] {
  const out: FormFieldInput[] = [];
  if (Array.isArray(campos)) {
    for (const c of campos) {
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>;
        const campo = o.campo ?? o.field ?? o.nombre ?? o.name ?? o.etiqueta ?? o.label ?? o.numero ?? o["número"];
        const valor = o.valor ?? o.value ?? o.texto ?? o.text ?? o.contenido;
        if (campo !== undefined && campo !== null && String(campo).trim() !== "") {
          out.push({ campo, valor });
        }
      }
    }
    return out;
  }
  // Objeto plano { "Nombre": "Ana", "Email": "a@b.c" }.
  if (campos && typeof campos === "object") {
    for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
      if (k && k.trim()) out.push({ campo: k, valor: v });
    }
  }
  return out;
}

/**
 * Rellena varios campos de un formulario de una vez: para cada { campo, valor }
 * localiza el input/textarea/select por su etiqueta (o número) y le pone el
 * valor (usando la misma maquinaria que escribir_en / seleccionar_opcion).
 * Devuelve un resumen decible con lo que se rellenó y lo que no se encontró.
 */
export function fillForm(campos: unknown): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo rellenar formularios en el navegador.");
  const list = normalizeFieldList(campos);
  if (list.length === 0) {
    return fail("Dime qué campos rellenar, por ejemplo: nombre «Ana», correo «ana@ejemplo.com».");
  }
  // Un escaneo fresco para que los campos estén localizables por nombre/número.
  try { scanScreen(); } catch { /* noop */ }

  const hechos: string[] = [];
  const fallidos: string[] = [];
  for (const { campo, valor } of list) {
    const label = String(campo).trim();
    const value = valor === null || valor === undefined ? "" : String(valor);
    const { item } = resolveTarget(campo);
    if (!item) { fallidos.push(label); continue; }
    const field = editableFrom(item.el);
    if (!field) { fallidos.push(item.label); continue; }
    try {
      if (field instanceof HTMLSelectElement) {
        const res = selectOption(campo, value);
        if (res.ok) hechos.push(item.label); else fallidos.push(item.label);
        continue;
      }
      if (field instanceof HTMLInputElement) {
        const t = (field.type || "text").toLowerCase();
        if (t === "checkbox" || t === "radio") {
          // Marcar si el valor es afirmativo; desmarcar si negativo/explícito.
          const on = /^(1|true|si|sí|yes|on|marcar|activar)$/i.test(value.trim()) || value.trim() === "";
          if (field.checked !== on) { try { field.click(); } catch { /* noop */ } }
          hechos.push(item.label);
          continue;
        }
      }
      try { field.focus({ preventScroll: true }); } catch { /* noop */ }
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        setNativeValue(field, value);
        fireInput(field, value);
        hechos.push(item.label);
      } else if (field.isContentEditable) {
        field.textContent = value;
        fireInput(field, value);
        hechos.push(item.label);
      } else {
        fallidos.push(item.label);
      }
    } catch {
      fallidos.push(item.label);
    }
  }

  const partes: string[] = [];
  if (hechos.length > 0) {
    partes.push(`Rellené ${hechos.length} campo${hechos.length === 1 ? "" : "s"}: ${hechos.join(", ")}.`);
  }
  if (fallidos.length > 0) {
    partes.push(`No encontré: ${fallidos.join(", ")}. ${HINT}`);
  }
  const okAny = hechos.length > 0;
  const message = partes.join(" ") || `No pude rellenar ningún campo. ${HINT}`;
  return okAny
    ? ok(message, { rellenados: hechos, no_encontrados: fallidos })
    : fail(message);
}

// ── Ir a una sección del OS / abrir una app (navegación por nombre) ──────────

/**
 * Resuelve un nombre libre a una ruta interna del OS reutilizando `resolveOsRoute`
 * de las acciones de Aurora (import perezoso, defensivo). Devuelve { path, label }.
 * Si no se puede cargar el resolvedor, acepta rutas explícitas («/memorias»).
 */
async function resolveSectionRoute(raw: string): Promise<{ path: string | null; label: string }> {
  let path: string | null = null;
  let label = raw;
  try {
    const mod = await import("@/lib/aurora/actions");
    path = mod.resolveOsRoute(raw);
    const hit = mod.OS_ROUTES.find((r) => r.path === path);
    if (hit) label = hit.label;
  } catch {
    path = raw.startsWith("/") ? raw : null;
  }
  return { path, label };
}

/** Navegación de verdad a una ruta interna (evento suave + fallback duro). */
function navigateTo(path: string): void {
  try { hideOverlayBadges(); } catch { /* noop */ }
  try {
    window.dispatchEvent(
      new CustomEvent("starseed:navigate", { detail: { path, source: "aurora", at: Date.now() } }),
    );
  } catch { /* noop */ }
  try {
    window.location.assign(path);
  } catch {
    try { window.location.href = path; } catch { /* noop */ }
  }
}

/**
 * Navega a una sección/área del OS por su nombre libre (memorias, decisiones,
 * pizarras, red…). Emite `starseed:navigate` por si la shell hace navegación
 * suave y cae a la navegación del navegador. SSR-safe; nunca lanza.
 */
export async function goToSection(nombre: unknown): Promise<ScreenActionOutcome> {
  if (!isClient()) return fail("Solo puedo cambiar de sección en el navegador.");
  const raw = String(nombre ?? "").trim();
  if (!raw) return fail("¿A qué sección quieres ir? Por ejemplo: memorias, decisiones o pizarras.");
  const { path, label } = await resolveSectionRoute(raw);
  if (!path) return fail(`No reconozco la sección «${clip(raw, 40)}».`);
  navigateTo(path);
  return ok(`Voy a ${label}.`, { ruta: path, seccion: label });
}

/**
 * Abre una app del OS por nombre. Emite `starseed:open-app` (que la shell y el
 * catálogo de apps del OS pueden atender para abrir ventana/ruta) y, si el
 * nombre resuelve a una sección conocida, navega a ella como respaldo.
 */
export async function openApp(nombre: unknown): Promise<ScreenActionOutcome> {
  if (!isClient()) return fail("Solo puedo abrir apps en el navegador.");
  const raw = String(nombre ?? "").trim();
  if (!raw) return fail("¿Qué app quieres abrir?");
  try {
    window.dispatchEvent(
      new CustomEvent("starseed:open-app", { detail: { name: raw, source: "aurora", at: Date.now() } }),
    );
  } catch { /* noop */ }
  const { path } = await resolveSectionRoute(raw);
  if (path) {
    navigateTo(path);
    return ok(`Abriendo ${raw}.`, { app: raw, ruta: path });
  }
  return ok(`Pedí abrir «${clip(raw, 40)}». Si no aparece, dime el nombre exacto de la app.`, { app: raw });
}

// ── Historial y pantalla completa ───────────────────────────────────────────

/** Vuelve a la página anterior del historial del navegador. */
export function goBack(): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo navegar en el navegador.");
  try {
    hideOverlayBadges();
    window.history.back();
    return ok("Volviendo atrás.");
  } catch {
    return fail("No pude volver atrás.");
  }
}

/** Avanza a la página siguiente del historial del navegador. */
export function goForward(): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo navegar en el navegador.");
  try {
    hideOverlayBadges();
    window.history.forward();
    return ok("Yendo adelante.");
  } catch {
    return fail("No pude ir adelante.");
  }
}

/**
 * Alterna la pantalla completa del OS emitiendo el evento del sistema
 * 'starseed:toggle-fullscreen' (la shell del OS decide cómo aplicarlo).
 */
export function toggleFullscreen(): ScreenActionOutcome {
  if (!isClient()) return fail("Solo puedo cambiar la pantalla en el navegador.");
  try {
    window.dispatchEvent(
      new CustomEvent("starseed:toggle-fullscreen", { detail: { source: "aurora", at: Date.now() } }),
    );
    return ok("Alterné la pantalla completa.");
  } catch {
    return fail("No pude cambiar la pantalla completa.");
  }
}
