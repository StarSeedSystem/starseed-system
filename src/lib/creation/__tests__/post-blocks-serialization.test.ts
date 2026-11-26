import { describe, it, expect } from "vitest";
import {
    serializeBlock,
    serializeBlocks,
    parseBlocks,
    newBlockId,
    type PostBlock,
    type PostBlockType,
    type PostBlockRef,
    type ChartDatum,
    RICH_BLOCK_TYPES,
} from "../post-blocks";

describe("post-blocks serialization", () => {
    const makeBlock = (type: PostBlockType, overrides: Partial<PostBlock> = {}): PostBlock => ({
        id: newBlockId(),
        type,
        ...overrides,
    });

    describe("serializeBlock", () => {
        it("preserves id and type for all rich block types", () => {
            for (const type of RICH_BLOCK_TYPES) {
                const block = makeBlock(type);
                const serialized = serializeBlock(block);
                expect(serialized.id).toBe(block.id);
                expect(serialized.type).toBe(type);
            }
        });

        it("serializes protomolecula block with code field", () => {
            const code = '{"pm":1,"molecula":{"id":"test","titulo":"Test","ambito":"publica","capas":[],"atomos":[],"valores":{},"version":1,"creadaEn":1,"actualizadaEn":1}}';
            const block = makeBlock("protomolecula", { code });
            const serialized = serializeBlock(block);
            expect(serialized.code).toBe(code);
        });

        it("serializes referencia block with ref object", () => {
            const ref: PostBlockRef = {
                kind: "brain",
                id: "brain-123",
                label: "Mi Cerebro",
                route: "/cerebro/brain-123",
            };
            const block = makeBlock("referencia", { ref, text: "Mi Cerebro" });
            const serialized = serializeBlock(block);
            expect(serialized.ref).toEqual(ref);
            expect(serialized.text).toBe("Mi Cerebro");
        });

        it("serializes entidad block with ref object", () => {
            const ref: PostBlockRef = {
                kind: "page",
                id: "mi-pagina",
                label: "Mi Página",
                route: "/pagina/mi-pagina",
            };
            const block = makeBlock("entidad", { ref, text: "Mi Página" });
            const serialized = serializeBlock(block);
            expect(serialized.ref).toEqual(ref);
            expect(serialized.text).toBe("Mi Página");
        });

        it("serializes portada block with url, name, text, and marco", () => {
            const marco = { forma: "circulo" as const, escala: 1, x: 0, y: 0 };
            const block = makeBlock("portada", {
                url: "https://example.com/portada.jpg",
                name: "portada.jpg",
                text: "Título de portada",
                marco,
            });
            const serialized = serializeBlock(block);
            expect(serialized.url).toBe("https://example.com/portada.jpg");
            expect(serialized.name).toBe("portada.jpg");
            expect(serialized.text).toBe("Título de portada");
            expect(serialized.marco).toEqual({
                forma: "circulo",
                x: 0,
                y: 0,
                escala: 1,
                borde: 2,
                colorBorde: undefined,
                rotacion: 0,
            });
        });

        it("serializes codigo block with code and language", () => {
            const block = makeBlock("codigo", {
                code: "console.log('hola')",
                language: "js",
            });
            const serialized = serializeBlock(block);
            expect(serialized.code).toBe("console.log('hola')");
            expect(serialized.language).toBe("js");
        });

        it("serializes pagina block with code and language", () => {
            const block = makeBlock("pagina", {
                code: "<h1>Hola</h1>",
                language: "html",
            });
            const serialized = serializeBlock(block);
            expect(serialized.code).toBe("<h1>Hola</h1>");
            expect(serialized.language).toBe("html");
        });

        it("serializes repo block with url and text", () => {
            const block = makeBlock("repo", {
                url: "https://github.com/user/repo",
                text: "Mi Repo",
            });
            const serialized = serializeBlock(block);
            expect(serialized.url).toBe("https://github.com/user/repo");
            expect(serialized.text).toBe("Mi Repo");
        });

        it("serializes pizarra block with url and text", () => {
            const block = makeBlock("pizarra", {
                url: "https://miro.com/pizarra",
                text: "Mi Pizarra",
            });
            const serialized = serializeBlock(block);
            expect(serialized.url).toBe("https://miro.com/pizarra");
            expect(serialized.text).toBe("Mi Pizarra");
        });

        it("serializes agente block with name, persona, system", () => {
            const block = makeBlock("agente", {
                name: "Asistente",
                persona: "amable",
                system: "Eres un asistente útil.",
            });
            const serialized = serializeBlock(block);
            expect(serialized.name).toBe("Asistente");
            expect(serialized.persona).toBe("amable");
            expect(serialized.system).toBe("Eres un asistente útil.");
        });

        it("serializes mapa block with lat, lng, place", () => {
            const block = makeBlock("mapa", {
                lat: 40.4168,
                lng: -3.7038,
                place: "Madrid",
            });
            const serialized = serializeBlock(block);
            expect(serialized.lat).toBe(40.4168);
            expect(serialized.lng).toBe(-3.7038);
            expect(serialized.place).toBe("Madrid");
        });

        it("serializes grafica block with chartType and data", () => {
            const data: ChartDatum[] = [
                { label: "A", value: 10 },
                { label: "B", value: 20 },
            ];
            const block = makeBlock("grafica", {
                chartType: "bar",
                data,
            });
            const serialized = serializeBlock(block);
            expect(serialized.chartType).toBe("bar");
            expect(serialized.data).toEqual(data);
        });

        it("serializes penpot block with url, text, system", () => {
            const block = makeBlock("penpot", {
                url: "https://design.penpot.app/share/abc",
                text: "Mi Diseño",
                system: "embed",
            });
            const serialized = serializeBlock(block);
            expect(serialized.url).toBe("https://design.penpot.app/share/abc");
            expect(serialized.text).toBe("Mi Diseño");
            expect(serialized.system).toBe("embed");
        });

        it("serializes video block with url, text, marco", () => {
            const marco = { forma: "hexagono" as const, escala: 1.2, x: 0.1, y: -0.1 };
            const block = makeBlock("video", {
                url: "https://example.com/video.mp4",
                text: "Mi Video",
                marco,
            });
            const serialized = serializeBlock(block);
            expect(serialized.url).toBe("https://example.com/video.mp4");
            expect(serialized.text).toBe("Mi Video");
            expect(serialized.marco).toEqual({
                forma: "hexagono",
                x: 0.1,
                y: -0.1,
                escala: 1.2,
                borde: 2,
                colorBorde: undefined,
                rotacion: 0,
            });
        });

        it("serializes respuesta-viva block with code", () => {
            const code = "# Respuesta Viva\n\n<boton>Hola</boton>";
            const block = makeBlock("respuesta-viva", { code });
            const serialized = serializeBlock(block);
            expect(serialized.code).toBe(code);
        });

        it("omits undefined, null, and empty string fields", () => {
            const block = makeBlock("codigo", {
                code: "console.log('test')",
                language: "js",
                text: "",
                url: undefined,
                name: null,
            });
            const serialized = serializeBlock(block);
            expect(serialized.code).toBe("console.log('test')");
            expect(serialized.language).toBe("js");
            expect("text" in serialized).toBe(false);
            expect("url" in serialized).toBe(false);
            expect("name" in serialized).toBe(false);
        });

        it("omits ref when kind or id is missing", () => {
            const block = makeBlock("referencia", {
                ref: { kind: "brain", id: "", label: "Incompleto" },
                text: "Incompleto",
            });
            const serialized = serializeBlock(block);
            expect("ref" in serialized).toBe(false);
        });

        it("filters out invalid chart data points", () => {
            const data: ChartDatum[] = [
                { label: "A", value: 10 },
                { label: "B", value: NaN },
                { label: "", value: 20 },
                { label: "C", value: Infinity },
            ];
            const block = makeBlock("grafica", { chartType: "line", data });
            const serialized = serializeBlock(block);
            expect(serialized.data).toHaveLength(2);
            expect(serialized.data?.[0]).toEqual({ label: "A", value: 10 });
            expect(serialized.data?.[1]).toEqual({ label: "", value: 20 });
        });

        it("omits empty data array", () => {
            const block = makeBlock("grafica", { chartType: "bar", data: [] });
            const serialized = serializeBlock(block);
            expect("data" in serialized).toBe(false);
        });
    });

    describe("serializeBlocks", () => {
        it("serializes an array of mixed rich blocks", () => {
            const blocks: PostBlock[] = [
                makeBlock("protomolecula", { code: '{"pm":1,"molecula":{}}' }),
                makeBlock("referencia", { ref: { kind: "brain", id: "b1", label: "B" }, text: "B" }),
                makeBlock("entidad", { ref: { kind: "page", id: "p1", label: "P" }, text: "P" }),
                makeBlock("portada", { url: "https://x.com/img.jpg", text: "Portada" }),
                makeBlock("codigo", { code: "1+1", language: "js" }),
            ];
            const serialized = serializeBlocks(blocks);
            expect(serialized).toHaveLength(5);
            expect(serialized[0].type).toBe("protomolecula");
            expect(serialized[1].type).toBe("referencia");
            expect(serialized[2].type).toBe("entidad");
            expect(serialized[3].type).toBe("portada");
            expect(serialized[4].type).toBe("codigo");
        });

        it("handles empty array", () => {
            expect(serializeBlocks([])).toEqual([]);
        });

        it("handles null/undefined input", () => {
            expect(serializeBlocks(null as any)).toEqual([]);
            expect(serializeBlocks(undefined as any)).toEqual([]);
        });
    });

    describe("parseBlocks round-trip", () => {
        it("parses serialized protomolecula block correctly", () => {
            const code = '{"pm":1,"molecula":{"id":"test","titulo":"Test","ambito":"publica","capas":[],"atomos":[],"valores":{},"version":1,"creadaEn":1,"actualizadaEn":1}}';
            const original = makeBlock("protomolecula", { code });
            const serialized = serializeBlock(original);
            const parsed = parseBlocks([serialized]);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].type).toBe("protomolecula");
            expect(parsed[0].code).toBe(code);
        });

        it("parses serialized referencia block correctly", () => {
            const ref: PostBlockRef = { kind: "library", id: "lib-1", label: "Lib", route: "/library", libraryKind: "user" };
            const original = makeBlock("referencia", { ref, text: "Lib" });
            const serialized = serializeBlock(original);
            const parsed = parseBlocks([serialized]);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].type).toBe("referencia");
            expect(parsed[0].ref).toEqual(ref);
            expect(parsed[0].text).toBe("Lib");
        });

        it("parses serialized entidad block correctly", () => {
            const ref: PostBlockRef = { kind: "group", id: "grp-1", label: "Grupo", route: "/grupo/grp-1" };
            const original = makeBlock("entidad", { ref, text: "Grupo" });
            const serialized = serializeBlock(original);
            const parsed = parseBlocks([serialized]);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].type).toBe("entidad");
            expect(parsed[0].ref).toEqual(ref);
            expect(parsed[0].text).toBe("Grupo");
        });

        it("parses all rich block types in a single array", () => {
            const blocks: PostBlock[] = [
                makeBlock("protomolecula", { code: '{"pm":1,"molecula":{}}' }),
                makeBlock("referencia", { ref: { kind: "brain", id: "b1", label: "B" }, text: "B" }),
                makeBlock("entidad", { ref: { kind: "page", id: "p1", label: "P" }, text: "P" }),
                makeBlock("portada", { url: "https://x.com/img.jpg", text: "Portada" }),
                makeBlock("codigo", { code: "1+1", language: "js" }),
                makeBlock("pagina", { code: "<h1>Hi</h1>", language: "html" }),
                makeBlock("repo", { url: "https://github.com/x/y", text: "Repo" }),
                makeBlock("pizarra", { url: "https://miro.com/z", text: "Pizarra" }),
                makeBlock("agente", { name: "A", persona: "p", system: "s" }),
                makeBlock("mapa", { lat: 1, lng: 2, place: "Aquí" }),
                makeBlock("grafica", { chartType: "pie", data: [{ label: "X", value: 5 }] }),
                makeBlock("penpot", { url: "https://penpot.app/x", text: "Penpot", system: "card" }),
                makeBlock("video", { url: "https://x.com/v.mp4", text: "Video" }),
                makeBlock("respuesta-viva", { code: "<boton/>" }),
            ];
            const serialized = serializeBlocks(blocks);
            const parsed = parseBlocks(serialized);
            expect(parsed).toHaveLength(14);
            for (let i = 0; i < blocks.length; i++) {
                expect(parsed[i].type).toBe(blocks[i].type);
                expect(parsed[i].id).toBe(blocks[i].id);
            }
        });
    });
});