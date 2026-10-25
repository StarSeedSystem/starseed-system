// Pruebas del módulo puro de actualizaciones de la Biblioteca (JV12 · Ola 360).

import { describe, it, expect } from "vitest";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
    validarPatronTag,
    MAX_LONGITUD_PATRON_TAG,
} from "../actualizaciones";

const GITHUB = "https://github.com/razorback16/openjev";
const HF = "https://huggingface.co/AlexWortega/openjev";
const HF_ENLACE = "https://huggingface.co/api/models/AlexWortega/openjev";

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

    it("un release sin published_at da fecha null y uno raro devuelve null", () => {
        expect(
            leerVersion(GITHUB, { tag_name: "v2.0.0" }, { canal: "releases" }),
        ).toEqual({ version: "v2.0.0", fecha: null });
        expect(leerVersion(GITHUB, {}, { canal: "releases" })).toBeNull();
    });
});

describe("canal directo (RLB1020Bd)", () => {
    it("urlDeConsulta acepta el canal como cadena: releases y tags", () => {
        expect(urlDeConsulta(GITHUB, "releases")).toBe(
            "https://api.github.com/repos/razorback16/openjev/releases/latest",
        );
        expect(urlDeConsulta(GITHUB, "tags")).toBe(
            "https://api.github.com/repos/razorback16/openjev/tags?per_page=1",
        );
        expect(urlDeConsulta(GITHUB, "commits")).toBe(
            "https://api.github.com/repos/razorback16/openjev/commits?per_page=1",
        );
    });

    it("Hugging Face ignora el canal directo", () => {
        expect(urlDeConsulta(HF, "releases")).toBe(HF_ENLACE);
        expect(urlDeConsulta(HF, "tags")).toBe(HF_ENLACE);
    });

    it("leerVersion acepta el canal como cadena: releases", () => {
        expect(
            leerVersion(GITHUB, { tag_name: "v1.2.3", published_at: "2026-09-20T10:00:00Z" }, "releases"),
        ).toEqual({ version: "v1.2.3", fecha: "2026-09-20T10:00:00Z" });
        expect(leerVersion(GITHUB, [], "releases")).toBeNull();
    });

    it("leerVersion acepta el canal como cadena: tags", () => {
        expect(leerVersion(GITHUB, [{ name: "v1.2.3" }], "tags")).toEqual({
            version: "v1.2.3",
            fecha: null,
        });
        expect(leerVersion(GITHUB, [{ name: "" }], "tags")).toBeNull();
        expect(leerVersion(GITHUB, [], "tags")).toBeNull();
    });

    it("sin canal se sigue igual que hoy: commits por defecto", () => {
        expect(urlDeConsulta(GITHUB)).toBe(
            "https://api.github.com/repos/razorback16/openjev/commits?per_page=1",
        );
        expect(urlDeConsulta(GITHUB, undefined)).toBe(
            "https://api.github.com/repos/razorback16/openjev/commits?per_page=1",
        );
    });
});

/* ─────────────────────── compararVersiones (RLB1020Bd) ─────────────────────── */

describe("compararVersiones con etiquetas", () => {
    it("tag contra el mismo tag (con o sin «v») → «igual»", () => {
        expect(compararVersiones("v1.0.0", "v1.0.0")).toBe("igual");
        expect(compararVersiones("v1.0.0", "1.0.0")).toBe("igual");
        expect(compararVersiones("1.0.0", "v1.0.0")).toBe("igual");
    });

    it("tag distinto → «hay-actualizacion»", () => {
        expect(compararVersiones("1.0.0", "1.0.1")).toBe("hay-actualizacion");
        expect(compararVersiones("v1.0.0", "v1.0.1")).toBe("hay-actualizacion");
        expect(compararVersiones("1.0.0", "v2.0.0")).toBe("hay-actualizacion");
    });

    it("mezcla de sha y tag → «desconocida», como siempre", () => {
        expect(compararVersiones("a1b2c3d", "v1.0.0")).toBe("desconocida");
        expect(compararVersiones("1.0.0", "a1b2c3d")).toBe("desconocida");
    });

    it("cadenas que no son ni shas ni tags → «desconocida»", () => {
        expect(compararVersiones("no es un tag", "otra cosa")).toBe("desconocida");
        expect(compararVersiones("v-owner/tag", "v1.0.0")).toBe("desconocida");
    });
});
