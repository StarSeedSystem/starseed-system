"use client";

/**
 * device-tier — nivel de rendimiento del dispositivo (SSR-safe).
 * ----------------------------------------------------------------------------
 * El OS montaba 7 capas de fondo pesadas a la vez (WebGL, Spline, iframe
 * Audiomorphic, psicodélico líquido, materia viva…), lo que traba móviles.
 * Este módulo clasifica el dispositivo y publica `data-perf` en <html> para que
 * los fondos y el CSS decidan cuánto renderizar.
 *
 *   tier 'high' → todo.  'mid' → animaciones reducidas.  'low' → estático.
 *
 * El MODO puede forzarse desde Ajustes → Rendimiento ('auto' | 'alto' | 'eco' | 'eficiente').
 * Ahora integra con modo-rendimiento.ts para fases de potenciación y `data-rendimiento`.
 */

import {
  type ModoRendimiento,
  type FasePotenciacion,
  MODOS,
  MODO_KEY,
  MODO_CHANGED_EVENT,
  leerModo,
  configDeModo,
  faseActiva,
  migrarConfiguracionAntigua,
  decidirModoAuto,
  type DecisionAuto,
  type EstadoEnergia,
  type PerfilEnergiaSistema,
  type SistemaEnergia,
  type TareaPesada,
} from "./modo-rendimiento";

export type PerfTier = "high" | "mid" | "low";
export type PerfMode = ModoRendimiento;
/** Lo que efectivamente aplica el sistema (legacy): 'high' | 'mid' | 'eco'. */
export type PerfApplied = "high" | "mid" | "eco";

export const PERF_CHANGED_EVENT = "starseed:perf-changed";

/* ── (EFI1119B) Energía del aparato ─────────────────────────────────────────
 * La app nativa (Rust `energia.rs`) y la Battery API de la web entregan el
 * estado; aquí solo se normaliza y se decide. Nada de esto toca el ajuste
 * guardado: `starseed.perf.v1` se lee, nunca se reescribe desde «auto».
 */

const SISTEMAS: readonly SistemaEnergia[] = ["macos", "android", "linux", "windows", "web", "desconocido"];
const PERFILES: readonly PerfilEnergiaSistema[] = ["ahorro", "equilibrado", "rendimiento", "desconocido"];
const TAREAS: readonly TareaPesada[] = ["control-remoto", "llamada", "transmision"];

/** Valida y recorta lo que llega de Rust, de la Battery API o de un ajuste. */
export function normalizarEstadoEnergia(datos: unknown): EstadoEnergia | null {
  if (!datos || typeof datos !== "object") return null;
  const d = datos as Record<string, unknown>;
  const sistema = SISTEMAS.includes(d.sistema as SistemaEnergia) ? (d.sistema as SistemaEnergia) : "desconocido";
  const perfil = PERFILES.includes(d.perfilEnergia as PerfilEnergiaSistema)
    ? (d.perfilEnergia as PerfilEnergiaSistema)
    : null;
  const bateria = typeof d.bateriaPct === "number" && Number.isFinite(d.bateriaPct)
    ? Math.max(0, Math.min(100, Math.round(d.bateriaPct)))
    : null;
  const temperatura = typeof d.temperaturaC === "number" && Number.isFinite(d.temperaturaC)
    ? d.temperaturaC
    : null;
  const tareas = Array.isArray(d.tareasPesadas)
    ? (d.tareasPesadas.filter((t) => TAREAS.includes(t as TareaPesada)) as TareaPesada[])
    : [];
  return {
    sistema,
    bateriaPct: bateria,
    cargando: typeof d.cargando === "boolean" ? d.cargando : null,
    ahorroSistema: d.ahorroSistema === true,
    modoBajoConsumo: d.modoBajoConsumo === true,
    perfilEnergia: perfil,
    temperaturaC: temperatura !== null && temperatura >= -40 && temperatura <= 150 ? temperatura : null,
    tareasPesadas: tareas,
  };
}

/** Lee el modo guardado (con migración de valores legacy). */
export function getPerfMode(): PerfMode {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(MODO_KEY);
    return migrarConfiguracionAntigua(v);
  } catch {
    return "auto";
  }
}

