// Serialización de bloques rich del Lienzo (CRE1125E): cada tipo debe
// sobrevivir a serializeBlocks → parseBlocks sin perder sus campos, y los
// valores inválidos de ss:meta no deben colarse al render.
import { describe, expect, it } from "vitest";
import {
    parseBlocks,
    serializeBlock,
    serializeBlocks,
    type PostBlock,
} from "@/lib/creation/post-blocks";
import { sourceRefToBlockPatch } from "@/components/creation/creation-blocks";

const RICOS: PostBlock[] = [
    { id: "p", type: "portada", url: "https://x/p.png", name: "p.png", text: "Portada" },
    { id: "c", type: "codigo", code: "<h1>Hola</h1>", language: "html" },
    { id: "pg", type: "pagina", code: "<App/>", language: "jsx" },
    { id: "r", type: "repo", url: "https://github.com/u/r", text: "repo" },
    { id: "z", type: "pizarra", url: "https://x/board", text: "tablero" },
    { id: "a", type: "agente", name: "Aurora", persona: "cercana", system: "responde breve" },
    { id: "m", type: "mapa", lat: 0, lng: 0, place: "origen" },
    {
        id: "g",
        type: "grafica",
        chartType: "pie",
        data: [
            { label: "uno", value: 1 },
            { label: "dos", value: 2 },
        ],
    },
    {
        id: "ref",
        type: "referencia",
        text: "Biblioteca",
        ref: { kind: "library", id: "lib-1", label: "Mi biblioteca", route: "/library", libraryKind: "user" },
    },
    {
        id: "ent",
        type: "entidad",
        text: "Mi página",
        ref: { kind: "page", id: "mi-pagina", label: "Mi página", route: "/pagina/mi-pagina" },
    },
    { id: "pp", type: "penpot", url: "https://design.penpot.app/#/view", text: "Diseño", system: "embed" },
    { id: "v", type: "video", url: "https://x/v.mp4", text: "Clip" },
    { id: "pm", type: "protomolecula", code: '{"pm":1,"molecula":{}}' },
    { id: "rv", type: "respuesta-viva", code: "<Card>Hola</Card>" },
];

describe("serializeBlocks · bloques rich", () => {
    it("ida y vuelta de todos los tipos ricos sin perder campos", () => {
        const serializados = serializeBlocks(RICOS);
        expect(serializados).toHaveLength(RICOS.length);
        expect(parseBlocks(serializados)).toEqual(serializados);
        for (const original of RICOS) {
            const [out] = serializeBlocks([original]);
            expect(out.id).toBe(original.id);
            expect(out.type).toBe(original.type);
        }
    });

    it("los bloques legados siguen serializando su contenido", () => {
        const legados: PostBlock[] = [
            { id: "t", type: "texto", text: "Hola" },
            { id: "i", type: "imagen", url: "https://x/a.png", name: "a.png" },
            { id: "f", type: "archivo", url: "https://x/d.pdf", name: "d.pdf" },
            { id: "e", type: "enlace", url: "https://x", text: "Enlace" },
            { id: "w", type: "widget", url: "widget-id", text: "Widget" },
        ];
        expect(parseBlocks(serializeBlocks(legados))).toEqual(serializeBlocks(legados));
    });

    it("serializar dos veces es idempotente", () => {
        const unaVez = serializeBlocks(RICOS);
        expect(serializeBlocks(parseBlocks(unaVez))).toEqual(unaVez);
    });
});

