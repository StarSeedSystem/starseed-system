import { describe, expect, it, vi } from "vitest";

import { revisarConPeces, type ResultadoRevicion } from "../revisar";

describe("revisarConPeces", () => {
    const hacerMockLlamar = (
        respuestas: Record<string, string> = {},
        fallos: string[] = [],
        tiempos: Record<string, number> = {},
    ) => {
        return vi.fn().mockImplementation(async (modelo: string, prompt: string) => {
            if (fallos.includes(modelo)) {
                throw new Error(`Modelo ${modelo} falló`);
            }
            const tiempo = tiempos[modelo] ?? 0;
            if (tiempo > 0) {
                await new Promise((r) => setTimeout(r, tiempo));
            }
            return respuestas[modelo] ?? "ninguna| \n";
        });
    };

    it("devuelve sin peces si no hay modelos", async () => {
        const resultado = await revisarConPeces("artefacto de prueba", {
            tipo: "respuesta",
            llamar: vi.fn(),
            modelos: [],
        });
        expect(resultado.peces).toEqual([]);
        expect(resultado.avisos).toContain("sin peces");
        expect(resultado.veredicto.pasa).toBe(true);
    });

    it("devuelve objeciones cuando un pez reacciona", async () => {
        const mockLlamar = hacerMockLlamar({
            "modelo-1": "bloquea| Error crítico\nimporta| Falta documentación",
        });

        const resultado = await revisarConPeces("código con bugs", {
            tipo: "ola",
            llamar: mockLlamar,
            modelos: ["modelo-1"],
            n: 2,
        });

        expect(resultado.peces).toContain("modelo-1");
        expect(resultado.objeciones).toHaveLength(2);
        expect(resultado.objeciones[0]).toEqual({ gravedad: "bloquea", texto: "Error crítico" });
        expect(resultado.objeciones[1]).toEqual({ gravedad: "importa", texto: "Falta documentación" });
    });

    it("cuenta como sin objeciones cuando un pez falla", async () => {
        const mockLlamar = hacerMockLlamar(
            { "modelo-1": "bloquea| Error grave" },
            ["modelo-2"],
        );

        const resultado = await revisarConPeces("artefacto", {
            tipo: "plan",
            llamar: mockLlamar,
            modelos: ["modelo-1", "modelo-2"],
            n: 2,
        });

        expect(resultado.objeciones).toEqual([{ gravedad: "bloquea", texto: "Error grave" }]);
        expect(resultado.avisos).toContain("Pez modelo-2 falló: Modelo modelo-2 falló");
        expect(resultado.veredicto.pasa).toBe(false);
    });

    it("supera el plazo y cuenta como sin objeciones", async () => {
        const mockLlamar = hacerMockLlamar(
            { "modelo-1": "bloquea| Error" },
            [],
            { "modelo-2": 1000 },
        );

        const resultado = await revisarConPeces("artefacto", {
            tipo: "pagina",
            llamar: mockLlamar,
            modelos: ["modelo-1", "modelo-2"],
            plazoMs: 100,
        });

        expect(resultado.objeciones).toEqual([{ gravedad: "bloquea", texto: "Error" }]);
        expect(resultado.avisos).toContain("Pez modelo-2 falló: Plazo superado");
    });

    it("selecciona hasta n modelos distintos", async () => {
        const mockLlamar = hacerMockLlamar({ "m1": "ninguna| \n", "m2": "ninguna| \n", "m3": "ninguna| \n" });

        const resultado = await revisarConPeces("test", {
            tipo: "app",
            llamar: mockLlamar,
            modelos: ["m1", "m2", "m3"],
            n: 2,
        });

        expect(resultado.peces).toHaveLength(2);
    });

    it("elimina duplicados de modelos", async () => {
        const mockLlamar = hacerMockLlamar({ "m1": "ninguna| \n" });

        const resultado = await revisarConPeces("test", {
            tipo: "respuesta",
            llamar: mockLlamar,
            modelos: ["m1", "m1", "m1"],
            n: 3,
        });

        expect(resultado.peces).toEqual(["m1"]);
    });

    it("devuelve veredicto pasa=true cuando no hay bloquea", async () => {
        const mockLlamar = hacerMockLlamar({
            "m1": "importa| Detalle menor\nmenor| Sugerencia",
        });

        const resultado = await revisarConPeces("artefacto", {
            tipo: "ola",
            llamar: mockLlamar,
            modelos: ["m1"],
        });

        expect(resultado.veredicto.pasa).toBe(true);
        expect(resultado.veredicto.bloqueantes).toEqual([]);
    });

    it("devuelve veredicto pasa=false cuando hay bloquea", async () => {
        const mockLlamar = hacerMockLlamar({
            "m1": "bloquea| Error crítico\nimporta| Detalle",
        });

        const resultado = await revisarConPeces("artefacto", {
            tipo: "plan",
            llamar: mockLlamar,
            modelos: ["m1"],
        });

        expect(resultado.veredicto.pasa).toBe(false);
        expect(resultado.veredicto.bloqueantes).toHaveLength(1);
        expect(resultado.veredicto.bloqueantes[0].texto).toBe("Error crítico");
    });

    it("fusiona objeciones de múltiples peces", async () => {
        const mockLlamar = hacerMockLlamar({
            "m1": "bloquea| Error A\nimporta| Obs 1",
            "m2": "bloquea| Error B\nmenor| Sug 2",
        });

        const resultado = await revisarConPeces("artefacto", {
            tipo: "respuesta",
            llamar: mockLlamar,
            modelos: ["m1", "m2"],
        });

        expect(resultado.objeciones).toHaveLength(4);
        expect(resultado.veredicto.bloqueantes).toHaveLength(2);
    });

    it("elimina duplicados de objeciones entre peces", async () => {
        const mockLlamar = hacerMockLlamar({
            "m1": "bloquea| Error mismo\nimporta| Obs distinto",
            "m2": "bloquea| Error mismo\nmenor| Otro",
        });

        const resultado = await revisarConPeces("artefacto", {
            tipo: "ola",
            llamar: mockLlamar,
            modelos: ["m1", "m2"],
        });

        const errores = resultado.objeciones.filter((o) => o.texto === "Error mismo");
        expect(errores).toHaveLength(1);
    });

    it("usa valor por defecto n=2", async () => {
        const mockLlamar = vi.fn().mockResolvedValue("ninguna| \n");

        await revisarConPeces("test", {
            tipo: "respuesta",
            llamar: mockLlamar,
            modelos: ["a", "b"],
        });

        expect(mockLlamar).toHaveBeenCalledTimes(2);
    });

    it("usa valor por defecto plazoMs=30000", async () => {
        const mockLlamar = vi.fn().mockImplementation(async (m: string) => {
            await new Promise((r) => setTimeout(r, 50));
            return "ninguna| \n";
        });

        const resultado = await revisarConPeces("test", {
            tipo: "app",
            llamar: mockLlamar,
            modelos: ["a"],
        });

        expect(resultado.peces).toContain("a");
    });
});