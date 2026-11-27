import { describe, it, expect } from "vitest";
import {
    isRichBlock,
    parseBlocks,
    serializeBlock,
    serializeBlocks,
    type PostBlock,
} from "@/lib/creation/post-blocks";
import { normalizarMarco } from "@/lib/profile/marco-foto";
import { sourceRefToBlockPatch } from "@/components/creation/creation-blocks";

const marco = { forma: "corazon" as const, x: 3, y: -4, escala: 1.4, borde: 3 };

describe("serialización por tipo de bloque rich", () => {
    it("conserva sólo los campos que cada editor necesita", () => {
        const casos: Array<{ bloque: PostBlock; esperado: PostBlock }> = [
            { bloque: { id: "b1", type: "portada", url: "u", name: "n", text: "t", marco, code: "ruido", uploading: true }, esperado: { id: "b1", type: "portada", url: "u", name: "n", text: "t", marco: normalizarMarco(marco) } },
            { bloque: { id: "b2", type: "codigo", code: "<h1>", language: "html", url: "ruido", uploading: true }, esperado: { id: "b2", type: "codigo", code: "<h1>", language: "html" } },
            { bloque: { id: "b3", type: "pagina", code: "ui()", language: "js", text: "ruido" }, esperado: { id: "b3", type: "pagina", code: "ui()", language: "js" } },
            { bloque: { id: "b4", type: "repo", url: "u", text: "r", code: "ruido" }, esperado: { id: "b4", type: "repo", url: "u", text: "r" } },
            { bloque: { id: "b5", type: "pizarra", url: "u", text: "p", lat: 1 }, esperado: { id: "b5", type: "pizarra", url: "u", text: "p" } },
            { bloque: { id: "b6", type: "agente", name: "A", persona: "p", system: "s", url: "ruido" }, esperado: { id: "b6", type: "agente", name: "A", persona: "p", system: "s" } },
            { bloque: { id: "b7", type: "mapa", place: "Aquí", lat: 1.2, lng: -2.3, code: "ruido" }, esperado: { id: "b7", type: "mapa", place: "Aquí", lat: 1.2, lng: -2.3 } },
            { bloque: { id: "b8", type: "grafica", chartType: "line", data: [{ label: "A", value: 2 }], name: "ruido" }, esperado: { id: "b8", type: "grafica", chartType: "line", data: [{ label: "A", value: 2 }] } },
            { bloque: { id: "b9", type: "referencia", text: "R", ref: { kind: "url", id: "https://x", label: "R", url: "https://x" }, code: "ruido" }, esperado: { id: "b9", type: "referencia", text: "R", ref: { kind: "url", id: "https://x", label: "R", url: "https://x" } } },
            { bloque: { id: "b10", type: "entidad", text: "P", ref: { kind: "page", id: "p", route: "/pagina/p" }, url: "ruido" }, esperado: { id: "b10", type: "entidad", text: "P", ref: { kind: "page", id: "p", route: "/pagina/p" } } },
            { bloque: { id: "b11", type: "penpot", url: "u", text: "D", system: "embed", data: [{ label: "x", value: 1 }] }, esperado: { id: "b11", type: "penpot", url: "u", text: "D", system: "embed" } },
            { bloque: { id: "b12", type: "video", url: "u", name: "v", text: "V", marco, system: "ruido" }, esperado: { id: "b12", type: "video", url: "u", name: "v", text: "V", marco: normalizarMarco(marco) } },
            { bloque: { id: "b13", type: "protomolecula", code: '{"pm":1}', url: "ruido", uploading: true }, esperado: { id: "b13", type: "protomolecula", code: '{"pm":1}' } },
            { bloque: { id: "b14", type: "respuesta-viva", code: "root = Card()", language: "jsx" }, esperado: { id: "b14", type: "respuesta-viva", code: "root = Card()" } },
        ];
        for (const { bloque, esperado } of casos) {
            expect(serializeBlock(bloque)).toEqual(esperado);
        }
    });
});

