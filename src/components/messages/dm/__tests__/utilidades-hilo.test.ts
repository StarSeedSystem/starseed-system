import { describe, expect, it } from "vitest";
import {
    agruparMensajes, buscarCoincidencias, estadoLectura, etiquetaDia, exportarChatTexto, mensajesVisibles, partirResaltado,
    resolverNombreHilo, resumenMiembros, textoEscribiendo,
} from "@/components/messages/dm/utilidades-hilo";
import type { DmMessage, DmThreadSummary } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";

const perfil = (userId: string, displayName: string, username = userId): OsProfile => ({
    userId, displayName, username, bio: "", tags: [], searchable: true, updatedAt: "2026-09-28T00:00:00.000Z",
});

const msg = (id: string, sender: string | null, createdAt: string, body = "", over: Partial<DmMessage> = {}): DmMessage => ({
    id, threadId: "h1", sender, body, attachments: [], replyTo: null, kind: "user", editedAt: null, deleted: false, createdAt, formato: null, ...over,
});

const dm = (over: Partial<DmThreadSummary> = {}): Pick<DmThreadSummary, "kind" | "memberIds" | "title" | "meta"> => ({
    kind: "dm", memberIds: ["yo", "ana"], title: null, meta: null, ...over,
});

describe("resolverNombreHilo", () => {
    const perfiles = { ana: perfil("ana", "Ana García"), luis: perfil("luis", "", "luisito") };
    it("apodo › contacto › perfil › @usuario › genérico", () => {
        expect(resolverNombreHilo({ thread: dm(), miUid: "yo", perfiles, apodo: "Hermana" })).toBe("Hermana");
        expect(resolverNombreHilo({ thread: dm(), miUid: "yo", perfiles, contacto: { nombre: "Anita", apodo: undefined } })).toBe("Anita");
        expect(resolverNombreHilo({ thread: dm(), miUid: "yo", perfiles })).toBe("Ana García");
        expect(resolverNombreHilo({ thread: dm({ memberIds: ["yo", "luis"] }), miUid: "yo", perfiles })).toBe("@luisito");
        expect(resolverNombreHilo({ thread: dm({ memberIds: ["yo", "nadie"] }), miUid: "yo", perfiles })).toBe("Conversación");
    });
    it("los grupos usan su título salvo apodo", () => {
        expect(resolverNombreHilo({ thread: dm({ kind: "group", title: "Huerta" }), miUid: "yo", perfiles })).toBe("Huerta");
        expect(resolverNombreHilo({ thread: dm({ kind: "group", title: null }), miUid: "yo", perfiles })).toBe("Grupo sin nombre");
    });
});

describe("resúmenes de grupo", () => {
    const nombre = (id: string) => ({ ana: "Ana García", luis: "Luis Pérez", eva: "Eva", mar: "Mar", sol: "Sol" }[id] ?? id);
    it("«Ana, Luis y 3 más» sin contarme", () => {
        expect(resumenMiembros(["yo", "ana", "luis", "eva", "mar", "sol"], "yo", nombre)).toBe("Ana, Luis y 3 más");
        expect(resumenMiembros(["yo", "ana", "luis"], "yo", nombre)).toBe("Ana y Luis");
        expect(resumenMiembros(["yo"], "yo", nombre)).toBe("Solo tú");
    });
    it("escribiendo en chats de dos y en grupos", () => {
        expect(textoEscribiendo(["ana"], false, nombre)).toBe("escribiendo…");
        expect(textoEscribiendo(["ana"], true, nombre)).toBe("Ana está escribiendo…");
        expect(textoEscribiendo(["ana", "luis"], true, nombre)).toBe("Ana y Luis están escribiendo…");
        expect(textoEscribiendo(["ana", "luis", "eva"], true, nombre)).toBe("3 personas están escribiendo…");
        expect(textoEscribiendo([], true, nombre)).toBeNull();
    });
});

