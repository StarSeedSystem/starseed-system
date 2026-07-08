// src/lib/canvas/board-engine.ts
// StarSeed · Pizarra — preferencia de MOTOR por pizarra ("Lienzo StarSeed" vs
// "tldraw (profesional)"). Aditivo: no toca el tipo `Canvas` ni la tabla
// `canvases` (que no tiene columna `engine`) para evitar cualquier riesgo de
// romper el guardado existente. Se persiste en localStorage, por pizarra
// (clave = canvas.id), soberano del dispositivo — igual de honesto que el
// resto del sistema de preferencias locales del OS (p. ej. defaults-seed.ts).
//
// HONESTO: esto es una preferencia LOCAL (por navegador/dispositivo), no
// sincronizada entre dispositivos de la misma cuenta. Sincronizarla de verdad
// requeriría una columna `canvases.engine` (evolución futura); mientras tanto,
// cada pizarra SIN preferencia guardada usa "starseed" por defecto — así las
// pizarras ya existentes JAMÁS cambian de motor solas.
//
// El modo COMPARTIDO (os_spaces kind='board') no usa esta clave: el motor de
// una pizarra compartida se decide por la URL (`?engine=tldraw`) o por el
// marcador `doc.engine` del propio espacio — ver canvas-board.tsx.

export type BoardEngine = "starseed" | "tldraw";

const KEY_PREFIX = "starseed.pizarra.engine.";
const DRAFT_KEY = "_draft";

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function keyFor(canvasId: string | null | undefined): string {
  return KEY_PREFIX + (canvasId && canvasId.trim() ? canvasId : DRAFT_KEY);
}

/** Motor recordado para esta pizarra (por id) en ESTE dispositivo. Por defecto "starseed". */
export function getBoardEngine(canvasId: string | null | undefined): BoardEngine {
  if (!isClient()) return "starseed";
  try {
    const raw = window.localStorage.getItem(keyFor(canvasId));
    return raw === "tldraw" ? "tldraw" : "starseed";
  } catch {
    return "starseed";
  }
}

/** Recuerda el motor elegido para esta pizarra (por id) en ESTE dispositivo. */
export function setBoardEngine(canvasId: string | null | undefined, engine: BoardEngine): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(keyFor(canvasId), engine);
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}
