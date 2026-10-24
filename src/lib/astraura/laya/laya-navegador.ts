// Laya en navegador y apps con laya-ts (WebGPU → WASM), tarea H de la Ola 1018L
// (architecture/laya-y-habilidades.md §4): decide PURO cuándo se carga el modelo
// en el medio local y cuándo se pregunta fuera (malla al A1 o servidor local de
// Laya), según el contrato capas-autoadaptables.md §4. El perfil llega ya medido
// (perfil-medio.ts): aquí no hay red, disco, reloj ni modelo real que cargar.

import { enSegundoPlano, presupuestoMedio, type PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

export type ModeloLayaNavegador = "multilingual-int8" | "multilingual";

export interface PlanLayaLocal {
  cargar: boolean;
  modelo: ModeloLayaNavegador | null;
  motivo: string;
}

/** laya-ts no está publicado en npm y laya-multilingual no tiene checkpoint ONNX exportado (tarea O): mientras uno y otro falten, nada carga aunque el medio cumpla. */
export const LAYA_TS_LISTO = false;
/** Pesos del checkpoint exportado en MB (mmBERT-base, 322 M: int8 ≈ 320 MB, fp32 ≈ 1,3 GB). El int8 manda (cabrá casi siempre y es más rápido); el fp32 espera a las cifras del banco (capas §9). */
export const PESO_INT8_MB = 320;
export const PESO_FP32_MB = 1300;
/** Límites del contrato para la PWA: ≥ 2 GB de almacenamiento persistente y ≥ 4 GB de memoria. */
export const PERSISTENTE_MIN_MB = 2048;
export const RAM_MIN_MB = 4096;

/** Salida «no se carga»: modelo fuera y motivo en una línea. */
function noCargar(motivo: string): PlanLayaLocal {
  return { cargar: false, modelo: null, motivo };
}

/** Memoria disponible en MB según lo medido (libre real del entorno, si no la del equipo); `null` = desconocida. */
function ramDisponibleMb(p: PerfilMedio): number | null {
  if (p.ramLibreMb !== null) return p.ramLibreMb;
  return p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024) : null;
}

/** Elige entre los exportados: el más ligero que quepa en disco y memoria (el int8 primero). */
function elegirModelo(discoMb: number | null, ramMb: number | null): ModeloLayaNavegador | null {
  if (discoMb === null || ramMb === null) return null;
  const pesos: ReadonlyArray<{ modelo: ModeloLayaNavegador; mb: number }> = [
    { modelo: "multilingual-int8", mb: PESO_INT8_MB },
    { modelo: "multilingual", mb: PESO_FP32_MB },
  ];
  const cabe = pesos.find((m) => discoMb >= m.mb && ramMb >= m.mb);
  return cabe?.modelo ?? null;
}

/** Disco disponible y por qué un modelo no cabe en este medio, sin duplicar la tabla §4 (usa presupuestoMedio). */
function disponibilidad(p: PerfilMedio): { almacena: boolean; discoMb: number | null; motivo: string } {
  if (p.plataforma === "pwa") {
    if (!p.webgpu.disponible) return { almacena: false, discoMb: null, motivo: "PWA sin WebGPU: el medio no cumple la condición del contrato, se pregunta fuera (§4)" };
    if (!p.almacenamiento.persistente) return { almacena: false, discoMb: null, motivo: "PWA sin persist() concedido: solo reflejo en caché, Laya se pregunta fuera (§4)" };
    const libre = p.almacenamiento.libreMb ?? 0;
    if (libre < PERSISTENTE_MIN_MB) {
      return { almacena: false, discoMb: null, motivo: `PWA con ${libre} MB libres en almacenamiento persistente (< 2 GB): se pregunta fuera (§4)` };
    }
    return { almacena: true, discoMb: libre, motivo: "PWA con WebGPU y ≥ 2 GB persistentes" };
  }
  if (p.plataforma === "tauri" || p.plataforma === "android" || p.plataforma === "ios") {
    const presupuesto = presupuestoMedio(p);
    if (presupuesto.disco_mb < PESO_INT8_MB) {
      return { almacena: false, discoMb: null, motivo: `app nativa: laya-multilingual no cabe en su presupuesto (${presupuesto.disco_mb} MB de disco): se pregunta al servidor (§4)` };
    }
    return { almacena: true, discoMb: presupuesto.disco_mb, motivo: "app nativa: cabe en su presupuesto (15 % del disco libre, tope 8 GB)" };
  }
  if (p.plataforma === "servidor") {
    return { almacena: false, discoMb: null, motivo: "servidor: corre el laya de 127.0.0.1:4470 (§4); laya-ts es solo navegador y apps" };
  }
  return { almacena: false, discoMb: null, motivo: "visita web: Laya pregunta por la malla al A1, nada se carga localmente (§4)" };
}

/** Decisión completa para el medio local: cargar laya-ts o preguntar fuera, con el motivo. */
export function planLayaLocal(p: PerfilMedio): PlanLayaLocal {
  if (enSegundoPlano(p)) {
    const causa = !p.visible ? "pestaña oculta" : p.saveData ? "saveData activo" : "batería baja";
    return noCargar(`2.º plano (${causa}): Laya no se carga, solo corre el reflejo (§4)`);
  }
  const disco = disponibilidad(p);
  if (!disco.almacena) return noCargar(disco.motivo);
  const ram = ramDisponibleMb(p);
  const modelo = elegirModelo(disco.discoMb, ram);
  if (!modelo || ram === null) {
    return noCargar(`memoria desconocida o insuficiente para ${modelo ?? "multilingual-int8"}: se pregunta fuera (§4)`);
  }
  if (ram < RAM_MIN_MB) {
    return noCargar(`memoria insuficiente para laya-ts (${ram} MB < 4.096 MB): se pregunta fuera (§4)`);
  }
  if (!LAYA_TS_LISTO) {
    return noCargar(`condiciones dadas para ${modelo}, pero laya-ts sigue sin publicar y laya-multilingual sin exportar a ONNX (tarea O): por ahora se pregunta por la malla o al servidor`);
  }
  return { cargar: true, modelo, motivo: `laya-ts con ${modelo} por WebGPU/WASM en este medio (§4)` };
}
