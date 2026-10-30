// Laya en el navegador y las apps (architecture/laya-y-habilidades.md §4, Ola 1018L · LYS1018H).
// Módulo PURO: recibe el perfil del medio ya medido y la disponibilidad inyectada; sin red, sin disco
// ni reloj. Decide con la tabla de capas-autoadaptables §4 y con `answer_confidence` en las llamadas.
import { presupuestoMedio, type PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

export type ModeloLaya = "multilingual-int8" | "multilingual";

export interface PlanLayaLocal {
  cargar: boolean;
  modelo: ModeloLaya | null;
  motivo: string;
}

/** Lo que aún no existe en el repo: `vendor/laya-ts` y el modelo exportado de la tarea O. */
export interface DisponibilidadLaya {
  layaTsDisponible?: boolean;
  modeloExportado?: boolean;
}

/** `laya-multilingual` (mmBERT-base, 322 M) en fp32 e int8, en MB aproximados. */
const MODELO_MULTILINGUAL_MB = 1300;
const MODELO_INT8_MB = 400;
/** Umbrales de §4 para PWA: 2 GB de almacenamiento persistente y 4 GB de memoria. */
const PWA_DISCO_MIN_MB = 2048;
const PWA_RAM_MIN_MB = 4096;
/** Con holgura de memoria se prefiere fp32; si no, int8. */
const RAM_FOLGADA_MB = 6144;

const no = (motivo: string): PlanLayaLocal => ({ cargar: false, modelo: null, motivo });
const si = (modelo: ModeloLaya, motivo: string): PlanLayaLocal => ({ cargar: true, modelo, motivo });

/** Memoria disponible en MB: la libre medida manda; si no, la del equipo. `null` = no se sabe. */
const memoriaMb = (p: PerfilMedio): number | null =>
  p.ramLibreMb ?? (p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024) : null);

/** int8 cuando el modelo grande no cabe con holgura; el fp32 solo con disco y memoria de sobra. */
function elegirModelo(libreMb: number, ramMb: number | null): ModeloLaya {
  const holgura = ramMb !== null && ramMb >= RAM_FOLGADA_MB;
  return libreMb >= MODELO_MULTILINGUAL_MB && holgura ? "multilingual" : "multilingual-int8";
}

/** PWA instalada: WebGPU, almacenamiento persistente ≥ 2 GB y memoria ≥ 4 GB (§4). */
function planPwa(p: PerfilMedio): PlanLayaLocal {
  if (!p.webgpu.disponible) return no("PWA sin WebGPU: Laya va por la malla (§4)");
  if (!p.almacenamiento.persistente) return no("PWA sin almacenamiento persistente: no se guarda el modelo (§4)");
  const libreMb = p.almacenamiento.libreMb ?? 0;
  if (libreMb < PWA_DISCO_MIN_MB) {
    return no(`PWA con ${libreMb} MB de almacenamiento (mínimo 2 GB): Laya va por la malla (§4)`);
  }
  const ramMb = memoriaMb(p);
  if (ramMb === null || ramMb < PWA_RAM_MIN_MB) {
    return no("PWA con menos de 4 GB de memoria: Laya va por la malla (§4)");
  }
  const modelo = elegirModelo(libreMb, ramMb);
  return si(modelo, `PWA con WebGPU y presupuesto suficiente: Laya local (${modelo}) (§4)`);
}

/** App nativa: carga si el modelo cabe en su presupuesto de disco (15 % libre, tope 8 GB). */
function planNativa(p: PerfilMedio): PlanLayaLocal {
  const presupuestoMb = presupuestoMedio(p).disco_mb;
  if (presupuestoMb < MODELO_INT8_MB) {
    return no(`app nativa con ${presupuestoMb} MB de presupuesto: no cabe Laya (mínimo int8) (§4)`);
  }
  const modelo = elegirModelo(presupuestoMb, memoriaMb(p));
  return si(modelo, `app nativa con presupuesto para Laya local (${modelo}) (§4)`);
}

export function planLayaLocal(
  perfil: PerfilMedio,
  disponibilidad: DisponibilidadLaya = {},
): PlanLayaLocal {
  if (disponibilidad.layaTsDisponible !== true || disponibilidad.modeloExportado !== true) {
    return no("faltan vendor/laya-ts y el modelo exportado (tarea O): Laya no se carga en el aparato");
  }
  if (perfil.bateria.baja) return no("batería por debajo del 20 %: Laya no se carga en segundo plano (§4)");
  if (!perfil.visible) return no("pestaña oculta: Laya no se carga en segundo plano (§4)");
  switch (perfil.plataforma) {
    case "pwa":
      return planPwa(perfil);
    case "tauri":
    case "android":
    case "ios":
      return planNativa(perfil);
    case "web":
      return no("visita web: Laya va por la malla, nunca se carga en el aparato (§4)");
    default:
      return no("servidor: Laya corre en el servidor propio, no en este aparato");
  }
}
