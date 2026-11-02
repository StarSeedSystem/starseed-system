// El medidor del filtro de entrada de Astraura (Ola 1102 · IMG1102D): puras, sin red ni disco.
// Contrato: architecture/imaginacion-calidad.md §1 (`propuestas.json → filtro_astraura`).
import { describe, expect, it } from "vitest";

import { cuentaFiltroAstraura, lineaFiltroAstraura } from "@/lib/mando/imaginacion-tipos";

const HOY = new Date(2026, 10, 2, 12, 0, 0);
const FILTRO = {
    fecha: "2026-11-02",
    tope_dia: 3,
    ventana_dias: 7,
    vistas: 12,
    entran: 6,
    filtradas: { "familia repetida": 3, "tipo de archivo": 4, tope: 2 },
    autorizacion_inventada: 1,
};

describe("cuentaFiltroAstraura", () => {
    it("lee los tres motivos y la autorización inventada sin fiarse de más", () => {
        expect(cuentaFiltroAstraura(FILTRO)).toEqual({
            fecha: "2026-11-02",
            total: 9,
            familia: 3,
            tipo: 4,
            tope: 2,
            inventadas: 1,
        });
    });
    it("lo que no es un objeto o no trae fecha no se pinta; los números raros cuentan cero", () => {
        expect(cuentaFiltroAstraura(null)).toBeNull();
        expect(cuentaFiltroAstraura([])).toBeNull();
        expect(cuentaFiltroAstraura("x")).toBeNull();
        expect(cuentaFiltroAstraura({})).toBeNull();
        expect(
            cuentaFiltroAstraura({ fecha: "2026-11-02", filtradas: { "familia repetida": -2, "tipo de archivo": 1.9, tope: "3" } }),
        ).toEqual({ fecha: "2026-11-02", total: 1, familia: 0, tipo: 1, tope: 0, inventadas: 0 });
    });
});

describe("lineaFiltroAstraura", () => {
    it("pinta la línea pedida cuando el filtro es de hoy", () => {
        expect(lineaFiltroAstraura(FILTRO, HOY)).toBe(
            "Filtradas de Astraura hoy: 9 (familia 3 · tipo 4 · tope 2) · 1 con autorización inventada",
        );
    });
    it("sin autorizaciones inventadas no añade el aviso", () => {
        expect(lineaFiltroAstraura({ ...FILTRO, autorizacion_inventada: 0 }, HOY)).toBe(
            "Filtradas de Astraura hoy: 9 (familia 3 · tipo 4 · tope 2)",
        );
    });
    it("un filtro de otro día no se presenta como de hoy", () => {
        expect(lineaFiltroAstraura(FILTRO, new Date(2026, 10, 3, 0, 1, 0))).toBeNull();
        expect(lineaFiltroAstraura(null, HOY)).toBeNull();
    });
});
