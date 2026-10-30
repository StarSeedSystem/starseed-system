/**
 * Laya en el navegador y apps nativas (tarea H de la Ola 1018L · LYS1018H): la
 * decisión pura `planLayaLocal(perfilMedio)` del contrato capas-autoadaptables.md §4.
 * Módulo PURO: el medio llega medido por `perfil-medio.ts`; sin red, sin modelos.
 */
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

/** Veredicto de si este medio carga Laya local y con qué modelo exportado. */
export interface VeredictoLaya {
  cargar: boolean;
  modelo: "multilingual-int8" | "multilingual" | null;
  motivo: string;
}

/** mb libres de almacenamiento persistente; `null` si el medio no lo dice. */
function mbLibres(p: PerfilMedio): number | null {
  const { cuotaMb, libreMb } = p.almacenamiento;
  if (cuotaMb !== null && libreMb !== null) return Math.min(cuotaMb, libreMb);
  if (libreMb !== null) return libreMb;
  return cuotaMb;
}

/** ¿Quién de por sí no puede ejecutar Laya local, por medio o por 2.º plano? */
function frenoConcreto(p: PerfilMedio): string | null {
  if (!p.visible) return "el medio está en 2.º plano (pestaña oculta): toca reflejo y por la malla (§4)";
  if (p.bateria.baja && p.bateria.cargando !== true) {
    return "el medio está en 2.º plano (batería < 20 % sin cargador): toca reflejo y por la malla (§4)";
  }
  if (p.saveData) return "el medio está en 2.º plano (saveData activo): toca reflejo y por la malla (§4)";
  if (p.plataforma === "web") return "Laya en una visita web va por la malla; en navegador solo reflejo ≤ 12 MB (§4)";
  if (!p.webgpu.disponible) return "Laya con laya-ts necesita WebGPU en la app; sin él va por la malla (§4)";
  const libres = mbLibres(p);
  if (!p.almacenamiento.persistente) return "el almacenamiento no es persistente: el modelo exportado no puede quedar guardado (§4)";
  if (libres === null || libres < 2048) {
    return "faltan 2 GB de almacenamiento persistente para el modelo exportado de Laya (§4)";
  }
  if (p.base.ramGb !== null && p.base.ramGb < 4) {
    return "se necesitan 4 GB de RAM en el equipo para ejecutar Laya; va por la malla (§4)";
  }
  if (p.ramLibreMb !== null && p.ramLibreMb < 4096) {
    return "se necesitan 4 GB de RAM libres para ejecutar Laya; va por la malla (§4)";
  }
  return null;
}

/** Freno mientras no existan `vendor/laya-ts` ni el modelo exportado (tarea O de la Ola 1018L). */
const PENDIENTE_LAYA_TS =
  "El medio es capaz, pero laya-ts y el modelo multilingual exportado a ONNX aún no están disponibles (tarea O, pendiente de medir): Laya sigue por la malla en el A1. (§4)";

/**
 * Decisión pura: ¿carga Laya este medio ahora mismo? Mientras la tarea O no
 * publique el checkpoint exportado, siempre responde «no» con el motivo.
 */
export function planLayaLocal(p: PerfilMedio): VeredictoLaya {
  const freno = frenoConcreto(p);
  return freno
    ? { cargar: false, modelo: null, motivo: freno }
    : { cargar: false, modelo: null, motivo: PENDIENTE_LAYA_TS };
}
