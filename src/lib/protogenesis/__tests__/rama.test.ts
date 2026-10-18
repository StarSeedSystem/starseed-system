import { describe, it, expect } from "vitest";
import type { Molecula, Parametro, Operacion, Capa } from "@/lib/protomolecula/tipos";
import { abrirRama, aplicarEnRama, anadirCapa, fusionar, deshacerFusion } from "../rama";

function moleculaBase(): Molecula {
  return {
    id: "m1",
    titulo: "test",
    ambito: "personal",
    capas: [],
    atomos: [],
    valores: { "a::p": 10 },
    version: 1,
    creadaEn: 0,
    actualizadaEn: 0,
  };
}

function parametro(): Parametro {
  return { id: "p", nombre: "p", tipo: "numero", min: 0, max: 100, defecto: 0 };
}

function operacion(valor: number): Operacion {
  return {
    id: "op1",
    objetivo: { atomoId: "a", parametroId: "p" },
    accion: { tipo: "exacta", valor },
    autor: { tipo: "persona", id: "u1" },
    origen: "mano",
    t: 1,
  };
}

describe("rama", () => {
  it("la original no cambia al trabajar en la rama", () => {
    const m = moleculaBase();
    const rama0 = abrirRama(m, "enc1");
    const res = aplicarEnRama(rama0, parametro(), operacion(20));
    expect(res.ok).toBe(true);
    const rama1 = res.ok ? res.rama : rama0;
    expect(m.valores["a::p"]).toBe(10);
    expect(rama1.valores["a::p"]).toBe(20);
  });

  it("detecta conflicto cuando la molécula cambió", () => {
    const m = moleculaBase();
    const rama0 = abrirRama(m, "enc2");
    const res = aplicarEnRama(rama0, parametro(), operacion(20));
    const rama1 = res.ok ? res.rama : rama0;
    const mCambiada = { ...m, valores: { ...m.valores, "a::p": 15 } };
    const f = fusionar(mCambiada, rama1);
    expect(f.ok).toBe(true);
    const resultado = f.ok ? f : { ok: false, molecula: m, conflictos: [] as string[] };
    expect(resultado.conflictos.length).toBeGreaterThan(0);
    expect(resultado.molecula.valores["a::p"]).toBe(15);
  });

  it("deshacer vuelve exacto", () => {
    const m = moleculaBase();
    const rama0 = abrirRama(m, "enc3");
    const res = aplicarEnRama(rama0, parametro(), operacion(20));
    const rama1 = res.ok ? res.rama : rama0;
    const f = fusionar(m, rama1);
    const moleculaFusionada = f.ok ? f.molecula : m;
    const cambio = rama1.cambios[0];
    const revertida = deshacerFusion(moleculaFusionada, [cambio]);
    expect(revertida.valores["a::p"]).toBe(10);
  });

  it("anadirCapa requiere referencia", () => {
    const m = moleculaBase();
    const rama = abrirRama(m, "enc4");
    const capaSinRef: Capa = { id: "c1", tipo: "datos", titulo: "t", formato: "json", referencia: null, orden: 0, visible: true, bloqueada: false };
    const r1 = anadirCapa(rama, capaSinRef);
    expect(r1.ok).toBe(false);
    const capaConRef: Capa = { ...capaSinRef, referencia: { tipo: "entidad", id: "e1" } };
    const r2 = anadirCapa(rama, capaConRef);
    expect(r2.ok).toBe(true);
  });
});
