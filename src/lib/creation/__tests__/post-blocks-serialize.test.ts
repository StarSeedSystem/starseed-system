import { describe, expect, it } from "vitest";
import {
    serializeBlock,
    serializeBlocks,
    parseBlocks,
    newBlockId,
    type PostBlock,
    type PostBlockType,
    RICH_BLOCK_TYPES,
} from "@/lib/creation/post-blocks";
import { normalizarMarco } from "@/lib/profile/marco-foto";

describe("serializeBlock - bloques rich", () => {
    const baseBlock = (type: PostBlockType): PostBlock => ({
        id: newBlockId(),
        type,
    });

    it("serializa portada con url, name, text y marco", () => {
        const block = baseBlock("portada");
        block.url = "https://example.com/portada.jpg";
        block.name = "portada.jpg";
        block.text = "Título portada";
        block.marco = { forma: "circulo", zoom: 1.2, x: 0.1, y: 0.2 } as any;

        const out = serializeBlock(block);
        const expectedMarco = normalizarMarco(block.marco);

        expect(out.id).toBe(block.id);
        expect(out.type).toBe("portada");
        expect(out.url).toBe(block.url);
        expect(out.name).toBe(block.name);
        expect(out.text).toBe(block.text);
        expect(out.marco).toEqual(expectedMarco);
    });

    it("serializa codigo con code y language", () => {
        const block = baseBlock("codigo");
        block.code = "console.log('hola')";
        block.language = "js";

        const out = serializeBlock(block);

        expect(out.type).toBe("codigo");
        expect(out.code).toBe(block.code);
        expect(out.language).toBe("js");
    });

    it("serializa pagina con code y language", () => {
        const block = baseBlock("pagina");
        block.code = "<h1>Hola</h1>";
        block.language = "html";

        const out = serializeBlock(block);

        expect(out.type).toBe("pagina");
        expect(out.code).toBe(block.code);
        expect(out.language).toBe("html");
    });

    it("serializa repo con url y text", () => {
        const block = baseBlock("repo");
        block.url = "https://github.com/user/repo";
        block.text = "Mi Repo";

        const out = serializeBlock(block);

        expect(out.type).toBe("repo");
        expect(out.url).toBe(block.url);
        expect(out.text).toBe(block.text);
    });

    it("serializa pizarra con url y text", () => {
        const block = baseBlock("pizarra");
        block.url = "https://miro.com/board/123";
        block.text = "Mi pizarra";

        const out = serializeBlock(block);

        expect(out.type).toBe("pizarra");
        expect(out.url).toBe(block.url);
        expect(out.text).toBe(block.text);
    });

    it("serializa agente con name, persona y system", () => {
        const block = baseBlock("agente");
        block.name = "Asistente";
        block.persona = "amable";
        block.system = "Eres un asistente útil";

        const out = serializeBlock(block);

        expect(out.type).toBe("agente");
        expect(out.name).toBe(block.name);
        expect(out.persona).toBe(block.persona);
        expect(out.system).toBe(block.system);
    });

    it("serializa mapa con lat, lng y place", () => {
        const block = baseBlock("mapa");
        block.lat = 40.4168;
        block.lng = -3.7038;
        block.place = "Madrid";

        const out = serializeBlock(block);

        expect(out.type).toBe("mapa");
        expect(out.lat).toBe(40.4168);
        expect(out.lng).toBe(-3.7038);
        expect(out.place).toBe("Madrid");
    });

    it("serializa grafica con chartType y data", () => {
        const block = baseBlock("grafica");
        block.chartType = "bar";
        block.data = [
            { label: "A", value: 10 },
            { label: "B", value: 20 },
        ];

        const out = serializeBlock(block);

        expect(out.type).toBe("grafica");
        expect(out.chartType).toBe("bar");
        expect(out.data).toEqual(block.data);
    });

    it("serializa referencia con ref completo", () => {
        const block = baseBlock("referencia");
        block.ref = {
            kind: "brain",
            id: "brain-123",
            label: "Mi Cerebro",
            route: "/cerebro/brain-123",
        };

        const out = serializeBlock(block);

        expect(out.type).toBe("referencia");
        expect(out.ref).toEqual(block.ref);
    });

    it("serializa entidad con ref (page/profile/group/community/event)", () => {
        const block = baseBlock("entidad");
        block.ref = {
            kind: "profile",
            id: "usuario123",
            label: "Usuario Demo",
            route: "/profile/usuario123",
        };

        const out = serializeBlock(block);

        expect(out.type).toBe("entidad");
        expect(out.ref).toEqual(block.ref);
    });

    it("serializa penpot con url, text y system", () => {
        const block = baseBlock("penpot");
        block.url = "https://design.penpot.app/proto/123";
        block.text = "Diseño Penpot";
        block.system = "embed";

        const out = serializeBlock(block);

        expect(out.type).toBe("penpot");
        expect(out.url).toBe(block.url);
        expect(out.text).toBe(block.text);
        expect(out.system).toBe("embed");
    });

    it("serializa video con url, text y marco", () => {
        const block = baseBlock("video");
        block.url = "https://example.com/video.mp4";
        block.text = "Mi vídeo";
        block.marco = { forma: "estrella", zoom: 1, x: 0, y: 0 } as any;

        const out = serializeBlock(block);
        const expectedMarco = normalizarMarco(block.marco);

        expect(out.type).toBe("video");
        expect(out.url).toBe(block.url);
        expect(out.text).toBe(block.text);
        expect(out.marco).toEqual(expectedMarco);
    });

    it("serializa protomolecula con code (JSON serializado)", () => {
        const block = baseBlock("protomolecula");
        const moleculaJson = JSON.stringify({
            pm: 1,
            molecula: { id: "mol-1", titulo: "Test", ambito: "publico", capas: [], atomos: [], valores: {}, version: 1, creadaEn: Date.now(), actualizadaEn: Date.now() },
        });
        block.code = moleculaJson;

        const out = serializeBlock(block);

        expect(out.type).toBe("protomolecula");
        expect(out.code).toBe(moleculaJson);
    });

    it("serializa respuesta-viva con code (OpenUI Lang)", () => {
        const block = baseBlock("respuesta-viva");
        block.code = "<openui><button>Click</button></openui>";

        const out = serializeBlock(block);

        expect(out.type).toBe("respuesta-viva");
        expect(out.code).toBe(block.code);
    });

    it("no incluye campos vacíos/undefined en la salida", () => {
        const block = baseBlock("codigo");
        block.code = "";
        block.language = "js";

        const out = serializeBlock(block);

        expect(out.code).toBeUndefined();
        expect(out.language).toBe("js");
    });

    it("filtra datos de gráfica con valores no finitos", () => {
        const block = baseBlock("grafica");
        block.chartType = "line";
        block.data = [
            { label: "A", value: 10 },
            { label: "B", value: NaN },
            { label: "C", value: Infinity },
            { label: "D", value: 20 },
        ];

        const out = serializeBlock(block);

        expect(out.data).toHaveLength(2);
        expect(out.data?.[0].value).toBe(10);
        expect(out.data?.[1].value).toBe(20);
    });
});

