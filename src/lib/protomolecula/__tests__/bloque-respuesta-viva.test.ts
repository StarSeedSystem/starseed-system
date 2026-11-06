import { describe, it, expect } from "vitest";
import { isRichBlock, parseBlocks, serializeBlock } from "@/lib/creation/post-blocks";
import { TIPO_RESPUESTA_VIVA, CAPA_RESPUESTA_VIVA } from "../bloque-protomolecula";
import type { Molecula } from "../tipos";

function moleculaConRespuestaViva(): Molecula {
    return {
        id: "mol-respuesta-viva", titulo: "Molécula con Respuesta Viva", ambito: "personal",
        capas: [CAPA_RESPUESTA_VIVA], atomos: [], valores: {}, version: 1, creadaEn: 1000, actualizadaEn: 1000,
    };
}

describe("bloque respuesta-viva en catálogo de bloques", () => {
    it("el tipo está en RICH_BLOCK_TYPES y es rico", () => {
        expect(isRichBlock(TIPO_RESPUESTA_VIVA)).toBe(true);
    });

    it("serializa y deserializa sin perder el texto OpenUI Lang", () => {
        const openuiLang = `root = Card("Título", "Contenido")`;
        const bloque = {
            id: "blk-1",
            type: TIPO_RESPUESTA_VIVA,
            code: openuiLang,
        } as const;

        const serializado = serializeBlock(bloque);
        expect(serializado.code).toBe(openuiLang);
        expect(serializado.type).toBe(TIPO_RESPUESTA_VIVA);

        const [vuelta] = parseBlocks([serializado]);
        expect(vuelta.code).toBe(openuiLang);
        expect(vuelta.type).toBe(TIPO_RESPUESTA_VIVA);
    });

    it("un bloque respuesta-viva se puede incrustar en una molécula y sobrevive a ss:meta", () => {
        const m = moleculaConRespuestaViva();
        const openuiLang = `root = Table([{col: "a", row: 1}, {col: "b", row: 2}])`;
        const bloque = { id: "blk-2", type: TIPO_RESPUESTA_VIVA, code: openuiLang };
        const serializado = serializeBlock(bloque);
        const [vuelta] = parseBlocks([serializado]);
        expect(vuelta.code).toBe(openuiLang);
    });
});
