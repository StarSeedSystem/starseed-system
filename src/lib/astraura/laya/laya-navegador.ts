import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import { enSegundoPlano } from "@/lib/astraura/capas/perfil-medio";

/** Disponibilidad del modelo exportado (tarea O). */
const MODELO_EXPORTADO = false;

export type ModeloLaya = "multilingual-int8" | "multilingual" | null;

export interface PlanLayaLocal {
  cargar: boolean;
  modelo: ModeloLaya;
  motivo: string;
}

/**
 * Decide si Laya se carga localmente en el navegador/PWA/app nativa.
 * Reglas (capas-autoadaptables §4):
 * - Visita web: nunca (va por la malla).
 * - PWA con WebGPU, almacenamiento persistente ≥ 2 GB y RAM ≥ 4 GB.
 * - App nativa si cabe en su presupuesto.
 * - Batería < 20 % o pestaña oculta → no.
 * - Mientras no exista `vendor/laya-ts` ni el modelo exportado → false.
 */
export function planLayaLocal(perfil: PerfilMedio): PlanLayaLocal {
  // 1. Visita web (plataforma por defecto "web")
  if (perfil.plataforma === "web") {
    return { cargar: false, modelo: null, motivo: "visita web: Laya via malla" };
  }

  // 2. Segundo plano
  if (enSegundoPlano(perfil)) {
    return { cargar: false, modelo: null, motivo: "segundo plano: solo reflejo" };
  }

  // 3. Evaluar criterios según plataforma
  let puedeCargar = false;
  let modelo: ModeloLaya = null;
  let motivo = "";

  switch (perfil.plataforma) {
    case "pwa": {
      const webgpu = perfil.webgpu.disponible;
      const persistente = perfil.almacenamiento.persistente;
      const libreMb = perfil.almacenamiento.libreMb ?? 0;
      const ramGb = perfil.base.ramGb ?? 0;
      if (webgpu && persistente && libreMb >= 2048 && ramGb >= 4) {
        puedeCargar = true;
        modelo = "multilingual-int8";
        motivo = "PWA cumple requisitos WebGPU, almacenamiento ≥ 2 GB y RAM ≥ 4 GB";
      } else {
        motivo = "PWA no cumple requisitos para Laya local";
      }
      break;
    }
    case "tauri":
    case "android":
    case "ios": {
      // Presupuesto nativo ya calculado en presupuestoMedio; aquí verificamos que haya espacio.
      const libreMb = perfil.almacenamiento.libreMb ?? 0;
      const ramGb = perfil.base.ramGb ?? 0;
      // Aproximación: requiere al menos 500 MB disco y 2 GB RAM
      if (libreMb >= 512 && ramGb >= 2) {
        puedeCargar = true;
        modelo = "multilingual-int8";
        motivo = "App nativa con presupuesto suficiente";
      } else {
        motivo = "App nativa sin presupuesto suficiente para Laya";
      }
      break;
    }
    case "servidor": {
      // En servidor siempre puede si hay RAM
      if ((perfil.ramLibreMb ?? 0) >= 2048) {
        puedeCargar = true;
        modelo = "multilingual";
        motivo = "Servidor con RAM suficiente";
      } else {
        motivo = "Servidor sin RAM suficiente";
      }
      break;
    }
    default:
      motivo = "Plataforma desconocida";
  }

  if (!puedeCargar) {
    return { cargar: false, modelo: null, motivo };
  }

  // 4. Modelo exportado aún no disponible (tarea O)
  if (!MODELO_EXPORTADO) {
    return {
      cargar: false,
      modelo: null,
      motivo: "laya-ts o modelo multilingual no exportados (tarea O pendiente)",
    };
  }

  return { cargar: true, modelo, motivo };
}