/**
 * Colibri en las capas (CLB1027C): contrato `architecture/colibri-multicapas.md`.
 * Prueba `modelosDeCapas` (src/lib/recursos-ia/catalogo.ts) con runtime «colibri»: solo
 * funciones puras, sin disco, sin red — las entradas son literales, no el JSON real.
 */
import { describe, expect, it } from "vitest";
import { modelosDeCapas } from "../catalogo";

type Entrada = Record<string, unknown>;

const capasDe = (entradas: Entrada[] | unknown[]) => modelosDeCapas({ capas: entradas });

/** Entrada 1: capa «razón», int4, expertos leídos del disco (streaming_disco), GGUF. */
const CODER: Entrada = {
    id: "colibri-qwen-coder",
    capa: "razon",
    modelo: "Qwen3-Coder-30B-A3B (int4)",
    runtime: "colibri",
    formato: "gguf",
    tamano_bytes: 19_400_000_000,
    ram_min_mb: 8192,
    estado: "por-verificar",
    medios: ["servidor"],
    streaming_disco: true,
};

/** Entrada 2: capa «profunda» con visión en el nombre, int8, sin streaming. */
const CLEF: Entrada = {
    id: "colibri-clef",
    capa: "profunda",
    modelo: "Clef: Qwen3.8-27B int8 con visión",
    runtime: "colibri",
    tamano_bytes: 52_000_000_000,
    estado: "por-verificar",
    medios: ["servidor"],
};

/** Entrada 3: capa «juicio» (Laya) sin int8 en el nombre → int4. */
const LAYA: Entrada = {
    id: "colibri-laya",
    capa: "juicio",
    modelo: "Laya",
    runtime: "colibri",
    formato: "safetensors",
    tamano_bytes: 870_000_000,
    estado: "por-verificar",
    medios: ["servidor"],
};

/** Entrada 4: capa «palabra» (OLMoE) que sí declara int8. */
const OLMOE: Entrada = {
    id: "colibri-olmoe-7b",
    capa: "palabra",
    modelo: "OLMoE 7B (int8)",
    runtime: "colibri",
    formato: "safetensors",
    tamano_bytes: 7_168_000_000,
    estado: "por-verificar",
    medios: ["servidor"],
};

const colibri = capasDe([CODER, CLEF]);
const porId = (id: string) => colibri.find((m) => m.id === id);

describe("modelosDeCapas · runtime colibri", () => {
    it("ambas entradas salen con runtime, arquitecturas y origen de capas", () => {
        expect(colibri).toHaveLength(2);
        for (const m of colibri) {
            expect(m.runtime).toBe("colibri");
            expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
            expect(m.origen).toBe("capas");
            expect(m.almacenamiento.soloLocal).toBe(true);
            expect(m.estado).toBe("en-pruebas");
        }
    });

    it("razón → texto, razon y codigo; profunda añade visión solo si el modelo la dice", () => {
        expect(porId("colibri-qwen-coder")?.capacidades.sort()).toEqual(["codigo", "razon", "texto"]);
        expect(porId("colibri-clef")?.capacidades.sort()).toEqual(["codigo", "razon", "texto", "vision"]);
    });

    it("bits 4 (int4) u 8 (int8) según lo que dice el propio modelo, nunca del tamaño", () => {
        expect(porId("colibri-qwen-coder")?.bits).toBe(4);
        expect(porId("colibri-clef")?.bits).toBe(8);
    });

    it("streaming_disco → modo «streaming» con disco local rápido y nota; los demás no", () => {
        const coder = porId("colibri-qwen-coder");
        expect(coder?.almacenamiento.modo).toBe("streaming");
        expect(coder?.almacenamiento.lecturaMinMBs).toBe(500);
        expect(coder?.notas).toContain("Streaming de expertos desde disco");
        // La 2 no pide streaming: sin formato GGUF ni modo de streaming, carga completa.
        expect(porId("colibri-clef")?.almacenamiento.modo).toBe("carga-completa");
        expect(porId("colibri-clef")?.almacenamiento.lecturaMinMBs).toBeUndefined();
    });

    it("todas escuchan en el 4480 de Colibri (el 8000 es de Astraura 1.58)", () => {
        for (const m of colibri) {
            expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        }
    });

    it("tamaños desde el archivo real, redondeados por prudencia", () => {
        expect(porId("colibri-qwen-coder")?.disco).toEqual({ gb: 19.4, verificado: false });
        expect(porId("colibri-qwen-coder")?.ramMinGb).toBe(8);
        expect(porId("colibri-clef")?.disco).toEqual({ gb: 52, verificado: false });
    });

    it("ignora las entradas sin capa conocida o sin id", () => {
        expect(capasDe([{ id: "sin-capa", capa: "desconocida", runtime: "colibri", modelo: "X" }])).toHaveLength(0);
        expect(capasDe([{ capa: "razon", runtime: "colibri", modelo: "X" }])).toHaveLength(0);
    });

    it("juicio → decision y palabra → texto (los extremos de §2 del contrato)", () => {
        const [laya, olmoe] = capasDe([LAYA, OLMOE]);
        expect(laya?.capacidades).toEqual(["decision"]);
        expect(olmoe?.capacidades).toEqual(["texto"]);
        expect(laya?.bits).toBe(4);
        expect(olmoe?.bits).toBe(8);
        for (const m of [laya, olmoe]) {
            expect(m?.runtime).toBe("colibri");
            expect(m?.arquitecturas).toEqual(["arm64", "x86_64"]);
        }
    });

    it("medios y formato del JSON pasan al catálogo tal cual", () => {
        const [coder, laya] = capasDe([CODER, LAYA]);
        expect(coder?.medios).toEqual(["servidor"]);
        expect(laya?.medios).toEqual(["servidor"]);
        expect(coder?.formato).toBe("gguf");
        expect(laya?.formato).toBe("safetensors");
    });

    it("mantiene el orden de entrada y no duplica ids", () => {
        const ids = capasDe([CODER, CLEF, LAYA, OLMOE]).map((m) => m.id);
        expect(ids).toEqual(["colibri-qwen-coder", "colibri-clef", "colibri-laya", "colibri-olmoe-7b"]);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
