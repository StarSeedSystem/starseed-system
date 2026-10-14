import { describe, it, expect } from "vitest";
import {
    serializarBloque, leerBloque, avisosDePublicacion, esMoleculaValidaNucleo, MAX_BLOQUE_BYTES,
} from "../bloque-protomolecula";
import { isRichBlock, parseBlocks, serializeBlock } from "@/lib/creation/post-blocks";
import type { Ambito, Capa, Molecula } from "../tipos";

function moleculaDePrueba(): Molecula {
    return {
        id: "mol-1", titulo: "Molécula de prueba", ambito: "personal",
        capas: [], atomos: [], valores: {}, version: 1, creadaEn: 1000, actualizadaEn: 1000,
    };
}
function capaConReferencia(): Capa {
    return {
        id: "capa-1", tipo: "lienzo2d", titulo: "Capa de prueba", formato: "svg",
        referencia: { tipo: "page", id: "page-1" }, orden: 0, visible: true, bloqueada: false,
    };
}

describe("serializarBloque", () => {
    it("serializa una molécula válida con sobre versionado", () => {
        const m = moleculaDePrueba();
        const r = serializarBloque(m);
        expect(r.ok).toBe(true);
        if (r.ok) expect(JSON.parse(r.valor)).toEqual({ pm: 1, molecula: m });
    });
    it("rechaza una molécula inválida (también ámbitos de la forma antigua)", () => {
        expect(serializarBloque({} as unknown as Molecula)).toEqual({ ok: false, motivo: "molécula inválida" });
        const vieja = { ...moleculaDePrueba(), ambito: "publico" as unknown as Ambito };
        expect(serializarBloque(vieja).ok).toBe(false);
    });
    it("rechaza cuando el texto supera el tope", () => {
        const m = moleculaDePrueba();
        m.valores = { grande: "x".repeat(MAX_BLOQUE_BYTES) };
        const r = serializarBloque(m);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("tamaño excedido");
    });
});

describe("leerBloque", () => {
    it("ida y vuelta: lee lo serializado", () => {
        const m = moleculaDePrueba();
        m.capas = [capaConReferencia()];
        const s = serializarBloque(m);
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        expect(leerBloque(s.valor)).toEqual({ ok: true, valor: m });
    });
    it("rechaza JSON basura sin lanzar", () => {
        expect(leerBloque("{ no es JSON")).toEqual({ ok: false, motivo: "JSON no válido" });
    });
    it("rechaza estructuras que no son el sobre", () => {
        expect(leerBloque('["arreglo"]')).toEqual({ ok: false, motivo: "estructura no esperada" });
    });
    it("rechaza una versión desconocida", () => {
        expect(leerBloque('{"pm": 2, "molecula": {}}')).toEqual({ ok: false, motivo: "versión no soportada: 2" });
        expect(leerBloque('{"molecula": {}}')).toEqual({ ok: false, motivo: "versión no soportada: undefined" });
    });
    it("rechaza una molécula inválida dentro del sobre", () => {
        expect(leerBloque('{"pm": 1, "molecula": {}}')).toEqual({ ok: false, motivo: "molécula inválida" });
    });
});

describe("esMoleculaValidaNucleo", () => {
    it("acepta el vacío válido y rechaza piezas rotas", () => {
        expect(esMoleculaValidaNucleo(moleculaDePrueba())).toBe(true);
        const m = moleculaDePrueba();
        const sinEstado = { ...m, atomos: [{ id: "a", herramientaId: "pincel" }] };
        expect(esMoleculaValidaNucleo(sinEstado)).toBe(false);
    });
});

describe("bloque protomolecula en post-blocks", () => {
    it("el tipo nuevo es rico y sobrevive al formateo de ss:meta", () => {
        expect(isRichBlock("protomolecula")).toBe(true);
        const m = moleculaDePrueba();
        const s = serializarBloque(m);
        if (!s.ok) throw new Error("no serializó");
        const limpio = serializeBlock({ id: "b1", type: "protomolecula", code: s.valor, uploading: true });
        expect(limpio).toEqual({ id: "b1", type: "protomolecula", code: s.valor });
        const [vuelta] = parseBlocks([limpio]);
        expect(vuelta).toEqual(limpio);
        const leida = leerBloque(vuelta.code || "");
        expect(leida).toEqual({ ok: true, valor: m });
    });
    it("un cliente viejo ignora el bloque sin romperse (degrada como penpot/video)", () => {
        const misterioso = { id: "b2", type: "tipo-del-futuro", code: "{}" };
        expect(() => parseBlocks([misterioso])).not.toThrow();
        expect(isRichBlock("tipo-del-futuro")).toBe(false);
    });
});

describe("avisosDePublicacion", () => {
    const siemprePersonal = (_tipo: string, _id: string): Ambito => "personal";
    it("avisa cuando la molécula es más reservada que la publicación", () => {
        const m = { ...moleculaDePrueba(), ambito: "perfil" as Ambito };
        const avisos = avisosDePublicacion(m, "publica", siemprePersonal);
        expect(avisos[0]).toContain("La molécula es más reservada (perfil) que la publicación (publica).");
    });
    it("avisa de capas que citan entidades más reservadas y de la instantánea", () => {
        const m = moleculaDePrueba();
        m.capas = [capaConReferencia()];
        const avisos = avisosDePublicacion(m, "grupo", siemprePersonal);
        expect(avisos).toContain('La capa "Capa de prueba" cita una entidad más reservada (personal) que la publicación (grupo).');
        expect(avisos).toContain("El bloque es una instantánea: quien lo vea tendrá una copia, no la original.");
    });
    it("no avisa cuando todo comparte el ámbito de la publicación", () => {
        const m = { ...moleculaDePrueba(), ambito: "grupo" as Ambito };
        expect(avisosDePublicacion(m, "grupo", (): Ambito => "grupo")).toEqual([]);
    });
    it("una entidad personal citada en un post público salta dos veces el aviso de ámbito", () => {
        const m = { ...moleculaDePrueba(), ambito: "personal" as Ambito };
        m.capas = [capaConReferencia()];
        const avisos = avisosDePublicacion(m, "publica", siemprePersonal);
        expect(avisos.some((a) => a.includes("más reservada (personal) que la publicación (publica)"))).toBe(true);
        expect(avisos.some((a) => a.startsWith('La capa "Capa de prueba"'))).toBe(true);
    });
});
