// ════════════════════════════════════════════════════════════════
// Aurora · Control de Pantalla — Overlay de insignias (SIN React)
// ----------------------------------------------------------------
// Capa imperativa (document.createElement sobre <body>) que pinta
// insignias numeradas estilo "glass" (borde ámbar #FFBF00, el color
// Logic/Solar Amber del sistema Trinity) junto a cada elemento
// enumerado por el escáner, y un highlight suave sobre el elemento
// seleccionado. No captura ratón (pointer-events: none) y vive en
// z-index 300, por encima del OS pero sin robar interacción.
//
// API: showBadges(items) · highlight(el) · hide().
// Las insignias se auto-ocultan a los 12 s y se reposicionan al hacer
// scroll/resize (rAF). El highlight se desvanece solo (~1.6 s).
//
// SSR-safe: nada toca window/document a nivel de módulo; toda función
// es no-op fuera del navegador. Defensivo: nada lanza.
// ════════════════════════════════════════════════════════════════

/** Id del nodo raíz del overlay (el escáner lo excluye por este id). */
export const SCREEN_OVERLAY_ID = "aurora-screen-overlay";

/** Ámbar Solar (nodo Logic del sistema Trinity). */
const AMBER = "#FFBF00";

/** Auto-ocultado de las insignias. */
const AUTO_HIDE_MS = 12000;

/** Duración por defecto del highlight del elemento seleccionado. */
const HIGHLIGHT_MS = 1600;

interface BadgeInput {
  /** Número a mostrar (id efímero del escáner). */
  id: number;
  /** Elemento al que acompaña la insignia. */
  el: HTMLElement;
  /** Etiqueta legible (opcional, solo informativa). */
  label?: string;
}

interface TrackedBadge {
  el: HTMLElement;
  badge: HTMLDivElement;
}

// Estado del overlay (módulo singleton; solo existe en el navegador).
let rootEl: HTMLDivElement | null = null;
let tracked: TrackedBadge[] = [];
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let rafId = 0;
let listening = false;

// ── Base ────────────────────────────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Crea (o recupera) el nodo raíz fijo del overlay. */
function ensureRoot(): HTMLDivElement | null {
  if (!isClient() || !document.body) return null;
  if (rootEl && rootEl.isConnected) return rootEl;
  try {
    const existing = document.getElementById(SCREEN_OVERLAY_ID);
    if (existing instanceof HTMLDivElement) {
      rootEl = existing;
      return rootEl;
    }
    const div = document.createElement("div");
    div.id = SCREEN_OVERLAY_ID;
    div.setAttribute("data-aurora-screen-overlay", "true");
    div.setAttribute("aria-hidden", "true");
    const s = div.style;
    s.position = "fixed";
    s.top = "0";
    s.right = "0";
    s.bottom = "0";
    s.left = "0";
    s.zIndex = "300";
    s.pointerEvents = "none";
    document.body.appendChild(div);
    rootEl = div;
    return rootEl;
  } catch {
    return null;
  }
}

/** Estilo "glass" de una insignia numerada (borde ámbar Trinity/Logic). */
function styleBadge(b: HTMLDivElement): void {
  const s = b.style;
  s.position = "fixed";
  s.minWidth = "20px";
  s.height = "20px";
  s.padding = "0 6px";
  s.display = "flex";
  s.alignItems = "center";
  s.justifyContent = "center";
  s.borderRadius = "999px";
  s.border = `1px solid ${AMBER}`;
  s.background = "rgba(10, 14, 24, 0.78)";
  s.setProperty("backdrop-filter", "blur(8px) saturate(140%)");
  s.setProperty("-webkit-backdrop-filter", "blur(8px) saturate(140%)");
  s.color = "#FFE9B8";
  s.font = "600 12px/1 ui-sans-serif, system-ui, sans-serif";
  s.letterSpacing = "0.02em";
  s.boxShadow = "0 0 10px rgba(255,191,0,0.35), 0 2px 8px rgba(0,0,0,0.5)";
  s.pointerEvents = "none";
  s.userSelect = "none";
}

