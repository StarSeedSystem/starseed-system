// src/lib/dock/eventos-dock.ts
/**
 * EVENTOS DEL DOCK — el punto de entrada del diseño de iconos (Ola 1025U · V1a → V1b).
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ: dos eventos de `window` que el menú de un icono emite y que el diseñador de
 * iconos (V1b) escucha:
 *   · `starseed:dock-diseno-icono`  { itemId }  → «Cambiar diseño de este icono»
 *   · `starseed:dock-plantillas`    {}          → «Plantillas de iconos del perfil»
 * POR QUÉ: el menú no sabe (ni debe saber) cómo se diseña un icono. Pero tampoco
 * puede prometer algo que nadie atiende: si no hay oyente, el menú dice «Próximamente».
 *
 * CÓMO SABER SI ALGUIEN LO ATIENDE: los eventos son cancelables y llevan
 * `detail.atender()`. Quien los reciba y abra su panel DEBE hacer una de las dos
 * cosas (con una basta): `event.preventDefault()` o `event.detail.atender()`.
 * Lo más cómodo es `escucharDisenoIcono` / `escucharPlantillas`, que lo hacen solos.
 */

export const EVENTO_DISENO_ICONO = "starseed:dock-diseno-icono";
export const EVENTO_PLANTILLAS = "starseed:dock-plantillas";

export interface DetalleDisenoIcono {
  itemId: string;
  /** Quien abre el diseñador lo llama para decir «yo me ocupo». */
  atender: () => void;
}
export interface DetallePlantillas {
  atender: () => void;
}

function emitir<T extends { atender: () => void }>(nombre: string, resto: Omit<T, "atender">): boolean {
  if (typeof window === "undefined") return false;
  let atendido = false;
  const detail = { ...resto, atender: () => { atendido = true; } } as T;
  try {
    const noCancelado = window.dispatchEvent(new CustomEvent(nombre, { detail, cancelable: true }));
    if (!noCancelado) atendido = true;
  } catch {
    return false;
  }
  return atendido;
}

/** Pide abrir el diseñador del icono. Devuelve true si alguien lo atendió. */
export function pedirDisenoIcono(itemId: string): boolean {
  return emitir<DetalleDisenoIcono>(EVENTO_DISENO_ICONO, { itemId });
}

/** Pide abrir las plantillas de iconos del perfil. Devuelve true si alguien lo atendió. */
export function pedirPlantillas(): boolean {
  return emitir<DetallePlantillas>(EVENTO_PLANTILLAS, {});
}

/** Para V1b: escucha la petición de diseñar un icono y la da por atendida sola. */
export function escucharDisenoIcono(alPedir: (itemId: string) => void): () => void {
  const oyente = (e: Event) => {
    const d = (e as CustomEvent<DetalleDisenoIcono>).detail;
    if (!d || typeof d.itemId !== "string") return;
    e.preventDefault();
    d.atender?.();
    alPedir(d.itemId);
  };
  window.addEventListener(EVENTO_DISENO_ICONO, oyente);
  return () => window.removeEventListener(EVENTO_DISENO_ICONO, oyente);
}

/** Para V1b: escucha la petición de abrir las plantillas y la da por atendida sola. */
export function escucharPlantillas(alPedir: () => void): () => void {
  const oyente = (e: Event) => {
    e.preventDefault();
    (e as CustomEvent<DetallePlantillas>).detail?.atender?.();
    alPedir();
  };
  window.addEventListener(EVENTO_PLANTILLAS, oyente);
  return () => window.removeEventListener(EVENTO_PLANTILLAS, oyente);
}
