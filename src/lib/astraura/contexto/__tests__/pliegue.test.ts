import { describe, it, expect } from "vitest";
import {
  plegarHistorial,
  restaurarBloque,
  buscarEnBloques,
  resumenExtractivo,
  type OpcionesPliegue,
  type Turno,
} from "../pliegue";

const turnos = (n: number, largo = 200, marca = ""): Turno[] =>
  Array.from({ length: n }, (_, i) => ({
    rol: i % 2 === 0 ? "user" : "assistant",
    texto: `${marca}turno ${i} ${"x".repeat(Math.max(0, largo - 12))}`,
  }));

describe("pliegue de historial", () => {
  it("si cabe todo, no hay bloques ni texto", () => {
    const r = plegarHistorial(turnos(3, 20), { presupuestoChars: 10_000 });
    expect(r.bloques).toEqual([]);
    expect(r.texto).toBe("");
    expect(r.descartadosChars).toBe(0);
    expect(r.recientes).toHaveLength(3);
  });

  it("40 turnos largos: recientes acotados, bloques contiguos y texto dentro del presupuesto", () => {
    const h = turnos(40);
    const op: OpcionesPliegue = { presupuestoChars: 5000, recientesChars: 1000, maxResumenChars: 100 };
    const r = plegarHistorial(h, op);
    const charsRecientes = r.recientes.reduce((n, t) => n + t.texto.length, 0);
    expect(charsRecientes).toBeLessThanOrEqual(1000);
    let cursor = 0;
    for (const b of r.bloques) {
      expect(b.desde).toBe(cursor);
      expect(b.hasta).toBeGreaterThan(b.desde);
      cursor = b.hasta;
    }
    expect(cursor).toBe(h.length - r.recientes.length);
    expect(r.texto.length).toBeLessThanOrEqual(5000);
  });

  it("estabilidad: añadir 3 turnos al final no cambia los bloques de nivel 1 ya hechos", () => {
    const base = turnos(48);
    const op: OpcionesPliegue = { presupuestoChars: 10_000, recientesChars: 2400, maxResumenChars: 200 };
    const antes = plegarHistorial(base, op);
    const despues = plegarHistorial([...base, ...turnos(3)], op);
    expect(antes.bloques).toHaveLength(6);
    for (let i = 0; i < antes.bloques.length; i++) {
      expect(despues.bloques[i]).toEqual(antes.bloques[i]);
    }
  });

  it("fusiona en niveles 2 y 3 cuando los resúmenes no caben", () => {
    const h: Turno[] = Array.from({ length: 60 }, (_, i) => ({
      rol: i % 2 === 0 ? "user" : "assistant",
      texto: `${i} palabra palabra palabra palabra palabra`,
    }));
    const r = plegarHistorial(h, { presupuestoChars: 180, recientesChars: 100, maxResumenChars: 30 });
    expect(r.bloques.some((b) => b.nivel === 3)).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(180);
    expect(r.bloques[0].desde).toBe(0);
    for (let i = 1; i < r.bloques.length; i++) {
      expect(r.bloques[i].desde).toBe(r.bloques[i - 1].hasta);
    }
  });

  it("restaurarBloque devuelve el trozo original", () => {
    const h = turnos(40);
    const r = plegarHistorial(h, { presupuestoChars: 5000, recientesChars: 1000, maxResumenChars: 100 });
    const b = r.bloques[1];
    expect(restaurarBloque(h, b)).toEqual(h.slice(b.desde, b.hasta));
  });

  it("busca dentro de lo plegado y no inventa coincidencias", () => {
    const h = turnos(18, 120);
    h[2] = { rol: "user", texto: "La orquídea nocturna guarda el código secreto." };
    h[10] = { rol: "assistant", texto: "El bosque de cedros no menciona la clave." };
    const r = plegarHistorial(h, { presupuestoChars: 9000, recientesChars: 10, maxResumenChars: 120 });
    expect(buscarEnBloques(h, r.bloques, "orquidea")).toEqual([r.bloques[0]]);
    expect(buscarEnBloques(h, r.bloques, "xyzzy")).toEqual([]);
  });

  it("usa el resumidor inyectado", () => {
    const h = turnos(12, 100);
    const usos: number[] = [];
    const r = plegarHistorial(h, {
      presupuestoChars: 5000, recientesChars: 0, maxResumenChars: 50,
      resumidor: (turnosDelBloque, max) => { usos.push(max); return `RES(${turnosDelBloque.length})`; },
    });
    expect(r.bloques).toHaveLength(2);
    expect(r.bloques.every((b) => b.resumen.startsWith("RES("))).toBe(true);
    expect(usos.length).toBeGreaterThan(0);
  });

  it("es determinista y el resumen extractivo corta con elipsis", () => {
    const h = turnos(20, 300);
    const op: OpcionesPliegue = { presupuestoChars: 3000, recientesChars: 600, maxResumenChars: 90 };
    expect(plegarHistorial(h, op)).toEqual(plegarHistorial(h, op));
    const s = resumenExtractivo([{ rol: "user", texto: "palabra ".repeat(40) }], 60);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("…")).toBe(true);
  });
});
