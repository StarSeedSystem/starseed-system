"use client";

/**
 * StarSeed OS — Preferencia de VISIBILIDAD del botón de Guía flotante.
 * ============================================================================
 * El botón "Guía" (acceso flotante abajo-izquierda de `AuroraGuide`) aparece por
 * defecto en todas las páginas para reabrir el tour de bienvenida. Algunas
 * cuentas prefieren ocultarlo una vez que conocen el sistema. Esta preferencia
 * LOCAL (por dispositivo — es una elección de esta pantalla, no de identidad,
 * mismo criterio que `avatar-config.ts` y `sync-providers.ts`) controla si el
 * botón se muestra.
 *
 *   · Default: OCULTO (false) — Adenda 188: la guía corre sola al terminar el
 *     wizard de cuentas nuevas y se reproduce desde Ajustes cuando se quiera.
 *   · Se conmuta desde Ajustes → Personalización (interruptor "Botón de guía").
 *   · `AuroraGuide` lo LEE y se resuscribe: el cambio se aplica en vivo, en
 *     todas las rutas, sin recargar.
 *
 * SSR-safe y defensivo: todo acceso a window/localStorage está protegido; ante
 * cualquier error degrada al valor por defecto sin lanzar. Mismo patrón exacto
 * que `getAvatarConfig`/`setAvatarConfig`/`subscribeAvatarConfig`.
 */

export const GUIDE_BUTTON_VISIBLE_KEY = "starseed.guide.button.visible.v1";
/** Evento interno (mismo tab) emitido al cambiar la preferencia. */
export const GUIDE_BUTTON_VISIBLE_EVENT = "starseed:guide-button-visible";

/** Por defecto el botón de guía está VISIBLE. */
// Adenda 188: OCULTO por defecto — la guía corre sola al crear la cuenta
// (final del wizard) y puede reproducirse desde Ajustes → Personalización.
export const DEFAULT_GUIDE_BUTTON_VISIBLE = false;

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Lee si el botón de guía debe mostrarse (default: true). NUNCA lanza. */
export function getGuideButtonVisible(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return DEFAULT_GUIDE_BUTTON_VISIBLE;
  try {
    const raw = ls.getItem(GUIDE_BUTTON_VISIBLE_KEY);
    if (raw === null) return DEFAULT_GUIDE_BUTTON_VISIBLE;
    // Solo "0" oculta; cualquier otro valor (incl. legado) mantiene visible.
    return raw !== "0";
  } catch {
    return DEFAULT_GUIDE_BUTTON_VISIBLE;
  }
}

/** Escribe la preferencia y notifica al tab (y a otras pestañas). NUNCA lanza. */
export function setGuideButtonVisible(visible: boolean): void {
  const ls = safeLocalStorage();
  if (ls) {
    try {
      ls.setItem(GUIDE_BUTTON_VISIBLE_KEY, visible ? "1" : "0");
    } catch {
      /* cuota/modo privado: degrada en silencio */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(GUIDE_BUTTON_VISIBLE_EVENT));
    } catch {
      /* fail-open */
    }
  }
}

/** Suscribe a cambios de la preferencia (mismo tab + otras pestañas). */
export function subscribeGuideButtonVisible(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === GUIDE_BUTTON_VISIBLE_KEY) cb();
  };
  try {
    window.addEventListener(GUIDE_BUTTON_VISIBLE_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
  } catch {
    /* */
  }
  return () => {
    try {
      window.removeEventListener(GUIDE_BUTTON_VISIBLE_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    } catch {
      /* */
    }
  };
}
