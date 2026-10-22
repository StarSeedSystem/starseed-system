// Pruebas del módulo puro de actualizaciones de la Biblioteca (JV12 · Ola 360).

import { describe, it, expect } from "vitest";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
} from "../actualizaciones";

describe("urlDeConsulta", () => {
    it("una URL de GitHub da la consulta de commits (canal por defecto)", () => {
        expect(urlDeConsulta("https://github.com/razorback16/openjev")).toBe(
            "https://api.github.com/repos/razorback16/openjev/commits?per_page=1",
        );
    });

    it("una URL de GitHub con canal «releases» da la consulta del último release", () => {
        expect(urlDeConsulta("https://github.com/razorback16/openjev", "releases")).toBe(
            "https://api.github.com/repos/razorback16/openjev/releases/latest",
        );
    });

    it("una URL de GitHub con canal «tags» da la consulta del último tag", () => {
        expect(urlDeConsulta("https://github.com/razorback16/openjev", "tags")).toBe(
            "https://api.github.com/repos/razorback16/openjev/tags?per_page=1",
        );
    });

    it("una URL de Hugging Face da la consulta del modelo (canal ignorado)", () => {
        expect(urlDeConsulta("https://huggingface.co/AlexWortega/openjev")).toBe(
            "https://huggingface.co/api/models/AlexWortega/openjev",
        );
        expect(urlDeConsulta("https://huggingface.co/AlexWortega/openjev", "releases")).toBe(
            "https://huggingface.co/api/models/AlexWortega/openjev",
        );
        expect(urlDeConsulta("https://huggingface.co/AlexWortega/openjev", "tags")).toBe(
            "https://huggingface.co/api/models/AlexWortega/openjev",
        );
    });

    it("una URL rara devuelve null", () => {
        expect(urlDeConsulta("https://gitlab.com/algo/raro")).toBeNull();
        expect(urlDeConsulta("no-es-url")).toBeNull();
    });
});

describe("leerVersion", () => {
    it("lee sha corto y fecha del último commit de GitHub (canal por defecto)", () => {
        const json = [
            { sha: "a1b2c3d4e5f6", commit: { committer: { date: "2026-09-20T10:00:00Z" } } },
        ];
        expect(leerVersion("https://github.com/razorback16/openjev", json)).toEqual({
            version: "a1b2c3d",
            fecha: "2026-09-20T10:00:00Z",
        });
    });

    it("lee tag_name y published_at de GitHub releases", () => {
        const json = { tag_name: "v1.2.3", published_at: "2026-09-20T10:00:00Z" };
        expect(leerVersion("https://github.com/razorback16/openjev", json, "releases")).toEqual({
            version: "v1.2.3",
            fecha: "2026-09-20T10:00:00Z",
        });
    });

    it("un release sin published_at da fecha null", () => {
        const json = { tag_name: "v2.0.0" };
        expect(leerVersion("https://github.com/razorback16/openjev", json, "releases")).toEqual({
            version: "v2.0.0",
            fecha: null,
        });
    });

    it("lee el name del primer tag de GitHub tags", () => {
        const json = [{ name: "v1.2.3" }];
        expect(leerVersion("https://github.com/razorback16/openjev", json, "tags")).toEqual({
            version: "v1.2.3",
            fecha: null,
        });
    });

    it("lee sha y lastModified de un modelo de Hugging Face (canal ignorado)", () => {
        const json = { sha: "f9e8d7c6b5a4", lastModified: "2026-09-01T00:00:00.000Z" };
        expect(leerVersion("https://huggingface.co/AlexWortega/openjev", json)).toEqual({
            version: "f9e8d7c",
            fecha: "2026-09-01T00:00:00.000Z",
        });
        expect(leerVersion("https://huggingface.co/AlexWortega/openjev", json, "releases")).toEqual({
            version: "f9e8d7c",
            fecha: "2026-09-01T00:00:00.000Z",
        });
    });

    it("una respuesta vacía o rara devuelve null", () => {
        expect(leerVersion("https://github.com/a/b", [])).toBeNull();
        expect(leerVersion("https://huggingface.co/a/b", {})).toBeNull();
        expect(leerVersion("https://github.com/a/b", {}, "releases")).toBeNull();
        expect(leerVersion("https://github.com/a/b", [], "tags")).toBeNull();
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

    it("tag contra el mismo tag (sin v) → «igual»", () => {
        expect(compararVersiones("1.0.0", "1.0.0")).toBe("igual");
    });

    it("tag contra el mismo tag (con v) → «igual»", () => {
        expect(compararVersiones("v1.0.0", "v1.0.0")).toBe("igual");
        expect(compararVersiones("v1.0.0", "1.0.0")).toBe("igual");
        expect(compararVersiones("1.0.0", "v1.0.0")).toBe("igual");
    });

    it("tag distinto → «hay-actualizacion»", () => {
        expect(compararVersiones("1.0.0", "1.0.1")).toBe("hay-actualizacion");
        expect(compararVersiones("v1.0.0", "v1.0.1")).toBe("hay-actualizacion");
        expect(compararVersiones("1.0.0", "v2.0.0")).toBe("hay-actualizacion");
    });

    it("mezcla SHA y tag → «desconocida»", () => {
        expect(compararVersiones("a1b2c3d", "v1.0.0")).toBe("desconocida");
        expect(compararVersiones("1.0.0", "a1b2c3d")).toBe("desconocida");
    });

    it("falta un dato → «desconocida»", () => {
        expect(compararVersiones(undefined, "a1b2c3d")).toBe("desconocida");
        expect(compararVersiones("a1b2c3d", null)).toBe("desconocida");
        expect(compararVersiones(undefined, "1.0.0")).toBe("desconocida");
        expect(compararVersiones("1.0.0", null)).toBe("desconocida");
    });
});
