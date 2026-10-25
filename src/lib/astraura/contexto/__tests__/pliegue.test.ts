import { describe, it, expect } from "vitest";
import {
  buscarEnBloques,
  plegarHistorial,
  restaurarBloque,
  type Resumidor,
  type Turno,
} from "../pliegue";

function turno(i: number, extra = ""): Turno {
  return {
    rol: i % 2 === 0 ? "user" : "assistant",
    texto: `Turno ${i} ${extra} ` + "contenido largo de prueba ".repeat(5),
  };
}

function historialLargo(n: number): Turno[] {
  return Array.from({ length: n }, (_, i) => turno(i, i === 2 ? "ornitorrinco " : ""));
}

const opciones = { presupuestoChars: 4000, recientesChars: 1000, maxResumenChars: 120 };

describe("pliegue de historial", () => {
  it("si todo cabe en lo reciente no pliega nada", () => {
    const historial = [turno(0), turno(1), turno(2)];
    const r = plegarHistorial(historial, { presupuestoChars: 2000 });
    expect(r.bloques).toEqual([]);
    expect(r.texto).toBe("");
    expect(r.recientes).toHaveLength(3);
    expect(r.descartadosChars).toBe(0);
  });

  it("pliega 40 turnos largos sin huecos ni solapes y respeta el presupuesto", () => {
    const historial = historialLargo(40);
    const r = plegarHistorial(historial, opciones);
    const usados = r.recientes.reduce((s, t) => s + t.texto.length, 0);
    expect(usados).toBeLessThanOrEqual(1000);
    expect(r.bloques.length).toBeGreaterThan(0);
    let cursor = 0;
    for (const b of r.bloques) {
      expect(b.desde).toBe(cursor);
      expect(b.hasta).toBeGreaterThan(b.desde);
      cursor = b.hasta;
    }
    expect(cursor).toBe(historial.length - r.recientes.length);
    expect(r.texto.length).toBeLessThanOrEqual(4000);
    expect(r.texto.startsWith("[RESUMEN DE LO ANTERIOR")).toBe(true);
  });

  it("es estable al añadir turnos al final", () => {
    const original = plegarHistorial(historialLargo(40), opciones);
    const ampliado = plegarHistorial(historialLargo(43), opciones);
    const estables = original.bloques.filter((b) => b.hasta <= 30);
    expect(estables.length).toBeGreaterThan(0);
    for (const viejo of estables) {
      const nuevo = ampliado.bloques.find((b) => b.desde === viejo.desde && b.nivel === 1);
      expect(nuevo?.hasta).toBe(viejo.hasta);
      expect(nuevo?.resumen).toBe(viejo.resumen);
    }
  });

  it("restaura exactamente el trozo original", () => {
    const historial = historialLargo(40);
    const r = plegarHistorial(historial, opciones);
    const bloque = r.bloques[0];
    expect(restaurarBloque(historial, bloque)).toEqual(historial.slice(bloque.desde, bloque.hasta));
  });

  it("busca dentro de lo plegado y devuelve vacío si no hay coincidencias", () => {
    const historial = historialLargo(40);
    const r = plegarHistorial(historial, opciones);
    const encontrados = buscarEnBloques(historial, r.bloques, "ornitorrinco");
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].desde).toBeLessThanOrEqual(2);
    expect(encontrados[0].hasta).toBeGreaterThan(2);
    expect(buscarEnBloques(historial, r.bloques, "inexistente")).toEqual([]);
  });

  it("usa el resumidor inyectado", () => {
    const llamadas: Turno[][] = [];
    const resumidor: Resumidor = (turnos, maxChars) => {
      llamadas.push(turnos);
      return `R${turnos.length} ${turnos[0].texto}`.slice(0, maxChars);
    };
    const r = plegarHistorial(historialLargo(20), {
      presupuestoChars: 2000,
      recientesChars: 200,
      maxResumenChars: 40,
      resumidor,
    });
    expect(llamadas.length).toBeGreaterThan(0);
    expect(r.bloques.every((b) => b.resumen.startsWith("R"))).toBe(true);
  });

  it("es determinista", () => {
    const a = plegarHistorial(historialLargo(40), opciones);
    const b = plegarHistorial(historialLargo(40), opciones);
    expect(a).toEqual(b);
  });
});
