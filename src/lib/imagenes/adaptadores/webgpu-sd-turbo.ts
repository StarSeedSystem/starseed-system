/**
 * Imágenes locales de Astraura · SD-Turbo con WebGPU (IMG1011H, parte 1 de 3).
 * Basado en el ejemplo oficial de Microsoft (MIT):
 * https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo
 * Solo con WebGPU disponible y activado por la persona. Descarga de pesos solo con permiso.
 */
export interface EstadoWebGPU { disponible: boolean; mensaje: string; adaptador?: string | null; }
export interface EstadoMotorSDTurbo { cargado: boolean; mensaje: string; pesosEnCache: boolean; bytesEstimados?: number; }
export interface OpcionesWebGPUSD { activado: boolean; permitirDescargaPesos: boolean; }
export interface ResultadoDescargaPesos { descargado: boolean; mensaje: string; bytesDescargados: number; }
export interface ResultadoFlujoWebGPUSD { webgpu: EstadoWebGPU; descarga: ResultadoDescargaPesos; motor: EstadoMotorSDTurbo; capaRecomendada: "navegador" | "neurona" | "malla" | "espacio" | "web-gratis" | "externo"; mensajeFinal: string; }

export const LICENCIA_SD_TURBO = "Stability AI (su LICENSE.md; sin etiqueta en Hugging Face)";
export const ESTADO_LICENCIA_SD_TURBO = "sin comprobar del todo";
export const PESOS_SD_TURBO_BYTES_ESTIMADOS = 5.2 * 1024 ** 3;

export function detectarWebGPU(): EstadoWebGPU {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { disponible: false, mensaje: "WebGPU no está disponible en esta pestaña. Se usan las demás capas (neuronas locales, malla, web gratis)." };
  }
  return { disponible: true, adaptador: "WebGPU", mensaje: "WebGPU detectado. SD-Turbo puede correr en esta pestaña con onnxruntime-web y WebGPU." };
}

export function simularCargaMotorSDTurbo(opciones: OpcionesWebGPUSD, webgpu: EstadoWebGPU): EstadoMotorSDTurbo {
  if (!webgpu.disponible) return { cargado: false, mensaje: "No hay WebGPU: el motor SD-Turbo no carga. Se delega a las demás capas.", pesosEnCache: false };
  if (!opciones.activado) return { cargado: false, mensaje: "WebGPU disponible pero SD-Turbo no está activado por la persona. Se usan las demás capas.", pesosEnCache: false };
  if (!opciones.permitirDescargaPesos) return { cargado: false, mensaje: "Falta permiso para descargar los pesos a la caché del navegador (~5,2 GB estimados). Se usan las demás capas.", pesosEnCache: false, bytesEstimados: PESOS_SD_TURBO_BYTES_ESTIMADOS };
  return { cargado: true, mensaje: "Motor SD-Turbo simulado cargado con WebGPU (onnxruntime-web). Pesos en caché del navegador.", pesosEnCache: true, bytesEstimados: PESOS_SD_TURBO_BYTES_ESTIMADOS };
}

export function simularDescargaPesos(opciones: OpcionesWebGPUSD): ResultadoDescargaPesos {
  if (!opciones.permitirDescargaPesos) return { descargado: false, mensaje: "Sin permiso de la persona para descargar los pesos. Nada se descarga automáticamente.", bytesDescargados: 0 };
  if (!opciones.activado) return { descargado: false, mensaje: "SD-Turbo no está activado; no se solicita descarga.", bytesDescargados: 0 };
  return { descargado: true, mensaje: `Pesos de SD-Turbo (~${(PESOS_SD_TURBO_BYTES_ESTIMADOS / 1024 ** 3).toFixed(1)} GB estimados) guardados en caché del navegador. Descarga simulada sin red real.`, bytesDescargados: PESOS_SD_TURBO_BYTES_ESTIMADOS };
}

export function flujoWebGPUSD(opciones: OpcionesWebGPUSD): ResultadoFlujoWebGPUSD {
  const webgpu = detectarWebGPU();
  const descarga = simularDescargaPesos(opciones);
  const motor = simularCargaMotorSDTurbo(opciones, webgpu);
  const capaRecomendada: ResultadoFlujoWebGPUSD["capaRecomendada"] = motor.cargado ? "navegador" : webgpu.disponible ? "neurona" : "malla";
  const mensajeFinal = motor.cargado ? `Capa navegador (WebGPU): SD-Turbo activo con onnxruntime-web. ${ESTADO_LICENCIA_SD_TURBO}.` : `Capa ${capaRecomendada}: sin WebGPU o sin activación, se delega. ${ESTADO_LICENCIA_SD_TURBO} para SD-Turbo.`;
  return { webgpu, descarga, motor, capaRecomendada, mensajeFinal };
}
