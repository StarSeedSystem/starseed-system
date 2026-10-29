import { describe, it, expect } from "vitest";
import type { EstadoActualizacion } from "@/lib/library/actualizaciones";
import {
    contarNovedades,
    normalizarVersion,
    resumirVersiones,
    type FuenteVersion,
} from "@/lib/library/versiones-upstream";

function fuente(parcial: Partial<FuenteVersion> & { id: string }): FuenteVersion {
    return {
        id: parcial.id,
        instalada: parcial.instalada ?? "1.0.0",
        remota: parcial.remota ?? null,
        estado: (parcial.estado ?? "desconocida") as EstadoActualizacion,
        fecha: parcial.fecha ?? null,
        upstream: parcial.upstream ?? "https://github.com/ejemplo/repo",
        aviso: parcial.aviso ?? null,
    };
}

describe("normalizarVersion", () => {
    it("hace coincidir la versión con alcance de paquete y la pelada", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });

    it("recorta un SHA de 40 hexadecimales a sus 7 primeros caracteres", () => {
        const sha40 = "18891e4aabbccddeeff00112233445566778899a";
        expect(sha40).toHaveLength(40);
        expect(normalizarVersion(sha40)).toBe("18891e4");
        expect(normalizarVersion("18891e4")).toBe("18891e4");
    });

    it("quita la v inicial solo si va seguida de dígito", () => {
        expect(normalizarVersion("v2.30.0")).toBe("2.30.0");
        expect(normalizarVersion("V1.12.0.237")).toBe("1.12.0.237");
        expect(normalizarVersion("version-2")).toBe("version-2");
    });

    it("pasa a minúsculas y quita espacios", () => {
        expect(normalizarVersion("  0.7.0-BETA ")).toBe("0.7.0-beta");
    });
});

describe("resumirVersiones", () => {
    it("commits: SHA de 7 contra 40 con el mismo prefijo queda al día", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-x",
                    instalada: "18891e4",
                    remota: "18891e4aabbccddeeff00112233445566778899a",
                    estado: "igual",
                }),
            ],
            new Set(["lib-x"]),
        );
        expect(resumen).toHaveLength(1);
        expect(resumen[0].tono).toBe("al-dia");
        expect(resumen[0].texto).toBe("Al día (18891e4)");
    });

    it("commits: SHA distinto da novedad con la frase completa", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-x",
                    instalada: "18891e4",
                    remota: "9a9988665544332211ffeeddccbbaa9988776655",
                    estado: "hay-actualizacion",
                    fecha: "2026-10-21T00:00:00Z",
                }),
            ],
            new Set(["lib-x"]),
        );
        expect(resumen[0].tono).toBe("novedad");
        expect(resumen[0].texto).toBe(
            "Versión nueva publicada: 9a99886 (2026-10-21T00:00:00Z; la ficha tiene 18891e4)",
        );
    });

    it("etiquetas con prefijo de paquete: distinta fecha de etiqueta es novedad", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-ruview",
                    instalada: "ruview-harness-2026-10-20",
                    remota: "ruview-harness-2026-10-21",
                    estado: "hay-actualizacion",
                }),
            ],
            new Set(["lib-ruview"]),
        );
        expect(resumen[0].tono).toBe("novedad");
        expect(resumen[0].texto).toBe(
            "Versión nueva publicada: ruview-harness-2026-10-21 (la ficha tiene ruview-harness-2026-10-20)",
        );
    });

    it("release con v: desconocida pero misma versión normalizada queda al día", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-inbox",
                    instalada: "2.30.0",
                    remota: "v2.30.0",
                    estado: "desconocida",
                    fecha: "2026-05-18T00:00:00Z",
                }),
            ],
            new Set(["lib-inbox"]),
        );
        expect(resumen[0].tono).toBe("al-dia");
        expect(resumen[0].texto).toBe("Al día (2.30.0 · 2026-05-18T00:00:00Z)");
    });

    it("release con v: versión nueva normalizada distinta da novedad sin depender del estado", () => {
        const resumen = resumirVersiones(
            [
                fuente({
                    id: "lib-scrape",
                    instalada: "2.3.1",
                    remota: "v2.4.0",
                    estado: "desconocida",
                    fecha: "2026-10-06T00:00:00Z",
                }),
            ],
            new Set(["lib-scrape"]),
        );
        expect(resumen[0].tono).toBe("novedad");
        expect(resumen[0].texto).toBe(
            "Versión nueva publicada: 2.4.0 (2026-10-06T00:00:00Z; la ficha tiene 2.3.1)",
        );
    });

    it("sin remota: sin-comprobar, nunca novedad (aunque el estado diga otra cosa)", () => {
        const resumen = resumirVersiones(
            [
                fuente({ id: "lib-a", remota: null, estado: "hay-actualizacion" }),
                fuente({ id: "lib-b", remota: null, estado: "desconocida" }),
            ],
            new Set(["lib-a", "lib-b"]),
        );
        expect(resumen.map((r) => r.tono)).toEqual(["sin-comprobar", "sin-comprobar"]);
        expect(resumen.every((r) => r.texto === "No se pudo comprobar ahora")).toBe(true);
    });

    it("deja fuera los ids no instalados y respeta el orden de entrada", () => {
        const resumen = resumirVersiones(
            [
                fuente({ id: "lib-c", instalada: "1.0.0", remota: "v1.0.0", estado: "igual" }),
                fuente({ id: "lib-d", instalada: "1.0.0", remota: "v1.1.0", estado: "desconocida" }),
                fuente({ id: "lib-e", instalada: "1.0.0", remota: "v1.0.0", estado: "igual" }),
            ],
            new Set(["lib-c", "lib-e"]),
        );
        expect(resumen.map((r) => r.id)).toEqual(["lib-c", "lib-e"]);
        expect(resumen.map((r) => r.tono)).toEqual(["al-dia", "novedad"]);
    });

    it("copia los datos de la fuente tal cual, sin inventar versiones", () => {
        const fuenteUnica = fuente({
            id: "lib-f",
            instalada: "0.7.0",
            remota: "@cloudflare/computer@0.8.0",
            estado: "desconocida",
            fecha: "2026-10-23",
            upstream: "https://github.com/cloudflare/computer",
            aviso: null,
        });
        const resumen = resumirVersiones([fuenteUnica], new Set(["lib-f"]));
        expect(resumen[0].id).toBe("lib-f");
        expect(resumen[0].instalada).toBe("0.7.0");
        expect(resumen[0].remota).toBe("@cloudflare/computer@0.8.0");
        expect(resumen[0].fecha).toBe("2026-10-23");
        expect(resumen[0].upstream).toBe("https://github.com/cloudflare/computer");
        expect(resumen[0].tono).toBe("novedad");
        expect(resumen[0].texto).toBe(
            "Versión nueva publicada: 0.8.0 (2026-10-23; la ficha tiene 0.7.0)",
        );
    });
    it("contarNovedades cuenta solo las filas con novedad", () => {
        const resumen = resumirVersiones(
            [
                fuente({ id: "lib-a", instalada: "1.0.0", remota: "v1.0.0", estado: "igual" }),
                fuente({ id: "lib-b", instalada: "1.0.0", remota: "v2.0.0", estado: "hay-actualizacion" }),
                fuente({ id: "lib-c", remota: null }),
                fuente({ id: "lib-d", instalada: "5.2.3", remota: "v5.2.9", estado: "desconocida" }),
            ],
            new Set(["lib-a", "lib-b", "lib-c", "lib-d"]),
        );
        expect(contarNovedades(resumen)).toBe(2);
        expect(contarNovedades([])).toBe(0);
    });
});
