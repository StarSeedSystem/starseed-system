"use client";

import { describe, it, expect } from "vitest";
import { validarRegla, aplicarReglas, clasificarHilo, resumenSeguimiento, R, R0, M } from "../inteligente.ts";

const now = new Date("2026-01-15T12:00:00Z").getTime();

describe("corrreos-inteligentes", () => {
  it("válida", () => expect(validarRegla(R("etiquetar", { etiqueta: "t" }, "p"))).toBe(true));

  it("sin parametro", () => expect(validarRegla(R("destacar", { de: "a" }))).toBe(true));

  it("campo extra regla", () => expect(validarRegla({...R0("etiquetar"), extra: 1} as unknown)).toBe(false));

  it("campo extra cuando", () => expect(validarRegla({...R0("etiquetar"), cuando: {extra:1}} as unknown)).toBe(false));

  it("texto largo", () => expect(validarRegla({...R0("etiquetar"), texto: "x".repeat(201)} as unknown)).toBe(false));

  it("param largo", () => expect(validarRegla({...R0("etiquetar"), parametro: "x".repeat(101)} as unknown)).toBe(false));

  it("id vacío", () => expect(validarRegla({...R0("etiquetar"), id:""} as unknown)).toBe(false));

  it("antiguedad negativa", () => expect(validarRegla({...R0("etiquetar"), cuando: {antiguedadHorasMin:-1}} as unknown)).toBe(false));

  it("tieneAdjunto no bool", () => expect(validarRegla({...R0("etiquetar"), cuando: {tieneAdjunto:"sí"}} as unknown)).toBe(false));

  it("null/undef/empty", () => { expect(validarRegla(null)).toBe(false); expect(validarRegla({})).toBe(false); });

  it("coincide", () => { const a = aplicarReglas([R("etiquetar",{etiqueta:"t"},"p")], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z"}); expect(a).toEqual([{reglaId:"r1",tipo:"etiquetar",parametro:"p"}]); });

  it("no coincide", () => expect(aplicarReglas([R("mover",{tieneAdjunto:true})], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z"})).toHaveLength(0));

  it("múltiples en orden", () => { const h = {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z",tieneAdjunto:true}; const a = aplicarReglas([R("etiquetar",{etiqueta:"t"}), R("mover",{tieneAdjunto:true}), R("destacar",{de:"ana"})], h); expect(a.map(x=>x.tipo)).toEqual(["etiquetar","mover","destacar"]); });

  it("no duplica acción+param", () => { const a = aplicarReglas([R("etiquetar",{etiqueta:"t"},"p"), R("etiquetar",{etiqueta:"t"},"p")], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z"}); expect(a).toHaveLength(1); });

  it("distinto param sí permite", () => { const a = aplicarReglas([R("etiquetar",{etiqueta:"t"},"a"), R("etiquetar",{etiqueta:"t"},"b")], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z"}); expect(a).toHaveLength(2); });

  it("filtra inválidas", () => { const a = aplicarReglas([{...R0("etiquetar"), hacer:"enviar"} as unknown, R("etiquetar",{etiqueta:"t"})], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z"}); expect(a).toHaveLength(1); });

  it("por dominio", () => expect(aplicarReglas([R("sugerir-borrador",{dominio:"i.com"})], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z",dominio:"i.com"})[0].tipo).toBe("sugerir-borrador"));

  it("por antiguedad", () => { const h = {id:"m1",remitente:"u",fecha:new Date(Date.now()-1.8e7).toISOString()}; expect(aplicarReglas([R("esperar-respuesta",{antiguedadHorasMin:1})], h)[0].tipo).toBe("esperar-respuesta"); });

  it("por de case-insensitive", () => expect(aplicarReglas([R("destacar",{de:"ANA"})], {id:"m1",remitente:"u",fecha:"2026-01-14T10:00:00Z"})[0].tipo).toBe("destacar"));

  it("por-responder: último otro, >N h", () => expect(clasificarHilo(M([{id:"1",remitente:"yo",fecha:"2026-01-14T10:00:00Z"},{id:"2",remitente:"o",fecha:"2026-01-14T11:00:00Z"}]), "yo", now, {horasPorResponder:24})).toBe("por-responder"));

  it("resuelto: último otro, <N h", () => expect(clasificarHilo(M([{id:"1",remitente:"yo",fecha:"2026-01-15T10:00:00Z"},{id:"2",remitente:"o",fecha:"2026-01-15T11:00:00Z"}]), "yo", now, {horasPorResponder:24})).toBe("resuelto"));

  it("esperando: último yo, >D d", () => expect(clasificarHilo(M([{id:"1",remitente:"o",fecha:"2026-01-01T10:00:00Z"},{id:"2",remitente:"yo",fecha:"2026-01-01T11:00:00Z"}]), "yo", now, {diasEsperando:14})).toBe("esperando"));

  it("resuelto: último yo, <D d", () => expect(clasificarHilo(M([{id:"1",remitente:"o",fecha:"2026-01-14T10:00:00Z"},{id:"2",remitente:"yo",fecha:"2026-01-14T11:00:00Z"}]), "yo", now, {diasEsperando:14})).toBe("resuelto"));

  it("sin mensajes -> resuelto", () => expect(clasificarHilo(M([]), "yo", now)).toBe("resuelto"));

  it("defaults 24h/14d", () => { expect(clasificarHilo(M([{id:"1",remitente:"yo",fecha:"2026-01-14T10:00:00Z"},{id:"2",remitente:"o",fecha:"2026-01-14T11:00:00Z"}]), "yo", now)).toBe("por-responder"); expect(clasificarHilo(M([{id:"1",remitente:"o",fecha:"2026-01-01T10:00:00Z"},{id:"2",remitente:"yo",fecha:"2026-01-01T11:00:00Z"}]), "yo", now)).toBe("esperando"); });

  it("acepta Date o number", () => { const h = M([{id:"1",remitente:"o",fecha:"2026-01-14T11:00:00Z"}]); expect(clasificarHilo(h,"yo",new Date(now))).toBe("por-responder"); expect(clasificarHilo(h,"yo",now)).toBe("por-responder"); });

  it("cuenta 3 estados", () => {
    const hs = [ M([{id:"1",remitente:"yo",fecha:"2026-01-14T10:00:00Z"},{id:"2",remitente:"o",fecha:"2026-01-14T11:00:00Z"}]), M([{id:"1",remitente:"o",fecha:"2026-01-01T10:00:00Z"},{id:"2",remitente:"yo",fecha:"2026-01-01T11:00:00Z"}]), M([{id:"1",remitente:"yo",fecha:"2026-01-15T10:00:00Z"},{id:"2",remitente:"o",fecha:"2026-01-15T11:00:00Z"}]), M([{id:"1",remitente:"o",fecha:"2026-01-14T10:00:00Z"},{id:"2",remitente:"yo",fecha:"2026-01-14T11:00:00Z"}]), M([]) ];
    expect(resumenSeguimiento(hs, "yo", now)).toEqual({porResponder:1, esperando:1, resuelto:3, total:5});
  });

  it("lista vacía", () => expect(resumenSeguimiento([], "yo", now)).toEqual({porResponder:0, esperando:0, resuelto:0, total:0}));
});