"use client";

// src/lib/share/bridge.ts
// ─────────────────────────────────────────────────────────────────────────────
// PUENTE de interconexión de StarSeed — un bus de eventos tipado y minúsculo
// sobre `window` CustomEvents que enlaza el LIENZO (pizarra), el NAVEGADOR y el
// COMPOSITOR de publicaciones sin acoplarlos directamente.
//
// Dos canales:
//   · `starseed:attach`        → adjuntar algo (ventana / lienzo / app / archivo)
//                                a una pizarra abierta. La pizarra lo escucha y,
//                                p. ej., crea un bloque `browser` con la URL.
//   · `starseed:open-composer` → abrir el compositor de publicaciones con un
//                                `initial` prerellenado. El host (la pizarra o
//                                el navegador) escucha y monta un Dialog con
//                                <PublicationComposer initial={…}/>.
//
// SSR-SAFE: todo acceso a `window` está guardado; en el servidor son no-ops.
// Las suscripciones devuelven una función de limpieza (apta para useEffect).
// ─────────────────────────────────────────────────────────────────────────────

// Forma del `initial` que consume el compositor. Se mantiene laxa a propósito
// (estructural) para no acoplar este puente al módulo de publicación: el host
// la pasa tal cual a <PublicationComposer initial={…}/>.
export interface ComposerInitial {
  type?: string;
  format?: string;
  fromProfiles?: string[];
  destinations?: unknown[];
  content?: Record<string, unknown>;
}

// Carga útil de un adjunto. `kind` describe qué se adjunta; el resto es opcional
// según el tipo (una ventana trae `url`; un lienzo trae `canvasId`, etc.).
export interface AttachPayload {
  kind: "window" | "canvas" | "app" | "file";
  url?: string;
  canvasId?: string;
  title?: string;
  data?: Record<string, unknown>;
}

// Nombres de los eventos (exportados por si otros módulos quieren escuchar).
export const ATTACH_EVENT = "starseed:attach";
export const OPEN_COMPOSER_EVENT = "starseed:open-composer";

// ── attach ──────────────────────────────────────────────────────────────────

/** Emite un adjunto hacia cualquier pizarra/host que esté escuchando. */
export function emitAttach(payload: AttachPayload): boolean {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent<AttachPayload>(ATTACH_EVENT, { detail: payload }));
  return true;
}

/**
 * Se suscribe a los adjuntos entrantes. Devuelve una función de limpieza para
 * desuscribirse (cómodo en `useEffect`). No-op en SSR.
 */
export function onAttach(cb: (payload: AttachPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<AttachPayload>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(ATTACH_EVENT, handler as EventListener);
  return () => window.removeEventListener(ATTACH_EVENT, handler as EventListener);
}

// ── open-composer ─────────────────────────────────────────────────────────────

/** Pide abrir el compositor de publicaciones con un `initial` prerellenado. */
export function openComposer(initial: ComposerInitial): boolean {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(
    new CustomEvent<ComposerInitial>(OPEN_COMPOSER_EVENT, { detail: initial }),
  );
  return true;
}

/**
 * Se suscribe a las peticiones de abrir el compositor. Devuelve limpieza.
 * El callback recibe el `initial` listo para `<PublicationComposer initial={…}/>`.
 * No-op en SSR.
 */
export function onOpenComposer(cb: (initial: ComposerInitial) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ComposerInitial>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(OPEN_COMPOSER_EVENT, handler as EventListener);
  return () => window.removeEventListener(OPEN_COMPOSER_EVENT, handler as EventListener);
}
