import { describe, expect, it } from "vitest";

import { bytesLegibles, construirAvisos, etiquetaTiempoReal, fraccionUso, haceCuantoMs } from "../avisos";
import { estadoPermiso, etiquetaEstadoPermiso, PERMISOS_NAVEGADOR } from "../privacidad";

const base = { sesion: true, instalacionesPendientes: 0, carpetasSinAcceso: 0, usoAlmacenamiento: 0.1, estadoSync: "connected" };

describe("construirAvisos", () => {
    it("sin nada pendiente no hay avisos", () => {
        expect(construirAvisos(base)).toEqual([]);
    });

    it("mientras no se sabe si hay sesión no se avisa de ella", () => {
        expect(construirAvisos({ ...base, sesion: null })).toEqual([]);
    });

    it("cada situación real produce su aviso con una acción", () => {
        const avisos = construirAvisos({
            sesion: false,
            instalacionesPendientes: 2,
            carpetasSinAcceso: 1,
            usoAlmacenamiento: 0.9,
            estadoSync: "error",
        });
        expect(avisos.map((a) => a.id)).toEqual([
            "sin-sesion",
            "instalaciones-pendientes",
            "carpetas-sin-acceso",
            "almacenamiento-lleno",
        ]);
        expect(avisos[1]?.texto).toContain("2 apps esperan");
        expect(avisos[3]?.texto).toContain("90 %");
        for (const a of avisos) expect(a.accion).toBeDefined();
    });

    it("el error de sincronización solo se avisa con sesión", () => {
        expect(construirAvisos({ ...base, estadoSync: "error" }).map((a) => a.id)).toEqual(["sync-error"]);
    });

    it("singular y plural", () => {
        const [uno] = construirAvisos({ ...base, instalacionesPendientes: 1 });
        expect(uno?.texto).toContain("1 app espera");
    });
});

describe("formatos", () => {
    it("bytes legibles con coma decimal", () => {
        expect(bytesLegibles(0)).toBe("0 B");
        expect(bytesLegibles(1500)).toBe("1,5 KB");
        expect(bytesLegibles(25_000_000)).toBe("25 MB");
        expect(bytesLegibles(null)).toBe("—");
        expect(bytesLegibles(-1)).toBe("—");
    });

    it("fracción de uso", () => {
        expect(fraccionUso(50, 100)).toBe(0.5);
        expect(fraccionUso(200, 100)).toBe(1);
        expect(fraccionUso(undefined, 100)).toBeNull();
        expect(fraccionUso(10, 0)).toBeNull();
    });

    it("hace cuánto en milisegundos", () => {
        const ahora = 10_000_000;
        expect(haceCuantoMs(null, ahora)).toBe("todavía no");
        expect(haceCuantoMs(ahora - 10_000, ahora)).toBe("ahora mismo");
        expect(haceCuantoMs(ahora - 120_000, ahora)).toBe("hace 2 min");
    });

    it("estado de la sincronización en tiempo real en palabras", () => {
        expect(etiquetaTiempoReal("connected")).toBe("activa");
        expect(etiquetaTiempoReal("no-session")).toBe("sin sesión");
        expect(etiquetaTiempoReal(undefined)).toBe("sin datos");
    });
});

describe("privacidad", () => {
    it("normaliza estados de permiso", () => {
        expect(estadoPermiso("granted")).toBe("granted");
        expect(estadoPermiso("default")).toBe("no-disponible");
        expect(estadoPermiso(undefined)).toBe("no-disponible");
        expect(etiquetaEstadoPermiso("denied")).toBe("Bloqueado");
    });

    it("explica para qué se usa cada permiso", () => {
        expect(PERMISOS_NAVEGADOR.map((p) => p.id)).toEqual(["microphone", "camera", "notifications", "persistent-storage"]);
        for (const p of PERMISOS_NAVEGADOR) expect(p.para.length).toBeGreaterThan(10);
    });
});
