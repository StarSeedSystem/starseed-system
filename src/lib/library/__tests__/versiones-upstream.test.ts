import { describe, expect, it } from "vitest";
import {
    contarNovedades,
    normalizarVersion,
    resumirVersiones,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(extra: Partial<FuenteVersion>): FuenteVersion {
    return {
        id: "ficha",
        instalada: "1.0.0",
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "github.com/acme/repo",
        aviso: null,
        ...extra,
    };
}

describe("normalizarVersion", () => {
    it("da igual_SHA_7 para un SHA de 40 y de 7", () => {
        const sha40 = "0123456789abcdef0123456789abcdef01234567";
        expect(normalizarVersion(sha40)).toBe("0123456");
        expect(normalizarVersion("0123456")).toBe("0123456");
    });

    it("quita el prefijo de paquete y la v inicial", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion(" v1.2.3 ")).toBe("1.2.3");
        expect(normalizarVersion("V2.0")).toBe("2.0");
    });

    it("no trata como SHA algo con letras fuera del rango hex o de 6", () => {
        expect(normalizarVersion("1.2.3-rc1")).toBe("1.2.3-rc1");
        expect(normalizarVersion("zzzz999")).toBe("zzzz999");
    });
});

describe("resumirVersiones", () => {
    it("estado igual y SHA completo coinciden con SHA corto: al-día", () => {
        const sha = "0123456789abcdef0123456789abcdef01234567";
        const r = resumirVersiones(
            [
                fuente({ id: "a", estado: "igual", remota: sha, fecha: "2026-09-12" }),
                fuente({
                    id: "b",
                    instalada: "0123456",
                    remota: "0123456",
                    estado: "desconocida",
                }),
            ],
            new Set(["a", "b"]),
        );
        expect(r[0].tono).toBe("al-dia");
        expect(r[0].texto).toBe("Al día (1.0.0) (2026-09-12)");
        expect(r[1].tono).toBe("al-dia");
        expect(r[1].texto).toBe("Al día (0123456)");
    });

    it("tag con prefijo de paquete y release con v dan novedad contra la instalada", () => {
        const r = resumirVersiones(
            [
                fuente({ id: "a", instalada: "0.7.0", remota: "@cloudflare/computer@0.7.1" }),
                fuente({ id: "b", instalada: "1.2.3", remota: "v1.3.0", estado: "igual" }),
            ],
            new Set(["a", "b"]),
        );
        expect(r[0].tono).toBe("novedad");
        expect(r[0].texto).toBe("Versión nueva publicada: @cloudflare/computer@0.7.1 (la ficha tiene 0.7.0)");
        expect(r[1].tono).toBe("novedad");
    });

    it("sin remota: sin-comprobar, nunca novedad", () => {
        const r = resumirVersiones(
            [
                fuente({ id: "a", remota: null }),
                fuente({ id: "b", remota: null, estado: "igual", fecha: "2026-10-01" }),
            ],
            new Set(["a", "b"]),
        );
        expect(r.every((x) => x.tono === "sin-comprobar")).toBe(true);
        expect(r[0].texto).toBe("No se pudo comprobar ahora");
        expect(r[1].texto).toBe("No se pudo comprobar ahora (2026-10-01)");
    });

    it("solo ids instalados, orden estable", () => {
        const r = resumirVersiones(
            [fuente({ id: "c" }), fuente({ id: "a" }), fuente({ id: "z" })],
            new Set(["a", "b"]),
        );
        expect(r.map((x) => x.id)).toEqual(["a"]);
    });
});

describe("contarNovedades", () => {
    it("cuenta solo las novedades", () => {
        const n = contarNovedades([
            { id: "a", tono: "novedad", texto: "", instalada: "", remota: "", fecha: null, upstream: "" },
            { id: "b", tono: "al-dia", texto: "", instalada: "", remota: "", fecha: null, upstream: "" },
            { id: "c", tono: "novedad", texto: "", instalada: "", remota: "", fecha: null, upstream: "" },
        ]);
        expect(n).toBe(2);
    });
});
