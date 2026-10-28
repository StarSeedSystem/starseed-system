/** CLB1027C · los modelos de Colibri (`config/capas-colibri-1027.json`) en `modelosDeCapas`. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoRecursos, modeloPorId, modelosDeCapas } from "../catalogo";

const colibriJson: unknown = JSON.parse(readFileSync(join(process.cwd(), "config/capas-colibri-1027.json"), "utf8"));

const por = (id: string) => modelosDeCapas(colibriJson).find((m) => m.id === id)!;

describe("catálogo · entradas de Colibri", () => {
    it("las 9 entradas del JSON entran con origen «capas» y runtime «colibri»", () => {
        const colibri = modelosDeCapas(colibriJson);
        expect(colibri).toHaveLength(9);
        expect(colibri.every((m) => m.runtime === "colibri")).toBe(true);
        expect(colibri.every((m) => m.origen === "capas")).toBe(true);
        expect(colibri.every((m) => m.arquitecturas?.includes("arm64") && m.arquitecturas.includes("x86_64"))).toBe(true);
        expect(colibri.every((m) => m.estado === "en-pruebas")).toBe(true); // sin SHA aún: «por-verificar»
        expect(colibri.every((m) => !m.disco.verificado)).toBe(true);
    });

    it("juicio → decisión (Laya y GLiNER): bits, RAM, disco y upstream de la ficha", () => {
        const laya = por("colibri-laya");
        expect(laya.capacidades).toEqual(["decision"]);
        expect(laya.bits).toBe(4);
        expect(laya.ramMinGb).toBe(1.7);
        expect(laya.disco).toEqual({ gb: 0.85, verificado: false });
        expect(laya.medios).toEqual(["nativo", "servidor"]);
        expect(laya.licencia).toBe("Apache-2.0");
        expect(laya.upstream).toBe("https://huggingface.co/convaiinnovations/laya");
        expect(laya.almacenamiento.modo).toBe("carga-completa");
        const gliner = por("colibri-gliner-decide");
        expect(gliner.capacidades).toEqual(["decision"]);
        expect(gliner.bits).toBe(4); // la medida no habla de bits: nada inventado
        expect(gliner.disco.gb).toBe(1.95);
        const clef = por("colibri-clef");
        expect(clef.capacidades).toEqual(["decision"]);
        expect(clef.bits).toBe(8); // «medida: … en int8»
        expect(clef.ramMinGb).toBe(19);
    });

    it("palabra → texto (OLMoE int8: 4 u 8 según el modelo) y elecciones con descarga", () => {
        const olmoe = por("colibri-olmoe-7b");
        expect(olmoe.capacidades).toEqual(["texto"]);
        expect(olmoe.bits).toBe(8);
        expect(olmoe.disco).toEqual({ gb: 7, verificado: false, descargaGb: 14 });
    });

    it("razón → texto, razón y código, en int4", () => {
        for (const id of ["colibri-qwen3-coder-30b", "colibri-qwen36-35b"]) {
            const m = por(id);
            expect(m.capacidades, id).toEqual(["texto", "razon", "codigo"]);
            expect(m.bits, id).toBe(4);
        }
        expect(por("colibri-qwen3-coder-30b").disco.gb).toBe(19.4);
        expect(por("colibri-qwen36-35b").disco.gb).toBe(23.1);
        expect(por("colibri-qwen3-coder-30b").upstream).toBe("https://huggingface.co/Justvugg/Qwen3-Coder-30B-A3B-colibri-int4");
    });

    it("profunda → streaming del disco; visión solo si el modelo la dice", () => {
        const reap = por("colibri-deepseek-v4-flash-reap");
        expect(reap.capacidades).toEqual(["texto", "razon", "codigo"]); // no dice visión
        expect(reap.almacenamiento).toEqual({ modo: "streaming", soloLocal: false });
        expect(reap.disco.gb).toBe(84.7);
        expect(reap.ramMinGb).toBe(16);
        expect(reap.notas).toContain("disco rápido");

        const flashNext = por("colibri-qwen38-flash-next");
        expect(flashNext.capacidades).toEqual(["texto", "razon", "codigo", "vision"]);
        expect(flashNext.almacenamiento.modo).toBe("streaming");
        expect(flashNext.disco.gb).toBe(186);

        const glm = por("colibri-glm-5.2");
        expect(glm.capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(glm.almacenamiento.modo).toBe("streaming");
        expect(glm.disco.gb).toBe(429.3);
    });

    it("entradas rotas (dos de muestra) no entran: sin id, sin capa ni capa desconocida", () => {
        const rotas = modelosDeCapas({
            entradas: [
                { id: "colibri-x", capa: "desconocida" },
                { capa: "juicio" },
                { id: "colibri-y" },
            ],
        });
        expect(rotas).toEqual([]);
        expect(modelosDeCapas(null)).toEqual([]);
    });

    it("Colibri entra en el catálogo completo sin pisar lo que ya hay", () => {
        const cat = catalogoRecursos();
        expect(modeloPorId("colibri-laya", cat)).toBeDefined();
        const ids = cat.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