/** Recoloca una insignia junto a su elemento (o la esconde si se fue). */
function positionBadge(t: TrackedBadge): void {
  let r: DOMRect;
  try {
    if (!t.el.isConnected) {
      t.badge.style.display = "none";
      return;
    }
    r = t.el.getBoundingClientRect();
  } catch {
    t.badge.style.display = "none";
    return;
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  if (!visible) {
    t.badge.style.display = "none";
    return;
  }
  t.badge.style.display = "flex";
  // Esquina superior-izquierda del elemento, ligeramente superpuesta.
  t.badge.style.top = `${Math.round(clamp(r.top - 9, 2, vh - 24))}px`;
  t.badge.style.left = `${Math.round(clamp(r.left - 9, 2, vw - 28))}px`;
}

function repositionAll(): void {
  for (const t of tracked) positionBadge(t);
}

function onViewportChange(): void {
  if (!isClient() || rafId) return;
  try {
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      repositionAll();
    });
  } catch {
    rafId = 0;
    repositionAll();
  }
}

function attachListeners(): void {
  if (!isClient() || listening) return;
  try {
    // capture:true para enterarnos también del scroll de contenedores internos.
    window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange, { passive: true });
    listening = true;
  } catch { /* noop */ }
}

function detachListeners(): void {
  if (!isClient() || !listening) return;
  try {
    window.removeEventListener("scroll", onViewportChange, { capture: true } as EventListenerOptions);
    window.removeEventListener("resize", onViewportChange);
  } catch { /* noop */ }
  listening = false;
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Muestra insignias numeradas junto a cada elemento. Sustituye a las
 * anteriores y reinicia el temporizador de auto-ocultado (12 s).
 */
export function showBadges(items: BadgeInput[], opts?: { autoHideMs?: number }): void {
  const root = ensureRoot();
  if (!root) return;
  try {
    hide(); // limpia insignias/timers previos (los highlights se autogestionan)
    for (const it of items) {
      if (!it || !it.el) continue;
      const b = document.createElement("div");
      styleBadge(b);
      b.textContent = String(it.id);
      if (it.label) b.setAttribute("data-label", it.label);
      root.appendChild(b);
      tracked.push({ el: it.el, badge: b });
    }
    repositionAll();
    attachListeners();
    const ms = Math.max(1000, opts?.autoHideMs ?? AUTO_HIDE_MS);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hide(), ms);
  } catch { /* noop */ }
}

/**
 * Resalta el elemento seleccionado con un marco ámbar que se desvanece
 * solo. Independiente de las insignias (puede usarse sin showBadges).
 */
export function highlight(el: HTMLElement, ms = HIGHLIGHT_MS): void {
  const root = ensureRoot();
  if (!root || !el) return;
  try {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    const box = document.createElement("div");
    const s = box.style;
    s.position = "fixed";
    s.top = `${Math.round(r.top - 3)}px`;
    s.left = `${Math.round(r.left - 3)}px`;
    s.width = `${Math.round(r.width + 6)}px`;
    s.height = `${Math.round(r.height + 6)}px`;
    s.border = `2px solid ${AMBER}`;
    s.borderRadius = "12px";
    s.boxShadow = "0 0 0 4px rgba(255,191,0,0.16), 0 0 22px rgba(255,191,0,0.45)";
    s.pointerEvents = "none";
    s.opacity = "1";
    s.transition = "opacity 320ms ease";
    box.setAttribute("data-aurora-screen-highlight", "true");
    root.appendChild(box);
    setTimeout(() => {
      try {
        box.style.opacity = "0";
        setTimeout(() => {
          try { box.remove(); } catch { /* noop */ }
        }, 360);
      } catch { /* noop */ }
    }, Math.max(200, ms));
  } catch { /* noop */ }
}

/** Oculta las insignias numeradas (timers y listeners incluidos). */
export function hide(): void {
  if (hideTimer) {
    try { clearTimeout(hideTimer); } catch { /* noop */ }
    hideTimer = null;
  }
  if (rafId && isClient()) {
    try { window.cancelAnimationFrame(rafId); } catch { /* noop */ }
    rafId = 0;
  }
  detachListeners();
  for (const t of tracked) {
    try { t.badge.remove(); } catch { /* noop */ }
  }
  tracked = [];
}

/** Alias explícito de hide() (por legibilidad en llamadores). */
export function hideBadges(): void {
  hide();
}

/** ¿Hay insignias visibles ahora mismo? */
export function isShowingBadges(): boolean {
  return tracked.length > 0;
}
