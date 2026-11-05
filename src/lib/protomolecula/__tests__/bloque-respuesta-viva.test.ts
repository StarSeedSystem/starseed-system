import { describe, it, expect } from "vitest";
import { isRichBlock, parseBlocks, serializeBlock } from "@/lib/creation/post-blocks";
import type { Molecula, Capa } from "../tipos";

function capaDeRespuestaViva(): Capa {
    return {
        id: "respuesta-viva",
        tipo: "respuesta-viva",
        titulo: "Respuesta Viva",
        formato: "openui-lang",
        referencia: null,
        orden: 0,
        visible: true,
        bloqueada: false,
    };
}

function moleculaConRespuestaViva(): Molecula {
    return {
        id: "mol-respuesta-viva", titulo: "Molécula con Respuesta Viva", ambito: "personal",
        capas: [capaDeRespuestaViva()], atomos: [], valores: {}, version: 1, creadaEn: 1000, actualizadaEn: 1000,
    };
}

describe("bloque respuesta-viva en catálogo de bloques", () => {
    it("el tipo está en RICH_BLOCK_TYPES y es rico", () => {
        expect(isRichBlock("respuesta-viva")).toBe(true);
    });

    it("serializa y deserializa sin perder el texto OpenUI Lang", () => {
        const openuiLang = `root = Card("Título", "Contenido")`;
        const bloque = {
            id: "blk-1",
            type: "respuesta-viva" as const,
            code: openuiLang,
        };

        const serializado = serializeBlock(bloque);
        expect(serializado.code).toBe(openuiLang);
        expect(serializado.type).toBe("respuesta-viva");

        const [vuelta] = parseBlocks([serializado]);
        expect(vuelta.code).toBe(openuiLang);
        expect(vuelta.type).toBe("respuesta-viva");
    });

    it("un bloque respuesta-viva se puede incrustar en una molécula y sobrevive a ss:meta", () => {
        const m = moleculaConRespuestaViva();
        const openuiLang = `root = Table([{col: "a", row: 1}, {col: "b", row: 2}])`;
        const bloque = { id: "blk-2", type: "respuesta-viva" as const, code: openuiLang };
        const serializado = serializeBlock(bloque);
        const [vuelta] = parseBlocks([serializado]);
        expect(vuelta.code).toBe(openuiLang);
    });
});