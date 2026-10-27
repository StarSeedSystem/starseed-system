import { describe, it, expect } from "vitest";
import { normalizarVersion, resumirVersiones, contarNovedades, type FuenteVersion } from "../versiones-upstream";

describe("normalizarVersion", () => {
    it("quita v inicial seguida de dígito", () => {
        expect(normalizarVersion("v1.2.3")).toBe("1.2.3");
    });
    it("se queda con lo que va tras la última @", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });
    it("normaliza SHA de 7 a 40 hex a 7 primeros caracteres", () => {
        expect(normalizarVersion("abc1234567890def")).toBe("abc1234");
        expect(normalizarVersion("ABC1234567890DEF")).toBe("abc1234");
    });
    it("minúsculas y sin espacios", () => {
        expect(normalizarVersion("  V1.0.0  ")).toBe("1.0.0");
    });
});

describe("resumirVersiones", () => {
    it("commits SHA de 7 contra 40 - igual si comparten prefijo", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg1",
                instalada: "abc1234",
                remota: "abc1234567890def1234567890abcdef12345678",
                estado: "desconocida",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg1"]));
        expect(res[0].tono).toBe("al-dia");
    });
    it("etiquetas con prefijo de paquete", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg2",
                instalada: "@scope/pkg@1.0.0",
                remota: "1.0.0",
                estado: "desconocida",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg2"]));
        expect(res[0].tono).toBe("al-dia");
    });
    it("release con v", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg3",
                instalada: "v2.3.1",
                remota: "v2.3.1",
                estado: "desconocida",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg3"]));
        expect(res[0].tono).toBe("al-dia");
    });
    it("igual con estado igual", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg4",
                instalada: "1.0.0",
                remota: "1.0.0",
                estado: "igual",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg4"]));
        expect(res[0].tono).toBe("al-dia");
        expect(res[0].texto).toBe("Al día (1.0.0)");
    });
    it("novedad con estado hay-actualizacion", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg5",
                instalada: "1.0.0",
                remota: "1.0.1",
                estado: "hay-actualizacion",
                fecha: "2026-10-25T00:00:00Z",
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg5"]));
        expect(res[0].tono).toBe("novedad");
        expect(res[0].texto).toBe("Versión nueva publicada: 1.0.1 (la ficha tiene 1.0.0) (2026-10-25T00:00:00Z)");
    });
    it("sin-comprobar si no hay remota", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg6",
                instalada: "1.0.0",
                remota: null,
                estado: "desconocida",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg6"]));
        expect(res[0].tono).toBe("sin-comprobar");
        expect(res[0].texto).toBe("No se pudo comprobar ahora");
    });
    it("sin-comprobar con fecha", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg7",
                instalada: "1.0.0",
                remota: null,
                estado: "desconocida",
                fecha: "2026-01-01",
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg7"]));
        expect(res[0].texto).toBe("No se pudo comprobar ahora (2026-01-01)");
    });
    it("ids no instalados fuera", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg8",
                instalada: "1.0.0",
                remota: "1.0.1",
                estado: "hay-actualizacion",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["otro"]));
        expect(res.length).toBe(0);
    });
    it("orden estable", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "a",
                instalada: "1.0.0",
                remota: "1.0.0",
                estado: "igual",
                fecha: null,
                upstream: "https://github.com/foo/a",
                aviso: null,
            },
            {
                id: "b",
                instalada: "1.0.0",
                remota: null,
                estado: "desconocida",
                fecha: null,
                upstream: "https://github.com/foo/b",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["a", "b"]));
        expect(res[0].id).toBe("a");
        expect(res[1].id).toBe("b");
    });
    it("remota null nunca da novedad", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "pkg9",
                instalada: "1.0.0",
                remota: null,
                estado: "hay-actualizacion",
                fecha: null,
                upstream: "https://github.com/foo/bar",
                aviso: null,
            },
        ];
        const res = resumirVersiones(fuentes, new Set(["pkg9"]));
        expect(res[0].tono).toBe("sin-comprobar");
    });
    it("contarNovedades", () => {
        const fuentes: FuenteVersion[] = [
            { id: "a", instalada: "1.0.0", remota: "1.0.1", estado: "hay-actualizacion", fecha: null, upstream: "u", aviso: null },
            { id: "b", instalada: "1.0.0", remota: "1.0.0", estado: "igual", fecha: null, upstream: "u", aviso: null },
        ];
        const res = resumirVersiones(fuentes, new Set(["a", "b"]));
        expect(contarNovedades(res)).toBe(1);
    });
});