describe("serializeBlocks - lista de bloques", () => {
    it("serializa array vacío", () => {
        expect(serializeBlocks([])).toEqual([]);
    });

    it("serializa múltiples bloques de tipos distintos", () => {
        const blocks: PostBlock[] = [
            { id: "b1", type: "texto", text: "Hola" },
            { id: "b2", type: "codigo", code: "x", language: "js" },
            { id: "b3", type: "protomolecula", code: '{"pm":1}' },
            { id: "b4", type: "referencia", ref: { kind: "url", id: "u1", label: "Link" } },
            { id: "b5", type: "entidad", ref: { kind: "profile", id: "p1", label: "Perfil" } },
        ];

        const out = serializeBlocks(blocks);

        expect(out).toHaveLength(5);
        expect(out[0].type).toBe("texto");
        expect(out[1].type).toBe("codigo");
        expect(out[2].type).toBe("protomolecula");
        expect(out[3].type).toBe("referencia");
        expect(out[4].type).toBe("entidad");
        expect(out[2].code).toBe('{"pm":1}');
        expect(out[3].ref).toEqual({ kind: "url", id: "u1", label: "Link" });
        expect(out[4].ref).toEqual({ kind: "profile", id: "p1", label: "Perfil" });
    });
});

describe("parseBlocks - roundtrip con serializeBlocks", () => {
    it("hace roundtrip correcto para todos los tipos RICH_BLOCK_TYPES", () => {
        const originalBlocks: PostBlock[] = [
            { id: "b1", type: "portada", url: "u", name: "n", text: "t", marco: { forma: "circulo", zoom: 1, x: 0, y: 0 } as any },
            { id: "b2", type: "codigo", code: "code", language: "js" },
            { id: "b3", type: "pagina", code: "code", language: "html" },
            { id: "b4", type: "repo", url: "u", text: "t" },
            { id: "b5", type: "pizarra", url: "u", text: "t" },
            { id: "b6", type: "agente", name: "n", persona: "p", system: "s" },
            { id: "b7", type: "mapa", lat: 1, lng: 2, place: "p" },
            { id: "b8", type: "grafica", chartType: "bar", data: [{ label: "x", value: 1 }] },
            { id: "b9", type: "referencia", ref: { kind: "brain", id: "id", label: "l", route: "/r" } },
            { id: "b10", type: "entidad", ref: { kind: "profile", id: "id", label: "l", route: "/r" } },
            { id: "b11", type: "penpot", url: "u", text: "t", system: "embed" },
            { id: "b12", type: "video", url: "u", text: "t", marco: { forma: "circulo", zoom: 1, x: 0, y: 0 } as any },
            { id: "b13", type: "protomolecula", code: '{"pm":1,"molecula":{}}' },
            { id: "b14", type: "respuesta-viva", code: "<openui/>" },
        ];

        const serialized = serializeBlocks(originalBlocks);
        const parsed = parseBlocks(serialized);

        expect(parsed).toHaveLength(originalBlocks.length);
        for (let i = 0; i < originalBlocks.length; i++) {
            expect(parsed[i].id).toBe(originalBlocks[i].id);
            expect(parsed[i].type).toBe(originalBlocks[i].type);
            // Comparar campos clave por tipo
            const orig = originalBlocks[i];
            const p = parsed[i];
            if (orig.text) expect(p.text).toBe(orig.text);
            if (orig.url) expect(p.url).toBe(orig.url);
            if (orig.name) expect(p.name).toBe(orig.name);
            if (orig.code) expect(p.code).toBe(orig.code);
            if (orig.language) expect(p.language).toBe(orig.language);
            if (orig.lat) expect(p.lat).toBe(orig.lat);
            if (orig.lng) expect(p.lng).toBe(orig.lng);
            if (orig.place) expect(p.place).toBe(orig.place);
            if (orig.chartType) expect(p.chartType).toBe(orig.chartType);
            if (orig.data) expect(p.data).toEqual(orig.data);
            if (orig.system) expect(p.system).toBe(orig.system);
            if (orig.persona) expect(p.persona).toBe(orig.persona);
            if (orig.ref) expect(p.ref).toEqual(orig.ref);
            if (orig.marco) expect(p.marco).toEqual(normalizarMarco(orig.marco));
        }
    });

    it("acepta cualquier string como tipo en parseBlocks (compatibilidad forward)", () => {
        const raw = [
            { id: "b1", type: "texto", text: "ok" },
            { id: "b2", type: "tipo-inexistente", text: "no-ignorado" },
            { id: "b3", type: "codigo", code: "x" },
        ];
        const parsed = parseBlocks(raw);
        // parseBlocks no filtra por tipos válidos, acepta cualquier string no vacío
        expect(parsed).toHaveLength(3);
        expect(parsed.map((b) => b.type)).toEqual(["texto", "tipo-inexistente", "codigo"]);
    });
});

describe("RICH_BLOCK_TYPES contiene todos los tipos esperados", () => {
    const expectedRichTypes: PostBlockType[] = [
        "portada",
        "codigo",
        "pagina",
        "repo",
        "pizarra",
        "agente",
        "mapa",
        "grafica",
        "referencia",
        "entidad",
        "penpot",
        "video",
        "protomolecula",
        "respuesta-viva",
    ];

    it("incluye todos los tipos rich definidos", () => {
        for (const t of expectedRichTypes) {
            expect(RICH_BLOCK_TYPES).toContain(t);
        }
    });

    it("no incluye tipos legacy", () => {
        for (const t of ["texto", "imagen", "archivo", "enlace", "widget"] as const) {
            expect(RICH_BLOCK_TYPES).not.toContain(t);
        }
    });
});