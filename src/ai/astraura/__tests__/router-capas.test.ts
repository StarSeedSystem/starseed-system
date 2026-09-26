/**
 * Enrutador y capas de conciencia de Astraura 1.58 (Ola 365 · 2026-09-26): el interruptor
 * general y las capas local/nube sacan esas fuentes del ranking; el nivelador inclina hacia
 * el enrutador libre, un modelo específico o las capas 1.58. Catálogo real, sin red.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_INTELLIGENCE, rankCandidates, type IntelligenceSettings, type TaskProfile } from "@/ai/astraura/router";
import { ASTRAURA_158_CLOUD_SOURCE_ID, ASTRAURA_158_LOCAL_SOURCE_ID, findSource } from "@/ai/astraura/free-catalog";
import type { SourceAvailability } from "@/ai/astraura/availability";

const perfil: TaskProfile = { kind: "chat", needsVision: false, chars: 40, difficulty: 0.1 };
function lista(id: string): SourceAvailability {
    const source = findSource(id);
    if (!source) throw new Error(`fuente desconocida: ${id}`);
    return { source, ready: true };
}
const avail = [lista(ASTRAURA_158_LOCAL_SOURCE_ID), lista(ASTRAURA_158_CLOUD_SOURCE_ID), lista("openrouter-free")];
const rank = (extra: Partial<IntelligenceSettings>) => rankCandidates(perfil, avail, { ...DEFAULT_INTELLIGENCE, ...extra });
const fuentes = (extra: Partial<IntelligenceSettings>) => new Set(rank(extra).map((c) => c.source.id));
const mejorDe = (extra: Partial<IntelligenceSettings>, id: string) =>
    Math.max(...rank(extra).filter((c) => c.source.id === id).map((c) => c.score));

describe("rankCandidates · capas de conciencia 1.58", () => {
    it("por defecto (todo encendido) una fuente 1.58 encabeza un chat normal", () => {
        expect(rank({})[0].source.id.startsWith("astraura-158")).toBe(true);
    });

    it("con el interruptor general apagado no aparece ninguna fuente 1.58", () => {
        const f = fuentes({ astraura158Activo: false });
        expect(f.has(ASTRAURA_158_LOCAL_SOURCE_ID)).toBe(false);
        expect(f.has(ASTRAURA_158_CLOUD_SOURCE_ID)).toBe(false);
        expect(f.has("openrouter-free")).toBe(true);
    });

    it("apagar la capa local quita solo la local", () => {
        const f = fuentes({ capa158Local: false });
        expect(f.has(ASTRAURA_158_LOCAL_SOURCE_ID)).toBe(false);
        expect(f.has(ASTRAURA_158_CLOUD_SOURCE_ID)).toBe(true);
    });

    it("el nivelador al mínimo pone la gratuita por encima de la nube 1.58", () => {
        expect(mejorDe({ nivelador158: 0 }, "openrouter-free")).toBeGreaterThan(mejorDe({ nivelador158: 0 }, ASTRAURA_158_CLOUD_SOURCE_ID));
    });

    it("en el centro, con un modelo específico elegido, ese gana", () => {
        const m = rank({}).find((c) => c.source.id === "openrouter-free")!.model.id;
        const r = rank({ nivelador158: 50, especifico158: { fuente: "openrouter-free", modelo: m } });
        expect(r[0].source.id).toBe("openrouter-free");
        expect(r[0].model.id).toBe(m);
    });
});
