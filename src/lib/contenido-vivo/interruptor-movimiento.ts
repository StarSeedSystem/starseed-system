/**
 * Interruptor de movimiento del contenido vivo (CVV1028, tarea D · contrato §1).
 *
 * Tres modos que mandan sobre todo el contenido vivo de una página:
 *  · apagado  — el fotograma final queda quieto, nada se mueve;
 *  · encendido — las piezas se mueven con normalidad;
 *  · rayos-x  — no se mueve nada y cada pieza muestra su etiqueta
 *              («qué es · cómo se hizo» de `data-vivo` y su herramienta de
 *              `data-vivo-herramienta`).
 *
 * El modo entra por la URL (`?movimiento=apagado|encendido|rayos-x`), se
 * respeta `prefers-reduced-motion` (fuerza «apagado», igual que
 * `prefers-reduced-motion` fuerza «quieto» en el motor de avatares) y cada
 * cambio se anuncia con el evento `contenido-vivo:modo` en `window`.
 *
 * Módulo del navegador: sin `node:*`, sin red y sin React.
 */

/** Los tres modos del interruptor. */
export type ModoVivo = "apagado" | "encendido" | "rayos-x";

/** Evento del cambio de modo, en `window`. */
export const EVENTO_MODO = "contenido-vivo:modo" as const;

/** Lo que viaja en el detalle del evento. */
export interface DetalleModo {
  modo: ModoVivo;
}

const MODOS: ModoVivo[] = ["apagado", "encendido", "rayos-x"];

/**
 * Lee el modo pedido en la URL. Sin `?movimiento` o con un valor que no es
 * uno de los tres devuelve `null`: no se inventa nada, quien decide el
 * defecto es `resolverModo`.
 */
export function modoDesdeUrl(url: string): ModoVivo | null {
  try {
    const valor = new URL(url, "https://starseed.invalid").searchParams.get("movimiento");
    return valor && (MODOS as string[]).includes(valor) ? (valor as ModoVivo) : null;
  } catch {
    return null;
  }
}

/**
 * Resuelve el modo efectivo de la página: reduce movimiento manda (siempre
 * «apagado»), luego la URL y, si nadie pidió nada, «encendido».
 */
export function resolverModo(url: string, reducirMovimiento: boolean): ModoVivo {
  return reducirMovimiento ? "apagado" : (modoDesdeUrl(url) ?? "encendido");
}

/** Si el modo pide el fotograma final quieto (solo «apagado»). */
export function modoQuieto(modo: ModoVivo): boolean {
  return modo === "apagado";
}

/** Anuncia un cambio de modo con el evento del contrato. */
export function anunciarModo(modo: ModoVivo): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(EVENTO_MODO, { detail: { modo } satisfies DetalleModo }));
}

/**
 * Lo que hay bajo cada pieza, en modo rayos-x.
 */
export interface EtiquetaViva {
  /** «Qué es · cómo se hizo», tal como lo escribió quien armó la pieza. */
  caja: string;
  /** Herramienta con la que se hizo, si la pieza la declara. */
  herramienta: string;
}

/**
 * Lee la etiqueta de una pieza: `data-vivo` es obligatorio, la herramienta
 * dentro de `data-vivo-herramienta` es opcional. Sin `data-vivo` no hay pieza
 * viva y la etiqueta es vacía.
 */
export function detallePieza(pieza: Element): EtiquetaViva {
  const caja = pieza.getAttribute("data-vivo")?.trim() ?? "";
  const herramienta = pieza.getAttribute("data-vivo-herramienta")?.trim() ?? "";
  return { caja, herramienta };
}

/** Texto que se pinta: «qué · cómo» y, si hay, la herramienta al final. */
export function textoEtiqueta(etiqueta: EtiquetaViva): string {
  const partes = [etiqueta.caja, etiqueta.herramienta].filter(Boolean);
  return partes.join(" · ");
}

/**
 * Pinta la etiqueta rayos-x sobre cada pieza con `data-vivo`. Las etiquetas
 * ya pintadas se dejan como están y `quitarRayosX` las retira.
 */
export function pintarRayosX(raiz: HTMLElement): void {
  for (const pieza of raiz.querySelectorAll("[data-vivo]")) {
    if (pieza.querySelector("[data-vivo-etiqueta]")) continue;
    const texto = textoEtiqueta(detallePieza(pieza));
    if (!texto) continue;
    const gorro = document.createElement("span");
    gorro.setAttribute("data-vivo-etiqueta", "");
    gorro.textContent = texto;
    gorro.style.cssText =
      "display:block;font:11px/1.4 system-ui,sans-serif;letter-spacing:0.02em;" +
      "opacity:0.85;margin:0.3em 0 0;pointer-events:none;";
    pieza.appendChild(gorro);
  }
}

/** Retira todas las etiquetas pintadas por `pintarRayosX`. */
export function quitarRayosX(raiz: HTMLElement): void {
  for (const gorro of Array.from(raiz.querySelectorAll("[data-vivo-etiqueta]"))) {
    gorro.remove();
  }
}
