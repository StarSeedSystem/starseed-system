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

/* ── (EFI1119B) Estado de energía y decisión de «auto» ───────────────────────
 * `decidirModoAuto` es PURA: entra el estado del aparato y sale la fase y el
 * modo. No lee ni escribe almacenamiento, así que jamás cambia un ajuste
 * guardado por la persona. La usan la app nativa (Rust `energia.rs`), la
 * Battery API de la web y `device-tier.ts` al aplicar el modo «auto».
 */

/** Sistema del que viene el estado de energía. */
export type SistemaEnergia = "macos" | "android" | "linux" | "windows" | "web" | "desconocido";

/** Perfil que anuncia el sistema cuando lo sabe (Linux: power-profiles-daemon). */
export type PerfilEnergiaSistema = "ahorro" | "equilibrado" | "rendimiento" | "desconocido";

/** Tareas pesadas que, mientras duran, piden bajar la potencia visual. */
export type TareaPesada = "control-remoto" | "llamada" | "transmision";

/** Gama del aparato (la misma que clasifica `device-tier.ts`). */
export type PerfTierAuto = "high" | "mid" | "low";

export interface EstadoEnergia {
  sistema: SistemaEnergia;
  /** Nivel de batería 0–100; `null` si no hay batería o no se conoce. */
  bateriaPct: number | null;
  /** `true` cargando, `false` con batería, `null` si no se sabe (escritorio). */
  cargando: boolean | null;
  /** Ahorro de energía del sistema (Android, Windows) o bajo consumo (macOS). */
  ahorroSistema: boolean;
  /** Modo de bajo consumo de macOS, explícito. */
  modoBajoConsumo: boolean;
  /** Perfil del sistema si existe (Linux), o `null`. */
  perfilEnergia: PerfilEnergiaSistema | null;
  /** Temperatura del aparato en °C; `null` si no se conoce. */
  temperaturaC: number | null;
  /** Tareas pesadas en curso AHORA (control remoto, llamadas, transmisiones). */
  tareasPesadas: readonly TareaPesada[];
  /**
   * Linux: no hay ningún monitor conectado. `undefined` = no se sabe (como hoy).
   * Solo lo mide la app nativa; la web no lo inventa.
   */
  sinPantalla?: boolean;
}

export interface ContextoAuto {
  tier: PerfTierAuto;
  /** Estado del aparato; `null` = sin señales (se decide solo por la gama). */
  energia: EstadoEnergia | null;
}

export interface DecisionAuto {
  modo: Exclude<ModoRendimiento, "auto">;
  fases: FasePotenciacion[];
  fpsObjetivo: number;
  escalaFondo: number;
  /** Por qué se eligió, en una frase para la UI. */
  motivo: string;
  /** `true` si el cambio dura solo mientras siga la tarea pesada. */
  temporal: boolean;
  /** `false` cuando solo decide la gama del aparato, sin señal de energía. */
  senal: boolean;
}

/** Umbrales de la decisión, en un solo sitio. */
export const UMBRAL_BATERIA_CRITICA = 10;
export const UMBRAL_BATERIA_BAJA = 20;
export const UMBRAL_TEMPERATURA_TIBIA = 70;
export const UMBRAL_TEMPERATURA_ALTA = 80;

function decision(
  modo: Exclude<ModoRendimiento, "auto">,
  motivo: string,
  temporal = false,
  senal = true,
): DecisionAuto {
  const config = MODOS[modo];
  return {
    modo,
    fases: [...config.fases],
    fpsObjetivo: config.fpsObjetivo,
    escalaFondo: config.escalaFondo,
    motivo,
    temporal,
    senal,
  };
}

function motivoTareas(tareas: readonly TareaPesada[]): string {
  const nombres = tareas.map((t) =>
    t === "transmision" ? "transmisión de pantalla" : t === "llamada" ? "llamada en curso" : "control remoto en curso",
  );
  return `tareas pesadas en curso: ${nombres.join(" y ")}`;
}

