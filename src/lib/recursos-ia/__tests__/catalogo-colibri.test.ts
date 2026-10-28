/**
 * Contrato de Colibri en el catálogo de Recursos de IA (`architecture/colibri-multicapas.md` §2):
 * las 9 capas de Colibri viven en `config/capas-astraura.json` y entran por `modelosDeCapas` con
 * runtime «colibri» (datos CLB1027B: sin SHA medido todavía, todo «por-verificar»). Rescate de las
 * ramas de la nube (BLD1025C-d3), adaptado a la API de hoy.
 */
import { describe, expect, it } from "vitest";
import capasJson from "../../../../config/capas-astraura.json";
import { catalogoRecursos, modelosDeCapas } from "../catalogo";
import type { RequisitosModelo } from "../tipos";

const colibri = modelosDeCapas(capasJson).filter((m) => m.id.startsWith("colibri-"));
const por = (id: string): RequisitosModelo => {
    const m = colibri.find((x) => x.id === id);
    expect(m, id).toBeDefined();
    return m!;
};

describe("catálogo de recursos de IA · Colibri", () => {
    it("mapea las 9 entradas de Colibri, sin duplicados y todas de capas", () => {
        expect(colibri.map((m) => m.id).sort()).toEqual(
            [
                "colibri-laya", "colibri-gliner-decide", "colibri-clef", "colibri-olmoe-7b",
                "colibri-qwen3-coder-30b", "colibri-qwen36-35b", "colibri-deepseek-v4-flash-reap",
                "colibri-qwen38-flash-next", "colibri-glm-5.2",
            ].sort(),
        );
        expect(new Set(colibri.map((m) => m.id)).size).toBe(colibri.length);
        expect(colibri.every((m) => m.runtime === "colibri" && m.origen === "capas")).toBe(true);
    });

    it("compila para arm64 y x86_64 y los pesos quedan en la neurona (soloLocal)", () => {
        for (const m of colibri) {
            expect((m.arquitecturas ?? []).join(","), m.id).toBe("arm64,x86_64");
            expect(m.almacenamiento.soloLocal, m.id).toBe(true);
        }
    });

    it("capacidades por capa: juicio decide, palabra habla, razon y profunda piensan y escriben código", () => {
        expect(por("colibri-laya").capacidades as string[]).toEqual(["decision"]);
        expect(por("colibri-gliner-decide").capacidades as string[]).toEqual(["decision"]);
        expect(por("colibri-clef").capacidades as string[]).toEqual(["decision"]);
        expect(por("colibri-olmoe-7b").capacidades as string[]).toEqual(["texto"]);
        for (const id of ["colibri-qwen3-coder-30b", "colibri-qwen36-35b", "colibri-glm-5.2"]) {
            expect(por(id).capacidades as string[]).toEqual(["texto", "razon", "codigo"]);
        }
        // La profunda añade visión solo si el modelo la declara (Qwen3.8-Flash-Next declara «visión»).
        expect(por("colibri-qwen38-flash-next").capacidades as string[]).toEqual(["texto", "razon", "codigo", "vision"]);
    });

    it("bits: int4 es 4 y int8 es 8, leído del propio modelo y nunca del archivo", () => {
        for (const m of colibri) expect([4, 8]).toContain(m.bits);
        expect(por("colibri-laya").bits).toBe(4);
        expect(por("colibri-qwen3-coder-30b").bits).toBe(4);
        // «OLMoE 7B (int8 tras convertir)»: el modelo mismo dice int8; su archivo no manda.
        expect(por("colibri-olmoe-7b").bits).toBe(8);
    });

    it("streaming_disco pasa a modo «streaming» con lectura mínima de disco; el resto carga entero", () => {
        const enDisco = colibri.filter((m) => (m.almacenamiento.modo as string) === "streaming");
        expect(enDisco.map((m) => m.id).sort()).toEqual(
            ["colibri-deepseek-v4-flash-reap", "colibri-glm-5.2", "colibri-qwen38-flash-next"].sort(),
        );
        for (const m of enDisco) expect(m.almacenamiento.lecturaMinMBs, m.id).toBe(500);
        for (const m of colibri) {
            if ((m.almacenamiento.modo as string) !== "streaming") expect(m.almacenamiento.modo, m.id).toBe("carga-completa");
        }
    });

    it("todos tienen un servidor OpenAI-compatible en el puerto 4480 (el 8000 es de Astraura 1.58)", () => {
        for (const m of colibri) expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
    });

    it("sin SHA medido: «por-verificar» sale en pruebas y los tamaños salen de la config", () => {
        expect(colibri.every((m) => m.estado === "en-pruebas")).toBe(true);
        expect(por("colibri-laya").disco).toEqual({ gb: 0.87, verificado: false });
        expect(por("colibri-laya").ramMinGb).toBe(1.7);
        expect(por("colibri-qwen3-coder-30b").disco).toEqual({ gb: 19.87, verificado: false });
        expect(por("colibri-qwen3-coder-30b").ramMinGb).toBe(8);
        expect(por("colibri-glm-5.2").disco.gb).toBe(439.61);
        expect(por("colibri-glm-5.2").ramMinGb).toBe(16);
    });

    it("medios tal como los declara la config", () => {
        expect(por("colibri-laya").medios).toEqual(["nativo", "servidor"]);
        expect(por("colibri-gliner-decide").medios).toEqual(["nativo", "servidor"]);
        for (const id of ["colibri-clef", "colibri-olmoe-7b", "colibri-qwen3-coder-30b", "colibri-qwen38-flash-next"]) {
            expect(por(id).medios).toEqual(["servidor"]);
        }
    });

    it("dos entradas de ejemplo: Laya (juicio) y Qwen3-Coder (razón); retirada y desconocida, fuera", () => {
        const [laya, coder] = modelosDeCapas({
            capas: [
                { id: "colibri-laya", capa: "juicio", modelo: "Laya (Convai Innovations)", runtime: "colibri", formato: "safetensors", disco_mb: 870, ram_min_mb: 1740, estado: "por-verificar", medios: ["nativo", "servidor"] },
                { id: "colibri-qwen3-coder-30b", capa: "razon", modelo: "Qwen3-Coder-30B-A3B (int4)", runtime: "colibri", disco_mb: 19865, ram_min_mb: 8192, estado: "por-verificar", medios: ["servidor"] },
            ],
        });
        expect(laya!.id).toBe("colibri-laya");
        expect(laya!.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        expect(coder!.id).toBe("colibri-qwen3-coder-30b");
        expect(coder!.capacidades as string[]).toEqual(["texto", "razon", "codigo"]);
        expect(coder!.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        expect(modelosDeCapas({
            capas: [
                { id: "colibri-vieja", capa: "razon", runtime: "colibri", estado: "retirado" },
                { id: "colibri-rara", capa: "desconocida", runtime: "colibri", estado: "por-verificar" },
            ],
        })).toEqual([]);
    });

    it("en el catálogo conjunto están una sola vez, y tras los modelos de 1.58 bits", () => {
        const cat = catalogoRecursos();
        const ids = cat.map((m) => m.id);
        const enCat = ids.filter((id) => id.startsWith("colibri-"));
        expect(new Set(enCat).size).toBe(colibri.length);
        expect(new Set(enCat)).toEqual(new Set(colibri.map((m) => m.id)));
        // Todos van después del último 1.58-bit: la prioridad la manda `ordenarPorPrioridad`
        // (1.58 › estado › potencia); Colibri sale en 4 y 8 bits.
        const primeroNo158 = cat.findIndex((m) => m.bits !== 1.58);
        expect(Math.min(...enCat.map((id) => ids.indexOf(id)))).toBeGreaterThanOrEqual(primeroNo158);
    });
});
