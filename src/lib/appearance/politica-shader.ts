/**
 * politica-shader — cómo se pinta una capa shader según el aparato (Ola 1018F · FSH1018E ·
 * architecture/fondos-shaders.md §1 y §5). PURO: no toca `navigator`, `window` ni la GPU; quien
 * llama mide el entorno y esta función decide.
 *
 *  - «fijo»: sin WebGPU, con «reducir movimiento», con ahorro de batería o con la batería muy baja
 *    → se pinta la vista previa del set (o nada, y se ve el motor base). Gana sobre todo lo demás:
 *    una imagen fija no gasta nada, esté visible o no.
 *  - «pausado»: la pestaña o la capa no se ven → se conserva el último fotograma sin animar.
 *  - «vivo-30fps»: con batería (sin cargar) → 30 fotogramas por segundo como mucho.
 *  - «vivo»: enchufado (o el navegador no dice nada de la batería) → al ritmo de la pantalla.
 */

export type ModoCapa = "vivo" | "vivo-30fps" | "pausado" | "fijo";

export interface EntornoCapa {
  /** El navegador tiene WebGPU (`navigator.gpu`). */
  webgpu: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reducirMovimiento: boolean;
  /** La persona o el aparato piden ahorrar energía. */
  ahorroBateria: boolean;
  /** Carga de la batería (0-100) si va con batería y sin cargar; `null` si está enchufado o no se sabe. */
  bateriaPct: number | null;
  /** La pestaña está visible y la capa está en pantalla. */
  visible: boolean;
}

/** Por debajo de este porcentaje (sin cargar) la capa se queda fija, como haría el modo de ahorro del sistema. */
export const UMBRAL_BATERIA_BAJA = 20;

/** Fotogramas por segundo máximos con batería. */
export const FPS_CON_BATERIA = 30;

const conBateria = (pct: number | null): pct is number => typeof pct === "number" && Number.isFinite(pct);

export function modoDeCapa(e: EntornoCapa): ModoCapa {
  if (!e.webgpu || e.reducirMovimiento || e.ahorroBateria) return "fijo";
  if (conBateria(e.bateriaPct) && e.bateriaPct <= UMBRAL_BATERIA_BAJA) return "fijo";
  if (!e.visible) return "pausado";
  return conBateria(e.bateriaPct) ? "vivo-30fps" : "vivo";
}

/** Milisegundos mínimos entre fotogramas del modo (0 = sin tope; solo tiene sentido en los modos vivos). */
export function intervaloFotogramaMs(modo: ModoCapa): number {
  return modo === "vivo-30fps" ? Math.round(1000 / FPS_CON_BATERIA) : 0;
}

/** El modo necesita el motor WebGPU montado (vivo o pausado con su último fotograma). */
export function necesitaMotor(modo: ModoCapa): boolean {
  return modo !== "fijo";
}
