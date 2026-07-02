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
