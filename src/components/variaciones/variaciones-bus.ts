/**
 * StarSeed OS — Bus de la VENTANA de VARIACIONES PÚBLICAS (Ola 1019V)
 * Módulo PURO: sin "use client", sin JSX, sin hooks — solo tipos, constantes
 * y funciones. SOP: architecture/variaciones-publicas.md
 */

/** Nombre del evento del bus (una sola constante, para que nadie lo escriba a mano dos veces distinto). */
export const VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT = "starseed:variaciones-publicas-open-window";

/** Tabs internos de la ventana de variaciones públicas: Variaciones · Notas · Repos externos · Fuentes y versiones. */
export const VARIACIONES_PUBLICAS_WINDOW_TABS = ["variaciones", "notas", "repos", "fuentes"] as const;

export type VariacionesPublicasWindowTab = (typeof VARIACIONES_PUBLICAS_WINDOW_TABS)[number];

/** ¿Es `v` una pestaña válida de la ventana de variaciones públicas? */
export function isVariacionesPublicasWindowTab(v: unknown): v is VariacionesPublicasWindowTab {
  return typeof v === "string" && (VARIACIONES_PUBLICAS_WINDOW_TABS as readonly string[]).includes(v);
}

/**
 * Clave canónica del elemento: `<familia>:<id>[#<parte>]`, por ejemplo
 * `widget:clima`, `tema:synthwave-horizon`, `fondo:aurora`,
 * `ajuste:apariencia.radio`, `app:notas`, `dock:genesis`, `escritorio:icono`,
 * `herramienta:photocraft`, `atomo:video-html`, `post:<id>#estilo`,
 * `mensaje:editor`, `menu:trinity-fab`, `boton:publicar`.
 * Se valida que siga el formato: no vacío, contiene exactamente dos puntos? 
 * En realidad, el formato es <familia>:<id>[#<parte>], donde familia e id no están vacíos,
 * y si está presente la parte después de #, tampoco está vacía.
 */
export function isVariacionesPublicasClave(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;

  // Separar por '#' para manejar la parte opcional
  const hashSplit = v.split("#");
  if (hashSplit.length > 2) {
    // Más de un '#' no está permitido
    return false;
  }
  const base = hashSplit[0];
  const parte = hashSplit[1]; // puede estar undefined o vacío

  // El base debe contener exactamente un ':' y ambas partes no vacías
  const colonSplit = base.split(":");
  if (colonSplit.length !== 2) return false;
  const familia = colonSplit[0];
  const id = colonSplit[1];

  return familia.length > 0 && id.length > 0 && (parte === undefined || parte.length > 0);
}

/**
 * Detalle de la apertura de la ventana de variaciones públicas.
 */
export interface VariacionesPublicasWindowDetail {
  /** Clave canónica del elemento (validada por `isVariacionesPublicasClave`). */
  clave: string;
  /** Pestaña con la que abrir (por defecto "variaciones"). */
  tab?: VariacionesPublicasWindowTab;
}

/**
 * Despacha la apertura de la ventana de variaciones públicas para un elemento.
 * Lo puede llamar cualquier superficie del OS (orbe, Exocórtex, notificaciones,
 * pestañas del Studio) sin acoplarse al componente que la monta.
 * SSR-safe, nunca lanza.
 */
export function openVariacionesPublicasWindow(detail: VariacionesPublicasWindowDetail): void {
  if (typeof window === "undefined") return;
  try {
    // Validamos la clave y la tab (si se proporciona) para evitar eventos malformados.
    if (!isVariacionesPublicasClave(detail.clave)) {
      console.error("[VariacionesBus] Clave no válida:", detail.clave);
      return;
    }
    if (detail.tab !== undefined && !isVariacionesPublicasWindowTab(detail.tab)) {
      console.error("[VariacionesBus] Tab no válida:", detail.tab);
      return;
    }
    window.dispatchEvent(new CustomEvent<VariacionesPublicasWindowDetail>(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT, { detail }));
  } catch {
    /* defensivo */
  }
}

/**
 * Suscribe un callback a las aperturas de la ventana de variaciones públicas.
 * Devuelve la función de baja. SSR-safe (no-op en servidor).
 */
export function subscribeVariacionesPublicasWindow(cb: (detail: VariacionesPublicasWindowDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onOpen = (e: Event) => {
    const d = (e as CustomEvent<VariacionesPublicasWindowDetail>).detail;
    if (
      d &&
      isVariacionesPublicasClave(d.clave) &&
      (d.tab === undefined || isVariacionesPublicasWindowTab(d.tab))
    ) {
      cb(d);
    }
  };
  window.addEventListener(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT, onOpen);
  return () => window.removeEventListener(VARIACIONES_PUBLICAS_WINDOW_OPEN_EVENT, onOpen);
}

/**
 * URL de la página completa de una entidad — enlazable y compartible.
 * `/agent/variaciones/<clave>?tab=<tab>` (sin `tab` si no se pide uno).
 * Nota: La clave se codifica dos veces? Pero la clave ya tiene dos puntos y almohadillas, así que usamos encodeURIComponent.
 */
export function variacionesPublicasWindowHref(clave: string, tab?: VariacionesPublicasWindowTab): string {
  if (!isVariacionesPublicasClave(clave)) {
    throw new Error("[variacionesPublicasWindowHref] Clave no válida: " + clave);
  }
  const base = `/agent/variaciones/${encodeURIComponent(clave)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}