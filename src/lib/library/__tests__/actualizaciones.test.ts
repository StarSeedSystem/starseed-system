// Pruebas del módulo puro de actualizaciones de la Biblioteca (JV12 · Ola 360).

import { describe, it, expect, vi } from "vitest";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
    buscarEtiquetaPorPatron,
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

describe("buscarEtiquetaPorPatron (canal de etiquetas con patrón de RuView)", () => {
    it("busca la primera etiqueta ruview-harness-… saltando v3263", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([
                { name: "v1.0.0", commit: { sha: "abc123def" } },
                { name: "v2.0.0", commit: { sha: "def456ghi" } },
                { name: "ruview-harness-v3264-test", commit: { sha: "ghi789jkl" } },
                { name: "ruview-harness-v3265-test", commit: { sha: "jkl012mno" } },
            ]),
        }));
        const resultado = await buscarEtiquetaPorPatron("https://github.com/ruvnet/RuView", "^ruview-harness-");
        expect(resultado).toEqual({ version: "ghi789j", nombre: "ruview-harness-v3264-test" });
    });

    it("patrón inválido no rompe (devuelve «sin versión»)", async () => {
        const resultado = await buscarEtiquetaPorPatron("https://github.com/ruvnet/RuView", "[");
        expect(resultado).toBe("sin versión");
    });

    it("sin patrón permanece igual (sin consulta)", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([
                { name: "v1.0.0", commit: { sha: "abc123def" } },
                { name: "v2.0.0", commit: { sha: "def456ghi" } },
            ]),
        }));
        const resultado = await buscarEtiquetaPorPatron("https://github.com/ruvnet/RuView", "");
        expect(resultado).toBe("sin versión");
    });

    it("sin coincidencias devuelve «sin versión»", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([
                { name: "v1.0.0", commit: { sha: "abc123def" } },
                { name: "v2.0.0", commit: { sha: "def456ghi" } },
            ]),
        }));
        const resultado = await buscarEtiquetaPorPatron("https://github.com/ruvnet/RuView", "^ruview-harness-");
        expect(resultado).toBe("sin versión");
    });
});
