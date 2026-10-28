import { describe, expect, it } from "vitest";
import { modelosDeCapas } from "../catalogo";
import type { RequisitosModelo } from "../tipos";

const SHA = "a".repeat(64);

/** Entrada del catálogo de capas en el formato de `config/capas-astraura.json`. */
function capa(extra: Record<string, unknown>): Record<string, unknown> {
    return {
        familia: "Justvugg/colibri",
        formato: "safetensors",
        runtime: "colibri",
        parametros: "30 B",
        sha256: SHA,
        fuente_oficial: "https://github.com/JustVugg/colibri",
        estado: "recomendado",
        medios: ["servidor"],
        ...extra,
    };
}

function porId(lista: RequisitosModelo[], id: string): RequisitosModelo {
    const m = lista.find((x) => x.id === id);
    if (!m) throw new Error(`Falta ${id}`);
    return m;
}

describe("modelosDeCapas · Colibri (dos entradas)", () => {
    const modelos = modelosDeCapas({
        capas: [
            capa({ id: "colibri-qwen3-coder-30b", capa: "razon", modelo: "Qwen3-Coder-30B-A3B (int4)", disco_mb: 19_400, ram_min_mb: 8192 }),
            capa({ id: "colibri-olmoe-7b", capa: "palabra", modelo: "OLMoE 7B (int8 tras convertir)", parametros: "7 B", disco_mb: 7000, ram_min_mb: 8192 }),
        ],
    });

    it("lee las dos entradas como runtime colibri del catálogo de capas", () => {
        expect(modelos).toHaveLength(2);
        expect(modelos.map((m) => m.runtime)).toEqual(["colibri", "colibri"]);
        expect(modelos.map((m) => m.origen)).toEqual(["capas", "capas"]);
    });

    it("razón: texto, razón y código, en int4 y para arm64 y x86_64", () => {
        const m = porId(modelos, "colibri-qwen3-coder-30b");
        expect(m.capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(m.bits).toBe(4);
        expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
        expect(m.almacenamiento).toEqual({ modo: "carga-completa", soloLocal: false });
    });

    it("palabra: solo texto, en int8", () => {
        const m = porId(modelos, "colibri-olmoe-7b");
        expect(m.capacidades).toEqual(["texto"]);
        expect(m.bits).toBe(8);
        expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
    });
});

describe("modelosDeCapas · Colibri por capa", () => {
    it("juicio decide; la profunda con visión entiende imágenes", () => {
        const modelos = modelosDeCapas({
            capas: [
                capa({ id: "colibri-laya", capa: "juicio", modelo: "Laya", parametros: "0.3 B", disco_mb: 870, ram_min_mb: 1740 }),
                capa({
                    id: "colibri-qwen38-flash-next",
                    capa: "profunda",
                    modelo: "Qwen3.8-Flash-Next (visión y herramientas)",
                    parametros: "125 B",
                    disco_mb: 186_000,
                    ram_min_mb: 24_576,
                    streaming_disco: true,
                }),
            ],
        });
        expect(porId(modelos, "colibri-laya").capacidades).toEqual(["decision"]);
        expect(porId(modelos, "colibri-qwen38-flash-next").capacidades).toEqual([
            "texto",
            "razon",
            "codigo",
            "vision",
        ]);
    });

    it("una profunda sin visión no inventa la capacidad", () => {
        const [m] = modelosDeCapas({
            capas: [capa({ id: "colibri-glm-5.2", capa: "profunda", modelo: "GLM-5.2 (744B)", disco_mb: 429_300 })],
        });
        expect(m.capacidades).toEqual(["texto", "razon", "codigo"]);
    });

    it("streaming_disco pide disco local rápido y no toda la RAM", () => {
        const [m] = modelosDeCapas({
            capas: [
                capa({
                    id: "colibri-deepseek-v4-flash-reap",
                    capa: "profunda",
                    modelo: "DeepSeek V4 Flash REAP 150B",
                    parametros: "150 B",
                    disco_mb: 84_700,
                    ram_min_mb: 16_384,
                    streaming_disco: true,
                }),
            ],
        });
        expect(m.almacenamiento).toEqual({ modo: "streaming-ssd", lecturaMinMBs: 800, soloLocal: true });
        expect(m.notas).toMatch(/no toda la RAM/);
    });

    it("sin SHA se queda en pruebas, como el resto de capas", () => {
        const [m] = modelosDeCapas({
            capas: [capa({ id: "colibri-nuevo", capa: "juicio", modelo: "Nuevo", sha256: "", disco_mb: 100 })],
        });
        expect(m.estado).toBe("en-pruebas");
    });
});
