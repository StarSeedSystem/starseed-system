import { describe, expect, it } from "vitest";

import {
    blockHasContent,
    refTieneDestino,
} from "@/lib/creation/block-content";
import {
    parseBlocks,
    serializeBlocks,
    type PostBlock,
} from "@/lib/creation/post-blocks";

const bloque = (b: Partial<PostBlock> & Pick<PostBlock, "type">): PostBlock => ({
    id: "blk-prueba",
    ...b,
});

describe("blockHasContent · bloques por URL o código", () => {
    it("los bloques con URL exigen una URL no vacía", () => {
        for (const type of ["imagen", "archivo", "portada", "widget", "repo", "pizarra", "penpot", "video"] as const) {
            expect(blockHasContent(bloque({ type }))).toBe(false);
            expect(blockHasContent(bloque({ type, url: "   " }))).toBe(false);
            expect(blockHasContent(bloque({ type, url: "https://x.test/a" }))).toBe(true);
        }
    });

    it("texto y enlace aceptan texto o URL", () => {
        expect(blockHasContent(bloque({ type: "texto", text: "hola" }))).toBe(true);
        expect(blockHasContent(bloque({ type: "enlace", url: "https://x.test" }))).toBe(true);
        expect(blockHasContent(bloque({ type: "enlace", text: "  " }))).toBe(false);
    });

    it("código, página, protomolécula y respuesta viva exigen código", () => {
        for (const type of ["codigo", "pagina", "protomolecula", "respuesta-viva"] as const) {
            expect(blockHasContent(bloque({ type }))).toBe(false);
            expect(blockHasContent(bloque({ type, code: "   " }))).toBe(false);
            expect(blockHasContent(bloque({ type, code: "{}" }))).toBe(true);
        }
    });
});

describe("blockHasContent · agente, mapa y gráfica", () => {
    it("un agente vale por su sistema o su nombre", () => {
        expect(blockHasContent(bloque({ type: "agente" }))).toBe(false);
        expect(blockHasContent(bloque({ type: "agente", system: "eres útil" }))).toBe(true);
        expect(blockHasContent(bloque({ type: "agente", name: "Aurora" }))).toBe(true);
    });

    it("un mapa exige latitud y longitud finitas", () => {
        expect(blockHasContent(bloque({ type: "mapa" }))).toBe(false);
        expect(blockHasContent(bloque({ type: "mapa", lat: 0, lng: 0 }))).toBe(true);
        expect(blockHasContent(bloque({ type: "mapa", lat: Number.NaN, lng: 0 }))).toBe(false);
    });

    it("una gráfica vacía (etiqueta vacía y valor 0) no cuenta como contenido", () => {
        expect(blockHasContent(bloque({ type: "grafica" }))).toBe(false);
        expect(blockHasContent(bloque({ type: "grafica", data: [{ label: "", value: 0 }] }))).toBe(false);
        expect(blockHasContent(bloque({ type: "grafica", data: [{ label: "ene", value: 0 }] }))).toBe(true);
        expect(blockHasContent(bloque({ type: "grafica", data: [{ label: "", value: 7 }] }))).toBe(true);
    });
});

describe("blockHasContent · entidad (incluido evento) y protomolécula", () => {
    it("una entidad exige un destino con id no vacío", () => {
        expect(blockHasContent(bloque({ type: "entidad" }))).toBe(false);
        expect(blockHasContent(bloque({ type: "entidad", ref: { kind: "page", id: "  " } }))).toBe(false);
        expect(blockHasContent(bloque({ type: "entidad", ref: { kind: "page", id: "mi-pagina" } }))).toBe(true);
    });

    it("un evento es una entidad con kind «event» y se valida igual", () => {
        const evento: PostBlock = bloque({ type: "entidad", ref: { kind: "event", id: "fiesta-2026" } });
        expect(blockHasContent(evento)).toBe(true);
        expect(refTieneDestino(evento.ref)).toBe(true);
    });

    it("rechaza referencias con un tipo de recurso desconocido", () => {
        expect(refTieneDestino({ kind: "desconocido" as never, id: "x" })).toBe(false);
    });

    it("la protomolécula (prototipo serializado) vale por su código", () => {
        expect(blockHasContent(bloque({ type: "protomolecula", code: '{"pm":1}' }))).toBe(true);
        expect(blockHasContent(bloque({ type: "protomolecula", code: "  " }))).toBe(false);
    });
});

describe("serialización · entidad/evento y protomolécula sobreviven al viaje", () => {
    it("conserva la referencia de una entidad de tipo evento", () => {
        const original: PostBlock = bloque({
            type: "entidad",
            text: "Fiesta 2026",
            ref: { kind: "event", id: "fiesta-2026", label: "Fiesta 2026", route: "/evento/fiesta-2026" },
        });
        const [vuelta] = parseBlocks(serializeBlocks([original]));
        expect(vuelta.type).toBe("entidad");
        expect(vuelta.ref).toEqual(original.ref);
        expect(blockHasContent(vuelta)).toBe(true);
    });

    it("conserva el código de una protomolécula", () => {
        const original: PostBlock = bloque({ type: "protomolecula", code: '{"pm":1,"molecula":{}}' });
        const [vuelta] = parseBlocks(serializeBlocks([original]));
        expect(vuelta.type).toBe("protomolecula");
        expect(vuelta.code).toBe(original.code);
        expect(blockHasContent(vuelta)).toBe(true);
    });
});
