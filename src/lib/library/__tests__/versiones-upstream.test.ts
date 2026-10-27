// Pruebas del resumen puro de versiones upstream de la Biblioteca (Ola 1025R).
import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
} from "../versiones-upstream";

const SHA_COMPLETO = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const SHA_CORTO = "a1b2c3d";

function fuente(parcial: Partial<FuenteVersion>): FuenteVersion {
    return {
        id: "lib-prueba",
        instalada: SHA_CORTO,
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "https://github.com/prueba/repo",
        aviso: null,
        ...parcial,
    };
}

describe("normalizarVersion", () => {
    it("quita mayúsculas, espacios y lo que va antes de la última @", () => {
        expect(normalizarVersion("@Cloudflare/Computer@ 0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });

    it("quita una v inicial seguida de dígito", () => {
        expect(normalizarVersion("v0.10.2")).toBe("0.10.2");
        expect(normalizarVersion("V1.3.0")).toBe("1.3.0");
    });

    it("un SHA de 7 a 40 hexadecimales se queda con 7 caracteres", () => {
        expect(normalizarVersion(SHA_COMPLETO)).toBe(SHA_CORTO);
        expect(normalizarVersion(SHA_COMPLETO.toUpperCase())).toBe(SHA_CORTO);
        expect(normalizarVersion(SHA_COMPLETO)).toBe(normalizarVersion(SHA_CORTO));
    });
});

describe("resumirVersiones", () => {
    it("commit remoto de 40 hex: al día contra el SHA corto de la ficha", () => {
        const r = resumirVersiones(
            [fuente({ remota: SHA_COMPLETO, estado: "igual", fecha: "2026-10-19T10:00:00Z" })],
            new Set(["lib-prueba"]),
        );
        expect(r[0].tono).toBe("al-dia");
        expect(r[0].texto).toBe(`Al día (${SHA_CORTO}) (2026-10-19T10:00:00Z)`);
    });

    it("commit remoto distinto: novedad", () => {
        const r = resumirVersiones(
            [fuente({ remota: "b2c3d4e", estado: "hay-actualizacion" })],
            new Set(["lib-prueba"]),
        );
        expect(r[0].tono).toBe("novedad");
        expect(r[0].texto).toBe(`Versión nueva publicada: b2c3d4e (la ficha tiene ${SHA_CORTO})`);
    });

    it("resumen de varios canales: etiqueta, release y commits", () => {
        const casos: [string, string, boolean][] = [
            ["@cloudflare/computer@0.7.0", "0.7.0", true],
            ["@cloudflare/computer@0.7.0", "0.7.1", false],
            ["0.10.0", "v0.10.0", true],
            ["0.10.0", "v0.10.1", false],
        ];
        for (const [instalada, remota, alDia] of casos) {
            const r = resumirVersiones(
                [fuente({ instalada, remota, estado: "desconocida" })],
                new Set(["lib-prueba"]),
            );
            expect(r[0].tono).toBe(alDia ? "al-dia" : "novedad");
        }
    });

    it("sin remota: sin-comprobar, aunque el estado pida alarma", () => {
        const r = resumirVersiones(
            [fuente({ remota: null, estado: "hay-actualizacion" })],
            new Set(["lib-prueba"]),
        );
        expect(r[0].tono).toBe("sin-comprobar");
        expect(r[0].texto).toBe("No se pudo comprobar ahora");
    });

    it("los ids no instalados quedan fuera y el orden de entrada se respeta", () => {
        const fuentes = [
            fuente({ id: "lib-b", remota: "b2c3d4e", estado: "hay-actualizacion" }),
            fuente({ id: "lib-fuera", remota: "c3d4e5f", estado: "hay-actualizacion" }),
            fuente({ id: "lib-a", remota: null, estado: "desconocida" }),
        ];
        expect(resumirVersiones(fuentes, new Set(["lib-b", "lib-a"])).map((x) => x.id)).toEqual([
            "lib-b",
            "lib-a",
        ]);
    });

    it("remota null nunca da novedad", () => {
        const r = resumirVersiones(
            [fuente({ remota: null, estado: "desconocida" }), fuente({ remota: null, estado: "igual" })],
            new Set(["lib-prueba"]),
        );
        expect(r.every((x) => x.tono === "sin-comprobar")).toBe(true);
        expect(contarNovedades(r)).toBe(0);
    });

    it("contarNovedades cuenta solo las novedades", () => {
        const fuentes = [
            fuente({ id: "a", remota: "b2c3d4e", estado: "hay-actualizacion" }),
            fuente({ id: "b", remota: SHA_COMPLETO, estado: "igual" }),
            fuente({ id: "c", remota: null, estado: "desconocida" }),
            fuente({ id: "d", remota: null, estado: "desconocida" }),
        ];
        const r = resumirVersiones(fuentes, new Set(["a", "b", "c", "d"]));
        expect(contarNovedades(r)).toBe(1);
        expect(contarNovedades([])).toBe(0);
    });
});