/** Guarda el modo y aplica tanto data-perf (legacy) como data-rendimiento (nuevo). */
export function setPerfMode(mode: PerfMode): void {
  energiaSolicitada = false;
  try {
    window.localStorage.setItem(MODO_KEY, mode);
  } catch {
    /* noop */
  }
  applyPerf();
  applyRendimiento();
  try {
    window.dispatchEvent(new CustomEvent(PERF_CHANGED_EVENT));
    window.dispatchEvent(new CustomEvent(MODO_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

/** Clasifica el dispositivo por memoria, núcleos, puntero y reduced-motion. */
export function detectTier(): PerfTier {
  if (typeof navigator === "undefined") return "high";
  try {
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number };
    const mem = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
    const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8;
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) return "low";
    if (mem <= 3 || cores <= 3) return "low";
    if (coarse && (mem <= 6 || cores <= 6)) return "mid";
    if (mem <= 4 || cores <= 4) return "mid";
    return "high";
  } catch {
    return "high";
  }
}

interface BateriaNavegador {
  level: number;
  charging: boolean;
  addEventListener(tipo: "levelchange" | "chargingchange", cb: () => void): void;
}

interface NavigatorConBateria extends Navigator {
  getBattery?: () => Promise<BateriaNavegador>;
}

interface TauriEnergia {
  core?: { invoke?: (cmd: string) => Promise<unknown> };
}

let energiaActual: EstadoEnergia | null = null;
let energiaSolicitada = false;
let bateriaVigilada = false;

/** Battery API de la web, cuando existe. */
export async function leerEnergiaWeb(): Promise<EstadoEnergia | null> {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as NavigatorConBateria;
  if (typeof nav.getBattery !== "function") return null;
  try {
    const b = await nav.getBattery();
    return normalizarEstadoEnergia({
      sistema: "web",
      bateriaPct: Math.round(b.level * 100),
      cargando: b.charging,
      ahorroSistema: false,
      modoBajoConsumo: false,
      perfilEnergia: null,
      temperaturaC: null,
      tareasPesadas: [],
    });
  } catch {
    return null;
  }
}

/** Comando nativo `energia_estado` de la app (macOS, Android, Linux, Windows). */
export async function leerEnergiaNativa(): Promise<EstadoEnergia | null> {
  if (typeof window === "undefined") return null;
  try {
    const invoke = (window as unknown as { __TAURI__?: TauriEnergia }).__TAURI__?.core?.invoke;
    if (typeof invoke !== "function") return null;
    return normalizarEstadoEnergia(await invoke("energia_estado"));
  } catch {
    return null;
  }
}

/** Decide con el estado conocido (o con el que se pase) y la gama del aparato. */
export function decidirAutoActual(energia: EstadoEnergia | null = energiaActual): DecisionAuto {
  return decidirModoAuto({ tier: detectTier(), energia });
}

/**
 * Actualiza el estado de energía y re-aplica el modo efectivo. NUNCA guarda el
 * modo: la persona conserva «auto» (o el que haya elegido) en `starseed.perf.v1`.
 */
export function actualizarEnergia(estado: EstadoEnergia | null): DecisionAuto {
  energiaActual = estado;
  const decision = decidirAutoActual(estado);
  applyPerf();
  applyRendimiento();
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PERF_CHANGED_EVENT));
  } catch {
    /* noop */
  }
  return decision;
}

/**
 * Marca las tareas pesadas en curso (control remoto, llamada, transmisión) sin
 * perder el resto del estado medido. Al vaciar la lista, «auto» vuelve solo.
 */
export function actualizarTareasPesadas(tareas: readonly TareaPesada[]): DecisionAuto {
  const estado: EstadoEnergia = energiaActual
    ? { ...energiaActual, tareasPesadas: tareas }
    : {
        sistema: "desconocido",
        bateriaPct: null,
        cargando: null,
        ahorroSistema: false,
        modoBajoConsumo: false,
        perfilEnergia: null,
        temperaturaC: null,
        tareasPesadas: tareas,
      };
  return actualizarEnergia(estado);
}

function vigilarBateria(nav: NavigatorConBateria): void {
  if (bateriaVigilada || typeof nav.getBattery !== "function") return;
  bateriaVigilada = true;
  void nav.getBattery().then((b) => {
    const refrescar = () => {
      if (getPerfMode() !== "auto") return;
      void leerEnergiaWeb().then((e) => { if (e) actualizarEnergia(e); });
    };
    try {
      b.addEventListener("levelchange", refrescar);
      b.addEventListener("chargingchange", refrescar);
    } catch {
      /* sin escucha */
    }
  }).catch(() => { bateriaVigilada = false; });
}

