import { describe, expect, it } from "vitest";

import {
    CARPETAS_ESPECIALES_BASE,
    esRutaSegura,
    planDeSincronizacion,
    resumenDrive,
    type CarpetaEspecial,
} from "@/lib/mando/drive-carpetas";

describe("carpetas especiales de Drive", () => {
    const carpeta = (
        id: string,
        mb: number,
        modo: CarpetaEspecial["modo"] = "espejo",
    ): CarpetaEspecial => ({
        id,
        ruta: `starseed_memory_root/${id}`,
        etiqueta: id,
        descripcion: `Carpeta ${id}`,
        destinoDrive: `StarSeed_Memory_Root/${id}`,
        modo,
        mb,
        ultimaSync: null,
    });

    it("rechaza rutas de riesgo y acepta la memoria", () => {
        for (const ruta of [".git", "node_modules", ".next", "venv", ".env.local"]) {
            expect(esRutaSegura(ruta)).toBe(false);
        }
        expect(esRutaSegura("starseed_memory_root")).toBe(true);
    });

    it("mantiene segura toda la lista blanca", () => {
        expect(CARPETAS_ESPECIALES_BASE.length).toBeGreaterThan(0);
        expect(CARPETAS_ESPECIALES_BASE.every(({ ruta }) => esRutaSegura(ruta))).toBe(true);
    });

    it("con 20 GB libres no propone mover nada", () => {
        const plan = planDeSincronizacion([
            carpeta("grande", 8_000),
            carpeta("local", 2_000, "solo-local"),
        ], 20 * 1024);
        expect(plan.some(({ accion }) => accion === "mover")).toBe(false);
        expect(plan.find(({ id }) => id === "grande")?.accion).toBe("espejar");
    });

    it("con 2 GB mueve primero la carpeta más grande y explica las cifras", () => {
        const plan = planDeSincronizacion([
            carpeta("mediana", 3_000),
            carpeta("grande", 5_000),
            carpeta("pequena", 1_000),
        ], 2_048);
        const movimientos = plan.filter(({ accion }) => accion === "mover");
        expect(movimientos.map(({ id }) => id)).toEqual(["grande"]);
        expect(movimientos[0]?.motivo).toContain("2048 MB");
        expect(movimientos[0]?.motivo).toContain("4096 MB");
        expect(movimientos[0]?.motivo).toContain("5000 MB");
    });

    it("explica por qué no hay cuota disponible", () => {
        const resumen = resumenDrive(null, []);
        expect(resumen.valor).toBe("—");
        expect(resumen.detalle).toContain("DriveFS");
    });

    it("resume terabytes y dos carpetas espejadas", () => {
        const resumen = resumenDrive(
            { totalGb: 2_048, usadoGb: 114, libreGb: 1_934, fuente: "api" },
            [carpeta("una", 100), carpeta("dos", 200)],
        );
        expect(resumen.valor).toContain("TB");
        expect(resumen.valor).toContain("libres");
        expect(resumen.detalle).toContain("2 carpetas");
    });
});
