import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoRecursos, modeloPorId, modelosDeColibri } from "../catalogo";
import type { RequisitosModelo } from "../tipos";

const colibriJson: unknown = JSON.parse(readFileSync(join(process.cwd(), "config/capas-colibri-1027.json"), "utf8"));

describe("catálogo de recursos de IA · Colibri", () => {
    const colibri = modelosDeColibri(colibriJson);

    it("mapea todas las entradas del JSON (excluyendo los excluidos)", () => {
        const idsEntradas = ((colibriJson as { entradas: { id: string }[] }).entradas).map((e) => e.id);
        expect(colibri.map((m) => m.id).sort()).toEqual([...idsEntradas].sort());
        expect(colibri.every((m) => m.origen === "capas")).toBe(true);
    });

    it("runtime es 'colibri' y arquitecturas son arm64 y x86_64", () => {
        for (const m of colibri) {
            expect(m.runtime).toBe("colibri");
            expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
        }
    });

    it("capas: juicio → decision, palabra → texto, razon → texto/razon/codigo, profunda → texto/razon/codigo[/vision]", () => {
        const porId = (id: string) => colibri.find((x) => x.id === id)!;

        // juicio
        expect(porId("colibri-laya").capacidades).toEqual(["decision"]);
        expect(porId("colibri-gliner-decide").capacidades).toEqual(["decision"]);
        expect(porId("colibri-clef").capacidades).toEqual(["decision"]);

        // palabra
        expect(porId("colibri-olmoe-7b").capacidades).toEqual(["texto"]);

        // razon
        expect(porId("colibri-qwen3-coder-30b").capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(porId("colibri-qwen36-35b").capacidades).toEqual(["texto", "razon", "codigo"]);

        // profunda
        expect(porId("colibri-deepseek-v4-flash-reap").capacidades).toEqual(["texto", "razon", "codigo"]);
        // Qwen3.8-Flash-Next tiene visión
        expect(porId("colibri-qwen38-flash-next").capacidades).toContain("vision");
        expect(porId("colibri-qwen38-flash-next").capacidades).toEqual(["texto", "razon", "codigo", "vision"]);
        expect(porId("colibri-glm-5.2").capacidades).toEqual(["texto", "razon", "codigo"]);
    });

    it("bits: int4 = 4, int8 = 8", () => {
        const porId = (id: string) => colibri.find((x) => x.id === id)!;
        // Todos los modelos en la config son int4 excepto si se especifica int8
        expect(porId("colibri-laya").bits).toBe(4);
        expect(porId("colibri-gliner-decide").bits).toBe(4);
        // Clef es int8 según la config (52 GB disco, 19 GB RAM min)
        expect(porId("colibri-clef").bits).toBe(8);
    });

    it("modelos con streaming_disco tienen modo 'streaming' y lecturaMinMBs", () => {
        const porId = (id: string) => colibri.find((x) => x.id === id)!;

        // Profunda: DeepSeek V4 Flash REAP, Qwen3.8-Flash-Next, GLM-5.2 tienen streaming_disco
        expect(porId("colibri-deepseek-v4-flash-reap").almacenamiento.modo).toBe("streaming");
        expect(porId("colibri-deepseek-v4-flash-reap").almacenamiento.lecturaMinMBs).toBe(500);
        expect(porId("colibri-qwen38-flash-next").almacenamiento.modo).toBe("streaming");
        expect(porId("colibri-glm-5.2").almacenamiento.modo).toBe("streaming");

        // Los demás NO tienen streaming
        expect(porId("colibri-laya").almacenamiento.modo).toBe("carga-completa");
        expect(porId("colibri-olmoe-7b").almacenamiento.modo).toBe("carga-completa");
        expect(porId("colibri-qwen3-coder-30b").almacenamiento.modo).toBe("carga-completa");
    });

    it("todos tienen servidor OpenAI-compatible en puerto 4480", () => {
        for (const m of colibri) {
            expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        }
    });

    it("estado 'por-verificar' se mapea a 'en-pruebas'", () => {
        for (const m of colibri) {
            expect(m.estado).toBe("en-pruebas");
        }
    });

    it("tamaños de disco y RAM coinciden con la config", () => {
        const porId = (id: string) => colibri.find((x) => x.id === id)!;

        expect(porId("colibri-laya").disco.gb).toBe(0.85);
        expect(porId("colibri-laya").ramMinGb).toBe(2); // 1.7 → 2 (redondeo hacia arriba)

        expect(porId("colibri-gliner-decide").disco.gb).toBe(1.95);
        expect(porId("colibri-gliner-decide").ramMinGb).toBe(2); // 1.9 → 2

        expect(porId("colibri-clef").disco.gb).toBe(52);
        expect(porId("colibri-clef").ramMinGb).toBe(19);

        expect(porId("colibri-olmoe-7b").disco.gb).toBe(7);
        expect(porId("colibri-olmoe-7b").ramMinGb).toBe(8);

        expect(porId("colibri-qwen3-coder-30b").disco.gb).toBe(19.4);
        expect(porId("colibri-qwen3-coder-30b").ramMinGb).toBe(8);

        expect(porId("colibri-qwen36-35b").disco.gb).toBe(23.1);
        expect(porId("colibri-qwen36-35b").ramMinGb).toBe(10);

        expect(porId("colibri-deepseek-v4-flash-reap").disco.gb).toBe(84.7);
        expect(porId("colibri-deepseek-v4-flash-reap").ramMinGb).toBe(16);

        expect(porId("colibri-qwen38-flash-next").disco.gb).toBe(186);
        expect(porId("colibri-qwen38-flash-next").ramMinGb).toBe(24);

        expect(porId("colibri-glm-5.2").disco.gb).toBe(429.3);
        expect(porId("colibri-glm-5.2").ramMinGb).toBe(16);
    });

    it("medios: juicio y palabra solo 'servidor', razon y profunda 'servidor'", () => {
        const porId = (id: string) => colibri.find((x) => x.id === id)!;

        // Todos en la config tienen medios ["nativo", "servidor"] o ["servidor"]
        // Laya y GLiNER: ["nativo", "servidor"]
        expect(porId("colibri-laya").medios).toEqual(["nativo", "servidor"]);
        expect(porId("colibri-gliner-decide").medios).toEqual(["nativo", "servidor"]);
        // Clef: solo ["servidor"]
        expect(porId("colibri-clef").medios).toEqual(["servidor"]);
        // OLMoE: ["servidor"]
        expect(porId("colibri-olmoe-7b").medios).toEqual(["servidor"]);
        // Razón: ["servidor"]
        expect(porId("colibri-qwen3-coder-30b").medios).toEqual(["servidor"]);
        expect(porId("colibri-qwen36-35b").medios).toEqual(["servidor"]);
        // Profunda: ["servidor"]
        expect(porId("colibri-deepseek-v4-flash-reap").medios).toEqual(["servidor"]);
        expect(porId("colibri-qwen38-flash-next").medios).toEqual(["servidor"]);
        expect(porId("colibri-glm-5.2").medios).toEqual(["servidor"]);
    });

    it("formato: 'colibri-streaming' para los de streaming, 'gguf' para el resto", () => {
        const porId = (id: string) => colibri.find((x) => x.id === id)!;

        expect(porId("colibri-deepseek-v4-flash-reap").formato).toBe("colibri-streaming");
        expect(porId("colibri-qwen38-flash-next").formato).toBe("colibri-streaming");
        expect(porId("colibri-glm-5.2").formato).toBe("colibri-streaming");

        expect(porId("colibri-laya").formato).toBe("gguf");
        expect(porId("colibri-olmoe-7b").formato).toBe("gguf");
        expect(porId("colibri-qwen3-coder-30b").formato).toBe("gguf");
    });
});

describe("catálogo completo · integración Colibri", () => {
    const cat = catalogoRecursos();

    it("incluye todos los modelos de Colibri sin duplicados", () => {
        const idsColibri = [
            "colibri-laya",
            "colibri-gliner-decide",
            "colibri-clef",
            "colibri-olmoe-7b",
            "colibri-qwen3-coder-30b",
            "colibri-qwen36-35b",
            "colibri-deepseek-v4-flash-reap",
            "colibri-qwen38-flash-next",
            "colibri-glm-5.2",
        ];
        for (const id of idsColibri) {
            const m = modeloPorId(id, cat);
            expect(m, id).toBeDefined();
            expect(m!.runtime).toBe("colibri");
        }
    });

    it("los modelos de Colibri aparecen en el catálogo ordenado por prioridad", () => {
        const idsColibri = [
            "colibri-laya",
            "colibri-gliner-decide",
            "colibri-clef",
            "colibri-olmoe-7b",
            "colibri-qwen3-coder-30b",
            "colibri-qwen36-35b",
            "colibri-deepseek-v4-flash-reap",
            "colibri-qwen38-flash-next",
            "colibri-glm-5.2",
        ];
        const indices = idsColibri.map((id) => cat.findIndex((m) => m.id === id));
        expect(indices.every((i) => i >= 0)).toBe(true);
    });

    it("prueba con dos entradas: Laya (juicio) y Qwen3-Coder (razón)", () => {
        const laya = modeloPorId("colibri-laya", cat)!;
        const qwenCoder = modeloPorId("colibri-qwen3-coder-30b", cat)!;

        // Laya: capa juicio, decision, 4 bits, streaming=false
        expect(laya.capacidades).toEqual(["decision"]);
        expect(laya.bits).toBe(4);
        expect(laya.almacenamiento.modo).toBe("carga-completa");
        expect(laya.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });

        // Qwen3-Coder: capa razon, texto/razon/codigo, 4 bits, streaming=false
        expect(qwenCoder.capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(qwenCoder.bits).toBe(4);
        expect(qwenCoder.almacenamiento.modo).toBe("carga-completa");
        expect(qwenCoder.herramientasRequeridas).toEqual(["colibri-tools"]);
    });
});