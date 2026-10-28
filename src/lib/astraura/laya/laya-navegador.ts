// Laya en navegador y apps con laya-ts (Ola 1018L · LYS1018H, tarea H).
// Contrato: architecture/laya-y-habilidades.md §4 («Dónde corre Laya, por medio») y
// capas-autoadaptables.md §4. Decide si este medio carga Laya local con laya-ts
// (WebGPU → WASM) y con qué checkpoint, o si va por la malla. Módulo PURO: el
// `PerfilMedio` llega ya medido (perfil-medio.ts); sin red, disco, reloj ni modelo.

import {
  enSegundoPlano,
  presupuestoMedio,
  type PerfilMedio,
} from "@/lib/astraura/capas/perfil-medio";

/** Checkpoints de laya-multilingual exportados a ONNX para laya-ts (tarea O). */
export type ModeloExportado = "multilingual-int8" | "multilingual";

export type ModeloLayaNavegador = ModeloExportado | null;

export interface PlanLayaNavegador {
  readonly cargar: boolean;
  readonly modelo: ModeloLayaNavegador;
  readonly motivo: string;
}

/** ¿Están `vendor/laya-ts` y el modelo exportado de la tarea O? Hoy aún no: todo va por la malla. */
export const LAYA_TS_LISTO = false;

// Tamaños provisionales de laya-multilingual (mmBERT-base, 322 M de parámetros), estimados
// de los pesos; la tarea O medirá los reales en ONNX y pondrá sus cifras.
export const PESO_FP32_MB = 1300;
export const PESO_INT8_MB = 420;
/** RAM que reserva el modelo al cargar (§2: 1,6 GB medidos con el checkpoint inglés fp32). */
export const RAM_FP32_MB = 1600;
export const RAM_INT8_MB = 800;

/** §4: si el medio es inferior a uno de estos, laya-ts no entra y Laya va por la malla. */
export const ALMACEN_PERSISTENTE_MIN_MB = 2048;
export const RAM_MEDIO_MIN_GB = 4;

/** Media el rechazo (§4): la visita web y el servidor nunca corren laya-ts. */
function noCargar(motivo: string): PlanLayaNavegador {
  return { cargar: false, modelo: null, motivo };
}

function motivoNuncaLocal(plataforma: PerfilMedio["plataforma"]): string {
  if (plataforma === "servidor") {
    return "el servidor corre Laya con @receptron/laya (servidor-laya.mjs), no con laya-ts";
  }
  // Visita web: Laya va por la malla (§4); el reflejo local ya cubre lo instantáneo.
  return "visita web: nunca carga Laya, va por la malla (§4)";
}

/**
 * Plan de carga de laya-ts para un medio ya medido. `modeloListo` dice si ya están
 * `vendor/laya-ts` y el exportado de la tarea O (lo decide el cableado del medio);
 * mientras sea falso devuelve cargar:false y por la malla.
 */
export function planLayaLocal(
  perfil: PerfilMedio,
  modeloListo: boolean = LAYA_TS_LISTO,
): PlanLayaNavegador {
  if (!modeloListo) {
    return noCargar("vendor/laya-ts y el exportado de la tarea O aún no existen: por la malla");
  }
  if (perfil.plataforma === "web" || perfil.plataforma === "servidor") {
    return noCargar(motivoNuncaLocal(perfil.plataforma));
  }
  if (enSegundoPlano(perfil)) {
    // En 2.º plano solo el reflejo (§4): pestaña oculta, batería < 20 % (sin cargando) o saveData.
    const causa = !perfil.visible
      ? "pestaña oculta"
      : perfil.saveData
        ? "saveData activo"
        : "batería < 20 %";
    return noCargar(`2.º plano (${causa}): Laya va por la malla (§4)`);
  }
  if (perfil.plataforma === "pwa") return planPwa(perfil);
  return planAppNativa(perfil);
}

/** PWA: WebGPU + ≥ 2 GB de almacenamiento persistente + ≥ 4 GB de memoria (§4). */
function planPwa(perfil: PerfilMedio): PlanLayaNavegador {
  if (!perfil.webgpu.disponible) {
    return noCargar("PWA sin WebGPU: laya-ts no puede correr aquí (§4), por la malla");
  }
  if (!perfil.almacenamiento.persistente) {
    return noCargar("PWA sin persist() concedido: no hay almacenamiento persistente (§4), por la malla");
  }
  if ((perfil.almacenamiento.libreMb ?? 0) < ALMACEN_PERSISTENTE_MIN_MB) {
    return noCargar("PWA con menos de 2 GB de almacenamiento persistente (§4), por la malla");
  }
  if ((perfil.base.ramGb ?? 0) < RAM_MEDIO_MIN_GB) {
    return noCargar("PWA con menos de 4 GB de memoria (§4), por la malla");
  }
  // En el navegador manda el int8: cabe mejor en los límites de WebGPU/WASM (sin medir aún, tarea O).
  return {
    cargar: true,
    modelo: "multilingual-int8",
    motivo: "PWA con WebGPU, ≥ 2 GB persistentes y ≥ 4 GB de RAM (§4)",
  };
}

/** App nativa (Tauri, Android, iOS): carga si el checkpoint cabe en su presupuesto (§4). */
function planAppNativa(perfil: PerfilMedio): PlanLayaNavegador {
  const presupuesto = presupuestoMedio(perfil);
  const ramMb = presupuesto.ram_mb;
  if (ramMb !== null && ramMb >= RAM_FP32_MB && presupuesto.disco_mb >= PESO_FP32_MB) {
    return { cargar: true, modelo: "multilingual", motivo: "app nativa: laya-multilingual fp32 cabe en su presupuesto (§4)" };
  }
  if (ramMb !== null && ramMb >= RAM_INT8_MB && presupuesto.disco_mb >= PESO_INT8_MB) {
    return { cargar: true, modelo: "multilingual-int8", motivo: "app nativa: cabe el int8 (fp32 no) en su presupuesto (§4)" };
  }
  return noCargar(`app nativa: el checkpoint no cabe en su presupuesto (${presupuesto.disco_mb} MB de disco); por la malla`);
}
