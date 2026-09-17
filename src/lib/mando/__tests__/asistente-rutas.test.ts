import { describe, expect, it } from "vitest";

import { informeVigente, ordenarCandidatos, type InformePasarela } from "@/lib/mando/asistente-rutas";

describe("informeVigente", () => {
    it("devuelve false si no hay informe o no tiene t", () => {
        expect(informeVigente(null, Date.now())).toBe(false);
        expect(informeVigente({}, Date.now())).toBe(false);
        expect(informeVigente({ pasarelas: [] }, Date.now())).toBe(false);
    });

    it("devuelve false si t es inválido", () => {
        expect(informeVigente({ t: "no-es-fecha" }, Date.now())).toBe(false);
    });

    it("devuelve false si el informe es viejo (> maxMinutos)", () => {
        const ahora = Date.now();
        const viejo = new Date(ahora - 31 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
        expect(informeVigente({ t: viejo }, ahora)).toBe(false);
    });

    it("devuelve true si está dentro de la ventana", () => {
        const ahora = Date.now();
        const fresco = new Date(ahora - 5 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
        expect(informeVigente({ t: fresco }, ahora, 30)).toBe(true);
    });
});

describe("ordenarCandidatos", () => {
    const ahora = Date.now();
    const informeFresco: InformePasarela = {
        t: new Date(ahora - 60_000).toISOString().replace("T", " ").slice(0, 19),
        pasarelas: [
            { clave: "aihubmix", estado: "sin_cupo" },
            { clave: "tokenrouter", estado: "sin_canal" },
            { clave: "openrouter", estado: "sin_cupo" },
            { clave: "nim", estado: "caida" },
            { clave: "groq", estado: "escribe" },
            { clave: "neurona", estado: "escribe" },
        ],
    };

    const candidatos = [
        { id: "nim/moonshotai/kimi-k3", proveedor: "nim" },
        { id: "aihubmix/coding-glm-5.3-free", proveedor: "aihubmix" },
        { id: "tokenrouter/z-ai/glm-5.3-free", proveedor: "tokenrouter" },
        { id: "openrouter/nvidia/nemotron-3-super-120b-a12b:free", proveedor: "openrouter" },
        { id: "groq/openai/gpt-oss-20b", proveedor: "groq" },
        { id: "ollama/qwen2.5:0.5b", proveedor: "neurona" },
    ];

    it("pone primero las que escriben según el informe (caso real 4 muertas + 2 vivas)", () => {
        const orden = ordenarCandidatos(candidatos, informeFresco, ahora).map((c) => c.id);
        expect(orden[0]).toBe("groq/openai/gpt-oss-20b");
        expect(orden[1]).toBe("ollama/qwen2.5:0.5b");
        // las muertas se excluyen (no aparecen)
        expect(orden).not.toContain("nim/moonshotai/kimi-k3");
    });

    it("excluye sin_cupo, sin_canal, caida, modelo_fuera", () => {
        const orden = ordenarCandidatos(candidatos, informeFresco, ahora).map((c) => c.id);
        expect(orden).not.toContain("aihubmix/coding-glm-5.3-free");
        expect(orden).not.toContain("tokenrouter/z-ai/glm-5.3-free");
        expect(orden).not.toContain("openrouter/nvidia/nemotron-3-super-120b-a12b:free");
        expect(orden).not.toContain("nim/moonshotai/kimi-k3");
    });

    it("si el informe está viejo, devuelve la lista original (sin filtrar)", () => {
        const viejo = { t: new Date(ahora - 40 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19), pasarelas: [{ clave: "groq", estado: "escribe" }] };
        const orden = ordenarCandidatos(candidatos, viejo, ahora);
        expect(orden).toEqual(candidatos);
    });

    it("si tras filtrar queda vacío, devuelve la original", () => {
        const informeMalo: InformePasarela = {
            t: new Date(ahora - 60_000).toISOString().replace("T", " ").slice(0, 19),
            pasarelas: candidatos.map((c) => ({ clave: c.proveedor, estado: "caida" })),
        };
        const orden = ordenarCandidatos(candidatos, informeMalo, ahora);
        expect(orden).toEqual(candidatos);
    });

    it("desconocidos van después de las que escriben", () => {
        const inf: InformePasarela = { t: new Date(ahora - 30_000).toISOString().replace("T", " ").slice(0, 19), pasarelas: [{ clave: "groq", estado: "escribe" }] };
        const ord = ordenarCandidatos(candidatos, inf, ahora).map((c) => c.id);
        expect(ord[0]).toBe("groq/openai/gpt-oss-20b");
        expect(ord).toContain("ollama/qwen2.5:0.5b");
    });
});
