import { describe, expect, it, vi } from "vitest";

import { motorPaqueteLocal, type PipelineCargado } from "@/lib/traductor/motor-local";
import type { MotorTraduccion } from "@/lib/traduccion/motor";

function crearPipelineFalso(salida: (t: string) => string): PipelineCargado {
    const descargar = vi.fn();
    return {
        traducir: async (textos: string[]) => textos.map(salida),
        descargar,
    };
}

function motorLocalFalso(opciones: {
    instalado?: boolean;
    pipelineSalida?: (t: string) => string;
    fallarCarga?: boolean;
    llamadasInstalado?: string[][];
    llamadasPipeline?: string[][];
} = {}): MotorTraduccion {
    const { instalado = true, pipelineSalida = (t) => t, fallarCarga = false, llamadasInstalado, llamadasPipeline } = opciones;
    let pipeline: PipelineCargado | null = null;

    return motorPaqueteLocal({
        alcance: "aparato",
        instalado: async (origen, destino) => {
            llamadasInstalado?.push([origen, destino]);
            return instalado;
        },
        cargarPipeline: async (modeloId) => {
            llamadasPipeline?.push([modeloId]);
            if (fallarCarga) throw new Error("No se pudo cargar el motor local");
            pipeline = crearPipelineFalso(pipelineSalida);
            return pipeline;
        },
    });
}

describe("motorPaqueteLocal", () => {
    it("id y alcance correctos", () => {
        const motor = motorLocalFalso();
        expect(motor.id).toBe("paquete-local");
        expect(motor.alcance).toBe("aparato");
    });

    it("disponible delega en instalado", async () => {
        const llamadas: string[][] = [];
        const motor = motorLocalFalso({ instalado: true, llamadasInstalado: llamadas });
        expect(await motor.disponible("es", "en")).toBe(true);
        expect(llamadas).toEqual([["es", "en"]]);

        const motorNo = motorLocalFalso({ instalado: false });
        expect(await motorNo.disponible("es", "fr")).toBe(false);
    });

    it("traducir por lotes de 8 y devuelve misma cantidad", async () => {
        const motor = motorLocalFalso({ pipelineSalida: (t) => t.toUpperCase() });
        const textos = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
        const resultado = await motor.traducir(textos, "es", "en");
        expect(resultado).toHaveLength(10);
        expect(resultado).toEqual(textos.map((t) => t.toUpperCase()));
    });

    it("cambio de par descarga pipeline anterior", async () => {
        const pipelines: PipelineCargado[] = [];
        const motor = motorPaqueteLocal({
            alcance: "aparato",
            instalado: async () => true,
            cargarPipeline: async () => {
                const p = crearPipelineFalso((t) => t);
                pipelines.push(p);
                return p;
            },
        });

        await motor.traducir(["a"], "es", "en");
        await motor.traducir(["b"], "fr", "de");
        expect(pipelines).toHaveLength(2);
        expect(pipelines[0]!.descargar).toHaveBeenCalled();
    });

    it("error de carga se propaga con su mensaje", async () => {
        const motor = motorLocalFalso({ fallarCarga: true });
        await expect(motor.traducir(["hola"], "es", "en")).rejects.toThrow("No se pudo cargar el motor local");
    });

    it("alcance es aparato (privado)", async () => {
        const motor = motorLocalFalso();
        expect(motor.alcance).toBe("aparato");
    });

    it("si instalado devuelve false, disponible es false", async () => {
        const motor = motorLocalFalso({ instalado: false });
        expect(await motor.disponible("es", "en")).toBe(false);
    });

    it("traducción vacía devuelve array vacío", async () => {
        const motor = motorLocalFalso();
        const resultado = await motor.traducir([], "es", "en");
        expect(resultado).toEqual([]);
    });

    it("lote exacto de 8 no hace split extra", async () => {
        const textos = Array.from({ length: 8 }, (_, i) => `texto${i}`);
        const motor = motorLocalFalso({ pipelineSalida: (t) => t + "!" });
        const resultado = await motor.traducir(textos, "es", "en");
        expect(resultado).toHaveLength(8);
        expect(resultado[0]).toBe("texto0!");
    });
});

