import { describe, it, expect } from "vitest";
import {
    estadoDe,
    mensajeError,
    mensajeVacio,
    faltaDatoReal,
    MIN_SEGURO,
    type EntradaEstado,
} from "../calidad-widget";

describe("estadoDe", () => {
    it("prevalece el error sobre la carga, lo vacío y lo listo", () => {
        expect(estadoDe({ error: "boom", cargando: true, datos: [1] })).toBe("error");
        expect(estadoDe({ error: "boom", cargando: true })).toBe("error");
        expect(estadoDe({ error: "boom" })).toBe("error");
    });

    it("la carga manda sobre lo vacío y lo listo (sin error)", () => {
        expect(estadoDe({ cargando: true, datos: [] })).toBe("cargando");
        expect(estadoDe({ cargando: true, datos: [1] })).toBe("cargando");
        expect(estadoDe({ cargando: true })).toBe("cargando");
    });

    it("lo vacío manda sobre lo listo (sin error ni carga)", () => {
        expect(estadoDe({ datos: [] })).toBe("vacio");
        expect(estadoDe({ datos: {} })).toBe("vacio");
        expect(estadoDe({ datos: null })).toBe("vacio");
        expect(estadoDe({ datos: undefined })).toBe("vacio");
        expect(estadoDe({})).toBe("vacio");
    });

    it("sin error, carga ni vacío queda listo", () => {
        expect(estadoDe({ datos: [1, 2] })).toBe("listo");
        expect(estadoDe({ datos: "texto" })).toBe("listo");
    });

    it("0 y string vacío NO son vacíos: un contador a cero es un dato real", () => {
        expect(estadoDe({ datos: 0 })).toBe("listo");
        expect(estadoDe({ datos: "" })).toBe("listo");
        expect(estadoDe({ datos: false })).toBe("listo");
    });

    it("requiere sesión sin datos es un estado de error (no listo)", () => {
        const entrada: EntradaEstado = { requiereSesion: true };
        expect(estadoDe(entrada)).toBe("error");
    });

    it("requiere permiso sin datos es un estado de error", () => {
        const entrada: EntradaEstado = { requierePermiso: "politica.leer" };
        expect(estadoDe(entrada)).toBe("error");
    });
});

describe("mensajeVacio", () => {
    it("devuelve texto útil (título + ayuda) para cada categoría conocida", () => {
        const categorias = ["politica", "economia", "social", "clima", "ia", "sistema"];
        for (const c of categorias) {
            const m = mensajeVacio(c);
            expect(m.titulo.length).toBeGreaterThan(0);
            expect(m.ayuda.length).toBeGreaterThan(0);
            expect(/\s{2}/.test(m.titulo)).toBe(false);
        }
    });

    it("no dice solo «Sin datos»", () => {
        const m = mensajeVacio("social");
        expect(m.titulo.toLowerCase()).not.toContain("sin datos");
    });

    it("para una categoría desconocida devuelve un texto genérico útil, no rompe", () => {
        const m = mensajeVacio("categoria-inexistente");
        expect(m.titulo.length).toBeGreaterThan(0);
        expect(m.ayuda.length).toBeGreaterThan(0);
    });
});

describe("mensajeError", () => {
    it("reconoce red caída como reintentable", () => {
        const m = mensajeError(new TypeError("Failed to fetch"));
        expect(m.reintentable).toBe(true);
    });

    it("reconoce error de sesión como reintentable", () => {
        const m = mensajeError(new Error("No hay sesión activa"));
        expect(m.reintentable).toBe(true);
    });

    it("reconoce permiso denegado como NO reintentable", () => {
        const m = mensajeError(new Error("Permission denied"));
        expect(m.reintentable).toBe(false);
    });

    it("reconoce fuente sin responder como reintentable", () => {
        const m = mensajeError(new Error("La fuente no responde (503)"));
        expect(m.reintentable).toBe(true);
    });

    it("error desconocido es humano y reintentable", () => {
        const m = mensajeError(new Error("algo rarísimo"));
        expect(m.reintentable).toBe(true);
        expect(m.titulo.length).toBeGreaterThan(0);
        expect(m.detalle.length).toBeGreaterThan(0);
        expect(m.titulo.toLowerCase()).not.toContain("sin datos");
    });

    it("ningún mensaje culpa al usuario", () => {
        const m = mensajeError(new Error("boom"));
        expect(m.detalle.toLowerCase()).not.toContain("error tuyo");
    });
});

describe("faltaDatoReal", () => {
    it("true en cadenas de relleno (lorem, ejemplo, mock, TODO)", () => {
        expect(faltaDatoReal("Lorem ipsum")).toBe(true);
        expect(faltaDatoReal("ejemplo: propuesta")).toBe(true);
        expect(faltaDatoReal("mock de datos")).toBe(true);
        expect(faltaDatoReal("TODO pendiente")).toBe(true);
    });

    it("true en arrays de objetos idénticos", () => {
        const arr = [
            { id: 1, titulo: "A" },
            { id: 1, titulo: "A" },
            { id: 1, titulo: "A" },
        ];
        expect(faltaDatoReal(arr)).toBe(true);
    });

    it("true cuando un objeto contiene una propiedad de relleno", () => {
        expect(faltaDatoReal({ nombre: "Alex", bio: "esto es un ejemplo" })).toBe(true);
    });

    it("false en datos reales y singulares", () => {
        expect(faltaDatoReal("Manifiesto fundacional")).toBe(false);
        expect(faltaDatoReal(42)).toBe(false);
        expect(faltaDatoReal([{ id: 1 }, { id: 2 }])).toBe(false);
        expect(faltaDatoReal({ nombre: "Alex", semillas: 120 })).toBe(false);
        expect(faltaDatoReal(null)).toBe(false);
        expect(faltaDatoReal(undefined)).toBe(false);
    });
});

describe("MIN_SEGURO", () => {
    it("fija el suelo por debajo del cual ningún widget real mantiene su maquetación", () => {
        expect(MIN_SEGURO).toEqual({ minW: 3, minH: 3 });
    });
});