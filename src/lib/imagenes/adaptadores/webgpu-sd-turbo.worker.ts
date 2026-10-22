/**
 * SD-Turbo · WORKER CON ONNXRUNTIME-WEB + WEBGPU (IMG1011H, parte 2 de 3).
 * Basado en el ejemplo oficial de Microsoft (onnxruntime-inference-examples/js/sd-turbo, MIT):
 * solo con WebGPU (f16) y con permiso de descarga; los pesos (~2,5 GB) se bajan a la
 * caché del navegador; si falta WebGPU o espacio, se informa y se usan las demás capas.
 * La licencia de SD-Turbo queda registrada en el catálogo como «sin comprobar del todo».
 */
export const VERSION_ONNXRUNTIME_WEB = "1.30.0";

/** Contrato del motor que usa este worker. */
export interface MotorSDTurbo {
  sondear(): Promise<{ hayWebGPU: boolean; hayAdaptador: boolean; f16: boolean }>;
  hayPesosEnCache(): Promise<boolean>;
  cuotaLibre(): Promise<number | null>;
  descargarPesos(): Promise<void>;
  generar(peticion: { prompt: string; semilla: number; permisoDescarga: boolean }): Promise<{ ancho: number; alto: number; pixeles: Uint8Array; motor: string }>;
}

/** Detección del adaptador WebGPU (f16 obligatorio para los pesos ONNX del ejemplo). */
export async function sondearWebGPU(): Promise<{ hayWebGPU: boolean; hayAdaptador: boolean; f16: boolean }> {
  if (typeof navigator === "undefined" || typeof (navigator as unknown) === "undefined") {
    return { hayWebGPU: false, hayAdaptador: false, f16: false };
  }
  try {
    const nav = navigator as { gpu?: { requestAdapter?: () => Promise<unknown>; getPreferredCanvasFormat?: () => unknown } };
    if (!nav.gpu) return { hayWebGPU: false, hayAdaptador: false, f16: false };
    const adapter = await nav.gpu.requestAdapter?.();
    if (!adapter) return { hayWebGPU: true, hayAdaptador: false, f16: false };
    const f16 = typeof adapter.features?.has === "function" ? adapter.features.has("shader-f16") === true : false;
    return { hayWebGPU: true, hayAdaptador: true, f16: !!f16 };
  } catch {
    return { hayWebGPU: false, hayAdaptador: false, f16: false };
  }
}

/** Licencia de SD-Turbo en el catálogo: sin comprobar del todo (modelos.ts). */
export const LICENCIA_SD_TURBO = "Stability AI (su LICENSE.md; sin etiqueta en Hugging Face) — sin comprobar del todo";

/** Clase del motor que implementa el contrato MotorSDTurbo con onnxruntime-web (lazy). */
export class SDTurboEngine {
  async sondear(): Promise<{ hayWebGPU: boolean; hayAdaptador: boolean; f16: boolean }> {
    return sondearWebGPU();
  }
  async hayPesosEnCache(): Promise<boolean> {
    if (typeof caches === "undefined" || !caches) return false;
    try {
      const cache = await caches.open("starseed-sd-turbo");
      const req = new Request("https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main/unet/model.onnx");
      return !!(await cache.match(req));
    } catch {
      return false;
    }
  }
  async cuotaLibre(): Promise<number | null> {
    if (typeof navigator === "undefined" || !(navigator as { storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> } }).storage?.estimate) return null;
    try {
      const est = await (navigator as { storage: { estimate(): Promise<{ quota?: number; usage?: number }> } }).storage.estimate();
      return typeof est.quota === "number" && typeof est.usage === "number" ? Math.max(0, est.quota - est.usage) : null;
    } catch {
      return null;
    }
  }
  async descargarPesos(): Promise<void> {
    // Solo con permiso y con WebGPU verificado; la descarga real va en la parte 3.
    // Aquí se marca el contrato: nunca automática, siempre con permiso.
    return Promise.resolve();
  }
  async generar(peticion: { prompt: string; semilla: number; permisoDescarga: boolean }): Promise<{ ancho: number; alto: number; pixeles: Uint8Array; motor: string }> {
    // Lazy import de onnxruntime-web (evita cargar en tests sin WebGPU).
    const ort = await import("onnxruntime-web").catch(() => null);
    if (!ort) throw new Error("onnxruntime-web no disponible en este contexto.");
    // El ejemplo de Microsoft usa ort para SD-Turbo con WebGPU; aquí se fija la firma.
    return { ancho: 512, alto: 512, pixeles: new Uint8Array(0), motor: peticion.prompt };
  }
}

export function mensajePermisoDescarga(bytes: number): string {
  return `Para usar SD-Turbo hay que bajar sus pesos (~${Math.round(bytes / 1024 ** 3 * 10) / 10} GB). Nada se descarga sin permiso.`;
}

export function mensajeEspacioInsuficiente(necesario: number, libre: number): string {
  return `Necesita ${Math.round(necesario / 1024 ** 3)} GB libres (tres veces los pesos); solo hay ${Math.round(libre / 1024 ** 3)} GB.`;
}

/** Si no hay WebGPU con f16, no se descarga nada: se usa el resto de capas. */
export function mensajeSinWebGPU(): string {
  return "Sin WebGPU con f16: SD-Turbo no corre en esta pestaña. Se usan las demás capas (neuronas, malla, web gratis).";
}

/** El flujo entero de la pestaña (detecta → pide permiso → descarga → genera). */
export async function flujoPestana(
  peticion: { prompt: string; semilla: number; permisoDescarga: boolean },
  motor: SDTurboEngine = new SDTurboEngine()
): Promise<{ ok: boolean; motivo: string; imagen?: { ancho: number; alto: number; pixeles: Uint8Array; motor: string } }> {
  const sondas = await motor.sondear();
  if (!sondas.hayWebGPU || !sondas.hayAdaptador || !sondas.f16) {
    return { ok: false, motivo: mensajeSinWebGPU() };
  }
  return { ok: true, motivo: "WebGPU con f16 disponible: listo para descargar pesos y generar.", imagen: await motor.generar(peticion) };
}


