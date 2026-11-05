import { describe, expect, it } from "vitest";
import {
    loteAConsultar,
    fusionar,
    type EntradaFuente,
    type Conocida,
} from "../rotacion-actualizaciones";

const crearEntrada = (
    id: string,
    instalada: string = "v1.0.0",
    upstream: string = "https://github.com/test/test",
    payload?: unknown,
): EntradaFuente => ({
    id,
    instalada,
    upstream,
    payload,
});

const crearConocida = (
    id: string,
    remota: string | null = "v2.0.0",
    fecha: string | null = "2026-01-01",
    t: number = Date.now(),
): Conocida => ({ id, remota, fecha, t });

describe("loteAConsultar", () => {
    it("devuelve los IDs de las que no están conocidas", () => {
        const entradas: EntradaFuente[] = [
            crearEntrada("id-1"),
            crearEntrada("id-2"),
            crearEntrada("id-3"),
        ];
        const conocidas: Conocida[] = [];
        const ahora = Date.now();

        const resultado = loteAConsultar(entradas, conocidas, ahora, { maxLote: 10, edadMinMs: 0 });

        expect(resultado.sort()).toEqual(["id-1", "id-2", "id-3"].sort());
    });

    it("devuelve primero las que están desconocidas, luego las más viejas", () => {
        const ahora = 1000000;
        const entradas: EntradaFuente[] = [
            crearEntrada("nueva"),
            crearEntrada("antigua1"),
            crearEntrada("antigua2"),
        ];

        const conocidas: Conocida[] = [
            crearConocida("nueva", "v1.0.0", null, ahora - 10 * 24 * 60 * 60 * 1000),
            crearConocida("antigua1", "v1.0.0", null, ahora - 1 * 24 * 60 * 60 * 1000),
            crearConocida("antigua2", "v1.0.0", null, ahora - 24 * 60 * 60 * 1000),
        ];

        const resultado = loteAConsultar(entradas, conocidas, ahora, { maxLote: 10, edadMinMs: 0 });

        expect(resultado).toContain("nueva");
        expect(resultado).toContain("antigua1");
        expect(resultado).toContain("antigua2");
    });

    it("respeta el tope máximo de entrada", () => {
        const entradas: EntradaFuente[] = [
            crearEntrada("id-1"),
            crearEntrada("id-2"),
            crearEntrada("id-3"),
            crearEntrada("id-4"),
            crearEntrada("id-5"),
        ];
        const conocidas: Conocida[] = [];
        const ahora = Date.now();

        const resultado = loteAConsultar(entradas, conocidas, ahora, { maxLote: 3, edadMinMs: 0 });

        expect(resultado).toHaveLength(3);
    });

    it("no incluye las que ya están actualizadas recientemente", () => {
        const ahora = 1000000;
        const entradas: EntradaFuente[] = [
            crearEntrada("fuente-actualizada"),
        ];

        const conocidas: Conocida[] = [
            crearConocida("fuente-actualizada", "v2.0.0", null, ahora - 10 * 60 * 1000),
        ];

        const resultado = loteAConsultar(entradas, conocidas, ahora, { maxLote: 10, edadMinMs: 60 * 60 * 1000 });

        expect(resultado).toEqual([]);
    });

    it("prioriza las que están desconocidas antes de las antiguas", () => {
        const ahora = 1000000;
        const entradas: EntradaFuente[] = [
            crearEntrada("desconocida"),
            crearEntrada("antigua"),
        ];

        const conocidas: Conocida[] = [
            crearConocida("desconocida", null, null, 0),
            crearConocida("antigua", "v1.0.0", null, ahora - 5 * 24 * 60 * 60 * 1000),
        ];

        const resultado = loteAConsultar(entradas, conocidas, ahora, { maxLote: 10, edadMinMs: 0 });

        expect(resultado[0]).toBe("desconocida");
    });
});

describe("fusionar", () => {
    it("añade nuevas fuentes del resultado", () => {
        const ahora = 1000000;
        const conocidas: Conocida[] = [];
        const resultados = [
            { id: "nueva", remota: "v2.0.0", fecha: "2026-01-01" },
        ];

        const resultado = fusionar(conocidas, resultados, ahora);

        expect(resultado).toHaveLength(1);
        expect(resultado[0]).toEqual({
            id: "nueva",
            remota: "v2.0.0",
            fecha: "2026-01-01",
            t: ahora,
        });
    });

    it("actualiza las que ya estaban conocidas", () => {
        const ahora = 1000000;
        const conocidas: Conocida[] = [
            crearConocida("existe", "v1.0.0", "2025-01-01", ahora - 1000),
        ];
        const resultados = [
            { id: "existe", remota: "v2.0.0", fecha: "2026-01-01" },
        ];

        const resultado = fusionar(conocidas, resultados, ahora);

        expect(resultado).toHaveLength(1);
        expect(resultado[0].remota).toBe("v2.0.0");
        expect(resultado[0].t).toBe(ahora);
    });

    it("no actualiza si el resultado es null (fallo de consulta)", () => {
        const ahora = 1000000;
        const conocidas: Conocida[] = [
            crearConocida("existe", "v1.0.0", "2025-01-01", ahora - 1000),
        ];
        const resultados = [
            { id: "existe", remota: null, fecha: null },
        ];

        const resultado = fusionar(conocidas, resultados, ahora);

        expect(resultado).toHaveLength(1);
        expect(resultado[0].remota).toBe("v1.0.0");
    });

    it("preserva las que no están en el resultado", () => {
        const ahora = 1000000;
        const conocidas: Conocida[] = [
            crearConocida("conservada", "v1.0.0", "2025-01-01", ahora - 1000),
        ];
        const resultados: Array<{ id: string; remota: string | null; fecha: string | null }> = [];

        const resultado = fusionar(conocidas, resultados, ahora);

        expect(resultado).toHaveLength(1);
        expect(resultado[0].id).toBe("conservada");
    });
});