import { describe, it, expect } from "vitest";
import { motorPaqueteLocal, cargarPipelineTransformers } from "../motor-local";

describe("motor local de traducción", () => {
    it("tiene id 'paquete-local' y alcance 'aparato'", () => {
        const motor = motorPaqueteLocal({
            instalado: async () => false,
            cargarPipeline: async () => async (t) => t,
        });
        expect(motor.id).toBe("paquete-local");
        expect(motor.alcance).toBe("aparato");
    });

    it("comprueba disponibilidad directo y de dos saltos", async () => {
        const instalado = async (o: string, d: string) => o === "es" && d === "en";
        const motor = motorPaqueteLocal({
            instalado,
            cargarPipeline: async () => async (t) => t,
        });

        expect(await motor.disponible("es", "en")).toBe(true);
        expect(await motor.disponible("en", "es")).toBe(false);

        const motor2 = motorPaqueteLocal({
            instalado: async (o, d) => (o === "fr" && d === "en") || (o === "en" && d === "de"),
            cargarPipeline: async () => async (t) => t,
        });
        expect(await motor2.disponible("fr", "de")).toBe(true);
    });

    it("traduce por lotes y respeta el cambio de par descargando el anterior", async () => {
        const cargados: string[] = [];
        const motor = motorPaqueteLocal({
            instalado: async () => true,
            cargarPipeline: async (repo) => {
                cargados.push(repo);
                return async (textos) => textos.map((t) => `trad(${repo}):${t}`);
            },
        });

        const textos = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
        const res = await motor.traducir(textos, "es", "en");
        expect(res.length).toBe(9);
        expect(cargados).toEqual(["Xenova/opus-mt-es-en"]);

        const res2 = await motor.traducir(["hola"], "en", "es");
        expect(res2).toEqual(["trad(Xenova/opus-mt-en-es):hola"]);
        expect(cargados).toEqual(["Xenova/opus-mt-es-en", "Xenova/opus-mt-en-es"]);
    });

    it("propaga error claro si cargarPipelineTransformers falla", async () => {
        await expect(cargarPipelineTransformers("https://invalid-url-not-existing.js")).rejects.toThrow(
            "No se pudo cargar el motor local"
        );
    });
});
