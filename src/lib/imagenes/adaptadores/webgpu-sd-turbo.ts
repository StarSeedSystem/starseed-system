/**
 * Imágenes locales de Astraura · WEBGPU + SD-TURBO (IMG1011H). Contrato:
 * architecture/astraura-imagenes.md §1, §8. Basado en el ejemplo oficial de
 * Microsoft (MIT): https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo
 *
 * Solo si hay WebGPU y la persona activa esta capa. La descarga de pesos
 * (varios GB) solo con permiso explícito, solo los archivos necesarios y
 * tras comprobar ≥ 3 veces el espacio libre. Si no hay WebGPU o no está
 * activa, se indica claramente y la petición cae a las demás capas.
 * Licencia de SD-Turbo: «sin comprobar del todo».
 */

export interface EstadoWebGpuSdTurbo {
  webGpuDisponible: boolean;
  activadaPorPersona: boolean;
  licenciaEstado: "sin-comprobar-del-todo";
  mensajeNoDisponible?: string;
}

export interface DescargaPesos {
  archivosNecesarios: string[];
  bytesEstimados: number;
  espacioLibreBytes: number;
  puedeDescargar: boolean;
  mensaje: string;
}

/** Comprueba si WebGPU está disponible en este contexto (sin lanzar). */
export function detectarWebGpu(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.gpu) return false;
  return true;
}

/** Devuelve el estado de esta capa para el catálogo y la UI. */
export function estadoCapa(activada: boolean): EstadoWebGpuSdTurbo {
  const disponible = detectarWebGpu();
  if (!disponible && !activada) {
    return {
      webGpuDisponible: false,
      activadaPorPersona: false,
      licenciaEstado: "sin-comprobar-del-todo",
      mensajeNoDisponible: "No hay WebGPU disponible en este navegador. Se usan las demás capas (navegador con WebGPU, neurona, malla, web gratis).",
    };
  }
  if (!activada) {
    return {
      webGpuDisponible: true,
      activadaPorPersona: false,
      licenciaEstado: "sin-comprobar-del-todo",
      mensajeNoDisponible: "WebGPU disponible, pero esta capa no está activada por la persona. Se usan las demás capas.",
    };
  }
  return {
    webGpuDisponible: true,
    activadaPorPersona: true,
    licenciaEstado: "sin-comprobar-del-todo",
  };
}

/** Registra la licencia en el catálogo como «sin comprobar del todo». */
export function licenciaCatalogo(): string {
  return "Stability AI (su LICENSE.md; sin etiqueta en Hugging Face) — sin comprobar del todo";
}

/** Comprueba si hay espacio suficiente (≥ 3×) para los pesos. Nada se descarga automáticamente. */
export function puedeDescargarPesos(archivos: readonly string[], bytesEstimados: number, espacioLibreBytes: number): DescargaPesos {
  const archivosNecesarios = [...archivos];
  const bytesTotales = bytesEstimados > 0 ? bytesEstimados : 0;
  const suficiente = bytesTotales > 0 && espacioLibreBytes >= bytesTotales * 3;
  return {
    archivosNecesarios,
    bytesEstimados: bytesTotales,
    espacioLibreBytes,
    puedeDescargar: suficiente && archivosNecesarios.length > 0,
    mensaje: suficiente
      ? `Espacio suficiente (${(espacioLibreBytes / 1024 ** 3).toFixed(1)} GB libres, se piden ${(bytesTotales / 1024 ** 3).toFixed(1)} GB de pesos con triple de seguridad). Descarga solo con permiso explícito.`
      : `Espacio insuficiente o desconocido. Se pide el triple (${(bytesTotales * 3 / 1024 ** 3).toFixed(1)} GB) para una descarga segura de ${archivosNecesarios.join(", ")}.`,
  };
}

/** Explica el uso del worker para el motor, sin lanzar procesos. */
export function describeWorker(): string {
  return "El motor corre en un worker (WebGPU + onnxruntime-web 1.30.0, MIT). No se lanza automáticamente; solo con WebGPU activa y permiso explícito.";
}

/** Flujo de generación simulado con el motor. No lanza descargas reales sin permiso. */
export async function flujoSimulado(prompt: string, semilla: number): Promise<{ ok: boolean; url?: string; mensaje: string; motorSimulado: boolean }> {
  return {
    ok: true,
    url: `simulado://sd-turbo/webgpu?prompt=${encodeURIComponent(prompt)}&seed=${semilla}`,
    mensaje: "Motor simulado: WebGPU + SD-Turbo. La descarga de pesos requiere activación y permiso explícito (varios GB).",
    motorSimulado: true,
  };
}