describe("agrupación y días", () => {
    it("agrupa seguidos del mismo autor y corta por día y por pausa larga", () => {
        const xs = [
            msg("1", "ana", "2026-09-27T10:00:00"),
            msg("2", "ana", "2026-09-27T10:01:00"),
            msg("3", "yo", "2026-09-27T10:02:00"),
            msg("4", "yo", "2026-09-27T10:30:00"),
            msg("5", "yo", "2026-09-28T09:00:00"),
        ];
        const g = agruparMensajes(xs);
        expect(g.map((x) => [x.primeroDelGrupo, x.ultimoDelGrupo])).toEqual([
            [true, false],
            [false, true],
            [true, true],
            [true, true],
            [true, true],
        ]);
        expect(g.map((x) => x.nuevoDia)).toEqual([true, false, false, false, true]);
    });
    it("etiquetas de día", () => {
        const ahora = new Date("2026-09-28T12:00:00");
        expect(etiquetaDia("2026-09-28T08:00:00", ahora)).toBe("Hoy");
        expect(etiquetaDia("2026-09-27T23:00:00", ahora)).toBe("Ayer");
        expect(etiquetaDia("2026-09-21T10:00:00", ahora)).toBe("lunes 21 de septiembre");
        expect(etiquetaDia("2025-01-02T10:00:00", ahora)).toMatch(/2025/);
    });
});

describe("vaciar, buscar, leer y exportar", () => {
    const xs = [msg("1", "ana", "2026-09-20T10:00:00.000Z", "Canción de cuna"), msg("2", "yo", "2026-09-28T10:00:00.000Z", "hola")];
    it("vaciar solo oculta lo anterior y se puede mostrar todo", () => {
        expect(mensajesVisibles(xs, "2026-09-25T00:00:00.000Z", false)).toEqual({ visibles: [xs[1]], ocultos: 1 });
        expect(mensajesVisibles(xs, "2026-09-25T00:00:00.000Z", true).ocultos).toBe(0);
        expect(mensajesVisibles(xs, null, false).visibles).toHaveLength(2);
    });
    it("busca sin tildes y resalta en su sitio", () => {
        expect(buscarCoincidencias(xs, "cancion")).toEqual(["1"]);
        expect(partirResaltado("Canción de cuna", "CANCION")).toEqual([
            { texto: "Canción", coincide: true },
            { texto: " de cuna", coincide: false },
        ]);
    });
    it("marcas de lectura según las marcas remotas de los demás", () => {
        const t = { memberIds: ["yo", "ana", "luis"], meta: { readMarks: { ana: "2026-09-28T11:00:00.000Z" } } };
        expect(estadoLectura(xs[1], t, "yo")).toBe("leido-parcial");
        expect(estadoLectura(xs[1], { ...t, meta: { readMarks: { ana: "2026-09-28T11:00:00.000Z", luis: "2026-09-28T12:00:00.000Z" } } }, "yo")).toBe("leido");
        expect(estadoLectura(xs[1], { ...t, meta: null }, "yo")).toBe("enviado");
    });
    it("exporta a texto con autor y adjuntos, sin dataURL", () => {
        const conAdjunto = msg("3", "ana", "2026-09-28T10:05:00.000Z", "", {
            attachments: [{ kind: "image", name: "foto.png", url: "data:image/png;base64,AAA" }, { kind: "file", name: "acta.pdf", url: "https://x.test/acta.pdf" }],
        });
        const txt = exportarChatTexto("Ana", [...xs, conAdjunto], (m) => (m.sender === "yo" ? "Tú" : "Ana"));
        expect(txt).toContain("Chat: Ana");
        expect(txt).toContain("Ana: Canción de cuna");
        expect(txt).toContain("Tú: hola");
        expect(txt).toContain("[adjunto: foto.png]");
        expect(txt).not.toContain("base64");
        expect(txt).toContain("[adjunto: acta.pdf] https://x.test/acta.pdf");
    });
});
