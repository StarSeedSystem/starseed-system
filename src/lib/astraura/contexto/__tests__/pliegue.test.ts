import { describe, it, expect } from "vitest";
import {
  buscarEnBloques,
  plegarHistorial,
  restaurarBloque,
  resumenExtractivo,
  type Turno,
} from "../pliegue";

const turno = (i: number, texto = `turno ${i} del historial`): Turno => ({
  rol: i % 2 === 0 ? "user" : "assistant",
  texto,
});
const largos = (n: number): Turno[] =>
  Array.from({ length: n }, (_, i) =>
    turno(i, `Turno ${i}: una frase deliberadamente larga que empuja el presupuesto de caracteres del contexto y obliga a plegar el historial antiguo.`),
  );
const cortos = (n: number): Turno[] => Array.from({ length: n }, (_, i) => turno(i, "abcdefghij"));

describe("plegarHistorial", () => {
  it("si todo cabe no hay bloques ni texto de resumen", () => {
    const r = plegarHistorial(cortos(3), { presupuestoChars: 1000 });
    expect(r.bloques).toEqual([]);
    expect(r.recientes).toHaveLength(3);
    expect(r.texto).toBe("");
    expect(r.descartadosChars).toBe(0);
  });

  it("con 40 turnos largos respeta el presupuesto y cubre sin huecos ni solapes", () => {
    const r = plegarHistorial(largos(40), { presupuestoChars: 1200, recientesChars: 500, maxResumenChars: 120 });
    expect(r.recientes.reduce((n, t) => n + t.texto.length, 0)).toBeLessThanOrEqual(500);
    expect(r.texto.length).toBeLessThanOrEqual(1200);
    expect(r.bloques[0].desde).toBe(0);
    for (let i = 1; i < r.bloques.length; i++) expect(r.bloques[i].desde).toBe(r.bloques[i - 1].hasta);
    expect(r.bloques[r.bloques.length - 1].hasta).toBe(40 - r.recientes.length);
  });

  it("añadir 3 turnos al final no cambia los bloques de nivel 1 ya hechos", () => {
    const op = { presupuestoChars: 5000, recientesChars: 120, maxResumenChars: 200 };
    const antes = plegarHistorial(cortos(30), op).bloques.filter((b) => b.nivel === 1);
    const despues = plegarHistorial(cortos(33), op).bloques.filter((b) => b.nivel === 1);
    expect(antes).toHaveLength(3);
    expect(despues.slice(0, 3)).toEqual(antes);
  });

  it("restaurarBloque devuelve exactamente el trozo original", () => {
    const historial = largos(20);
    const r = plegarHistorial(historial, { presupuestoChars: 500, recientesChars: 100, maxResumenChars: 80 });
    const bloque = r.bloques[0];
    expect(restaurarBloque(historial, bloque)).toEqual(historial.slice(bloque.desde, bloque.hasta));
  });

  it("usa el resumidor inyectado", () => {
    const resumidor = (turnos: Turno[]) => `R:${turnos.length}`;
    const r = plegarHistorial(largos(12), { presupuestoChars: 5000, recientesChars: 100, resumidor });
    expect(r.bloques.length).toBeGreaterThan(0);
    for (const b of r.bloques) expect(b.resumen).toBe(`R:${b.hasta - b.desde}`);
  });

  it("es determinista", () => {
    const op = { presupuestoChars: 900, recientesChars: 200, maxResumenChars: 90 };
    expect(plegarHistorial(largos(24), op)).toEqual(plegarHistorial(largos(24), op));
  });
});

describe("buscarEnBloques", () => {
  it("encuentra el bloque con la palabra y devuelve [] sin coincidencias", () => {
    const historial = Array.from({ length: 12 }, (_, i) =>
      turno(i, i === 8 ? "hablamos de constelaciones y de mapas estelares" : `texto común número ${i}`),
    );
    const r = plegarHistorial(historial, { presupuestoChars: 5000, recientesChars: 0, maxResumenChars: 200 });
    const encontrados = buscarEnBloques(historial, r.bloques, "constelaciones", 3);
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].desde).toBeLessThanOrEqual(8);
    expect(encontrados[0].hasta).toBeGreaterThan(8);
    expect(buscarEnBloques(historial, r.bloques, "zurcido")).toEqual([]);
    expect(buscarEnBloques(historial, r.bloques, "abc")).toEqual([]);
  });

  it("resumenExtractivo limita la primera frase y el total", () => {
    const texto = `Primera frase corta. ${"relleno ".repeat(40)}`;
    const r = resumenExtractivo([turno(0, texto)], 200);
    expect(r.startsWith("U: Primera frase corta.")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(200);
    expect(resumenExtractivo([turno(0, "palabra ".repeat(60))], 60)).toHaveLength(60);
  });
});