describe("serializeBlock · normalización defensiva", () => {
    it("copia la referencia (no comparte el objeto) y conserva sus campos", () => {
        const ref = {
            kind: "folder" as const,
            id: "lib-1",
            label: "Carpeta",
            route: "/library",
            folderId: null,
            itemId: "item-1",
            libraryKind: "group",
            url: "https://x/archivo",
        };
        const out = serializeBlock({ id: "x", type: "entidad", text: "Carpeta", ref });
        expect(out.ref).toEqual(ref);
        expect(out.ref).not.toBe(ref);
        ref.label = "mutada";
        expect(out.ref?.label).toBe("Carpeta");
    });

    it("descarta referencias con tipo desconocido o sin id", () => {
        const tipoMalo = serializeBlock({
            id: "x",
            type: "referencia",
            ref: { kind: "inventado" as never, id: "1" },
        });
        expect(tipoMalo.ref).toBeUndefined();
        const sinId = serializeBlock({ id: "y", type: "referencia", ref: { kind: "page", id: "  " } });
        expect(sinId.ref).toBeUndefined();
    });

    it("descarta idiomas y gráficas con valores fuera del catálogo", () => {
        const codigo = serializeBlock({
            id: "c",
            type: "codigo",
            code: "x",
            language: "python" as unknown as PostBlock["language"],
        });
        expect(codigo.language).toBeUndefined();
        const grafica = serializeBlock({
            id: "g",
            type: "grafica",
            chartType: "radar" as unknown as PostBlock["chartType"],
        });
        expect(grafica.chartType).toBeUndefined();
    });

    it("limpia datos no finitos y normaliza valores numéricos", () => {
        const out = serializeBlock({
            id: "g",
            type: "grafica",
            chartType: "bar",
            data: [
                { label: "ok", value: 3 },
                { label: "nan", value: Number.NaN },
                { label: "texto", value: "7" as unknown as number },
            ],
        });
        expect(out.data).toEqual([
            { label: "ok", value: 3 },
            { label: "texto", value: 7 },
        ]);
    });

    it("no guarda campos transitorios ni coordenadas no finitas", () => {
        const vacio = serializeBlock({ id: "x", type: "codigo", code: "", uploading: true });
        expect(vacio).toEqual({ id: "x", type: "codigo" });
        const mapa = serializeBlock({ id: "m", type: "mapa", lat: 0, lng: 0 });
        expect(mapa.lat).toBe(0);
        expect(mapa.lng).toBe(0);
        const roto = serializeBlock({ id: "n", type: "mapa", lat: Number.NaN, lng: Infinity });
        expect(roto.lat).toBeUndefined();
        expect(roto.lng).toBeUndefined();
    });
});

describe("sourceRefToBlockPatch · referencias", () => {
    it("una biblioteca sin id usa su etiqueta y limpia la URL anterior", () => {
        const patch = sourceRefToBlockPatch({
            kind: "library",
            label: "Mi biblioteca",
            library: { kind: "user", id: "" },
        });
        expect(patch.ref).toEqual({
            kind: "library",
            id: "Mi biblioteca",
            libraryKind: "user",
            label: "Mi biblioteca",
            route: "/library",
        });
        expect(patch.url).toBeUndefined();
        expect(patch.name).toBeUndefined();
    });

    it("un folder sin id de biblioteca cae a su folderId", () => {
        const patch = sourceRefToBlockPatch({
            kind: "folder",
            label: "Carpeta",
            folderId: "f-1",
            library: { kind: "user", id: "" },
        });
        expect(patch.ref?.id).toBe("f-1");
        expect(patch.ref?.folderId).toBe("f-1");
    });

    it("cerebro y neurona sin id usan su etiqueta", () => {
        expect(sourceRefToBlockPatch({ kind: "brain", label: "Memoria" }).ref).toEqual({
            kind: "brain",
            id: "Memoria",
            label: "Memoria",
            route: "/cerebro",
        });
        expect(sourceRefToBlockPatch({ kind: "neuron", label: "Idea" }).ref?.id).toBe("Idea");
    });

    it("un archivo del dispositivo queda como referencia serializable", () => {
        const patch = sourceRefToBlockPatch({
            kind: "device",
            url: "https://x/a.png",
            name: "a.png",
            label: "Foto",
        });
        const out = serializeBlock({ id: "b", type: "referencia", ...patch });
        expect(out.ref).toMatchObject({ kind: "file", id: "https://x/a.png", url: "https://x/a.png" });
        expect(out.url).toBe("https://x/a.png");
    });
});
