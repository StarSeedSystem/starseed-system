/** Motor local de traducción (TRA1116-APP-F1): Marian/OPUS-MT por transformers.js (ONNX, WASM).
 * Puro: sin red salvo CDN controlada para pipeline, inyectable, acotado a aparato. */

import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";

export interface DepsMotorLocal {
  instalado(origen: string, destino: string): Promise<boolean>;
  cargarPipeline(modelo: string): Promise<(textos: string[], modelo: string) => Promise<string[]>>;
  alcance?: AlcanceMotor;
}

export const VERSION_TRANSFORMERS = "2.17.2";
export const CDN_TRANSFORMERS_DEFAULT = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${VERSION_TRANSFORMERS}`;

export function motorPaqueteLocal(deps: DepsMotorLocal): MotorTraduccion {
  let parActual: string | null = null;
  let pipelineActual: ((textos: string[]) => Promise<string[]>) | null = null;

  const obtenerModeloId = (origen: string, destino: string) => `Xenova/opus-mt-${origen}-${destino}`;

  return {
    id: "paquete-local",
    alcance: deps.alcance ?? "aparato",
    disponible: async (origen, destino) => {
      try {
        return await deps.instalado(origen, destino);
      } catch {
        return false;
      }
    },
    traducir: async (textos, origen, destino) => {
      const par = `${origen}-${destino}`;
      if (parActual !== par) {
        parActual = null;
        pipelineActual = null;
        const modeloId = obtenerModeloId(origen, destino);
        pipelineActual = await deps.cargarPipeline(modeloId);
        parActual = par;
      }
      if (!pipelineActual) {
        throw new Error("No se pudo cargar el motor local");
      }

      const resultados: string[] = [];
      const TAM_LOTE = 8;
      for (let i = 0; i < textos.length; i += TAM_LOTE) {
        const lote = textos.slice(i, i + TAM_LOTE);
        const traducidosLote = await pipelineActual(lote, obtenerModeloId(origen, destino));
        if (traducidosLote.length !== lote.length) {
          throw new Error("El motor local devolvió una cantidad diferente de traducciones.");
        }
        resultados.push(...traducidosLote);
      }
      return resultados;
    },
  };
}

export async function cargarPipelineTransformers(
  urlModulo: string = CDN_TRANSFORMERS_DEFAULT,
  almacenModelos: Record<string, unknown> = {},
): Promise<(textos: string[]) => Promise<string[]>> {
  try {
    const mod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ urlModulo);
    if (mod?.env) {
      mod.env.allowRemoteModels = false;
      mod.env.allowLocalModels = true;
    }
    const fnPipeline = mod?.pipeline;
    if (typeof fnPipeline !== "function") {
      throw new Error("Módulo sin pipeline");
    }
    return async (textos: string[], modelo: string) => {
      const traductor = await fnPipeline("translation", modelo);
      const salida = [];
      for (const t of textos) {
        const res = await traductor(t);
        salida.push(res?.[0]?.translation_text ?? t);
      }
      return salida;
    };
  } catch (err) {
    throw new Error(`No se pudo cargar el motor local: ${(err as Error)?.message ?? "error desconocido"}`);
  }
}
