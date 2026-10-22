// Pruebas del módulo puro de actualizaciones de la Biblioteca (JV12 · Ola 360).

import { describe, it, expect } from "vitest";
import {
    urlDeConsulta,
    urlDeEtiquetas,
    leerVersion,
    leerEtiqueta,
    validarPatronTag,
    compararVersiones,
} from "../actualizaciones";

describe("urlDeConsulta", () => {
    it("una URL de GitHub da la consulta de commits", () => {
        expect(urlDeConsulta("https://github.com/razorback16/openjev")).toBe(
            "https://api.github.com/repos/razorback16/openjev/commits?per_page=1",
        );
    });

    it("una URL de Hugging Face da la consulta del modelo", () => {
        expect(urlDeConsulta("https://huggingface.co/AlexWortega/openjev")).toBe(
            "https://huggingface.co/api/models/AlexWortega/openjev",
        );
    });

    it("una URL rara devuelve null", () => {
        expect(urlDeConsulta("https://gitlab.com/algo/raro")).toBeNull();
        expect(urlDeConsulta("no-es-url")).toBeNull();
    });
});

describe("leerVersion", () => {
    it("lee sha corto y fecha del último commit de GitHub", () => {
        const json = [
            { sha: "a1b2c3d4e5f6", commit: { committer: { date: "2026-09-20T10:00:00Z" } } },
        ];
        expect(leerVersion("https://github.com/razorback16/openjev", json)).toEqual({
            version: "a1b2c3d",
            fecha: "2026-09-20T10:00:00Z",
        });
    });

    it("lee sha y lastModified de un modelo de Hugging Face", () => {
        const json = { sha: "f9e8d7c6b5a4", lastModified: "2026-09-01T00:00:00.000Z" };
        expect(leerVersion("https://huggingface.co/AlexWortega/openjev", json)).toEqual({
            version: "f9e8d7c",
            fecha: "2026-09-01T00:00:00.000Z",
        });
    });

    it("una respuesta vacía o rara devuelve null", () => {
        expect(leerVersion("https://github.com/a/b", [])).toBeNull();
        expect(leerVersion("https://huggingface.co/a/b", {})).toBeNull();
    });
});

describe("compararVersiones", () => {
    it("instalada «1.0.0» + remota sha → «desconocida», no alarma", () => {
        expect(compararVersiones("1.0.0", "a1b2c3d")).toBe("desconocida");
    });

    it("sha contra el mismo sha → «igual»", () => {
        expect(compararVersiones("a1b2c3d", "a1b2c3d")).toBe("igual");
        expect(compararVersiones("a1b2c3d4e5f6", "a1b2c3d")).toBe("igual");
    });

    it("sha contra otro sha → «hay-actualizacion»", () => {
        expect(compararVersiones("a1b2c3d", "f9e8d7c")).toBe("hay-actualizacion");
    });

    it("falta un dato → «desconocida»", () => {
        expect(compararVersiones(undefined, "a1b2c3d")).toBe("desconocida");
        expect(compararVersiones("a1b2c3d", null)).toBe("desconocida");
    });
});

describe("canal de etiquetas con patrón (RuView)", () => {
    const upstream = "https://github.com/ruvnet/RuView";
    const etiquetas = [
        { name: "v3263" },
        { name: "v3264" },
        { name: "ruview-harness-0.4.1" },
        { name: "ruview-harness-0.4.0" },
    ];

    it("con patrón consulta /tags?per_page=100", () => {
        expect(urlDeConsulta(upstream, "^ruview-harness-")).toBe(
            "https://api.github.com/repos/ruvnet/RuView/tags?per_page=100",
        );
        expect(urlDeEtiquetas(upstream)).toBe(
            "https://api.github.com/repos/ruvnet/RuView/tags?per_page=100",
        );
    });

    it("elige la primera etiqueta ruview-harness-* y se salta v3263", () => {
        expect(leerVersion(upstream, etiquetas, "^ruview-harness-")).toEqual({
            version: "ruview-harness-0.4.1",
            fecha: null,
        });
        expect(leerEtiqueta(etiquetas, "^ruview-harness-")).toEqual({
            version: "ruview-harness-0.4.1",
            fecha: null,
        });
    });

    it("sin coincidencias devuelve «sin versión», no inventa", () => {
        expect(leerVersion(upstream, etiquetas, "^no-existe-")).toBeNull();
        expect(leerEtiqueta([], "^ruview-harness-")).toBeNull();
        expect(leerEtiqueta([{ nombre: "ruview-harness-1" }], "^ruview-harness-")).toBeNull();
    });

    it("un patrón inválido no rompe: se ignora y se avisa", () => {
        const roto = validarPatronTag("[");
        expect(roto.regex).toBeNull();
        expect(roto.aviso).toContain("no es una expresión regular válida");
        expect(urlDeConsulta(upstream, "[")).toBe(
            "https://api.github.com/repos/ruvnet/RuView/commits?per_page=1",
        );
        expect(leerVersion(upstream, etiquetas, "[")).toBeNull();
    });

    it("un patrón de más de 80 caracteres se ignora con aviso", () => {
        const largo = "a".repeat(81);
        const validado = validarPatronTag(largo);
        expect(validado.regex).toBeNull();
        expect(validado.aviso).toContain("80 caracteres");
        expect(urlDeConsulta(upstream, largo)).toContain("/commits?per_page=1");
    });

    it("sin patrón todo sigue igual (commit e Hugging Face)", () => {
        const commits = [
            { sha: "a1b2c3d4e5f6", commit: { committer: { date: "2026-09-20T10:00:00Z" } } },
        ];
        expect(urlDeConsulta(upstream)).toContain("/commits?per_page=1");
        expect(leerVersion(upstream, commits)).toEqual({
            version: "a1b2c3d",
            fecha: "2026-09-20T10:00:00Z",
        });
        expect(validarPatronTag(undefined)).toEqual({
            patron: null,
            regex: null,
            aviso: null,
        });
    });
});
