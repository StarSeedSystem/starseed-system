// Pruebas del resumen puro de versiones upstream (Ola 1025R).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(parcial: Partial<FuenteVersion> & { id: string }): FuenteVersion {
    return {
        instalada: "a1b2c3d",
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "https://github.com/algo/repo",
        aviso: null,
        ...parcial,
    };
}

describe("normalizarVersion", () => {
    it("se queda con lo que va tras la última @", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });

    it("minúsculas y sin espacios", () => {
        expect(normalizarVersion("  V2.1.0 ")).toBe("2.1.0");
    });

    it("quita la v inicial solo si va seguida de dígito", () => {
        expect(normalizarVersion("v1.4.2")).toBe("1.4.2");
        expect(normalizarVersion("verdadero-1")).toBe("verdadero-1");
    });

    it("acorta un SHA de 7 a 40 hexadecimales a 7 caracteres", () => {
        expect(normalizarVersion("a1b2c3d")).toBe("a1b2c3d");
        expect(normalizarVersion("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2")).toBe("a1b2c3d");
    });

    it("una versión que no es SHA queda igual", () => {
        expect(normalizarVersion("1.2.3")).toBe("1.2.3");
        expect(normalizarVersion("zzzzzz9")).toBe("zzzzzz9");
    });
});

describe("resumirVersiones", () => {
    it("commit igual da al día y SHA largo contra corto también", () => {
        const r = resumirVersiones(
            [
                fuente({ id: "a", instalada: "a1b2c3d", remota: "a1b2c3d", estado: "igual" }),
                fuente({
                    id: "b",
                    instalada: "a1b2c3d",
                    remota: "a1b2c3d4e5f6",
                    estado: "igual",
                }),
            ],
            new Set(["a", "b"]),
        );
        expect(r.map((x) => x.tono)).toEqual(["al-dia", "al-dia"]);
        expect(r[0]?.texto).toBe("Al día (a1b2c3d)");
    });

    it("etiqueta con prefijo de paquete coincide con la versión pelada", () => {
        const r = resumirVersiones(
            [fuente({ id: "x", instalada: "0.7.0", remota: "@cloudflare/computer@0.7.0" })],
            new Set(["x"]),
        );
        expect(r[0]?.tono).toBe("al-dia");
    });

    it("release con v distinta da novedad con su texto y fecha", () => {
        const r = resumirVersiones(
            [
                fuente({
                    id: "x",
                    instalada: "1.0.0",
                    remota: "v1.4.2",
                    fecha: "2026-10-01T00:00:00Z",
                }),
            ],
            new Set(["x"]),
        );
        expect(r[0]?.tono).toBe("novedad");
        expect(r[0]?.texto).toBe(
            "Versión nueva publicada: v1.4.2 (la ficha tiene 1.0.0) (2026-10-01T00:00:00Z)",
        );
    });

    it("sin remota da sin-comprobar y nunca novedad", () => {
        const r = resumirVersiones(
            [fuente({ id: "x", instalada: "9.9.9", estado: "hay-actualizacion" })],
            new Set(["x"]),
        );
        expect(r[0]?.tono).toBe("sin-comprobar");
        expect(r[0]?.texto).toBe("No se pudo comprobar ahora");
        expect(contarNovedades(r)).toBe(0);
    });

    it("los ids no instalados quedan fuera y el orden es el de entrada", () => {
        const r = resumirVersiones(
            [
                fuente({ id: "uno", remota: "1.0.0", estado: "igual" }),
                fuente({ id: "dos", instalada: "1.0.0", remota: "2.0.0" }),
                fuente({ id: "tres", instalada: "1.0.0", remota: "1.0.0", estado: "igual" }),
            ],
            new Set(["uno", "tres", "cuatro"]),
        );
        expect(r.map((x) => x.id)).toEqual(["uno", "tres"]);
        expect(r).toHaveLength(2);
    });

    it("estado hay-actualizacion manda aunque las cadenas coincidan al pelarse", () => {
        const r = resumirVersiones(
            [fuente({ id: "x", instalada: "1.0.0", remota: "1.0.0", estado: "hay-actualizacion" })],
            new Set(["x"]),
        );
        expect(r[0]?.tono).toBe("novedad");
        expect(contarNovedades(r)).toBe(1);
    });
});