/** Decide el modo y las fases efectivas en «auto» (puro, sin efectos). */
export function decidirModoAuto({ tier, energia }: ContextoAuto): DecisionAuto {
  const base: Exclude<ModoRendimiento, "auto"> = tier === "high" ? "alto" : "eco";
  const bateria = energia?.bateriaPct ?? null;
  const cargando = energia?.cargando === true;
  const tareas = energia?.tareasPesadas ?? [];
  const conBateriaBaja = bateria !== null && !cargando && bateria <= UMBRAL_BATERIA_BAJA;

  // 1. Calor: primero el aparato (aunque esté cargando).
  const temperatura = energia?.temperaturaC ?? null;
  if (temperatura !== null && temperatura >= UMBRAL_TEMPERATURA_ALTA) {
    return decision("eficiente", "temperatura alta del aparato");
  }
  if (temperatura !== null && temperatura >= UMBRAL_TEMPERATURA_TIBIA) {
    return decision("eco", "temperatura elevada del aparato");
  }

  // 2. Batería crítica sin cargar: por encima de cualquier tarea.
  if (bateria !== null && !cargando && bateria <= UMBRAL_BATERIA_CRITICA) {
    return decision("eficiente", "batería crítica sin cargar");
  }

  // 3. Tareas pesadas: solo mientras duran (`temporal`), nunca en alto.
  if (tareas.length > 0) {
    const transmision = tareas.includes("transmision");
    if ((transmision && tier !== "high") || tier === "low") {
      return decision("eficiente", motivoTareas(tareas), true);
    }
    if (transmision || tier === "mid") {
      return decision("eco", motivoTareas(tareas), true);
    }
  }

  // 4. Batería baja sin cargar.
  if (conBateriaBaja) {
    return decision(tier === "low" ? "eficiente" : "eco", "batería baja sin cargar");
  }

  // 5. Ahorro del sistema (Android/Windows) o bajo consumo (macOS).
  if (energia?.modoBajoConsumo) {
    return decision(tier === "low" || conBateriaBaja ? "eficiente" : "eco", "modo de bajo consumo de macOS");
  }
  if (energia?.ahorroSistema) {
    return decision(tier === "low" || conBateriaBaja ? "eficiente" : "eco", "ahorro de energía del sistema");
  }

  // 6. Perfil del sistema (Linux: power-profiles-daemon / UPower).
  if (energia?.perfilEnergia === "ahorro") {
    return decision(tier === "low" ? "eficiente" : "eco", "perfil de energía del sistema en ahorro");
  }

  // 7. Reposo: manda la gama del aparato.
  return decision(base, base === "alto" ? "sin señales de ahorro" : "equipo modesto", false, false);
}

/** Tope de cuadros por segundo cuando el nodo no tiene pantalla conectada. */
export const FPS_SIN_PANTALLA = 1;

/**
 * Tope extra de cuadros por segundo por no tener monitor conectado.
 * Devuelve `FPS_SIN_PANTALLA` solo si se SABE que no hay pantalla y nadie la
 * está mirando. Devuelve `0` (sin tope extra) si hay pantalla, si no se sabe
 * (campo ausente) o si hay una sesión de control remoto o una transmisión viva:
 * quien controla o comparte pantalla SÍ la ve aunque no haya monitor físico.
 */
export function topeFpsSinPantalla(energia: EstadoEnergia | null | undefined): number {
  if (!energia || energia.sinPantalla !== true) return 0;
  const alguienMira = energia.tareasPesadas.some(
    (t) => t === "control-remoto" || t === "transmision",
  );
  return alguienMira ? 0 : FPS_SIN_PANTALLA;
}

/**
 * Aplica el tope por falta de pantalla a un FPS de modo (0 = sin tope).
 * Puro: no lee ni guarda nada. Lo usan `fpsObjetivoModo()` y el ritmo de los
 * bucles gobernados para que ambos respeten el mismo tope sin duplicar reglas.
 */
export function aplicarTopeFpsSinPantalla(
  fps: number,
  energia: EstadoEnergia | null | undefined,
  visibilityState?: string,
): number {
  const tope = topeFpsSinPantalla(energia);
  if (tope <= 0) return fps;
  return fps > 0 ? Math.min(fps, tope) : tope;
}

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