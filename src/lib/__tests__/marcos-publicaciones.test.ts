// Adenda 219 · Marcos de forma en publicaciones: el marco viaja en ss:meta
// (bloque rico `marco` + mapa `marcos` por URL) y el parser del feed lo devuelve
// normalizado para que PostCard y el renderer lo pinten.
import { describe, expect, it } from "vitest";
import { splitBodyAttachments } from "@/lib/social-posts";
import { parseBlocks, serializeBlock } from "@/lib/creation/post-blocks";
import { buildSsMetaComment, parseSsMeta } from "@/components/creation/creation-config";
import { clipPathDe, normalizarMarco } from "@/lib/profile/marco-foto";

const URL = "http://localhost:9002/starseed-symbol-square.png";

describe("marcos de forma en publicaciones (Adenda 219)", () => {
    it("serializa y parsea el marco de un bloque rico", () => {
        const s = serializeBlock({ id: "b1", type: "portada", url: URL, marco: { forma: "corazon", x: 3, y: -4, escala: 1.4, borde: 3 } });
        expect(s.marco?.forma).toBe("corazon");
        const [p] = parseBlocks([s]);
        expect(p.marco).toEqual(normalizarMarco({ forma: "corazon", x: 3, y: -4, escala: 1.4, borde: 3 }));
    });

    it("el feed recupera marcos por URL y en el bloque", () => {
        const meta = buildSsMetaComment({
            area: "cultura",
            tipo: "general",
            blocks: [{ id: "b1", type: "portada", url: URL, marco: normalizarMarco({ forma: "estrella" }) }],
            marcos: { [URL]: normalizarMarco({ forma: "estrella", escala: 1.3 }) },
        });
        const r = splitBodyAttachments(`Título\n\n${meta}`);
        expect(r.body).toBe("Título");
        expect(r.marcos[URL].forma).toBe("estrella");
        expect(r.marcos[URL].escala).toBe(1.3);
        expect(r.blocks[0].marco?.forma).toBe("estrella");
        expect(parseSsMeta(meta)?.marcos?.[URL].forma).toBe("estrella");
    });

    it("un marco corrupto cae al círculo y las formas tienen clip-path", () => {
        const m = normalizarMarco({ forma: "triangulo", escala: 99, borde: -2 });
        expect(m.forma).toBe("circulo");
        expect(m.escala).toBe(3);
        expect(m.borde).toBe(0);
        for (const f of ["circulo", "estrella", "hexagono", "corazon", "gota", "heptagono"] as const) {
            expect(clipPathDe(f).length).toBeGreaterThan(8);
        }
    });

    it("sin marcos, el parser no inventa nada", () => {
        const r = splitBodyAttachments("Hola\n\n<!--ss:meta {\"area\":\"perfil\"}-->");
        expect(r.marcos).toEqual({});
    });
});
