// (Ola 224) Tope de tamaño para la metadata ss:meta del Lienzo: ssMetaBytes mide
// el JSON serializado (serializeBlocks) que se embebería en `ss:meta.blocks`, y
// el Lienzo no publica nada que lo supere.
import { describe, expect, it } from "vitest";
import { MAX_SS_META_BYTES, ssMetaBytes } from "@/lib/creation/post-blocks";
import { buildSsMetaComment } from "@/components/creation/creation-config";

describe("tope de tamaño ss:meta (Ola 224)", () => {
    it("un bloque pequeño queda por debajo del tope", () => {
        const blocks = [{ id: "b1", type: "texto" as const, text: "Hola" }];
        const bytes = ssMetaBytes(blocks);
        expect(bytes).toBeGreaterThan(0);
        expect(bytes).toBeLessThan(MAX_SS_META_BYTES);
    });

    it("un bloque grande (código/datos) supera el tope", () => {
        // Código de ~60 KB > 48 KB: fuerza el límite con un solo bloque.
        const blocks = [{ id: "b1", type: "codigo" as const, language: "js" as const, code: "x".repeat(60 * 1024) }];
        expect(ssMetaBytes(blocks)).toBeGreaterThan(MAX_SS_META_BYTES);
    });

    it("una lista vacía serializa el mínimo (el JSON `[]`)", () => {
        expect(ssMetaBytes([])).toBe(2);
    });

    it("el comentario ss:meta generado también supera el tope con un bloque grande", () => {
        const meta = buildSsMetaComment({
            area: "perfil",
            tipo: "general",
            blocks: [
                { id: "b1", type: "grafica" as const, chartType: "bar" as const, data: Array.from({ length: 20000 }, (_, i) => ({ label: `x${i}`, value: i })) },
            ],
        });
        expect(new TextEncoder().encode(meta).length).toBeGreaterThan(MAX_SS_META_BYTES);
    });
});