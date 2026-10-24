// ¿Se carga Laya en este medio? (architecture/laya-y-habilidades.md §4, Ola 1018L · LYS1018H, tarea H).
// Laya en navegador y apps con `laya-ts` (WebGPU → WASM). PURA: mismo perfil, mismo plan; sin red,
// sin disco, sin reloj y sin cargar el modelo. Lo privado nunca sale de las neuronas de la persona
// ni de sus servidores propios: una visita web no ejecuta Laya local, va por la malla.
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import { presupuestoMedio } from "@/lib/astraura/capas/perfil-medio";

/** Checkpoint exportado que puede correr `laya-ts`; int8 primero por tamaño y velocidad. */
export type ModeloLayaNavegador = "multilingual-int8" | "multilingual";

export interface PlanLayaLocal {
  readonly cargar: boolean;
  readonly modelo: ModeloLayaNavegador | null;
  readonly motivo: string;
}

export interface OpcionesLayaLocal {
  /** `vendor/laya-ts` copiado y el checkpoint exportado (tarea O). Mientras falte, nunca se carga. */
  readonly artefactosListos?: boolean;
  /** El export int8 de `laya-multilingual` existe; si no, se usa el fp32. */
  readonly int8Disponible?: boolean;
}

/** Tamaños de referencia del checkpoint multilingual (MB), para el presupuesto nativo. */
export const PESO_INT8_MB = 400;
export const PESO_FP32_MB = 1400;
export const RAM_INT8_MB = 600;
export const RAM_FP32_MB = 1800;

/** 2 GB de almacenamiento libre y persistente para la PWA (§4). */
export const PWA_DISCO_MIN_MB = 2048;
/** 4 GB de memoria del dispositivo para la PWA (§4). */
export const PWA_RAM_MIN_GB = 4;

/**
 * Decide si este medio carga Laya con `laya-ts` y con qué checkpoint. Reglas de §4:
 * visita web nunca (va por la malla); PWA con WebGPU, ≥ 2 GB persistentes y ≥ 4 GB de RAM;
 * app nativa si cabe en su presupuesto; batería < 20 %, pestaña oculta o `saveData` → no.
 */
export function planLayaLocal(perfil: PerfilMedio, opciones?: OpcionesLayaLocal): PlanLayaLocal {
  const modelo: ModeloLayaNavegador = opciones?.int8Disponible === false ? "multilingual" : "multilingual-int8";
  return decidir(perfil, opciones?.artefactosListos === true, modelo);
}

function decidir(perfil: PerfilMedio, listos: boolean, modelo: ModeloLayaNavegador): PlanLayaLocal {
  const motivo = motivoParaNoCargar(perfil, listos);
  if (motivo !== null) return { cargar: false, modelo: null, motivo };
  if (perfil.plataforma === "pwa") return planPwa(perfil, modelo);
  return planNativo(perfil, modelo);
}

/** Motivo por el que NO se carga en ninguna plataforma; `null` si el medio puede cargar Laya. */
function motivoParaNoCargar(perfil: PerfilMedio, listos: boolean): string | null {
  if (!listos) return "faltan vendor/laya-ts y el checkpoint exportado (tarea O): Laya va por la malla";
  if (perfil.bateria.baja) return "batería < 20 %: solo el reflejo, Laya no se carga (§4)";
  if (!perfil.visible) return "pestaña oculta: solo el reflejo, Laya no se carga (§4)";
  if (perfil.saveData) return "saveData activo: Laya no se carga, va por la malla (§4)";
  if (perfil.plataforma === "web")
    return "visita web: Laya no se carga nunca, va por la malla con el reflejo local (§4)";
  if (perfil.plataforma === "servidor")
    return "servidor: Laya corre en el servidor propio, no en un navegador (§4)";
  return null;
}

function planPwa(perfil: PerfilMedio, modelo: ModeloLayaNavegador): PlanLayaLocal {
  if (!perfil.webgpu.disponible) return { cargar: false, modelo: null, motivo: "PWA sin WebGPU: laya-ts exige WebGPU para cargar el checkpoint (§4)" };
  const libreMb = perfil.almacenamiento.libreMb ?? perfil.almacenamiento.cuotaMb ?? 0;
  if (!perfil.almacenamiento.persistente || libreMb < PWA_DISCO_MIN_MB)
    return { cargar: false, modelo: null, motivo: "PWA sin 2 GB de almacenamiento persistente: Laya va por la malla (§4)" };
  const ramGb = memoriaGb(perfil);
  if (ramGb === null || ramGb < PWA_RAM_MIN_GB)
    return { cargar: false, modelo: null, motivo: `PWA con menos de ${PWA_RAM_MIN_GB} GB de memoria: Laya va por la malla (§4)` };
  return { cargar: true, modelo, motivo: `PWA con WebGPU, almacenamiento persistente y ${ramGb} GB: carga ${modelo} (§4)` };
}

function planNativo(perfil: PerfilMedio, modelo: ModeloLayaNavegador): PlanLayaLocal {
  if (!perfil.webgpu.disponible && !perfil.wasm.disponible)
    return { cargar: false, modelo: null, motivo: "app nativa sin WebGPU ni WASM: laya-ts no puede correr el checkpoint" };
  const presupuesto = presupuestoMedio(perfil);
  const pesoMb = modelo === "multilingual-int8" ? PESO_INT8_MB : PESO_FP32_MB;
  const ramMb = modelo === "multilingual-int8" ? RAM_INT8_MB : RAM_FP32_MB;
  if (presupuesto.disco_mb < pesoMb)
    return { cargar: false, modelo: null, motivo: `app nativa: ${modelo} no cabe en su presupuesto de disco (${presupuesto.disco_mb} MB < ${pesoMb} MB)` };
  const ramDisponible = presupuesto.ram_mb ?? 0;
  if (ramDisponible < ramMb)
    return { cargar: false, modelo: null, motivo: `app nativa: ${modelo} no cabe en su presupuesto de memoria (${ramDisponible} MB < ${ramMb} MB)` };
  return { cargar: true, modelo, motivo: `app nativa: ${modelo} cabe en su presupuesto (${pesoMb} MB de disco, ${ramMb} MB de RAM)` };
}

/** Memoria del dispositivo en GB; usa la RAM libre medida si `deviceMemory` no está. */
function memoriaGb(perfil: PerfilMedio): number | null {
  if (typeof perfil.base.ramGb === "number" && perfil.base.ramGb > 0) return perfil.base.ramGb;
  if (typeof perfil.ramLibreMb === "number" && perfil.ramLibreMb > 0) return Math.floor(perfil.ramLibreMb / 1024);
  return null;
}
