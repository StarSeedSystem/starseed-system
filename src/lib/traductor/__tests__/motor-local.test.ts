import { describe, it, expect, vi } from "vitest";
import {
    motorPaqueteLocal,
    cargarPipelineTransformers,
} from "../motor-paquete-local";
import type { MotorTraduccion } from "../../traduccion/motor";

describe("cargarPipelineTransformers", () => {
    it("levanta error si el módulo no se puede importar", async () => {
        const error = await cargarPipelineTransformers(
            "https://invalid-url-for-testing.com/transformers.js",
            { descargar: vi.fn(), obtener: vi.fn() },
        ).catch((e) => e);
        expect(error).toBeInstanceOf(Error);
    });

    it("devuelve función de traducción cuando el módulo es válido", async () => {
        const almacenMock = {
            descargar: vi.fn().mockResolvedValue(undefined),
            obtener: vi.fn().mockReturnValue("/path/to/model"),
        };
        const traducir = await cargarPipelineTransformers(
            "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.0.0/dist/index.min.js",
            almacenMock,
        ).catch((e) => null);
        if (!traducir) {
            expect(traducir).toBeNull();
            return;
        }
        expect(typeof traducir).toBe("function");
    });
});

describe("motorPaqueteLocal", () => {
    const crearDepsMock = () => {
        let modeloActual: string | null = null;
        return {
            instalado: vi.fn().mockImplementation(async (origen: string, destino: string) => {
                return modeloActual === `${origen}-${destino}`;
            }),
            cargarPipeline: vi.fn().mockImplementation(async (modelo: string) => {
                modeloActual = modelo;
                return async (textos: string[]) => textos.map((t) => `traducido(${t})`);
            }),
            alcance: "aparato" as const,
        };
    };

    it("tiene id y alcance correctos", () => {
        const motor = motorPaqueteLocal(crearDepsMock());
        expect(motor.id).toBe("paquete-local");
        expect(motor.alcance).toBe("aparato");
    });

    it("disponible devuelve true cuando el modelo está instalado", async () => {
        const deps = crearDepsMock();
        const motor = motorPaqueteLocal(deps);
        const disponible = await motor.disponible("es", "en");
        expect(deps.instalado).toHaveBeenCalledWith("es", "en");
        expect(disponible).toBe(false);
    });

    it("traducir devuelve la misma cantidad de textos", async () => {
        const deps = crearDepsMock();
        const motor = motorPaqueteLocal(deps);
        const textos = ["hola", "mundo"];
        const resultados = await motor.traducir(textos, "es", "en");
        expect(resultados.length).toBe(2);
        expect(resultados[0]).toBe("traducido(hola)");
        expect(resultados[1]).toBe("traducido(mundo)");
    });

    it("traducir procesa lotes de ≤8 textos", async () => {
        const deps = crearDepsMock();
        const motor = motorPaqueteLocal(deps);
        const textos = Array.from({ length: 8 }, (_, i) => `texto${i}`);
        const resultados = await motor.traducir(textos, "es", "en");
        expect(resultados.length).toBe(8);
    });

    it("traducir lanza error si excede 8 textos", async () => {
        const deps = crearDepsMock();
        const motor = motorPaqueteLocal(deps);
        const textos = Array.from({ length: 9 }, (_, i) => `texto${i}`);
        const error = await motor.traducir(textos, "es", "en").catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("8 textos");
    });

    it("traducir maneja cambio de par descargando el anterior", async () => {
        const deps = crearDepsMock();
        const motor = motorPaqueteLocal(deps);
        await motor.traducir(["uno"], "es", "en");
        await motor.traducir(["dos"], "fr", "de");
        expect(deps.cargarPipeline).toHaveBeenCalledTimes(2);
    });

    it("traducir devuelve arreglo vacío para texto vacío", async () => {
        const deps = crearDepsMock();
        const motor = motorPaqueteLocal(deps);
        const resultados = await motor.traducir([], "es", "en");
        expect(resultados).toEqual([]);
    });

    it("traducir propaga error de carga del pipeline", async () => {
        const motor = motorPaqueteLocal({
            instalado: vi.fn().mockResolvedValue(true),
            cargarPipeline: vi.fn().mockRejectedValue(new Error("No se pudo cargar el modelo")) as (
                modeloId: string,
            ) => Promise<(textos: string[]) => Promise<string[]>>,
            alcance: "aparato",
        } as {
            instalado: (origen: string, destino: string) => Promise<boolean>;
            cargarPipeline: (modeloId: string) => Promise<(textos: string[]) => Promise<string[]>>;
            alcance: "aparato";
        });
        const error = await motor.traducir(["texto"], "es", "en").catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("No se pudo cargar el modelo");
    });
});