/**
 * StarSeed OS — ACCESIBILIDAD: carga + aplicación (Adenda 118).
 * ============================================================================
 * Lógica compartida extraída del panel de Ajustes → Apariencia → Accesibilidad
 * para que los ajustes se apliquen EN EL ARRANQUE (no solo al abrir el panel):
 * contraste, movimiento reducido, texto grande, daltonismo, tamaño de diana
 * (WCAG 2.5.5), subrayado de enlaces y anillo de foco valen desde el primer
 * render y en cada recarga. Persiste en localStorage independiente para
 * sobrevivir a cambios de tema. SSR-safe; nunca lanza.
 *
 * Principio constitucional de inclusión: la libertad estética no puede ir en
 * contra de la libertad de uso.
 */

export const A11Y_STORAGE_KEY = "starseed.a11y.settings";

export interface A11ySettings {
  highContrast: boolean;
  reduceMotion: "auto" | "always" | "never";
  largeText: number; // multiplicador 0.9..1.5
  cursorSize: "default" | "large" | "huge";
  colorBlindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";
  focusRingIntensity: number; // 0..3
  targetSize: "comfortable" | "large" | "huge"; // WCAG 2.5.5
  underlineLinks: boolean;
  pauseAnimations: boolean;
}

export const DEFAULT_A11Y: A11ySettings = {
  highContrast: false,
  reduceMotion: "auto",
  largeText: 1,
  cursorSize: "default",
  colorBlindMode: "none",
  focusRingIntensity: 1,
  targetSize: "comfortable",
  underlineLinks: false,
  pauseAnimations: false,
};

export function loadA11ySettings(): A11ySettings {
  if (typeof window === "undefined") return DEFAULT_A11Y;
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y;
    return { ...DEFAULT_A11Y, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_A11Y;
  }
}

export function saveA11ySettings(s: A11ySettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* cuota/entorno: best-effort */
  }
}

export function applyA11yToDocument(s: A11ySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // High contrast
  root.classList.toggle("a11y-high-contrast", s.highContrast);

  // Reduce motion
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const reduceNow = s.reduceMotion === "always" || (s.reduceMotion === "auto" && prefersReduced);
  root.classList.toggle("a11y-reduce-motion", reduceNow);

  // Pause all animations entirely
  root.classList.toggle("a11y-pause-animations", s.pauseAnimations);

  // Large text scale
  root.style.setProperty("--a11y-text-scale", String(s.largeText));

  // Cursor size (svg-based or class-based)
  root.classList.remove("a11y-cursor-large", "a11y-cursor-huge");
  if (s.cursorSize === "large") root.classList.add("a11y-cursor-large");
  if (s.cursorSize === "huge") root.classList.add("a11y-cursor-huge");

  // Color-blind filter (SVG filter applied to body)
  root.classList.remove(
    "a11y-cb-protanopia",
    "a11y-cb-deuteranopia",
    "a11y-cb-tritanopia",
    "a11y-cb-achromatopsia",
  );
  if (s.colorBlindMode !== "none") root.classList.add(`a11y-cb-${s.colorBlindMode}`);

  // Focus ring
  root.style.setProperty("--a11y-focus-ring", String(s.focusRingIntensity));

  // Touch target size
  root.classList.remove("a11y-target-large", "a11y-target-huge");
  if (s.targetSize === "large") root.classList.add("a11y-target-large");
  if (s.targetSize === "huge") root.classList.add("a11y-target-huge");

  // Underline links
  root.classList.toggle("a11y-underline-links", s.underlineLinks);
}

