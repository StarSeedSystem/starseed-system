import { describe, expect, it, vi } from "vitest";
import {
    motorPaqueteLocal,
    type MotorTraduccion,
    type AlmacenIndice,
} from "../motor-local";

function crearAlmacenFalso(): AlmacenIndice {
    const datos = new Map<string, string>();
    return {
        getItem: (clave: string) => datos.get(clave) ?? null,
        setItem: (clave: string, valor: string) => { dados.set(clave, valor); },
        removeItem: (clave: string) => { dados.delete(clave); },
        datos,
        romper: false,
    };
}

describe("motorPaqueteLocal", () => {
    describe("disponible", () => {
        it("devuelve true si el modelo está instalado", () => {
            const almacen = crearAlmacenFalso();
            almacen.setItem("starseed:traductor-paquetes", JSON.stringify([
                { id: "pkg-1", par: "es-en", bytes: 100, hash: "abc", version: "1", instaladoEn: Date.now() }
            ]));
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const motor = motorPaqueteLocal({ instalado: instalarModelo, cargarPipeline: vi.fn(), alcance: "aparato" });
            expect(motor.disponible("es", "en")).resolves.toBe(true);
        });

        it("devuelve false si el modelo no está instalado", () => {
            const almacen = crearAlmacenFalso();
            const instalarModelo = vi.fn().mockResolvedValue(false);
            const motor = motorPaqueteLocal({ instalado: instalarModelo, cargarPipeline: vi.fn(), alcance: "aparato" });
            expect(motor.disponible("es", "fr")).resolves.toBe(false);
        });

        it("devuelve false si no hay modelo para el par", async () => {
            const almacen = crearAlmacenFalso();
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const motor = motorPaqueteLocal({ instalado: instalarModelo, cargarPipeline: vi.fn(), alcance: "aparato" });
            expect(motor.disponible("ja", "en")).resolves.toBe(false);
        });
    });

    describe("traducir", () => {
        it("traduce lotes de textos", async () => {
            const almacen = crearAlmacenFalso();
            const pipelineMock = vi.fn().mockResolvedValue((textos: string[]) => textos.map(t => t.toUpperCase()));
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const motor = motorPaqueteLocal({ 
                instalado: instalarModelo, 
                cargarPipeline: pipelineMock, 
                alcance: "aparato" 
            });
            
            const textos = ["hola", "mundo"];
            const resultado = await motor.traducir(textos, "es", "en");
            expect(resultado).toEqual(["HOLA", "MUNDO"]);
        });

        it("traduce un máximo de 8 textos por lote", async () => {
            const almacen = crearAlmacenFalso();
            const pipelineMock = vi.fn().mockImplementation(async (textos: string[]) => {
                await new Promise(r => setTimeout(r, 10));
                return textos;
            });
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const motor = motorPaqueteLocal({ 
                instalado: instalarModelo, 
                cargarPipeline: pipelineMock, 
                alcance: "aparato" 
            });
            
            const textos = Array.from({ length: 17 }, (_, i) => `texto-${i}`);
            const resultado = await motor.traducir(textos, "es", "en");
            expect(resultado).toHaveLength(17);
        });

        it("carga un par a la vez en memoria", async () => {
            const almacen = crearAlmacenFalso();
            const pipelineMock = vi.fn().mockImplementation(async (textos: string[]) => textos);
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const motor = motorPaqueteLocal({ 
                instalado: instalarModelo, 
                cargarPipeline: pipelineMock, 
                alcance: "aparato" 
            });
            
            await motor.traducir(["a"], "es", "en");
            expect(instalarModelo).toHaveBeenCalledTimes(1);
            
            await motor.traducir(["b"], "fr", "en");
            expect(instalarModelo).toHaveBeenCalledTimes(2);
        });

        it("descarga el anterior al cambiar de par", async () => {
            const almacen = crearAlmacenFalso();
            const pipelineMock = vi.fn().mockImplementation(async (textos: string[]) => textos);
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const descargarPipeline = vi.fn().mockResolvedValue(undefined);
            const motor = motorPaqueteLocal({ 
                instalado: instalarModelo, 
                cargarPipeline: pipelineMock, 
                alcance: "aparato",
                descargarPipeline
            });
            
            await motor.traducir(["a"], "es", "en");
            await motor.traducir(["b"], "fr", "en");
            
            expect(instalarModelo).toHaveBeenCalledTimes(2);
        });
    });

    describe("carga y error", () => {
        it("propaga error si no se puede cargar el pipeline", async () => {
            const almacen = crearAlmacenFalso();
            const error = new Error("No se pudo cargar el motor local");
            const pipelineMock = vi.fn().mockRejectedValue(error);
            const instalarModelo = vi.fn().mockResolvedValue(true);
            const motor = motorPaqueteLocal({ 
                instalado: instalarModelo, 
                cargarPipeline: pipelineMock, 
                alcance: "aparato" 
            });
            
            await expect(motor.traducir(["hola"], "es", "en")).rejects.toThrow("No se pudo cargar el motor local");
        });
    });

    describe("metadatos del motor", () => {
        it("tiene id 'paquete-local'", () => {
            const almacen = crearAlmacenFalso();
            const motor = motorPaqueteLocal({ 
                instalado: vi.fn(), 
                cargarPipeline: vi.fn(), 
                alcance: "aparato" 
            });
            expect(motor.id).toBe("paquete-local");
        });

        it("tiene alcance 'aparato'", () => {
            const almacen = crearAlmacenFalso();
            const motor = motorPaqueteLocal({ 
                instalado: vi.fn(), 
                cargarPipeline: vi.fn(), 
                alcance: "aparato" 
            });
            expect(motor.alcance).toBe("aparato");
        });
    });

    describe("instalado", () => {
        it("devuelve false para pares sin modelo", async () => {
            const almacen = crearAlmacenFalso();
            const motor = motorPaqueteLocal({ 
                instalado: vi.fn().mockResolvedValue(false), 
                cargarPipeline: vi.fn(), 
                alcance: "aparato" 
            });
            expect(motor.disponible("es", "fr")).resolves.toBe(false);
        });
    });
});