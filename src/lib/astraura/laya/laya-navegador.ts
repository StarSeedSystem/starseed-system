// Laya en navegador y apps (Ola 1018L · LYS1018H, contrato laya-y-habilidades.md §4 y
// capas-autoadaptables.md §4): decide si este medio carga `laya-ts` (WebGPU → WASM) con el
// checkpoint multilingual exportado, o si las decisiones de Laya van fuera (malla, A1, servidores).
// Módulo PURO: el perfil llega ya medido (`perfil-medio.ts`) y la disponibilidad del vendor y del
// modelo exportado (tarea O) se inyectan. Sin red, sin disco, sin reloj y sin cargar modelos.

import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

/** Checkpoints exportados que `laya-ts` puede cargar en el navegador; la tarea O aún no los mide. */
export type ModeloLayaNavegador = "multilingual-int8" | "multilingual";

/** Disponibilidad inyectada: `vendor/laya-ts` y el modelo exportado (tarea O). */
export interface EstadoVendorLaya {
  vendorDisponible: boolean;
  /** ¿Ya está exportado `laya-multilingual`? int8 preferido (menos peso); fp32 mientras tanto. */
  modeloExportado: "int8" | "fp32" | null;
}

/** Estado hoy: ni `vendor/laya-ts` ni el modelo exportado existen → nunca carga en ningún medio. */
export const ESTADO_INICIAL_VENDOR: EstadoVendorLaya = {
  vendorDisponible: false,
  modeloExportado: null,
};

export interface PlanLayaLocal {
  cargar: boolean;
  modelo: ModeloLayaNavegador | null;
  motivo: string;
}

const MIN_PERSISTENTE_MB = 2 * 1024;
const RAM_MINIMA_PWA_GB = 4;
const PESO_INT8_MB = 400;
const PESO_FP32_MB = 1400;

/** Decide por medio si Laya se carga local. Pura: misma entrada, misma salida. */
export function planLayaLocal(
  p: PerfilMedio,
  estado: EstadoVendorLaya = ESTADO_INICIAL_VENDOR,
): PlanLayaLocal {
  if (estado.vendorDisponible !== true || estado.modeloExportado === null) {
    return {
      cargar: false,
      modelo: null,
      motivo:
        "vendor/laya-ts o modelo exportado (tarea O) aún no disponibles: Laya va por la malla o al A1",
    };
  }
  const modelo: ModeloLayaNavegador =
    estado.modeloExportado === "int8" ? "multilingual-int8" : "multilingual";
  return decidirPorPlataforma(p, modelo);
}

function decidirPorPlataforma(p: PerfilMedio, modelo: ModeloLayaNavegador): PlanLayaLocal {
  if (!p.visible || (p.bateria.baja && p.bateria.cargando !== true)) {
    return {
      cargar: false,
      modelo: null,
      motivo: "batería < 20 % o pestaña oculta: no se despierta Laya local (§4)",
    };
  }
  switch (p.plataforma) {
    case "pwa":
      return planPwa(p, modelo);
    case "tauri":
    case "android":
    case "ios":
      return planNativa(p, modelo);
    default:
      return planWeb(p.plataforma);
  }
}

/** Visita web: nunca carga; Laya va por la malla (§4 del contrato de capas). */
function planWeb(plataforma: string): PlanLayaLocal {
  return {
    cargar: false,
    modelo: null,
    motivo: `visita web (${plataforma}): Laya nunca se carga aquí, va por la malla (§4)`,
  };
}

/** PWA: WebGPU + ≥ 2 GB persistentes + ≥ 4 GB de RAM; solo reflejo si le falta algo (§4). */
function planPwa(p: PerfilMedio, modelo: ModeloLayaNavegador): PlanLayaLocal {
  const gpuOk = p.webgpu.disponible;
  const almacenamientoOk =
    p.almacenamiento.persistente === true && (p.almacenamiento.libreMb ?? 0) >= MIN_PERSISTENTE_MB;
  const ramOk = (p.base.ramGb ?? 0) >= RAM_MINIMA_PWA_GB;
  if (!gpuOk || !almacenamientoOk || !ramOk) {
    const faltas: string[] = [];
    if (!gpuOk) faltas.push("sin WebGPU");
    if (!almacenamientoOk) faltas.push(`sin ≥ ${MIN_PERSISTENTE_MB} MB persistentes`);
    if (!ramOk) faltas.push(`sin ≥ ${RAM_MINIMA_PWA_GB} GB de RAM`);
    return {
      cargar: false,
      modelo: null,
      motivo: `PWA no cumple (${faltas.join(" · ")}): Laya va por la malla (§4)`,
    };
  }
  return {
    cargar: true,
    modelo,
    motivo: `PWA con WebGPU, ≥ ${MIN_PERSISTENTE_MB} MB persistentes y ≥ ${RAM_MINIMA_PWA_GB} GB de RAM: carga ${modelo} (§4)`,
  };
}

/** App nativa: carga si el checkpoint cabe en su presupuesto (15 % del disco, tope 8 GB, §4). */
function planNativa(p: PerfilMedio, modelo: ModeloLayaNavegador): PlanLayaLocal {
  const pesoMb = modelo === "multilingual-int8" ? PESO_INT8_MB : PESO_FP32_MB;
  const presupuesto = presupuestoDiscoMb(p);
  if (!presupuestoSuficienteApp(p, presupuesto, pesoMb, modelo)) {
    return {
      cargar: false,
      modelo: null,
      motivo: `${modelo} no cabe en el presupuesto de la app nativa (§4): Laya por la malla o al A1`,
    };
  }
  return {
    cargar: true,
    modelo,
    motivo: `app nativa: ${modelo} cabe en su presupuesto (§4)`,
  };
}

/** Presupuesto de disco guardable del medio (lógica de `presupuestoMedio`, leída sin depender). */
function presupuestoDiscoMb(p: PerfilMedio): number {
  const libre = p.almacenamiento.libreMb ?? 0;
  const nativo = Math.min(Math.floor(libre * 0.15), 8 * 1024);
  return nativo;
}

/** Cabe el peso del modelo en disco y su estimación de RAM en el perfil. */
function presupuestoSuficienteApp(
  p: PerfilMedio,
  presupuestoMb: number,
  pesoMb: number,
  modelo: ModeloLayaNavegador,
): boolean {
  if (presupuestoMb < pesoMb) return false;
  const ramMb = p.ramLibreMb ?? (p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.4) : null);
  const ramNecesariaMb = modelo === "multilingual-int8" ? 600 : 1700;
  return ramMb === null ? true : ramMb >= ramNecesariaMb;
}
