// Pruebas del módulo puro de resumen de versiones upstream (LIB1025A).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
    type ResumenVersion,
} from "../versiones-upstream";

describe("normalizarVersion", () => {
    it("sha de 7 hexadecimales se queda igual", () => {
        expect(normalizarVersion("a1b2c3d")).toBe("a1b2c3d");
    });

    it("sha de 40 hexadecimales se recorta a 7", () => {
        expect(normalizarVersion("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0")).toBe("a1b2c3d");
    });

    it("sha con mayúsculas se pasa a minúsculas y recorta", () => {
        expect(normalizarVersion("A1B2C3D4E5F6")).toBe("a1b2c3d");
    });

    it("etiqueta con prefijo de paquete (@scope/pkg@version) se queda con la versión", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("@scope/pkg@1.2.3")).toBe("1.2.3");
    });

    it("release con v inicial seguida de dígito quita la v", () => {
        expect(normalizarVersion("v1.2.3")).toBe("1.2.3");
        expect(normalizarVersion("V2.0.0")).toBe("2.0.0");
    });

    it("v no seguida de dígito no se quita", () => {
        expect(normalizarVersion("version-1")).toBe("version-1");
        expect(normalizarVersion("vbeta")).toBe("vbeta");
    });

    it("espacios y mayúsculas se normalizan", () => {
        expect(normalizarVersion("  V1.0.0  ")).toBe("1.0.0");
        expect(normalizarVersion("  A1B2C3D  ")).toBe("a1b2c3d");
    });

    it("última @ gana si hay varias", () => {
        expect(normalizarVersion("@a@b@1.0.0")).toBe("1.0.0");
    });
});

describe("resumirVersiones", () => {
    const baseFuente: FuenteVersion = {
        id: "test-id",
        instalada: "a1b2c3d",
        remota: "a1b2c3d",
        estado: "igual",
        fecha: "2026-10-01T10:00:00Z",
        upstream: "https://github.com/test/repo",
        aviso: null,
    };

    it("solo devuelve ids instalados, en el orden de entrada", () => {
        const fuentes: FuenteVersion[] = [
            { ...baseFuente, id: "a" },
            { ...baseFuente, id: "b" },
            { ...baseFuente, id: "c" },
        ];
        const ids = new Set(["b", "a"]);
        const res = resumirVersiones(fuentes, ids);
        expect(res.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it("ids no instalados quedan fuera", () => {
        const fuentes: FuenteVersion[] = [
            { ...baseFuente, id: "a" },
            { ...baseFuente, id: "b" },
        ];
        const ids = new Set(["a"]);
        const res = resumirVersiones(fuentes, ids);
        expect(res.length).toBe(1);
        expect(res[0].id).toBe("a");
    });

    it("tono 'al-dia' cuando estado es 'igual' y versiones coinciden", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            estado: "igual",
            instalada: "a1b2c3d",
            remota: "a1b2c3d",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].tono).toBe("al-dia");
        expect(res[0].texto).toContain("Al día");
        expect(res[0].texto).toContain("a1b2c3d");
    });

    it("tono 'novedad' cuando estado es 'hay-actualizacion'", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            estado: "hay-actualizacion",
            instalada: "a1b2c3d",
            remota: "f9e8d7c",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].tono).toBe("novedad");
        expect(res[0].texto).toContain("Versión nueva publicada");
        expect(res[0].texto).toContain("f9e8d7c");
        expect(res[0].texto).toContain("a1b2c3d");
    });

    it("tono 'novedad' cuando hay remota y versión normalizada difiere (estado desconocida)", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            estado: "desconocida",
            instalada: "v1.0.0",
            remota: "v1.1.0",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].tono).toBe("novedad");
        expect(res[0].texto).toContain("Versión nueva publicada");
    });

    it("tono 'sin-comprobar' cuando remota es null (nunca 'novedad')", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            remota: null,
            estado: "desconocida",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].tono).toBe("sin-comprobar");
        expect(res[0].texto).toContain("No se pudo comprobar ahora");
        expect(res[0].texto).not.toContain("Versión nueva");
    });

    it("fecha entre paréntesis si existe", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            fecha: "2026-10-01T10:00:00Z",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].texto).toContain("(2026-10-01T10:00:00Z)");
    });

    it("sin fecha no añade paréntesis vacíos", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            fecha: null,
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].texto).not.toContain("()");
    });

    it("sha largo en instalada y corto en remota se comparan normalizados", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            instalada: "a1b2c3d4e5f6a7b8c9d0",
            remota: "a1b2c3d",
            estado: "igual",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].tono).toBe("al-dia");
    });

    it("remota null con estado 'hay-actualizacion' no da novedad (remota null prevalece)", () => {
        const fuente: FuenteVersion = {
            ...baseFuente,
            remota: null,
            estado: "hay-actualizacion",
        };
        const res = resumirVersiones([fuente], new Set(["test-id"]));
        expect(res[0].tono).toBe("sin-comprobar");
    });

    it("orden estable: respeta el orden del array de entrada", () => {
        const fuentes: FuenteVersion[] = [
            { ...baseFuente, id: "z" },
            { ...baseFuente, id: "a" },
            { ...baseFuente, id: "m" },
        ];
        const ids = new Set(["a", "m", "z"]);
        const res = resumirVersiones(fuentes, ids);
        expect(res.map((r) => r.id)).toEqual(["z", "a", "m"]);
    });
});

describe("contarNovedades", () => {
    const baseResumen: ResumenVersion = {
        id: "test",
        tono: "al-dia",
        texto: "Al día (1.0.0)",
        instalada: "1.0.0",
        remota: "1.0.0",
        fecha: null,
        upstream: "https://github.com/test/repo",
    };

    it("cuenta solo los de tono 'novedad'", () => {
        const resumenes: ResumenVersion[] = [
            { ...baseResumen, tono: "al-dia" },
            { ...baseResumen, tono: "novedad" },
            { ...baseResumen, tono: "sin-comprobar" },
            { ...baseResumen, tono: "novedad" },
        ];
        expect(contarNovedades(resumenes)).toBe(2);
    });

    it("array vacío devuelve 0", () => {
        expect(contarNovedades([])).toBe(0);
    });

    it("sin novedades devuelve 0", () => {
        const resumenes: ResumenVersion[] = [
            { ...baseResumen, tono: "al-dia" },
            { ...baseResumen, tono: "sin-comprobar" },
        ];
        expect(contarNovedades(resumenes)).toBe(0);
    });
});