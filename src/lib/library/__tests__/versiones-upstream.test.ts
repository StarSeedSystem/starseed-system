// Pruebas del resumen puro de versiones upstream de la Biblioteca (Ola 1025R).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(parcial: Partial<FuenteVersion>): FuenteVersion {
    return {
        id: "proto-demo",
        instalada: "1.0.0",
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "https://github.com/demo/demo",
        aviso: null,
        ...parcial,
    };
}

describe("normalizarVersion", () => {
    it("SHA de 7 contra 40 hexadecimales: coinciden por los 7 primeros", () => {
        expect(normalizarVersion("a1b2c3d")).toBe("a1b2c3d");
        expect(normalizarVersion("A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B")).toBe("a1b2c3d");
        expect(normalizarVersion("a1b2c3d")).toBe(normalizarVersion("a1b2c3d4e5f6"));
    });

    it("una etiqueta con prefijo de paquete coincide con la versión desnuda", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion(" 0.7.0 ")).toBe("0.7.0");
    });

    it("quita una v inicial seguida de dígito", () => {
        expect(normalizarVersion("v2.30.0")).toBe("2.30.0");
        expect(normalizarVersion("V1.12.0.237")).toBe("1.12.0.237");
    });

    it("lo que no encaja queda igual, sin inventar", () => {
        expect(normalizarVersion("ruview-harness-2026-10-20")).toBe("ruview-harness-2026-10-20");
    });
});

describe("resumirVersiones", () => {
    it("commits: SHA corto distinto da novedad, el mismo da al día", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "proto-x",
                    instalada: "a1b2c3d",
                    remota: "e4f5a6b7c8d9",
                    estado: "hay-actualizacion",
                    fecha: "2026-10-21T10:00:00Z",
                }),
                fuente({ id: "proto-y", instalada: "a1b2c3d", remota: "a1b2c3d4e5f6", estado: "igual" }),
            ],
            new Set(["proto-x", "proto-y"]),
        );
        expect(resumen[0].tono).toBe("novedad");
        expect(resumen[0].texto).toBe(
            "Versión nueva publicada: e4f5a6b7c8d9 (la ficha tiene a1b2c3d) (2026-10-21T10:00:00Z)",
        );
        expect(resumen[1].tono).toBe("al-dia");
    });

    it("etiqueta con prefijo de paquete distinta da novedad aunque el estado diga desconocida", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-cloudflare-computer",
                    instalada: "0.7.0",
                    remota: "@cloudflare/computer@0.7.0",
                }),
                fuente({ id: "lib-otra", instalada: "0.7.0", remota: "0.8.0" }),
            ],
            new Set(["lib-cloudflare-computer", "lib-otra"]),
        );
        expect(resumen[0].tono).toBe("al-dia");
        expect(resumen[0].texto).toBe("Al día (0.7.0)");
        expect(resumen[1].tono).toBe("novedad");
    });

    it("release con v inicial: v2.30.0 contra 2.30.0 es al día", () => {
        const resumen = resumirVersiones(
            [fuente({
                id: "lib-inbox-zero",
                instalada: "2.30.0",
                remota: "v2.30.0",
                estado: "desconocida",
            })],
            new Set(["lib-inbox-zero"]),
        );
        expect(resumen[0].tono).toBe("al-dia");
    });

    it("sin remota nunca hay novedad y no se inventa versión", () => {
        const resumen = resumirVersiones(
            [fuente({ id: "proto-x", instalada: "a1b2c3d", remota: null, estado: "desconocida" })],
            new Set(["proto-x"]),
        );
        expect(resumen[0].tono).toBe("sin-comprobar");
        expect(resumen[0].texto).toBe("No se pudo comprobar ahora");
        expect(resumen[0].remota).toBeNull();
        expect(contarNovedades(resumen)).toBe(0);
    });

    it("los ids no instalados quedan fuera y el orden es el de entrada", () => {
        const resumen = resumirVersiones(
            [
                fuente({ id: "a", remota: "1.1.0", estado: "hay-actualizacion" }),
                fuente({ id: "b", remota: null }),
                fuente({ id: "c", remota: "1.0.0", estado: "igual" }),
                fuente({ id: "d", remota: "2.0.0", estado: "hay-actualizacion" }),
            ],
            new Set(["c", "a", "b"]),
        );
        expect(resumen.map((r) => r.id)).toEqual(["a", "b", "c"]);
        expect(contarNovedades(resumen)).toBe(1);
    });

    it("estado igual manda aunque la normalización pudiera dudar", () => {
        const resumen = resumirVersiones(
            [fuente({ id: "lib-tarjeta", instalada: "3.10.1", remota: "3.10.1", estado: "igual" })],
            new Set(["lib-tarjeta"]),
        );
        expect(resumen[0].tono).toBe("al-dia");
        expect(contarNovedades(resumen)).toBe(0);
    });
});
