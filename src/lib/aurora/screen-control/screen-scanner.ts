// ════════════════════════════════════════════════════════════════
// Aurora · Control de Pantalla — Escáner del viewport
// ----------------------------------------------------------------
// Enumera los elementos interactivos VISIBLES de la pantalla (botones,
// enlaces, pestañas, campos…) y les asigna ids numéricos EFÍMEROS
// (1..n, válidos solo hasta el siguiente escaneo). Así el usuario puede
// "pulsarlos por voz": «ver pantalla» → «pulsa el 3» / «pulsa Publicar».
//
// Reglas:
// • Selección: button, a[href], [role=button|tab|link|menuitem],
//   input/select/textarea y [data-aurora-target] (gancho explícito).
// • Etiqueta legible: aria-label > texto corto > title > alt (y para
//   campos: label asociada > placeholder > name).
// • Exclusión: el orbe/overlays de Aurora y nuestro propio overlay de
//   insignias (además, cualquier superficie marcada [data-aurora-exclude]).
// • Orden visual: por filas (arriba→abajo) y dentro de la fila izq→der.
//
// SSR-safe: ningún acceso a window/document a nivel de módulo; fuera del
// navegador todo devuelve vacío. Defensivo: nada lanza.
// ════════════════════════════════════════════════════════════════

/** Tipo funcional del elemento (para hablar de él en español). */
export type ScreenElementKind =
  | "boton"
  | "enlace"
  | "pestana"
  | "menu"
  | "campo"
  | "selector"
  | "control";

/** Rectángulo del elemento en coordenadas del viewport (instantánea). */
export interface ScreenRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Un elemento interactivo enumerado (id efímero del último escaneo). */
export interface ScreenElement {
  /** Id numérico efímero (1..n), válido hasta el siguiente escaneo. */
  id: number;
  /** Etiqueta legible para decirla/oírla ("Publicar", "Perfil"…). */
  label: string;
  /** Tipo funcional (botón, enlace, campo…). */
  kind: ScreenElementKind;
  /** Referencia VIVA al nodo (no serializar; puede desconectarse). */
  el: HTMLElement;
  /** Posición en el viewport en el momento del escaneo. */
  rect: ScreenRect;
}

/** Selector de elementos interactivos que Aurora puede "pulsar". */
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="tab"]',
  '[role="link"]',
  '[role="menuitem"]',
  "input",
  "select",
  "textarea",
  "[data-aurora-target]",
].join(", ");

/**
 * Superficies de la propia Aurora que NUNCA se enumeran: el orbe flotante
 * (aria-label="Aurora" + data-aurora-state), nuestro overlay de insignias
 * y cualquier superficie que se marque con [data-aurora-exclude].
 */
export const AURORA_EXCLUDE_SELECTOR = [
  "#aurora-screen-overlay",
  "[data-aurora-screen-overlay]",
  '[aria-label="Aurora"]',
  "[data-aurora-state]",
  "[data-aurora-exclude]",
].join(", ");

/** Tope duro de elementos por escaneo (evita saturar voz y pantalla). */
const MAX_ELEMENTS = 80;
/** Tamaño mínimo en px para considerar un elemento "visible de verdad". */
const MIN_SIZE_PX = 6;
/** Longitud máxima de una etiqueta hablada. */
const MAX_LABEL_LEN = 42;

// ── Utilidades ──────────────────────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function cleanText(s: string | null | undefined, max = MAX_LABEL_LEN): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function isDisabled(el: HTMLElement): boolean {
  try {
    if ((el as HTMLButtonElement).disabled === true) return true;
    if (el.getAttribute("aria-disabled") === "true") return true;
  } catch { /* noop */ }
  return false;
}

/** Clasifica el elemento para poder hablar de él ("campo", "enlace"…). */
function kindOf(el: HTMLElement): ScreenElementKind {
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (el instanceof HTMLTextAreaElement) return "campo";
  if (el instanceof HTMLSelectElement) return "selector";
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase();
    if (t === "button" || t === "submit" || t === "reset" || t === "image") return "boton";
    if (t === "checkbox" || t === "radio" || t === "range") return "control";
    return "campo";
  }
  if (role === "tab") return "pestana";
  if (role === "menuitem") return "menu";
  if (el instanceof HTMLAnchorElement || role === "link") return "enlace";
  return "boton";
}

/** ¿Es un campo donde se escribe/elige (no un clicable simple)? */
function isFieldKind(kind: ScreenElementKind): boolean {
  return kind === "campo" || kind === "selector" || kind === "control";
}

/**
 * Etiqueta legible del elemento, en orden de preferencia:
 * aria-label > (campos: label asociada > placeholder > name) >
 * innerText corto > title > alt de imagen interior > respaldo por tipo.
 */
function labelFor(el: HTMLElement, kind: ScreenElementKind): string {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return cleanText(aria);

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    try {
      const lab = el.labels && el.labels.length > 0 ? el.labels[0].innerText : "";
      if (lab && lab.trim()) return cleanText(lab);
    } catch { /* noop */ }
    const ph = el.getAttribute("placeholder");
    if (ph && ph.trim()) return cleanText(ph);
    const nm = el.getAttribute("name");
    if (nm && nm.trim()) return cleanText(nm.replace(/[_-]+/g, " "));
  }

  let text = "";
  try {
    text = cleanText((el as HTMLElement).innerText || el.textContent || "");
  } catch { /* noop */ }
  if (text) return text;

  const title = el.getAttribute("title");
  if (title && title.trim()) return cleanText(title);

  try {
    const alt = el.querySelector("img[alt]")?.getAttribute("alt");
    if (alt && alt.trim()) return cleanText(alt);
  } catch { /* noop */ }

  // Enlaces sin texto: último tramo legible de la URL.
  if (el instanceof HTMLAnchorElement && el.href) {
    try {
      const u = new URL(el.href, window.location.href);
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) return cleanText(decodeURIComponent(last).replace(/[-_]+/g, " "));
    } catch { /* noop */ }
  }

  if (kind === "campo") return "campo de texto";
  if (kind === "selector") return "selector";
  if (kind === "enlace") return "enlace";
  return "botón";
}

