import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import { enSegundoPlano } from "@/lib/astraura/capas/perfil-medio";

export type ResultadoPlanLayaLocal = {
  cargar: boolean;
  modelo: "multilingual-int8" | "multilingual" | null;
  motivo: string;
};

/**
 * Planifica si cargar Laya localmente en el navegador según el perfil del medio.
 * @param perfilMedio Perfil del medio actual
 * @returns Resultado con decisión de carga, modelo a usar y motivo
 */
export function planLayaLocal(perfilMedio: PerfilMedio): ResultadoPlanLayaLocal {
  // 0. Si faltan dependencias esenciales de Laya (vendor/laya-ts y modelo exportado)
  //    No podemos verificar en módulo puro; se asume que el entorno lo inyecta.
  //    Para ahora, se omite esta check (debe hacerse fuera o mediante variables de entorno).
  //    En los tests, se simulará mediante el plataforma o almacenamiento.

  // 1. Si estamos en segundo plano (batería < 20%, pestaña oculta o saveData) -> no cargar
  if (enSegundoPlano(perfilMedio)) {
    let causa = "";
    if (!perfilMedio.visible) causa = "pestaña oculta";
    else if (perfilMedio.bateria.baja && perfilMedio.bateria.cargando !== true) causa = "batería < 20 %";
    else if (perfilMedio.saveData) causa = "saveData activo";
    return {
      cargar: false,
      modelo: null,
      motivo: `2.º plano (${causa}): solo corre el reflejo (§4)`,
    };
  }

  // 2. Visita web: nunca carga localmente, va por la malla
  if (perfilMedio.plataforma === "web") {
    return {
      cargar: false,
      modelo: null,
      motivo: "visita web: va por la malla (§4)",
    };
  }

  // 3. Para PWA: requiere WebGPU, almacenamiento persistente >= 2 GB y memoria >= 4 GB
  if (perfilMedio.plataforma === "pwa") {
    const webgpuOk = perfilMedio.webgpu.disponible === true;
    const almacenamientoOk =
      perfilMedio.almacenamiento.persistente === true &&
      (perfilMedio.almacenamiento.libreMb ?? 0) >= 2048; // 2 GB in MB
    const memoriaOk = (perfilMedio.base.ramGb ?? 0) >= 4; // 4 GB

    if (webgpuOk && almacenamientoOk && memoriaOk) {
      // Se asume que el modelo int8 está disponible por defecto; en Tests se puede forzar otro
      return {
        cargar: true,
        modelo: "multilingual-int8",
        motivo: "PWA cumple requisitos: WebGPU, almacenamiento persistente >= 2 GB, memoria >= 4 GB",
      };
    } else {
      return {
        cargar: false,
        modelo: null,
        motivo: "PWA no cumple requisitos: falta WebGPU, almacenamiento o memoria suficiente",
      };
    }
  }

  // 4. Para app nativa (Tauri, Android, iOS): si cabe en su presupuesto
  if (
    perfilMedio.plataforma === "tauri" ||
    perfilMedio.plataforma === "android" ||
    perfilMedio.plataforma === "ios"
  ) {
    // Se asume que si es nativa y no está en segundo plano, cabe en el presupuesto
    // (el presupuesto de capa reflejo siempre está disponible para nativas)
    return {
      cargar: true,
      modelo: "multilingual-int8",
      motivo: "app nativa: cabe en el presupuesto (§4)",
    };
  }

  // 5. Servidor u otros: no se carga localmente en el navegador
  return {
    cargar: false,
    modelo: null,
    motivo: "plataforma no soportada para carga local de Laya en navigator",
  };
}