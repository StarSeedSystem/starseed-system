// Laya en navegador y apps (Ola 1018L · LYS1018H): cuándo carga y cuándo se pregunta fuera.
// Módulo PURO: sin red, sin disco, sin reloj. Usa solo el perfil del medio inyectado.
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

export interface ResultadoPlanLaya {
  cargar: boolean;
  modelo: "multilingual-int8" | "multilingual" | null;
  motivo: string;
}

/** Evalúa si Laya puede cargarse localmente según el contrato de capas-autoadaptables §4. */
const VENDOR_LAYA_TS = false; // `vendor/laya-ts` aún no existe (tarea O pendiente).
const MODELO_EXPORTADO = false; // modelo exportado `multilingual-int8` aún no existe.

/** Evalúa si Laya puede cargarse localmente según el contrato de capas-autoadaptables §4. */
export function planLayaLocal(perfilMedio: PerfilMedio): ResultadoPlanLaya {
  const razones: string[] = [];
  if (!VENDOR_LAYA_TS || !MODELO_EXPORTADO) {
    razones.push("vendor/laya-ts y el modelo exportado (tarea O) no existen aún");
  }
  // §4: visita web nunca carga local (va por la malla).
  const esWebVisita = perfilMedio.plataforma !== "pwa" && perfilMedio.plataforma !== "tauri" && perfilMedio.plataforma !== "android" && perfilMedio.plataforma !== "ios" && perfilMedio.plataforma !== "servidor";
  if (esWebVisita) razones.push("visita web: Laya va por la malla, no carga local");
  // PWA con WebGPU y ≥ 2 GB persistente y ≥ 4 GB de memoria podría cargar; aquí no aplica por falta de archivos.
  if (perfilMedio.plataforma === "pwa" && perfilMedio.webgpu.disponible && perfilMedio.almacenamiento.persistente && (perfilMedio.almacenamiento.libreMb ?? 0) >= 2048 && (perfilMedio.base.ramGb ?? 0) >= 4) {
    razones.push("PWA con WebGPU y presupuesto: podría cargar, pero faltan archivos");
  }
  // App nativa si cabe en presupuesto: no aplica mientras no existan los archivos.
  if (perfilMedio.plataforma === "tauri" || perfilMedio.plataforma === "android" || perfilMedio.plataforma === "ios") {
    razones.push("app nativa: cabe en presupuesto, pero faltan archivos");
  }
  // Batería < 20 % o pestaña oculta → no carga.
  if (perfilMedio.bateria.baja && perfilMedio.bateria.cargando !== true) {
    razones.push("batería baja (< 20 %) sin cargar: no carga");
  }
  if (!perfilMedio.visible) {
    razones.push("pestaña oculta: no carga");
  }
  // Según §2 del contrato: Laya en CPU tarda segundos; nunca bloquea la primera palabra.
  const motivo = razones.length ? razones.join("; ") : "Laya va por la malla o servidores (archivo no disponible)";
  return { cargar: false, modelo: null, motivo };
}
