/**
 * modo-rendimiento — modos de rendimiento del OS (puro, sin DOM).
 * ----------------------------------------------------------------------------
 * Cuatro modos: auto | alto | eco | eficiente.
 * Cada modo tiene fases de potenciación que se aplican en cascada.
 * El modo actúa SOLO en tiempo de ejecución: no borra, no desactiva para
 * siempre, no cambia ningún diseño, función, ajuste u opción guardada.
 * starseed.perf.v1 guarda solo el modo; migración según regla de propagación.
 */

export type ModoRendimiento = "auto" | "alto" | "eco" | "eficiente";

export type FasePotenciacion =
  | "animaciones"
  | "transiciones"
  | "backdrop-filter"
  | "reflejos"
  | "fondos-dinamicos"
  | "canvas-webgl"
  | "requestAnimationFrame";

export interface ConfiguracionModo {
  modo: ModoRendimiento;
  fases: FasePotenciacion[];
  /** FPS objetivo para canvas/WebGL/rAF (0 = sin límite). */
  fpsObjetivo: number;
  /** Escala de calidad de fondo (1 = nativa, <1 = reducida). */
  escalaFondo: number;
  /** Etiqueta legible. */
  etiqueta: string;
  /** Descripción para UI. */
  descripcion: string;
}

/** Orden de aplicación de fases (de menos a más agresivo). */
export const ORDEN_FASES: readonly FasePotenciacion[] = [
  "animaciones",
  "transiciones",
  "backdrop-filter",
  "reflejos",
  "fondos-dinamicos",
  "canvas-webgl",
  "requestAnimationFrame",
] as const;

/** Configuración de cada modo con sus fases de potenciación. */
export const MODOS: Record<ModoRendimiento, ConfiguracionModo> = {
  auto: {
    modo: "auto",
    fases: [],
    fpsObjetivo: 0,
    escalaFondo: 1,
    etiqueta: "Auto",
    descripcion: "El sistema elige según tu aparato",
  },
  alto: {
    modo: "alto",
    fases: [],
    fpsObjetivo: 0,
    escalaFondo: 1,
    etiqueta: "Alto",
    descripcion: "Todos los efectos visuales",
  },
  eco: {
    modo: "eco",
    fases: ["animaciones", "transiciones", "fondos-dinamicos"],
    fpsObjetivo: 30,
    escalaFondo: 0.5,
    etiqueta: "Eco",
    descripcion: "Menos animaciones y fondos más ligeros",
  },
  eficiente: {
    modo: "eficiente",
    fases: [
      "animaciones",
      "transiciones",
      "backdrop-filter",
      "reflejos",
      "fondos-dinamicos",
      "canvas-webgl",
      "requestAnimationFrame",
    ],
    fpsObjetivo: 10,
    escalaFondo: 0.35,
    etiqueta: "Eficiente",
    descripcion: "Pausa animaciones, transiciones, desenfoques, reflejos y dinamismo; ahorra batería",
  },
};

/** Clave de almacenamiento (la misma que device-tier para compatibilidad). */
export const MODO_KEY = "starseed.perf.v1";

/** Evento que se dispara al cambiar el modo. */
export const MODO_CHANGED_EVENT = "starseed:modo-rendimiento-changed";

/** Lee el modo guardado; cualquier valor raro = "auto". */
export function leerModo(valor: string | null | undefined): ModoRendimiento {
  if (!valor) return "auto";
  return (["auto", "alto", "eco", "eficiente"] as const).includes(valor as ModoRendimiento)
    ? (valor as ModoRendimiento)
    : "auto";
}

/** Obtiene la configuración completa de un modo. */
export function configDeModo(modo: ModoRendimiento): ConfiguracionModo {
  return MODOS[modo];
}

/** Comprueba si una fase está activa en el modo dado. */
export function faseActiva(modo: ModoRendimiento, fase: FasePotenciacion): boolean {
  return MODOS[modo].fases.includes(fase);
}

/** Obtiene el FPS objetivo para el modo. */
export function fpsObjetivo(modo: ModoRendimiento): number {
  return MODOS[modo].fpsObjetivo;
}

/** Obtiene la escala de fondo para el modo. */
export function escalaFondo(modo: ModoRendimiento): number {
  return MODOS[modo].escalaFondo;
}

/** Lista de modos disponibles para selectores de UI. */
export const MODOS_UI: Array<{ id: ModoRendimiento; etiqueta: string; descripcion: string }> = [
  { id: "auto", etiqueta: "Auto", descripcion: "El sistema elige según tu aparato" },
  { id: "alto", etiqueta: "Alto", descripcion: "Todos los efectos visuales" },
  { id: "eco", etiqueta: "Eco", descripcion: "Menos animaciones y fondos más ligeros" },
  { id: "eficiente", etiqueta: "Eficiente", descripcion: "Pausa animaciones, transiciones, desenfoques, reflejos y dinamismo; ahorra batería" },
];

/** Migra configuraciones antiguas según la regla de propagación.
 *  Solo guarda el modo; el resto de ajustes se propagan desde sus fuentes originales. */
export function migrarConfiguracionAntigua(valorAntiguo: string | null): ModoRendimiento {
  if (!valorAntiguo) return "auto";
  // Valores legacy de device-tier: "auto" | "high" | "eco"
  if (valorAntiguo === "high") return "alto";
  if (valorAntiguo === "eco") return "eco";
  // Valores nuevos ya válidos
  if (["auto", "alto", "eco", "eficiente"].includes(valorAntiguo)) return valorAntiguo as ModoRendimiento;
  return "auto";
}