describe("serializeBlocks", () => {
    it("guarda todos los tipos ricos y deja fuera los legados y las entradas rotas", () => {
        const ricos = ["portada", "codigo", "pagina", "repo", "pizarra", "agente", "mapa", "grafica", "referencia", "entidad", "penpot", "video", "protomolecula", "respuesta-viva"] as const;
        for (const type of ricos) expect(isRichBlock(type)).toBe(true);
        const lista = [
            { id: "l", type: "texto", text: "legado" } as PostBlock,
            { id: "r", type: "referencia", ref: { kind: "file", id: "f", label: "F" } } as PostBlock,
            null as unknown as PostBlock,
            { id: "e", type: "entidad", ref: { kind: "community", id: "c", label: "C" } } as PostBlock,
        ];
        expect(serializeBlocks(lista).map((b) => b.id)).toEqual(["r", "e"]);
        expect(serializeBlocks([])).toEqual([]);
    });
});

describe("referencia y entidad", () => {
    it("normaliza todos los campos de una referencia y sobrevive al parseo", () => {
        const ref = { kind: "file" as const, id: "item-1", label: "Archivo", route: "/library", url: "https://x/f", folderId: null, itemId: "item-1", libraryKind: "user" };
        const serializado = serializeBlock({ id: "r", type: "referencia", ref, uploading: true });
        expect(serializado.ref).toEqual(ref);
        const [vuelta] = parseBlocks([serializado]);
        expect(vuelta.ref).toEqual(ref);
    });

    it("descarta referencias con kind desconocido o sin id", () => {
        const futuro = serializeBlock({ id: "r1", type: "referencia", ref: { kind: "futuro", id: "x" } } as unknown as PostBlock);
        const sinId = serializeBlock({ id: "r2", type: "entidad", ref: { kind: "page", id: "" } });
        expect(futuro.ref).toBeUndefined();
        expect(sinId.ref).toBeUndefined();
    });

    it("el editor no guarda referencias sin id que serializeBlock descartaría", () => {
        const sinId: PostBlock = { id: "r3", type: "referencia", ...sourceRefToBlockPatch({ kind: "library", label: "Sin id" }) };
        expect(serializeBlock(sinId)).toEqual({ id: "r3", type: "referencia", text: "Sin id" });
        const conId: PostBlock = { id: "r4", type: "referencia", ...sourceRefToBlockPatch({ kind: "brain", brainId: "b", label: "Cerebro" }) };
        expect(serializeBlock(conId).ref).toEqual({ kind: "brain", id: "b", label: "Cerebro", route: "/cerebro" });
    });

    it("una entidad con ruta canónica viaja intacta", () => {
        const bloque: PostBlock = { id: "e", type: "entidad", text: "Comunidad", ref: { kind: "community", id: "c", label: "Comunidad", route: "/pagina/c" }, uploading: true };
        const serializado = serializeBlock(bloque);
        expect(serializado).toEqual({ id: "e", type: "entidad", text: "Comunidad", ref: bloque.ref });
        expect(parseBlocks([serializado])).toEqual([serializado]);
    });
});

describe("protomolécula y campos numéricos", () => {
    it("la instantánea de la molécula viaja como code sin ruido", () => {
        const code = JSON.stringify({ pm: 1, molecula: { id: "mol" } });
        const serializado = serializeBlock({ id: "p", type: "protomolecula", code, url: "ruido", uploading: true });
        expect(serializado).toEqual({ id: "p", type: "protomolecula", code });
        expect(parseBlocks([serializado])[0]?.code).toBe(code);
    });

    it("sanea idioma, datos de gráfica y coordenadas antes de guardar", () => {
        const codigo = serializeBlock({ id: "c", type: "codigo", code: "x", language: "rust" as PostBlock["language"], uploading: true });
        expect(codigo).toEqual({ id: "c", type: "codigo", code: "x" });
        const grafica = serializeBlock({ id: "g", type: "grafica", chartType: "bar", data: [{ label: "A", value: 2 }, { label: "B", value: Number.NaN }], lat: 1 });
        expect(grafica).toEqual({ id: "g", type: "grafica", chartType: "bar", data: [{ label: "A", value: 2 }] });
        const mapa = serializeBlock({ id: "m", type: "mapa", place: "Aquí", lat: 1.5, lng: Number.NaN });
        expect(mapa).toEqual({ id: "m", type: "mapa", place: "Aquí", lat: 1.5 });
    });
});