/** Lee la energía (nativa o web) y aplica la decisión de «auto» una vez. */
export async function inicializarAutoRendimiento(): Promise<DecisionAuto | null> {
  if (getPerfMode() !== "auto") return null;
  const estado = (await leerEnergiaNativa()) ?? (await leerEnergiaWeb());
  if (!estado) return null;
  const decision = actualizarEnergia(estado);
  if (typeof navigator !== "undefined") vigilarBateria(navigator as NavigatorConBateria);
  return decision;
}

function pedirEnergiaSiAuto(): void {
  if (energiaSolicitada || typeof window === "undefined" || getPerfMode() !== "auto") return;
  energiaSolicitada = true;
  void inicializarAutoRendimiento();
}

/** Combina el modo elegido con el tier detectado → lo que se aplica de verdad (legacy). */
export function resolveApplied(): PerfApplied {
  const mode = getPerfMode();
  if (mode === "alto") return "high";
  if (mode === "eco") return "eco";
  if (mode === "eficiente") return "eco"; // eficiente se mapea a eco en legacy
  const tier = detectTier();
  const decision = decidirAutoActual();
  if (decision.modo === "alto") return "high";
  // En gama media sin señal de energía se conserva el «mid» de siempre
  // (animaciones reducidas pero fondos pesados). Con cualquier señal, eco.
  if (tier === "mid" && !decision.senal) return "mid";
  return "eco";
}

/** ¿Deben montarse los fondos animados pesados? (false en eco/eficiente) */
export function allowHeavyFx(): boolean {
  const applied = resolveApplied();
  return applied !== "eco";
}

/** ¿Modo de máxima riqueza? (WebGL/Spline plenos) */
export function allowFullFx(): boolean {
  return resolveApplied() === "high";
}

/** Escribe `data-perf` en <html> para compatibilidad legacy. */
export function applyPerf(): PerfApplied {
  const applied = resolveApplied();
  try {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-perf", applied);
    }
  } catch {
    /* noop */
  }
  pedirEnergiaSiAuto();
  return applied;
}

/** Escribe `data-rendimiento` en <html> con el modo actual para CSS nuevo. */
export function applyRendimiento(): ModoRendimiento {
  const mode = getPerfMode();
  try {
    if (typeof document !== "undefined") {
      const html = document.documentElement;
      html.setAttribute("data-rendimiento", mode);
      if (mode === "auto") {
        const d = decidirAutoActual();
        html.setAttribute("data-rendimiento-efectivo", d.modo);
        html.setAttribute("data-rendimiento-motivo", d.motivo);
        html.setAttribute("data-rendimiento-fases", d.fases.join(" "));
      } else {
        html.removeAttribute("data-rendimiento-efectivo");
        html.removeAttribute("data-rendimiento-motivo");
        html.removeAttribute("data-rendimiento-fases");
      }
    }
  } catch {
    /* noop */
  }
  return mode;
}

/** Modo que se aplica de verdad: el guardado, o la decisión de «auto». */
export function modoEfectivo(): ModoRendimiento {
  const mode = getPerfMode();
  return mode === "auto" ? decidirAutoActual().modo : mode;
}

/** Comprueba si una fase de potenciación está activa en el modo efectivo. */
export function faseActivaModo(fase: FasePotenciacion): boolean {
  return faseActiva(modoEfectivo(), fase);
}

/** Obtiene el FPS objetivo para canvas/WebGL/rAF según el modo efectivo. */
export function fpsObjetivoModo(): number {
  return configDeModo(modoEfectivo()).fpsObjetivo;
}

/** Obtiene la escala de fondo según el modo efectivo. */
export function escalaFondoModo(): number {
  return configDeModo(modoEfectivo()).escalaFondo;
}

/** Obtiene la configuración completa del modo efectivo. */
export function configModoActual() {
  return configDeModo(modoEfectivo());
}

/** Inicializa ambos atributos al cargar (llamar desde layout o provider). */
export function inicializarRendimiento(): { perf: PerfApplied; rendimiento: ModoRendimiento } {
  return { perf: applyPerf(), rendimiento: applyRendimiento() };
}