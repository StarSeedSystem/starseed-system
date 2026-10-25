// Pruebas del módulo puro de resumen de versiones upstream (Ola 1025R · LIB1025A).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(extra: Partial<FuenteVersion>): FuenteVersion {
    return {
        id: "ficha",
        instalada: "0.7.0",
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "https://github.com/cloudflare/computer",
        aviso: null,
        ...extra,
    };
}

describe("normalizarVersion", () => {
    it("un SHA completo y su forma corta de 7 coinciden", () => {
        expect(normalizarVersion("a1b2c3d4e5f6789a0123456789abcdef01234567")).toBe("a1b2c3d");
        expect(normalizarVersion("a1b2c3d")).toBe("a1b2c3d");
    });

    it("una etiqueta con prefijo de paquete y una release v equivalen", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("@cloudflare/computer@v1.2.3")).toBe("1.2.3");
        expect(normalizarVersion("v2.0.0-alpha.3")).toBe("2.0.0-alpha.3");
    });

    it("minúsculas y sin espacios; constantes armadas al vuelo valen lo mismo", () => {
        expect(normalizarVersion(["@", "iben12", "@fixture-sx"].join(""))).toBe("fixture-sx");
        expect(normalizarVersion("FixTure-SX".toLowerCase())).toBe("fixture-sx");
    });
});

describe("resumirVersiones", () => {
    it("commits: SHA distinto con estado conocido da novedad con su texto", () => {
        const fuentes = [
            fuente({
                id: "lib-a",
                instalada: "a1b2c3d",
                remota: "e4f5a6b7c8d9",
                fecha: "2026-10-24T00:00:00Z",
            }),
        ];
        const ids = new Set(["lib-a"]);
        const resumen = resumirVersiones(fuentes, ids);
        expect(resumen).toHaveLength(1);
        expect(resumen[0].tono).toBe("novedad");
        expect(resumen[0].texto).toBe(
            "Versión nueva publicada: e4f5a6b7c8d9 (la ficha tiene a1b2c3d) (2026-10-24T00:00:00Z)",
        );
    });

    it("commits: mismo SHA da al día", () => {
        const fuentes = [
            fuente({
                id: "lib-a",
                estado: "igual",
                instalada: "a1b2c3d",
                remota: "a1b2c3d",
            }),
        ];
        const [r] = resumirVersiones(fuentes, new Set(["lib-a"]));
        expect(r.tono).toBe("al-dia");
        expect(r.texto).toBe("Al día (a1b2c3d)");
    });

    it("etiquetas: versiones equivalentes con distinta forma se detectan", () => {
        const fuentes = [
            fuente({
                id: "lib-t",
                estado: "desconocida",
                instalada: "@cloudflare/computer@0.7.0",
                remota: "0.7.0",
                fecha: "2026-10-23T00:00:00Z",
            }),
        ];
        const [r] = resumirVersiones(fuentes, new Set(["lib-t"]));
        expect(r.tono).toBe("al-dia");
        expect(r.texto).toBe("Al día (@cloudflare/computer@0.7.0) (2026-10-23T00:00:00Z)");
    });

    it("releases con v: la v no equivoca la comparación", () => {
        const fuentes = [
            fuente({
                id: "lib-r",
                estado: "desconocida",
                instalada: "1.6.0",
                remota: "v1.7.0",
                fecha: "2026-10-23T12:00:00Z",
            }),
        ];
        const [r] = resumirVersiones(fuentes, new Set(["lib-r"]));
        expect(r.tono).toBe("novedad");
        expect(r.texto).toBe(
            "Versión nueva publicada: v1.7.0 (la ficha tiene 1.6.0) (2026-10-23T12:00:00Z)",
        );
    });

    it("remota null nunca es novedad, aunque el estado alarmara", () => {
        const fuentes = [fuente({ id: "lib-s", estado: "hay-actualizacion", remota: null })];
        const [r] = resumirVersiones(fuentes, new Set(["lib-s"]));
        expect(r.tono).toBe("sin-comprobar");
        expect(r.texto).toBe("No se pudo comprobar ahora");
    });

    it("los ids no instalados quedan fuera y el orden de entrada se conserva", () => {
        const fuentes = [
            fuente({ id: "otro" }),
            fuente({ id: "lib-b", remota: "a1b2c3d", estado: "igual" }),
            fuente({ id: "lib-a", instalada: "a1b2c3d", remota: "a1b2c3d", estado: "igual" }),
        ];
        const resumen = resumirVersiones(fuentes, new Set(["lib-a", "lib-b"]));
        expect(resumen.map((r) => r.id)).toEqual(["lib-b", "lib-a"]);
    });
});

describe("contarNovedades", () => {
    it("cuenta solo las de tono novedad", () => {
        const fuentes = [
            fuente({ id: "n1", instalada: "a1b2c3d", remota: "e4f5a6b", estado: "hay-actualizacion" }),
            fuente({ id: "n2", instalada: "a1b2c3d", remota: "a1b2c3d", estado: "igual" }),
            fuente({ id: "n3", remota: null, estado: "desconocida" }),
        ];
        expect(contarNovedades(resumirVersiones(fuentes, new Set(["n1", "n2", "n3"])))).toBe(1);
        expect(contarNovedades([])).toBe(0);
    });
});
