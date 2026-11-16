import type { MotorTraduccion, AlcanceMotor } from "@/lib/traduccion/motor";

const TRANSFORMERS_VERSION = "3.2.0";
const MAX_LOTE = 8;

export interface PipelineCargado {
    traducir: (textos: string[]) => string[];
    descargar: () => void;
}

export interface AlmacenModelos {
    obtenerRuta(modeloId: string): string | null;
    guardarRuta(modeloId: string, ruta: string): void;
}

export type Instalar = (origen: string, destino: string) => Promise<boolean>;
export type CargarPipeline = (modeloId: string) => Promise<PipelineCargado>;

export interface DepsMotorLocal {
    instalado: Instalar;
    cargarPipeline: CargarPipeline;
    alcance?: AlcanceMotor;
}

export async function cargarPipelineTransformers(
    urlModulo: string,
    almacenModelos: AlmacenModelos,
): Promise<PipelineCargado> {
    const mod = await import(/* webpackIgnore: true */ urlModulo);
    const transformers = mod as {
        pipeline: (tarea: string, modelo: string, opciones?: { device?: string; dtype?: string }) => PipelineCargado;
        env: { allowRemoteModels: boolean; allowLocalModels?: boolean };
    };
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
                const traducidos = pipeline.traducir(lote);
                resultados.push(...traducidos);
            }
            if (resultados.length !== textos.length) {
                throw new Error("El motor local devolvió otra cantidad de traducciones que la esperada.");
            }
            return resultados;
        },
    };
}