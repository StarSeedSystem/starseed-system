import { describe, expect, it } from "vitest";
import {
    RESERVA_PORCENTAJE,
    TOKENS_BASE_POR_TURNO,
    detalleAntigravity,
    resumirAntigravity,
} from "../creditos-antigravity";

const HOY = Date.parse("2026-11-20T12:00:00Z");
const CATALOGO = [
    { nombre: "gemini-4-hydrogen-high", familia: "gemini-4-hydrogen", nivel: "high" },
    { nombre: "gemini-3.8-flash-medium", familia: "gemini-3.8-flash", nivel: "medium" },
];
const USO = {
    "gemini-4-hydrogen-high": [
        { fecha: "2026-11-18", llamadas: 10, tiempo_total_seg: 100, errores_cuota: 0 },
        { fecha: "2026-11-19", llamadas: 20, tiempo_total_seg: 200, errores_cuota: 0 },
        { fecha: "2026-11-20", llamadas: 5, tiempo_total_seg: 50, errores_cuota: 0 },
    ],
    "gemini-3.8-flash-medium": [
        { fecha: "2026-11-19", llamadas: 4, tiempo_total_seg: 40, errores_cuota: 0 },
        { fecha: "2026-11-20", llamadas: 1, tiempo_total_seg: 10, errores_cuota: 0 },
    ],
};

function modelo(r: ReturnType<typeof resumirAntigravity>, nombre: string) {
    const m = r.modelos.find((x) => x.modelo === nombre);
    if (!m) throw new Error(`falta ${nombre}`);
    return m;
}

describe("resumirAntigravity", () => {
    it("dice «sin medir aún» cuando todavía no hay archivos", () => {
        const r = resumirAntigravity(null, null, HOY);
        expect(r.sinMedir).toBe(true);
        expect(r.modelos).toEqual([]);
        expect(r.resumen).toBe("sin medir aún");
    });

    it("pide iniciar sesión con agy cuando el catálogo está vacío", () => {
        const r = resumirAntigravity([], USO, HOY);
        expect(r.sinSesion).toBe(true);
        expect(r.estado).toBe("rojo");
        expect(r.aviso).toMatch(/agy/);
        expect(r.resumen).toMatch(/inicia sesión/i);
    });

    it("calcula llamadas, tokens, cuota, reserva, queda y tiempo medio de hoy", () => {
        const m = modelo(resumirAntigravity(CATALOGO, USO, HOY), "gemini-4-hydrogen-high");
        expect(m.llamadasHoy).toBe(5);
        expect(m.tokensHoy).toBe(5 * TOKENS_BASE_POR_TURNO);
        expect(m.cuotaDiaria).toBeCloseTo(22.5, 5);
        expect(m.reserva).toBeCloseTo(22.5 * RESERVA_PORCENTAJE, 5);
        expect(m.queda).toBeCloseTo(22.5 - 4.5 - 5, 5);
        expect(m.tiempoMedioSeg).toBe(10);
        expect(m.estado).toBe("verde");
        expect(m.papeles).toContain("Dirección");
    });

    it("usa el máximo histórico si hubo errores de cuota recientes y guarda el último con su hora", () => {
        const uso = {
            "gemini-4-hydrogen-high": [
                { fecha: "2026-11-18", llamadas: 8, tiempo_total_seg: 80, errores_cuota: 1, textos_errores_cuota: ["quota exceeded"] },
                {
                    fecha: "2026-11-19",
                    llamadas: 12,
                    tiempo_total_seg: 120,
                    errores_cuota: 1,
                    textos_errores_cuota: ["429"],
                    ultimo_error_cuota: "2026-11-19T14:32:00Z",
                },
                { fecha: "2026-11-20", llamadas: 2, tiempo_total_seg: 20, errores_cuota: 0 },
            ],
        };
        const m = modelo(resumirAntigravity(CATALOGO, uso, HOY), "gemini-4-hydrogen-high");
        expect(m.cuotaDiaria).toBe(12);
        expect(m.ultimoErrorCuota).toEqual({ texto: "429", cuando: "2026-11-19T14:32:00Z", hora: "14:32" });
    });

    it("marca ámbar al entrar en la reserva y rojo al quedarse sin cuota", () => {
        const conHoy = (llamadas: number) => ({
            "gemini-4-hydrogen-high": [
                { fecha: "2026-11-18", llamadas: 10, tiempo_total_seg: 100 },
                { fecha: "2026-11-19", llamadas: 20, tiempo_total_seg: 200 },
                { fecha: "2026-11-20", llamadas, tiempo_total_seg: 0 },
            ],
        });
        const ambar = modelo(resumirAntigravity(CATALOGO, conHoy(18), HOY), "gemini-4-hydrogen-high");
        expect(ambar.estado).toBe("ambar");
        expect(ambar.motivo).toMatch(/reserva/i);
        const rojo = modelo(resumirAntigravity(CATALOGO, conHoy(23), HOY), "gemini-4-hydrogen-high");
        expect(rojo.estado).toBe("rojo");
        expect(rojo.motivo).toMatch(/sin cuota/i);
    });

    it("suma los totales de todos los modelos medidos", () => {
        const r = resumirAntigravity(CATALOGO, USO, HOY);
        expect(r.total.llamadasHoy).toBe(6);
        expect(r.total.tokensHoy).toBe(6 * TOKENS_BASE_POR_TURNO);
        expect(r.total.cuotaDiaria).toBeCloseTo(28.5, 5);
        expect(r.total.reserva).toBeCloseTo(5.7, 5);
        expect(r.total.queda).toBeCloseTo(16.8, 5);
        expect(r.estado).toBe("verde");
    });

    it("incluye modelos que solo aparecen en el uso y tolera datos rotos", () => {
        const r = resumirAntigravity([{ nombre: "gemini-4-hydrogen-high" }], USO, HOY);
        expect(r.modelos.map((m) => m.modelo)).toContain("gemini-3.8-flash-medium");
        expect(() => resumirAntigravity(null, { roto: "no es lista" }, HOY)).not.toThrow();
    });

    it("construye el detalle del medidor con una fila por modelo", () => {
        const d = detalleAntigravity(resumirAntigravity(CATALOGO, USO, HOY));
        expect(d.titulo).toBe("Antigravity");
        expect(d.filas).toHaveLength(2);
        expect(d.filas[0]?.estado).toBe("ok");
        expect(d.filas[0]?.ficha?.length).toBeGreaterThan(0);
    });
});
