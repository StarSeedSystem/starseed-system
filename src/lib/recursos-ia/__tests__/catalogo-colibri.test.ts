import { describe, expect, it } from "vitest";
import { catalogoRecursos, modeloPorId, modelosDeCapas } from "../catalogo";
import catalogoCrudo from "../../../../config/capas-astraura.json";
import type { RequisitosModelo } from "../tipos";

/**
 * Colibri en el catálogo de recursos de IA (CLB1027C). Las 9 entradas entran en
 * `config/capas-astraura.json` con `runtime: "colibri"` y aquí se comprueba cómo las convierte
 * `modelosDeCapas`: capacidades por capa, 4 bits (int4) u 8 (int8) según el modelo, arm64/x86_64,
 * streaming de expertos desde disco y servidor en 4480.
 */
const IDS_COLIBRI = [
    "colibri-laya", "colibri-gliner-decide", "colibri-clef",
    "colibri-olmoe-7b", "colibri-qwen3-coder-30b", "colibri-qwen36-35b",
    "colibri-deepseek-v4-flash-reap", "colibri-qwen38-flash-next",
    "colibri-glm-5.2",
];

const modo = (m: RequisitosModelo): string => m.almacenamiento.modo;

describe("modelosDeCapas · runtime «colibri»", () => {
    const colibri = modelosDeCapas(catalogoCrudo).filter((m) => m.runtime === "colibri");

    it("las 9 entradas entran al catálogo: en pruebas, safetensors, arm64+amd64 y servidor en 4480", () => {
        expect(colibri.map((m) => m.id).sort()).toEqual([...IDS_COLIBRI].sort());
        expect(colibri.every((m) => m.estado === "en-pruebas" && m.origen === "capas")).toBe(true);
        for (const m of colibri) {
            expect(m.formato).toBe("safetensors");
            expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
            expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
            expect(m.almacenamiento.soloLocal).toBe(true);
        }
    });

    it("capacidades por capa: juicio decide, palabra habla y razón/profunda piensan con código", () => {
        const por = (id: string) => colibri.find((m) => m.id === id)!;
        for (const id of ["colibri-laya", "colibri-gliner-decide", "colibri-clef"]) expect(por(id).capacidades).toEqual(["decision"]);
        expect(por("colibri-olmoe-7b").capacidades).toEqual(["texto"]);
        for (const id of IDS_COLIBRI.slice(4, 7).concat("colibri-glm-5.2")) expect(por(id).capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(por("colibri-qwen38-flash-next").capacidades).toEqual(["texto", "razon", "codigo", "vision"]);
    });

    it("bits 4 (int4) u 8 (int8) según el propio modelo", () => {
        const por = (id: string) => colibri.find((m) => m.id === id)!;
        expect(por("colibri-laya").bits).toBe(4);
        expect(por("colibri-qwen3-coder-30b").bits).toBe(4);
        expect(por("colibri-qwen36-35b").bits).toBe(4);
        expect(por("colibri-olmoe-7b").bits).toBe(8); // «OLMoE 7B (int8 tras convertir)»
    });

    it("streaming_disco → modo «streaming»: disco rápido, no toda la RAM", () => {
        const conStreaming = colibri.filter((m) => modo(m) === "streaming").map((m) => m.id).sort();
        expect(conStreaming).toEqual(["colibri-deepseek-v4-flash-reap", "colibri-glm-5.2", "colibri-qwen38-flash-next"]);
        const reap = colibri.find((m) => m.id === "colibri-deepseek-v4-flash-reap")!;
        expect(reap.almacenamiento.lecturaMinMBs).toBe(500);
        expect(reap.notas).toMatch(/disco local rápido/);
        // El resto va en carga completa dentro de la misma neurona.
        const laya = colibri.find((m) => m.id === "colibri-laya")!;
        expect(modo(laya)).toBe("carga-completa");
        expect(laya.ramMinGb).toBe(1.7); // 1740 MB → 1,7 GB de RAM total mínima
        expect(laya.disco.gb).toBe(0.87); // 870 MB
    });
});

describe("modelosDeCapas · dos entradas de prueba", () => {
    const [juez, profunda] = modelosDeCapas({
        capas: [
            {
                id: "colibri-prueba-juicio", capa: "juicio", modelo: "Juez de mentira (int8)", runtime: "colibri",
                formato: "safetensors", disco_mb: 490, ram_min_mb: 1740, sha256: "por-verificar",
                estado: "por-verificar", medios: ["nativo", "servidor"],
            },
            {
                id: "colibri-prueba-profunda", capa: "profunda", modelo: "MoE de mentira (visión, int4)",
                runtime: "colibri", formato: "safetensors", disco_mb: 900000, ram_min_mb: 16384,
                streaming_disco: true, sha256: "por-verificar", estado: "por-verificar", medios: ["servidor"],
            },
        ],
    });

    it("juicio con int8: decisión, 8 bits, en pruebas y sin streaming", () => {
        expect(juez.capacidades).toEqual(["decision"]);
        expect(juez.bits).toBe(8);
        expect(juez.ramMinGb).toBe(1.7);
        expect(juez.disco).toEqual({ gb: 0.49, verificado: false });
        expect(modo(juez)).toBe("carga-completa");
        expect(juez.estado).toBe("en-pruebas");
    });

    it("profunda con visión e int4: streaming, lectura mínima y ambas arquitecturas", () => {
        expect(profunda.capacidades).toEqual(["texto", "razon", "codigo", "vision"]);
        expect(profunda.bits).toBe(4);
        expect(modo(profunda)).toBe("streaming");
        expect(profunda.almacenamiento.lecturaMinMBs).toBe(500);
        expect(profunda.arquitecturas).toEqual(["arm64", "x86_64"]);
    });
});

describe("catálogo completo · Colibri", () => {
    const cat = catalogoRecursos();

    it("los Colibri entran al catálogo unificado, sin duplicados", () => {
        const ids = cat.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of IDS_COLIBRI) expect(modeloPorId(id, cat)).toBeDefined();
    });

    it("dos entradas completas: Laya (juicio) y Qwen3-Coder (razón)", () => {
        const laya = modeloPorId("colibri-laya", cat)!;
        const coder = modeloPorId("colibri-qwen3-coder-30b", cat)!;
        expect(laya.capacidades).toEqual(["decision"]);
        expect(laya.bits).toBe(4);
        expect(laya.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        expect(coder.capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(coder.ramMinGb).toBe(8);
        expect(coder.disco.gb).toBe(19.87);
        expect(coder.upstream).toBe("https://huggingface.co/Justvugg/Qwen3-Coder-30B-A3B-colibri-int4");
    });
});
