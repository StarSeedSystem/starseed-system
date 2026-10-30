// Laya en navegador y apps (Ola 1018L · LYS1018H, tarea H, parte 1): cuándo la capa de
// Laya se carga EN el medio (`laya-ts` con WebGPU → WASM) y cuándo se pregunta fuera
// (por la malla al A1). Reglas de la tabla de medios: laya-y-habilidades.md §1/§4 y
// capas-autoadaptables.md §4. Módulo PURO: el `PerfilMedio` llega medido por
// `perfil-medio.ts` y aquí no hay red, ni disco, ni reloj, ni modelos.
import {
  presupuestoMedio,
  type PresupuestoMedio,
  type PerfilMedio,
} from "@/lib/astraura/capas/perfil-medio";

/** Los checkpoints exportables para el navegador, mejor calidad → más ligero. */
export type ModeloLayaNavegador = "multilingual-int8" | "multilingual";

/** Veredicto de `planLayaLocal`: si se carga, cómo cargado y con qué checkpoint. */
export interface PlanLayaLocal {
  cargar: boolean;
  modelo: ModeloLayaNavegador | null;
  motivo: string;
}

/** Espacio que ocupa cada checkpoint exportado en disco y en RAM (MB, con margen). */
export const TAMAÑO_MODELO_MB: Readonly<Record<ModeloLayaNavegador, number>> = {
  multilingual: 1300,
  "multilingual-int8": 400,
};

/** PWA: mínimo de almacenamiento persistente (§4 del contrato de Laya). */
export const PWA_PERSISTENTE_MIN_MB = 2 * 1024;
/** PWA: mínimo de memoria (§4: «WebGPU solo si hay ≥ 4 GB»). */
export const PWA_RAM_MIN_GB = 4;

/** Gate del estado de la cadena: `vendor/laya-ts` y el checkpoint exportado de
 * `laya-multilingual` (tarea O) aún no existen; mientras no, el plan devuelve
 * «no cargar» con ese motivo y Laya solo pregunta por la malla al A1. Se pone
 * a true cuando la tarea O exporte y traiga el paquete, `laya-ts` entre al repo,
 * en el navegador y en las apps. */
export const LAYA_NAVEGADOR_LISTO: boolean = false;

/** Veredicto sin cargar: el texto siempre dice POR QUÉ no se carga. */
const no = (motivo: string): PlanLayaLocal => ({ cargar: false, modelo: null, motivo });

export const MOTIVO_NO_LISTO =
  "laya-ts (tarea O) aún no está: `vendor/laya-ts` ni el checkpoint `laya-multilingual` exportado existen; " +
  "Laya del navegador va por la malla al A1 mientras tanto.";

/** Plan principal: primero el gate de disponibilidad, si no las reglas del medio. */
export function planLayaLocal(p: PerfilMedio): PlanLayaLocal {
  if (!LAYA_NAVEGADOR_LISTO) return { cargar: false, modelo: null, motivo: MOTIVO_NO_LISTO };
  return planLayaLocalEnMedio(p);
}

/**
 * Reglas puras del medio (sin el gate de disponibilidad), según laya-y-habilidades §4
 * y capas-autoadaptables §4:
 * - visita web NUNCA carga: va por la malla al A1;
 * - PWA: solo con WebGPU, ≥ 2 GB de almacenamiento persistente y ≥ 4 GB de memoria;
 * - app nativa (Tauri, Android, iOS): si el checkpoint cabe en el presupuesto de
 *   disco y RAM que `presupuestoMedio` reparte;
 * - pestaña oculta o batería < 20 % (sin estar cargando): en 2.º plano solo corre el reflejo;
 * - servidor: Laya ya vive en el A1 siempre encendida, aquí no se carga dos veces.
 */
export function planLayaLocalEnMedio(p: PerfilMedio): PlanLayaLocal {
  if (!p.visible) return no("pestaña oculta: en 2.º plano solo corre el reflejo (capas-autoadaptables §4)");
  if (p.bateria.baja && p.bateria.cargando !== true)
    return no("batería < 20 %: en 2.º plano solo corre el reflejo (capas-autoadaptables §4)");
  const presupuesto = presupuestoMedio(p);
  switch (p.plataforma) {
    case "servidor":
      return no("servidor: Laya del medio vive en el A1, siempre encendida; aquí no se carga (laya-y-habilidades §4)");
    case "web":
      return no("visita web: Laya va por la malla al A1 (laya-y-habilidades §4)");
    case "pwa": {
      if (!p.webgpu.disponible)
        return no("PWA sin WebGPU: laya-ts carga en el navegador con WebGPU o WASM (laya-y-habilidades §1)");
      if (!p.almacenamiento.persistente)
        return no("PWA sin almacenamiento persistente: persist() no concedido (capas-autoadaptables §4)");
      if ((p.almacenamiento.libreMb ?? 0) < PWA_PERSISTENTE_MIN_MB)
        return no("PWA con menos de 2 GB de almacenamiento persistente (capas-autoadaptables §4)");
      if ((p.base.ramGb ?? 0) < PWA_RAM_MIN_GB)
        return no("PWA con menos de 4 GB de memoria (laya-y-habilidades §1)");
      return cabeEnPresupuesto(presupuesto);
    }
    default:
      // Tauri, Android, iOS: solo si cabe en su presupuesto (sin WebGPU: puede usar runtime nativo).
      return cabeEnPresupuesto(presupuesto);
  }
}

/**
 * Elige el checkpoint más capaz que quepa en el presupuesto del medio: «multilingual»
 * completo da mejor confianza en español (mismo modelo, sin cuantizar); si no cabe,
 * «multilingual-int8» (la mitad de peso); si tampoco, no se carga y Laya pregunta fuera.
 */
function cabeEnPresupuesto(presupuesto: PresupuestoMedio): PlanLayaLocal {
  const orden: readonly ModeloLayaNavegador[] = ["multilingual", "multilingual-int8"];
  for (const modelo of orden) {
    const mb = TAMAÑO_MODELO_MB[modelo];
    if (presupuesto.disco_mb >= mb && presupuesto.ram_mb !== null && presupuesto.ram_mb >= mb)
      return {
        cargar: true,
        modelo,
        motivo:
          `cabe «${modelo}» en el presupuesto (${presupuesto.disco_mb} MB de disco, ` +
          `${presupuesto.ram_mb} MB de RAM): ${presupuesto.motivo}`,
      };
  }
  return no(
    `la capa Laya no cabe en el presupuesto del medio ` +
      `(${presupuesto.disco_mb} MB de disco, ${String(presupuesto.ram_mb)} MB de RAM): capas-autoadaptables §4`,
  );
}
