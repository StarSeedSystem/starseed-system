import { MotorTraduccion, AlcanceMotor } from "./motor";
import { modeloPara, ruta2saltos } from "./modelos-locales";

export const VERSION_TRANSFORMERS_LOCAL = "3.0.2";

export interface DepsPaqueteLocal {
    readonly instalado: (origen: string, destino: string) => Promise<boolean>;
    readonly cargarPipeline: (modeloRepo: string) => Promise<(textos: readonly string[]) => Promise<string[]>>;
    readonly alcance?: AlcanceMotor;
}

export function motorPaqueteLocal(deps: DepsPaqueteLocal): MotorTraduccion {
    const alcance = deps.alcance ?? "aparato";
    let activoRepo: string | null = null;
    let activoPipeline: ((textos: readonly string[]) => Promise<string[]>) | null = null;

    async function obtenerPipeline(repo: string) {
        if (activoRepo !== repo) {
            activoPipeline = null;
            activoRepo = repo;
            activoPipeline = await deps.cargarPipeline(repo);
        }
        return activoPipeline ?? (activoPipeline = await deps.cargarPipeline(repo));
    }

    return {
        id: "paquete-local",
        alcance,
        disponible: async (origen, destino) => {
            const m = modeloPara(origen, destino);
            if (m) return await deps.instalado(origen, destino);
            const r2 = ruta2saltos(origen, destino);
            if (!r2) return false;
            const [src, mid, dst] = r2.ruta;
            return (await deps.instalado(src, mid)) && (await deps.instalado(mid, dst));
        },
        traducir: async (textos, origen, destino) => {
            if (textos.length === 0) return [];
            const m = modeloPara(origen, destino);
            if (m) {
                const pipe = await obtenerPipeline(m.repo);
                const salidas: string[] = [];
                for (let i = 0; i < textos.length; i += 8) {
                    salidas.push(...(await pipe(textos.slice(i, i + 8))));
                }
                return salidas;
            }
            const r2 = ruta2saltos(origen, destino);
            if (r2) {
                const [src, mid, dst] = r2.ruta;
                const m1 = modeloPara(src, mid);
                const m2 = modeloPara(mid, dst);
                if (!m1 || !m2) throw new Error("Ruta inválida.");
                const pipe1 = await obtenerPipeline(m1.repo);
                const intermedio: string[] = [];
                for (let i = 0; i < textos.length; i += 8) {
                    intermedio.push(...(await pipe1(textos.slice(i, i + 8))));
                }
                const pipe2 = await obtenerPipeline(m2.repo);
                const finales: string[] = [];
                for (let i = 0; i < intermedio.length; i += 8) {
                    finales.push(...(await pipe2(intermedio.slice(i, i + 8))));
                }
                return finales;
            }
            throw new Error(`No hay modelo para ${origen} → ${destino}`);
        },
    };
}

export async function cargarPipelineTransformers(
    urlModulo: string = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2"
): Promise<(modeloRepo: string) => (textos: readonly string[]) => Promise<string[]>> {
    try {
        const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ urlModulo)) as Record<string, unknown>;
        const env = mod.env as { allowRemoteModels?: boolean; allowLocalModels?: boolean } | undefined;
        if (env) {
            env.allowRemoteModels = false;
            env.allowLocalModels = true;
        }
        const pipelineFn = mod.pipeline as ((task: string, model: string) => Promise<(input: unknown) => Promise<unknown>>) | undefined;
        if (typeof pipelineFn !== "function") throw new Error();
        return async (modeloRepo) => {
            const pipe = await pipelineFn("translation", modeloRepo);
            return async (textos) => {
                const res = await pipe(textos);
                const arr = Array.isArray(res) ? res : [res];
                return arr.map((item) => {
                    if (typeof item === "string") return item;
                    const obj = item as Record<string, unknown> | null;
                    return String(obj?.translation_text ?? obj?.text ?? item);
                });
            };
        };
    } catch {
        throw new Error("No se pudo cargar el motor local");
    }
}
