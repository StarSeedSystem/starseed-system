// Pruebas del resumen puro de versiones upstream de la Biblioteca (LIB1025A · Ola 1025R).

import { describe, it, expect } from "vitest";
import {
    normalizarVersion,
    resumirVersiones,
    contarNovedades,
    type FuenteVersion,
} from "../versiones-upstream";

function fuente(parcial: Partial<FuenteVersion> & { id: string }): FuenteVersion {
    return {
        instalada: "0.7.0",
        remota: null,
        estado: "desconocida",
        fecha: null,
        upstream: "https://github.com/ejemplo/repo",
        aviso: null,
        ...parcial,
    };
}

describe("normalizarVersion", () => {
    it("un SHA de 40 y su corte de 7 coinciden", () => {
        const largo = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
        expect(normalizarVersion(largo)).toBe("a1b2c3d");
        expect(normalizarVersion("a1b2c3d")).toBe("a1b2c3d");
    });

    it("una etiqueta con prefijo de paquete cae a la versión pelada", () => {
        expect(normalizarVersion("@cloudflare/computer@0.7.0")).toBe("0.7.0");
        expect(normalizarVersion("0.7.0")).toBe("0.7.0");
    });

    it("un release con «v» inicial lo pierde", () => {
        expect(normalizarVersion("v2.30.0")).toBe("2.30.0");
        expect(normalizarVersion("V2.30.0")).toBe("2.30.0");
    });

    it("minúsculas y sin espacios", () => {
        expect(normalizarVersion(" 1.2.3 ")).toBe("1.2.3");
        expect(normalizarVersion(" A1B2C3D4 ")).toBe("a1b2c3d");
    });

    it("una versión normal no se trunca", () => {
        expect(normalizarVersion("1.12.0.237")).toBe("1.12.0.237");
    });
});

describe("resumirVersiones", () => {
    it("commits: mismo SHA en corte de 7 contra 40 da «al-día»", () => {
        const [r] = resumirVersiones(
            [
                fuente({
                    id: "lib-klavis",
                    instalada: "a1b2c3d",
                    remota: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
                    estado: "igual",
                    fecha: "2026-06-01T00:00:00Z",
                }),
            ],
            new Set(["lib-klavis"]),
        );
        expect(r.tono).toBe("al-dia");
        expect(r.texto).toBe("Al día (a1b2c3d) (2026-06-01T00:00:00Z)");
    });

    it("commits: SHA distinto da «novedad» y dice las dos versiones", () => {
        const [r] = resumirVersiones(
            [
                fuente({
                    id: "lib-deepcode",
                    instalada: "2.3.1",
                    remota: "2.4.0",
                    estado: "hay-actualizacion",
                }),
            ],
            new Set(["lib-deepcode"]),
        );
        expect(r.tono).toBe("novedad");
        expect(r.texto).toBe("Versión nueva publicada: 2.4.0 (la ficha tiene 2.3.1)");
    });

    it("etiqueta con prefijo de paquete: la versión pelada igual da «al-día»", () => {
        const [r] = resumirVersiones(
            [
                fuente({
                    id: "lib-cloudflare-computer",
                    instalada: "0.7.0",
                    remota: "@cloudflare/computer@0.7.0",
                    estado: "desconocida",
                }),
            ],
            new Set(["lib-cloudflare-computer"]),
        );
        expect(r.tono).toBe("al-dia");
    });

    it("etiqueta con prefijo y versión nueva: «novedad» con la remota sin pelar", () => {
        const [r] = resumirVersiones(
            [
                fuente({
                    id: "lib-nanobot",
                    instalada: "0.3.5",
                    remota: "nanobot-v0.4.0",
                    estado: "desconocida",
                }),
            ],
            new Set(["lib-nanobot"]),
        );
        expect(r.tono).toBe("novedad");
        expect(r.texto).toBe("Versión nueva publicada: nanobot-v0.4.0 (la ficha tiene 0.3.5)");
    });

    it("release con «v»: si trae la misma versión da «al-día», si trae otra, «novedad»", () => {
        const fuentes = [
            fuente({
                id: "lib-inbox-zero",
                instalada: "v2.30.0",
                remota: "v2.30.0",
                estado: "desconocida",
            }),
            fuente({
                id: "lib-scrapegraph-ai",
                instalada: "2.3.1",
                remota: "v2.4.0",
                estado: "hay-actualizacion",
                fecha: "2026-10-20T00:00:00Z",
            }),
        ];
        const [igual, nueva] = resumirVersiones(
            fuentes,
            new Set(["lib-inbox-zero", "lib-scrapegraph-ai"]),
        );
        expect(igual.tono).toBe("al-dia");
        expect(nueva.tono).toBe("novedad");
        expect(nueva.texto).toBe(
            "Versión nueva publicada: v2.4.0 (la ficha tiene 2.3.1) (2026-10-20T00:00:00Z)",
        );
    });

    it("sin remota da «sin-comprobar» aunque el estado diga otra cosa", () => {
        const [r] = resumirVersiones(
            [fuente({ id: "lib-sin-datos", estado: "hay-actualizacion" })],
            new Set(["lib-sin-datos"]),
        );
        expect(r.tono).toBe("sin-comprobar");
        expect(r.texto).toBe("No se pudo comprobar ahora");
    });

    it("deja fuera los ids no instalados y respeta el orden de entrada", () => {
        const fuentes = [
            fuente({ id: "lib-b" }),
            fuente({ id: "lib-fuera" }),
            fuente({ id: "lib-a", remota: "1.0.0" }),
        ];
        const r = resumirVersiones(fuentes, new Set(["lib-a", "lib-b", "lib-c"]));
        expect(r.map((x) => x.id)).toEqual(["lib-b", "lib-a"]);
        expect(contarNovedades(r)).toBe(1);
    });

    it("contarNovedades solo cuenta «novedad»", () => {
        const r = resumirVersiones(
            [
                fuente({ id: "x1", remota: "2.0.0", estado: "hay-actualizacion" }),
                fuente({ id: "x2" }),
                fuente({ id: "x3", estado: "igual", remota: "0.7.0" }),
            ],
            new Set(["x1", "x2", "x3"]),
        );
        expect(contarNovedades(r)).toBe(1);
    });
});
