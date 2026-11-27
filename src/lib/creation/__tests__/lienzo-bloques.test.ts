import { describe, it, expect } from "vitest";
import {
    blockHasContent,
    bloquesRicosParaMeta,
    refConContenido,
} from "@/lib/creation/lienzo-bloques";
import type { PostBlock } from "@/lib/creation/post-blocks";

function bloque(parcial: Partial<PostBlock> & Pick<PostBlock, "type">): PostBlock {
    return { id: "blk-1", ...parcial };
}

describe("refConContenido", () => {
    it("acepta una entidad de tipo evento con id", () => {
        const b = bloque({ type: "entidad", ref: { kind: "event", id: "encuentro-2026" } });
        expect(refConContenido(b)).toBe(true);
    });

    it("rechaza una entidad cuyo tipo no es de entidad", () => {
        const b = bloque({ type: "entidad", ref: { kind: "brain", id: "cerebro-1" } });
        expect(refConContenido(b)).toBe(false);
    });

    it("rechaza referencias con id vacío o sólo espacios", () => {
        expect(refConContenido(bloque({ type: "referencia", ref: { kind: "brain", id: "" } }))).toBe(false);
        expect(refConContenido(bloque({ type: "referencia", ref: { kind: "brain", id: "  " } }))).toBe(false);
    });

    it("acepta una referencia común con id", () => {
        const b = bloque({ type: "referencia", ref: { kind: "library", id: "lib-1" } });
        expect(refConContenido(b)).toBe(true);
    });
});

describe("blockHasContent · bloques ricos", () => {
    it("valida el prototipo de Penpot por su URL", () => {
        expect(blockHasContent(bloque({ type: "penpot", url: "https://penpot.app/x" }))).toBe(true);
        expect(blockHasContent(bloque({ type: "penpot", url: "   " }))).toBe(false);
    });

    it("valida la respuesta viva por su código", () => {
        expect(blockHasContent(bloque({ type: "respuesta-viva", code: "card()" }))).toBe(true);
        expect(blockHasContent(bloque({ type: "respuesta-viva", code: " \n " }))).toBe(false);
    });

    it("exige coordenadas finitas en el mapa", () => {
        expect(blockHasContent(bloque({ type: "mapa", lat: 19.4, lng: -99.1 }))).toBe(true);
        expect(blockHasContent(bloque({ type: "mapa", lat: Number.NaN, lng: -99.1 }))).toBe(false);
        expect(blockHasContent(bloque({ type: "mapa", lat: 19.4 }))).toBe(false);
    });

    it("no cuenta la fila por defecto de una gráfica como contenido", () => {
        const vacia = bloque({ type: "grafica", data: [{ label: "", value: 0 }] });
        expect(blockHasContent(vacia)).toBe(false);
        const conEtiqueta = bloque({ type: "grafica", data: [{ label: "Enero", value: 0 }] });
        expect(blockHasContent(conEtiqueta)).toBe(true);
        const conValor = bloque({ type: "grafica", data: [{ label: "", value: 12 }] });
        expect(blockHasContent(conValor)).toBe(true);
    });

    it("acepta un agente definido sólo por su personalidad", () => {
        expect(blockHasContent(bloque({ type: "agente", persona: "cercano" }))).toBe(true);
        expect(blockHasContent(bloque({ type: "agente" }))).toBe(false);
    });
});

describe("bloquesRicosParaMeta", () => {
    it("serializa sólo los bloques ricos y limpia campos transitorios", () => {
        const salida = bloquesRicosParaMeta([
            bloque({ type: "texto", text: "hola" }),
            bloque({ type: "entidad", ref: { kind: "event", id: "encuentro-2026" }, uploading: true }),
            bloque({ type: "penpot", url: "https://penpot.app/x" }),
        ]);
        expect(salida.map((b) => b.type)).toEqual(["entidad", "penpot"]);
        expect(salida[0].uploading).toBeUndefined();
        expect(salida[0].ref).toEqual({ kind: "event", id: "encuentro-2026" });
    });

    it("tolera una lista vacía o indefinida", () => {
        expect(bloquesRicosParaMeta([])).toEqual([]);
        expect(bloquesRicosParaMeta(undefined as unknown as PostBlock[])).toEqual([]);
    });
});
