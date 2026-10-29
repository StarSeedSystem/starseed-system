// Pruebas del módulo puro de actualizaciones de la Biblioteca (JV12 · Ola 360).

import { describe, it, expect } from "vitest";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
    validarPatronTag,
    MAX_LONGITUD_PATRON_TAG,
} from "../actualizaciones";
import { FICHAS_REPOS_OS } from "../repos-os";

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

describe("validarPatronTag", () => {
    it("un patrón válido devuelve la regex lista y sin error", () => {
        const validado = validarPatronTag("^ruview-harness-");
        expect(validado.error).toBeNull();
        expect(validado.patron).toBeInstanceOf(RegExp);
        expect(validarPatronTag("v\\d+").error).toBeNull();
        expect(validarPatronTag("a").patron).toBeInstanceOf(RegExp);
    });

    it("un patrón con regex inválida se rechaza con el motivo", () => {
        for (const malo of ["[invalid", "(?"]) {
            const validado = validarPatronTag(malo);
            expect(validado.patron).toBeNull();
            expect(validado.error).toContain("expresión regular válida");
        }
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
    const upstream = "https://github.com/go-vikunja/vikunja";

    it("acepta el canal suelto y consulta /releases/latest", () => {
        expect(urlDeConsulta(upstream, "releases")).toBe(
            "https://api.github.com/repos/go-vikunja/vikunja/releases/latest",
        );
    });

    it("sigue aceptando el canal dentro del payload (retrocompatible)", () => {
        expect(urlDeConsulta(upstream, { canal: "releases" })).toBe(
            "https://api.github.com/repos/go-vikunja/vikunja/releases/latest",
        );
    });

    it("lee tag_name y published_at, con o sin payload", () => {
        const json = { tag_name: "v0.24.6", published_at: "2026-10-01T10:00:00Z" };
        expect(leerVersion(upstream, json, "releases")).toEqual({
            version: "v0.24.6",
            fecha: "2026-10-01T10:00:00Z",
        });
        expect(leerVersion(upstream, json, { canal: "releases" })).toEqual({
            version: "v0.24.6",
            fecha: "2026-10-01T10:00:00Z",
        });
    });

    it("un release sin published_at da fecha null", () => {
        expect(leerVersion(upstream, { tag_name: "v2.0.0" }, "releases")).toEqual({
            version: "v2.0.0",
            fecha: null,
        });
    });

    it("un release sin tag_name legible devuelve null (no se inventa)", () => {
        expect(leerVersion(upstream, {}, "releases")).toBeNull();
        expect(leerVersion(upstream, { tag_name: "" }, "releases")).toBeNull();
    });

    it("Hugging Face ignora el canal y sigue leyendo su ficha", () => {
        const hf = "https://huggingface.co/AlexWortega/openjev";
        const json = { sha: "f9e8d7c6b5a4", lastModified: "2026-09-01T00:00:00.000Z" };
        expect(urlDeConsulta(hf, "releases")).toBe("https://huggingface.co/api/models/AlexWortega/openjev");
        expect(leerVersion(hf, json, "releases")).toEqual({
            version: "f9e8d7c",
            fecha: "2026-09-01T00:00:00.000Z",
        });
    });
});

describe("canal de tags", () => {
    const upstream = "https://github.com/wechaty/wechaty";

    it("con el canal suelto consulta /tags?per_page=1", () => {
        expect(urlDeConsulta(upstream, "tags")).toBe(
            "https://api.github.com/repos/wechaty/wechaty/tags?per_page=1",
        );
    });

    it("lee el name del primer tag con fecha null", () => {
        expect(leerVersion(upstream, [{ name: "v1.2.3" }], "tags")).toEqual({
            version: "v1.2.3",
            fecha: null,
        });
    });

    it("una respuesta vacía o sin name devuelve null", () => {
        expect(leerVersion(upstream, [], "tags")).toBeNull();
        expect(leerVersion(upstream, [{ name: "" }], "tags")).toBeNull();
        expect(leerVersion(upstream, {}, "tags")).toBeNull();
    });
});

describe("compararVersiones con tags", () => {
    it("el mismo tag es «igual», con o sin «v» inicial", () => {
        expect(compararVersiones("1.0.0", "1.0.0")).toBe("igual");
        expect(compararVersiones("v1.0.0", "v1.0.0")).toBe("igual");
        expect(compararVersiones("v1.0.0", "1.0.0")).toBe("igual");
        expect(compararVersiones("1.0.0", "v1.0.0")).toBe("igual");
    });

    it("tags de versión distintos → «hay-actualizacion»", () => {
        expect(compararVersiones("1.0.0", "1.0.1")).toBe("hay-actualizacion");
        expect(compararVersiones("v1.0.0", "v2.0.0")).toBe("hay-actualizacion");
        expect(compararVersiones("ruview-harness-2026-10-19", "ruview-harness-2026-10-20")).toBe(
            "hay-actualizacion",
        );
    });

    it("mezcla de sha y tag, o textos sin versión → «desconocida»", () => {
        expect(compararVersiones("a1b2c3d", "v1.0.0")).toBe("desconocida");
        expect(compararVersiones("v1.0.0", "a1b2c3d")).toBe("desconocida");
        expect(compararVersiones("main", "dev")).toBe("desconocida");
    });
});

describe("versiones numéricas (BLD1025G)", () => {
    it("5.2.10 es mayor que 5.2.9: compara por tupla, no por texto", () => {
        expect(compararVersiones("5.2.9", "5.2.10")).toBe("hay-actualizacion");
        expect(compararVersiones("v5.2.9", "v5.2.10")).toBe("hay-actualizacion");
        expect(compararVersiones("5.2.10", "5.2.9")).toBe("igual");
    });

    it("normaliza «v», «LTS» y «release-» antes de comparar", () => {
        expect(compararVersiones("5.2.0 LTS", "v5.2.3")).toBe("hay-actualizacion");
        expect(compararVersiones("v5.2.3", "release-5.2.3")).toBe("igual");
        expect(compararVersiones("5.2.0 LTS", "5.2.0")).toBe("igual");
        expect(compararVersiones("v5.2.3", "5.2.3")).toBe("igual");
    });

    it("basura no lanza y no inventa una actualización", () => {
        expect(() => compararVersiones("basura", "v5.2.3")).not.toThrow();
        expect(compararVersiones("basura", "v5.2.3")).toBe("desconocida");
        expect(compararVersiones("v5.2.3", "basura")).toBe("desconocida");
    });
});

describe("etiqueta más alta con el patrón de la ficha repo-blender", () => {
    const blender = FICHAS_REPOS_OS.find((p) => p.id === "repo-blender")!;
    const upstream = String(blender.payload.upstream);
    const tags = [
        { name: "v5.2.9" },
        { name: "v5.2.10" },
        { name: "v5.1.0" },
        { name: "v6.0.0-alpha" },
    ];

    it("pide cien etiquetas y elige v5.2.10 entre las que casan", () => {
        expect(urlDeConsulta(upstream, blender.payload)).toBe(
            "https://api.github.com/repos/blender/blender/tags?per_page=100",
        );
        expect(leerVersion(upstream, tags, blender.payload)).toEqual({
            version: "v5.2.10",
            fecha: null,
        });
    });

    it("la ficha 5.2.3 ve la 5.2.10 como actualización", () => {
        const remota = leerVersion(upstream, tags, blender.payload);
        expect(remota).not.toBeNull();
        expect(compararVersiones(blender.version, remota!.version)).toBe("hay-actualizacion");
    });
});
