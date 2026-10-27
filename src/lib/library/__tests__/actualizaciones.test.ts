// Pruebas del módulo puro de actualizaciones de la Biblioteca (JV12 · Ola 360).

import { describe, it, expect } from "vitest";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
    validarPatronTag,
    MAX_LONGITUD_PATRON_TAG,
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

describe("canal de etiquetas con patrón", () => {
    const URL_RUVIEW = "https://github.com/ruvnet/RuView";

    it("con patronTag consulta /tags?per_page=100", () => {
        expect(urlDeConsulta(URL_RUVIEW, { patronTag: "^ruview-harness-" })).toBe(
            "https://api.github.com/repos/ruvnet/RuView/tags?per_page=100",
        );
    });

    it("elige la primera etiqueta que case y se salta la release numérica", () => {
        const tags = [
            { name: "v3263" },
            { name: "ruview-harness-2026-10-20" },
            { name: "ruview-harness-2026-10-19" },
        ];
        expect(leerVersion(URL_RUVIEW, tags, { patronTag: "^ruview-harness-" })).toEqual({
            version: "ruview-harness-2026-10-20",
            fecha: null,
        });
    });

    it("sin ninguna etiqueta coincidente no inventa versión: null", () => {
        const tags = [{ name: "v3263" }, { name: "v3264" }];
        expect(leerVersion(URL_RUVIEW, tags, { patronTag: "^ruview-harness-" })).toBeNull();
    });

    it("el canal tags sin patrón toma la primera etiqueta", () => {
        expect(
            leerVersion(URL_RUVIEW, [{ name: "ruview-harness-2026-10-20" }], { canal: "tags" }),
        ).toEqual({ version: "ruview-harness-2026-10-20", fecha: null });
    });

    it("un patrón inválido no rompe y se ignora (vuelve a commits)", () => {
        expect(() => urlDeConsulta(URL_RUVIEW, { patronTag: "[" })).not.toThrow();
        expect(urlDeConsulta(URL_RUVIEW, { patronTag: "[" })).toBe(
            "https://api.github.com/repos/ruvnet/RuView/commits?per_page=1",
        );
        const commits = [{ sha: "a1b2c3d4e5f6", commit: { committer: { date: "2026-09-20" } } }];
        expect(leerVersion(URL_RUVIEW, commits, { patronTag: "[" })).toEqual({
            version: "a1b2c3d",
            fecha: "2026-09-20",
        });
    });

    it("un patrón demasiado largo se ignora y explica el motivo", () => {
        const largo = "a".repeat(MAX_LONGITUD_PATRON_TAG + 1);
        const validado = validarPatronTag(largo);
        expect(validado.patron).toBeNull();
        expect(typeof validado.error).toBe("string");
        expect(urlDeConsulta(URL_RUVIEW, { patronTag: largo })).toBe(
            "https://api.github.com/repos/ruvnet/RuView/commits?per_page=1",
        );
    });

    it("sin patrón todo sigue igual: commits y Hugging Face", () => {
        expect(urlDeConsulta(URL_RUVIEW)).toBe(
            "https://api.github.com/repos/ruvnet/RuView/commits?per_page=1",
        );
        expect(urlDeConsulta("https://huggingface.co/AlexWortega/openjev")).toBe(
            "https://huggingface.co/api/models/AlexWortega/openjev",
        );
    });
});

describe("canal de releases", () => {
    it("consulta /releases/latest y lee tag_name", () => {
        const upstream = "https://github.com/go-vikunja/vikunja";
        expect(urlDeConsulta(upstream, { canal: "releases" })).toBe(
            "https://api.github.com/repos/go-vikunja/vikunja/releases/latest",
        );
        expect(
            leerVersion(
                upstream,
                { tag_name: "v0.24.6", published_at: "2026-10-01T10:00:00Z" },
                { canal: "releases" },
            ),
        ).toEqual({ version: "v0.24.6", fecha: "2026-10-01T10:00:00Z" });
    });

    it("acepta el canal como texto suelto y una release sin fecha", () => {
        const upstream = "https://github.com/go-vikunja/vikunja";
        expect(urlDeConsulta(upstream, "releases")).toBe(
            "https://api.github.com/repos/go-vikunja/vikunja/releases/latest",
        );
        expect(leerVersion(upstream, { tag_name: "v1.0.0" }, "releases")).toEqual({
            version: "v1.0.0",
            fecha: null,
        });
        expect(leerVersion(upstream, { sin_tag: true }, "releases")).toBeNull();
    });
});

describe("canal de tags", () => {
    const upstream = "https://github.com/wechaty/wechaty";

    it("consulta /tags y lee el name del primero", () => {
        expect(urlDeConsulta(upstream, { canal: "tags" })).toBe(
            "https://api.github.com/repos/wechaty/wechaty/tags?per_page=100",
        );
        expect(leerVersion(upstream, [{ name: "v1.20.0" }], { canal: "tags" })).toEqual({
            version: "v1.20.0",
            fecha: null,
        });
    });

    it("acepta el canal como texto suelto y no inventa versión sin tag", () => {
        expect(urlDeConsulta(upstream, "tags")).toBe(
            "https://api.github.com/repos/wechaty/wechaty/tags?per_page=100",
        );
        expect(leerVersion(upstream, [], "tags")).toBeNull();
        expect(leerVersion(upstream, [{ nombre: "v1" }], "tags")).toBeNull();
    });
});

describe("compararVersiones con tags", () => {
    it("el mismo tag, con o sin «v», es «igual»", () => {
        expect(compararVersiones("1.0.0", "1.0.0")).toBe("igual");
        expect(compararVersiones("v1.0.0", "1.0.0")).toBe("igual");
        expect(compararVersiones("1.0.0", "V1.0.0")).toBe("igual");
    });

    it("dos tags distintos son «hay-actualizacion»", () => {
        expect(compararVersiones("v1.0.0", "v1.0.1")).toBe("hay-actualizacion");
        expect(compararVersiones("1.0.0", "v2.0.0")).toBe("hay-actualizacion");
    });

    it("un tag y un sha, o un texto vacío, son «desconocida»", () => {
        expect(compararVersiones("v1.0.0", "a1b2c3d")).toBe("desconocida");
        expect(compararVersiones("a1b2c3d", "v1.0.0")).toBe("desconocida");
        expect(compararVersiones("   ", "v1.0.0")).toBe("desconocida");
    });
});