/** Inyecta estilos CSS globales que usan las clases a11y- en <html>. Idempotente. */
export function injectGlobalA11yStyles() {
  if (typeof document === "undefined") return;
  const id = "starseed-a11y-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    :root { --a11y-text-scale: 1; --a11y-focus-ring: 1; }

    /* Alto contraste */
    html.a11y-high-contrast {
      filter: contrast(1.18);
    }
    html.a11y-high-contrast :where(p, span, h1, h2, h3, h4, label, a, button) {
      color: white !important;
      text-shadow: 0 0 1px rgba(0,0,0,0.45);
    }

    /* Reducir movimiento */
    html.a11y-reduce-motion *,
    html.a11y-reduce-motion *::before,
    html.a11y-reduce-motion *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.05ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }

    /* Pausar animaciones (más agresivo) */
    html.a11y-pause-animations *,
    html.a11y-pause-animations *::before,
    html.a11y-pause-animations *::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
    html.a11y-pause-animations canvas {
      animation-play-state: paused !important;
    }

    /* Tamaño de texto */
    html { font-size: calc(16px * var(--a11y-text-scale, 1)); }

    /* Tamaño táctil mínimo (WCAG 2.5.5 · ampliado en la Adenda 149).
       Ahora cubre TAMBIÉN los <select> nativos y las pestañas (role="tab"),
       que quedaban fuera en todo el OS. Los INTERRUPTORES (role="switch", que
       Radix pinta como <button role="switch">) se EXCLUYEN de min-height: la
       pista mide 24px y estirarla a 44/60px deja el thumb flotando en una
       cápsula deformada; en su lugar crecen con transform: scale(), que
       agranda la diana real sin tocar la geometría interna ni el layout de la
       fila (transform no reserva espacio). Escala moderada a propósito. */
    html.a11y-target-large :where(button, [role="button"], a, select, [role="tab"]):not([role="switch"]) {
      min-height: 44px; min-width: 44px;
    }
    html.a11y-target-huge :where(button, [role="button"], a, select, [role="tab"]):not([role="switch"]) {
      min-height: 60px; min-width: 60px;
    }
    html.a11y-target-large [role="switch"] { transform: scale(1.15); transform-origin: center; }
    html.a11y-target-huge [role="switch"] { transform: scale(1.3); transform-origin: center; }

    /* Subrayar enlaces */
    html.a11y-underline-links a { text-decoration: underline !important; text-underline-offset: 2px; }

    /* Cursor */
    html.a11y-cursor-large body { cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><polygon points='4,4 4,28 12,21 17,30 21,28 16,19 24,19' fill='white' stroke='black' stroke-width='2'/></svg>") 4 4, auto; }
    html.a11y-cursor-huge body { cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 32 32'><polygon points='4,4 4,28 12,21 17,30 21,28 16,19 24,19' fill='white' stroke='black' stroke-width='2'/></svg>") 6 6, auto; }

    /* Anillo de foco */
    html :focus-visible {
      outline: calc(var(--a11y-focus-ring, 1) * 2px) solid hsl(var(--ring, 215 100% 60%)) !important;
      outline-offset: 2px !important;
    }
    html[style*="--a11y-focus-ring: 0"] :focus-visible { outline: revert !important; }

    /* Daltonismo — filtros inline para no requerir SVG externo */
    html.a11y-cb-protanopia body { filter: url(#cb-protanopia); }
    html.a11y-cb-deuteranopia body { filter: url(#cb-deuteranopia); }
    html.a11y-cb-tritanopia body { filter: url(#cb-tritanopia); }
    html.a11y-cb-achromatopsia body { filter: grayscale(1); }
  `;
  document.head.appendChild(style);

  // SVG con filtros para daltonismo (matrices estándar)
  const svgId = "starseed-a11y-svg";
  if (!document.getElementById(svgId)) {
    const svgWrap = document.createElement("div");
    svgWrap.style.position = "absolute";
    svgWrap.style.width = "0";
    svgWrap.style.height = "0";
    svgWrap.style.overflow = "hidden";
    svgWrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" id="${svgId}">
        <defs>
          <filter id="cb-protanopia">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="cb-deuteranopia">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="cb-tritanopia">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/>
          </filter>
        </defs>
      </svg>
    `;
    document.body.appendChild(svgWrap);
  }
}