// ── Visibilidad ─────────────────────────────────────────────────────────────

function isInViewport(rect: DOMRect, vw: number, vh: number): boolean {
  if (rect.width < MIN_SIZE_PX || rect.height < MIN_SIZE_PX) return false;
  return rect.bottom > 2 && rect.right > 2 && rect.top < vh - 2 && rect.left < vw - 2;
}

function isRendered(el: HTMLElement): boolean {
  try {
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (st.pointerEvents === "none") return false; // no clicable → no se enumera
    if (Number(st.opacity || "1") < 0.05) return false;
  } catch {
    return false;
  }
  try {
    if (el.closest('[aria-hidden="true"]')) return false;
  } catch { /* noop */ }
  return true;
}

/**
 * ¿El elemento está realmente "encima" (no tapado por otro overlay)?
 * Nuestro overlay de insignias tiene pointer-events:none, así que
 * elementFromPoint lo ignora y no interfiere.
 */
function isOnTop(el: HTMLElement, rect: DOMRect, vw: number, vh: number): boolean {
  const cx = clamp(rect.left + rect.width / 2, 1, vw - 1);
  const cy = clamp(rect.top + rect.height / 2, 1, vh - 1);
  let hit: Element | null = null;
  try {
    hit = document.elementFromPoint(cx, cy);
  } catch {
    return true; // sin datos → no descartamos
  }
  if (!hit) return false;
  if (hit === el || el.contains(hit) || hit.contains(el)) return true;
  // Campo dentro de una <label> que recibe el punto: cuenta como visible.
  try {
    const lab = hit.closest("label");
    if (lab && lab.contains(el)) return true;
  } catch { /* noop */ }
  return false;
}

// ── Escaneo ─────────────────────────────────────────────────────────────────

let lastScan: { at: number; items: ScreenElement[] } | null = null;

/**
 * Escanea el viewport y devuelve los elementos interactivos visibles con
 * ids efímeros 1..n en orden visual. Guarda el resultado como "último
 * escaneo" para resolver «pulsa el 3» después.
 */
export function scanScreen(): ScreenElement[] {
  if (!isClient()) return [];
  try {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
    const found: Array<Omit<ScreenElement, "id">> = [];
    const acceptedClickables: HTMLElement[] = [];

    for (const el of nodes) {
      if (found.length >= MAX_ELEMENTS) break;
      try {
        if (el.closest(AURORA_EXCLUDE_SELECTOR)) continue;
        if (el instanceof HTMLInputElement && (el.type || "").toLowerCase() === "hidden") continue;
        if (isDisabled(el)) continue;

        const rect = el.getBoundingClientRect();
        if (!isInViewport(rect, vw, vh)) continue;
        if (!isRendered(el)) continue;

        const kind = kindOf(el);
        // Anidados: si un clicable ya aceptado lo contiene, es el mismo
        // control (icono/botón dentro de un enlace). Los campos sí se
        // conservan aunque estén envueltos (para escribir_en).
        if (!isFieldKind(kind) && acceptedClickables.some((a) => a.contains(el))) continue;
        if (!isOnTop(el, rect, vw, vh)) continue;

        found.push({
          el,
          kind,
          label: labelFor(el, kind),
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        });
        if (!isFieldKind(kind)) acceptedClickables.push(el);
      } catch { /* elemento raro → lo saltamos */ }
    }

    // Orden visual: filas de ~32px (arriba→abajo), luego izquierda→derecha.
    found.sort((a, b) => {
      const ra = Math.round(a.rect.top / 32);
      const rb = Math.round(b.rect.top / 32);
      return ra !== rb ? ra - rb : a.rect.left - b.rect.left;
    });

    const items: ScreenElement[] = found.map((f, i) => ({ id: i + 1, ...f }));
    lastScan = { at: Date.now(), items };
    return items;
  } catch {
    return [];
  }
}

/** Elementos del último escaneo que siguen conectados al DOM ([] si no hay). */
export function getLastScan(): ScreenElement[] {
  if (!lastScan) return [];
  return lastScan.items.filter((i) => {
    try {
      return i.el.isConnected;
    } catch {
      return false;
    }
  });
}

/** Momento (epoch ms) del último escaneo, 0 si nunca se escaneó. */
export function getLastScanAt(): number {
  return lastScan?.at ?? 0;
}

/** Busca por id efímero en el último escaneo (null si no existe o se fue). */
export function findByNumber(numero: number): ScreenElement | null {
  const n = Math.trunc(numero);
  if (!Number.isFinite(n) || n <= 0) return null;
  const item = lastScan?.items.find((i) => i.id === n) ?? null;
  if (!item) return null;
  try {
    if (!item.el.isConnected) return null;
  } catch {
    return null;
  }
  return item;
}

/** Lista corta y decible: «1 Publicar · 2 Perfil · 3 Red · y 12 más». */
export function formatScanSummary(items: ScreenElement[], max = 10): string {
  const head = items.slice(0, max).map((i) => `${i.id} ${i.label}`).join(" · ");
  const rest = items.length - Math.min(items.length, max);
  return rest > 0 ? `${head} · y ${rest} más` : head;
}
