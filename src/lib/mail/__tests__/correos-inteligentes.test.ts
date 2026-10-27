import { describe, it, expect } from "vitest";
import { R, R0, validarRegla, aplicarReglas, M, clasificarHilo, resumenSeguimiento } from "../rules";

const base: Record<string, unknown> = {
    etiqueta: "",
    dominio: "",
    tieneAdjunto: false,
    de: "",
    fecha: "",
};

describe("validarRegla", () => {
    it("valida", () => expect(validarRegla(R("etiquetar", { etiqueta: "t" }, "p"))).toBe(true));

    it("sin parametro", () => expect(validarRegla(R("destacar", { de: "a" }))).toBe(true));

    it("campo extra regla", () => expect(validarRegla({ ...R0("etiquetar"), extra: 1 } as unknown)).toBe(false));

    it("campo extra cuando", () => expect(validarRegla({ ...R0("etiquetar"), cuando: { extra: 1 } } as unknown)).toBe(false));

    it("texto largo", () => expect(validarRegla({ ...R0("etiquetar"), texto: "x".repeat(201) } as unknown as Regla)).toBe(false));

    it("param largo", () => expect(validarRegla({ ...R0("etiquetar"), parametro: "x".repeat(101) } as unknown as Regla)).toBe(false));

    it("id vacio", () => expect(validarRegla({ ...R0("etiquetar"), id: "" } as unknown as Regla)).toBe(false));

    it("antiguedad negativa", () => expect(validarRegla({ ...R0("etiquetar"), cuando: { antiguedadHorasMin: -1 } } as unknown as Regla)).toBe(false));

    it("tieneAdjunto no bool", () => expect(validarRegla({ ...R0("etiquetar"), cuando: { tieneAdjunto: "sí" } } as unknown)).toBe(false));

    it("null/undef/empty", () => { expect(validarRegla(null)).toBe(false); expect(validarRegla({})).toBe(false); });
});

describe("aplicarReglas", () => {
    it("coincide", () => { const a = aplicarReglas([R("etiquetar", { etiqueta: "t" }, "p")], base); expect(a).toEqual([{ reglaId: expect.any(String), tipo: "etiquetar", parametro: "p" }]); });

    it("no coincide", () => expect(aplicarReglas([R("mover", { tieneAdjunto: true })], base)).toHaveLength(0));

    it("m multiples en orden", () => { const h = { ...base, tieneAdjunto: true }; const a = aplicarReglas([R("etiquetar", { etiqueta: "t" }), R("mover", { tieneAdjunto: true }), R("destacar", { de: "ana" })], h); expect(a.map(x => x.tipo)).toEqual(["etiquetar", "mover", "destacar"]); });

    it("no duplica accion+param", () => { const a = aplicarReglas([R("etiquetar", { etiqueta: "t" }, "p"), R("etiquetar", { etiqueta: "t" }, "p")], base); expect(a).toHaveLength(1); });

    it("distinto param permite", () => { const a = aplicarReglas([R("etiquetar", { etiqueta: "t" }, "a"), R("etiquetar", { etiqueta: "t" }, "b")], base); expect(a).toHaveLength(2); });

    it("filtra invalidas", () => { const a = aplicarReglas([{ ...R0("etiquetar"), hacer: "enviar" } as unknown as Regla, R("etiquetar", { etiqueta: "t" })], base); expect(a).toHaveLength(1); });

    it("por dominio", () => expect(aplicarReglas([R("sugerir-borrador", { dominio: "i.com" })], { ...base, dominio: "i.com" })[0].tipo).toBe("sugerir-borrador"));

    it("por antiguedad", () => { const h = { ...base, fecha: new Date(Date.now() - 1.8e7).toISOString() }; expect(aplicarReglas([R("esperar-respuesta", { antiguedadHorasMin: 1 })], h)[0].tipo).toBe("esperar-respuesta"); });

    it("por de case-insensitive", () => expect(aplicarReglas([R("destacar", { de: "ANA" })], base)[0].tipo).toBe("destacar"));

    it("por-responder ultimo otro >N h", () => expect(clasificarHilo(M([{ id: "1", remitente: "yo", fecha: "2026-01-14T10:00:00Z" }, { id: "2", remitente: "o", fecha: "2026-01-14T11:00:00Z" }]), "yo", Date.now(), { horasPorResponder: 24 })).toBe("por-responder"));

    it("resuelto ultimo otro <N h", () => expect(clasificarHilo(M([{ id: "1", remitente: "yo", fecha: "2026-01-15T10:00:00Z" }, { id: "2", remitente: "o", fecha: "2026-01-15T11:00:00Z" }]), "yo", Date.now(), { horasPorResponder: 24 })).toBe("resuelto"));

    it("esperando ultimo yo >D d", () => expect(clasificarHilo(M([{ id: "1", remitente: "o", fecha: "2026-01-01T10:00:00Z" }, { id: "2", remitente: "yo", fecha: "2026-01-01T11:00:00Z" }]), "yo", Date.now(), { diasEsperando: 14 })).toBe("esperando"));

    it("resuelto ultimo yo <D d", () => expect(clasificarHilo(M([{ id: "1", remitente: "o", fecha: "2026-01-14T10:00:00Z" }, { id: "2", remitente: "yo", fecha: "2026-01-14T11:00:00Z" }]), "yo", Date.now(), { diasEsperando: 14 })).toBe("resuelto"));

    it("sin mensajes -> resuelto", () => expect(clasificarHilo(M([]), "yo", Date.now())).toBe("resuelto"));

    it("defaults 24h/14d", () => { expect(clasificarHilo(M([{ id: "1", remitente: "yo", fecha: "2026-01-14T10:00:00Z" }, { id: "2", remitente: "o", fecha: "2026-01-14T11:00:00Z" }]), "yo", Date.now())).toBe("por-responder"); expect(clasificarHilo(M([{ id: "1", remitente: "o", fecha: "2026-01-01T10:00:00Z" }, { id: "2", remitente: "yo", fecha: "2026-01-01T11:00:00Z" }]), "yo", Date.now())).toBe("esperando"); });

    it("acepta Date o number", () => { const h = M([{ id: "1", remitente: "o", fecha: "2026-01-14T11:00:00Z" }]); expect(clasificarHilo(h, "yo", new Date(Date.now()))).toBe("por-responder"); expect(clasificarHilo(h, "yo", Date.now())).toBe("por-responder"); });

    it("cuenta 3 estados", () => {
        const hs = [ M([{ id: "1", remitente: "yo", fecha: "2026-01-14T10:00:00Z" }, { id: "2", remitente: "o", fecha: "2026-01-14T11:00:00Z"}]), M([{ id: "1", remitente: "o", fecha: "2026-01-01T10:00:00Z" }, { id: "2", remitente: "yo", fecha: "2026-01-01T11:00:00Z"}]), M([{ id: "1", remitente: "yo", fecha: "2026-01-15T10:00:00Z" }, { id: "2", remitente: "o", fecha: "2026-01-15T11:00:00Z"}]), M([{ id: "1", remitente: "o", fecha: "2026-01-14T10:00:00Z" }, { id: "2", remitente: "yo", fecha: "2026-01-14T11:00:00Z"}]), M([]) ];
        expect(resumenSeguimiento(hs, "yo", Date.now())).toEqual({ porResponder: 1, esperando: 1, resuelto: 3, total: 5 });
    });

    it("lista vacia", () => expect(resumenSeguimiento([], "yo", Date.now())).toEqual({ porResponder: 0, esperando: 0, resuelto: 0, total: 0 }));
});