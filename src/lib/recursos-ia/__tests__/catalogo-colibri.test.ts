/**
 * Catálogo de Recursos de IA (1027C): las capas con runtime «colibri» dentro de `modelosDeCapas`.
 * Colibri es el runtime nativo de las multicapas de Astraura (`architecture/colibri-multicapas.md`):
 * juicio decide, palabra conversa, razón y profunda piensan y escriben código.
 * Prueba con dos entradas sintéticas: módulo puro, sin disco ni red.
 */
import { describe, expect, it } from "vitest";
import { catalogoRecursos, modeloPorId, modelosDeCapas } from "../catalogo";

/** Una capa del catálogo con runtime «colibri». Sin `sha256`: se devuelve sola para las variantes. */
const entrada = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "colibri-prueba",
    capa: "razon",
    modelo: "Modelo de prueba int4",
    familia: "JustVugg/colibri",
    formato: "safetensors",
    runtime: "colibri",
    disco_mb: 1000,
    ram_min_mb: 8192,
    estado: "por-verificar",
    medios: ["servidor"],
    ...extra,
});

describe("modelosDeCapas · runtime «colibri»", () => {
    // Dos entradas: una de razón (int4, sin streaming) y una profunda con visión (int8, streaming).
    const [razon, profunda] = modelosDeCapas({
        capas: [entrada(), { ...entrada(), id: "colibri-prueba-pro", capa: "profunda", modelo: "Grande visión int8", disco_mb: 86732, ram_min_mb: 16384, streaming_disco: true }],
    });

    it("razón: texto, razón y código; int4, sin streaming, servidor en 4480", () => {
        expect(razon.id).toBe("colibri-prueba");
        expect(razon.capacidades as string[]).toEqual(["texto", "razon", "codigo"]);
        expect(razon.bits).toBe(4);
        expect(razon.runtime).toBe("colibri");
        expect(razon.arquitecturas).toEqual(["arm64", "x86_64"]);
        expect(String(razon.almacenamiento.modo)).toBe("carga-completa");
        expect(razon.almacenamiento.soloLocal).toBe(true);
        expect(razon.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        expect(razon.disco).toEqual({ gb: 1, verificado: false });
        expect(razon.ramMinGb).toBe(8);
        expect(razon.estado).toBe("en-pruebas");
        expect(razon.origen).toBe("capas");
        expect(razon.medios).toEqual(["servidor"]);
    });

    it("profunda: añade visión cuando el modelo la declara; int8 y streaming del disco", () => {
        expect(profunda.id).toBe("colibri-prueba-pro");
        expect(profunda.capacidades as string[]).toEqual(["texto", "razon", "codigo", "vision"]);
        expect(profunda.bits).toBe(8);
        expect(String(profunda.almacenamiento.modo)).toBe("streaming");
        expect(profunda.almacenamiento.lecturaMinMBs).toBe(500);
        expect(profunda.almacenamiento.soloLocal).toBe(true);
        expect(profunda.notas).toMatch(/disco local rápido/);
        expect(profunda.notas).toMatch(/SHA por verificar/);
        expect(profunda.disco.gb).toBe(86.74);
        expect(profunda.ramMinGb).toBe(16);
    });

    it("juicio decide con probabilidad y palabra conversa; bits según el modelo", () => {
        const capas = modelosDeCapas({
            capas: [
                entrada({ id: "colibri-prueba-j", capa: "juicio", modelo: "Laya de prueba" }),
                entrada({ id: "colibri-prueba-p", capa: "palabra", modelo: "OLMoE 7B int8" }),
            ],
        });
        const por = (id: string) => capas.find((x) => x.id === id)!;
        expect(por("colibri-prueba-j").capacidades as string[]).toEqual(["decision"]);
        expect(por("colibri-prueba-j").bits).toBe(4);
        expect(por("colibri-prueba-p").capacidades as string[]).toEqual(["texto"]);
        expect(por("colibri-prueba-p").bits).toBe(8);
    });

    it("un papel que Colibri no conoce y un estado retirado no entran", () => {
        expect(
            modelosDeCapas({
                capas: [entrada({ capa: "reflejo" }), entrada({ capa: "desconocida" }), entrada({ estado: "retirado", sha256: "a".repeat(64) })],
            }),
        ).toEqual([]);
    });

    it("un SHA medido respeta el estado declarado y limpia la nota del SHA", () => {
        const [m] = modelosDeCapas({ capas: [entrada({ estado: "recomendado", sha256: "a".repeat(64) })] });
        expect(m.estado).toBe("recomendado");
        expect(m.notas).not.toMatch(/SHA/);
        // El tamaño sigue viniendo de `disco_mb`: sin `tamano_bytes` no se da por verificado.
        expect(m.disco).toEqual({ gb: 1, verificado: false });
    });
});

describe("catálogo real · las capas Colibri entran con el contrato", () => {
    it("todas en 4480, arm64 + x86_64 y bits int4 u int8", () => {
        const colibri = catalogoRecursos().filter((m) => m.runtime === "colibri");
        expect(colibri.length).toBeGreaterThanOrEqual(9);
        for (const m of colibri) {
            expect(m.servidor, m.id).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
            expect(m.arquitecturas, m.id).toEqual(["arm64", "x86_64"]);
            expect([4, 8], m.id).toContain(m.bits);
            expect(m.almacenamiento.soloLocal, m.id).toBe(true);
        }
    });

    it("capacidades y streaming del JSON verificado (2026-10-27)", () => {
        const por = (id: string) => modeloPorId(id, catalogoRecursos())!;
        expect(por("colibri-laya").capacidades as string[]).toEqual(["decision"]);
        expect(por("colibri-clef").capacidades as string[]).toEqual(["decision"]);
        expect(por("colibri-olmoe-7b").capacidades as string[]).toEqual(["texto"]);
        expect(por("colibri-olmoe-7b").bits).toBe(8);
        expect(por("colibri-qwen3-coder-30b").capacidades as string[]).toEqual(["texto", "razon", "codigo"]);
        expect(String(por("colibri-deepseek-v4-flash-reap").almacenamiento.modo)).toBe("streaming");
        expect(por("colibri-qwen38-flash-next").capacidades as string[]).toContain("vision");
        expect(por("colibri-glm-5.2").bits).toBe(4);
    });
});
