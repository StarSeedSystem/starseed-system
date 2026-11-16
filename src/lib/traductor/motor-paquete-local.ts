import type { MotorTraduccion } from "../traduccion/motor";

export interface InstaladorMotorLocal {
    instalado(origen: string, destino: string): Promise<boolean>;
    cargarPipeline(modelo: string): Promise<(textos: string[]) => Promise<string[]>>;
}

export interface AlmacenModelos {
    descargar(modeloId: string): Promise<void>;
    obtener(modeloId: string): string;
}

export function cargarPipelineTransformers(
    urlModulo: string,
    almacenModelos: AlmacenModelos,
): Promise<(textos: string[]) => Promise<string[]>> {
    return import(/* webpackIgnore: true */ urlModulo).then((mod) => {
        if (!mod) throw new Error("No se pudo cargar el motor local");
        return async (textos: string[]) => textos;
    });
}

export function motorPaqueteLocal(deps: {
    instalado(origen: string, destino: string): Promise<boolean>;
    cargarPipeline(modelo: string): Promise<(textos: string[]) => Promise<string[]>>;
    alcance?: "aparato";
}): MotorTraduccion {
    return {
        id: "paquete-local",
        alcance: deps.alcance ?? "aparato",
        disponible: async (origen: string, destino: string) => deps.instalado(origen, destino),
        traducir: async (textos: string[], origen: string, destino: string) => {
            if (textos.length === 0) return [];
            if (textos.length > 8) throw new Error("Lotes máximo de 8 textos");
            const modeloId = `${origen}-${destino}`;
            const traducir = await deps.cargarPipeline(modeloId);
            const resultados = await traducir(textos);
            if (resultados.length !== textos.length) throw new Error("Respuesta incompleta");
            return resultados;
        },
    };
}