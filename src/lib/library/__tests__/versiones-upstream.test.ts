import { describe, it, expect } from "vitest";
import { normalizarVersion, resumirVersiones, contarNovedades, type FuenteVersion } from "../versiones-upstream";

describe("normalizarVersion", () => {
    it("quita prefijo v cuando va seguido de digito", () => {
        expect(normalizarVersion("v1.2.3")).toBe("1.2.3");
    });

    it("coincide @cloudflare/computer@0.7.0 con 0.7.0", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });

    it("convierte SHA de 7 a 40 hexadecimales a sus 7 primeros caracteres", () => {
        expect(normalizarVersion("ABCDEF1234567890ABCDEF1234567890ABCDEF12")).toBe("abcdef1");
        expect(normalizarVersion("abcdef1")).toBe("abcdef1");
    });

    it("minúsculas y sin espacios", () => {
        expect(normalizarVersion("V1.2.3")).toBe("1.2.3");
        expect(normalizarVersion(" 1.2.3 ")).toBe("1.2.3");
    });
});

describe("resumirVersiones", () => {
    it("commits: SHA de 7 contra 40", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "a",
                instalada: "abcdef1",
                remota: "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
                estado: "igual",
                fecha: null,
                upstream: "x",
                aviso: null,
            },
        ];
        const r = resumirVersiones(fuentes, new Set(["a"]));
        expect(r[0].tono).toBe("al-dia");
    });

    it("etiquetas con prefijo de paquete", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "b",
                instalada: "@scope/pkg@1.0.0",
                remota: "scope/pkg@1.0.0",
                estado: "desconocida",
                fecha: null,
                upstream: "x",
                aviso: null,
            },
        ];
        const r = resumirVersiones(fuentes, new Set(["b"]));
        expect(r[0].tono).toBe("al-dia");
    });

    it("release con v", () => {
        const fuentes: FuenteVersion[] = [
            {
                id: "c",
                instalada: "1.0.0",
                remota: "v1.0.0",
                estado: "desconocida",
                fecha: null,
                upstream: "x",
                aviso: null,
            },
        ];
        const r = resumirVersiones(fuentes, new Set(["c"]));
        expect(r[0].tono).toBe("al-dia");
        expect(r[0].texto).toBe("Al día (1.0.0)");
    });

    it("igual/novedad/sin-comprobar", () => {
        const fuentes: FuenteVersion[] = [
            { id: "i1", instalada: "1.0.0", remota: "1.0.0", estado: "igual", fecha: null, upstream: "x", aviso: null },
            { id: "n1", instalada: "1.0.0", remota: "1.0.1", estado: "hay-actualizacion", fecha: null, upstream: "x", aviso: null },
            { id: "s1", instalada: "1.0.0", remota: null, estado: "desconocida", fecha: null, upstream: "x", aviso: null },
        ];
        const r = resumirVersiones(fuentes, new Set(["i1", "n1", "s1"]));
        expect(r[0].tono).toBe("al-dia");
        expect(r[1].tono).toBe("novedad");
        expect(r[2].tono).toBe("sin-comprobar");
        expect(r[2].texto).toBe("No se pudo comprobar ahora");
    });

    it("ids no instalados fuera", () => {
        const fuentes: FuenteVersion[] = [
            { id: "x", instalada: "1.0.0", remota: "1.0.1", estado: "hay-actualizacion", fecha: null, upstream: "x", aviso: null },
        ];
        const r = resumirVersiones(fuentes, new Set(["y"]));
        expect(r.length).toBe(0);
    });

    it("orden estable", () => {
        const fuentes: FuenteVersion[] = [
            { id: "a", instalada: "1.0.0", remota: "1.0.0", estado: "igual", fecha: null, upstream: "x", aviso: null },
            { id: "b", instalada: "1.0.0", remota: "1.0.1", estado: "hay-actualizacion", fecha: null, upstream: "x", aviso: null },
            { id: "c", instalada: "1.0.0", remota: null, estado: "desconocida", fecha: null, upstream: "x", aviso: null },
        ];
        const r = resumirVersiones(fuentes, new Set(["a", "b", "c"]));
        expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
    });

    it("remota: null nunca da novedad", () => {
        const fuentes: FuenteVersion[] = [
            { id: "z", instalada: "1.0.0", remota: null, estado: "hay-actualizacion", fecha: null, upstream: "x", aviso: null },
        ];
        const r = resumirVersiones(fuentes, new Set(["z"]));
        expect(r[0].tono).toBe("sin-comprobar");
    });

    it("textos con fecha entre paréntesis si existe", () => {
        const fuentes: FuenteVersion[] = [
            { id: "n", instalada: "1.0.0", remota: "1.0.1", estado: "hay-actualizacion", fecha: "2026-10-25", upstream: "x", aviso: null },
            { id: "s", instalada: "1.0.0", remota: null, estado: "desconocida", fecha: "2026-10-25", upstream: "x", aviso: null },
        ];
        const r = resumirVersiones(fuentes, new Set(["n", "s"]));
        expect(r[0].texto).toBe("Versión nueva publicada: 1.0.1 (la ficha tiene 1.0.0) (2026-10-25)");
        expect(r[1].texto).toBe("No se pudo comprobar ahora (2026-10-25)");
    });
});

describe("contarNovedades", () => {
    it("cuenta solo novedades", () => {
        const fuentes: FuenteVersion[] = [
            { id: "a", instalada: "1.0.0", remota: "1.0.0", estado: "igual", fecha: null, upstream: "x", aviso: null },
            { id: "b", instalada: "1.0.0", remota: "1.0.1", estado: "hay-actualizacion", fecha: null, upstream: "x", aviso: null },
            { id: "c", instalada: "1.0.0", remota: null, estado: "desconocida", fecha: null, upstream: "x", aviso: null },
        ];
        const r = resumirVersiones(fuentes, new Set(["a", "b", "c"]));
        expect(contarNovedades(r)).toBe(1);
    });
});
