import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";

const TRANSFORMERS_VERSION = "3.2.0";
const MAX_LOTE = 8;

export interface PipelineCargado {
    traducir: (textos: string[]) => Promise<string[]>;
    descargar: () => void;
}

export interface AlmacenModelos {
    obtenerRuta(modeloId: string): string | null;
    guardarRuta(modeloId: string, ruta: string): void;
}

export interface DepsMotorLocal {
    instalado: (origen: string, destino: string) => Promise<boolean>;
    cargarPipeline: (modeloId: string) => Promise<PipelineCargado>;
    almacenModelos?: AlmacenModelos;
    alcance?: AlcanceMotor;
}

export async function cargarPipelineTransformers(
    urlModulo: string,
    _almacenModelos: AlmacenModelos,
): Promise<PipelineCargado> {
    let transformers: { pipeline: (tarea: string, modelo: string, opciones?: { device?: string; dtype?: string }) => Promise<PipelineCargado>; env: { allowRemoteModels: boolean } };
    try {
        const mod = await import(/* webpackIgnore: true */ urlModulo);
        transformers = mod;
    } catch (err) {
        throw new Error("No se pudo cargar el motor local");
    }
    transformers.env.allowRemoteModels = false;
    return transformers.pipeline("translation", "modelo-local", { device: "wasm", dtype: "q4" });
}

export function motorPaqueteLocal(deps: DepsMotorLocal): MotorTraduccion {
    const alcance = deps.alcance ?? "aparato";
    let pipelineActual: PipelineCargado | null = null;
    let modeloActual: string | null = null;

    async function asegurarPipeline(origen: string, destino: string): Promise<PipelineCargado> {
        const modeloId = `${origen}-${destino}`;
        if (modeloActual === modeloId && pipelineActual) return pipelineActual;

        if (pipelineActual) {
            pipelineActual.descargar();
            pipelineActual = null;
        }
        modeloActual = null;

        pipelineActual = await deps.cargarPipeline(modeloId);
        modeloActual = modeloId;
        return pipelineActual;
    }

    return {
        id: "paquete-local",
        alcance,
        disponible: async (origen, destino) => deps.instalado(origen, destino),
        traducir: async (textos, origen, destino) => {
            const pipeline = await asegurarPipeline(origen, destino);
            const resultados: string[] = [];
            for (let i = 0; i < textos.length; i += MAX_LOTE) {
                const lote = textos.slice(i, i + MAX_LOTE);
                const traducidos = await pipeline.traducir(lote);
                resultados.push(...traducidos);
            }
            if (resultados.length !== textos.length) {
                throw new Error("El motor local devolvió otra cantidad de traducciones que la esperada.");
            }
            return resultados;
        },
    };
}