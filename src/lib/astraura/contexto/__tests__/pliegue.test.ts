import { describe, it, expect } from "vitest";
import {
  plegarHistorial,
  resumenExtractivo,
  restaurarBloque,
  buscarEnBloques,
  type Turno,
} from "../pliegue";

const LARGO_TURNO = 60;

function largos(n: number): Turno[] {
  return Array.from({ length: n }, (_, i) => ({
    rol: i % 2 ? "assistant" : "user",
    texto: "t".repeat(LARGO_TURNO),
  }));
}

const OP = { presupuestoChars: 5000, recientesChars: 600 };

describe("pliegue · plegarHistorial", () => {
  it("si todo cabe no hay bloques y el texto es vacío", () => {
    const r = plegarHistorial(largos(3), { presupuestoChars: 5000, recientesChars: 2000 });
    expect(r.bloques).toEqual([]);
    expect(r.texto).toBe("");
    expect(r.recientes).toHaveLength(3);
    expect(r.descartadosChars).toBe(0);
  });

  it("con 40 turnos largos los bloques son contiguos y el texto cabe", () => {
    const h = largos(40);
    const r = plegarHistorial(h, OP);
    const chars = r.recientes.reduce((n, t) => n + t.texto.length, 0);
    expect(chars).toBeLessThanOrEqual(OP.recientesChars);
    expect(r.bloques.length).toBeGreaterThan(0);
    expect(r.bloques[0].desde).toBe(0);
    expect(r.bloques[r.bloques.length - 1].hasta).toBe(h.length - r.recientes.length);
    for (let i = 1; i < r.bloques.length; i++) {
      expect(r.bloques[i].desde).toBe(r.bloques[i - 1].hasta);
    }
    expect(r.bloques.every((b) => b.nivel === 1)).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(OP.presupuestoChars);
    expect(r.texto.startsWith("[RESUMEN DE LO ANTERIOR")).toBe(true);
    expect(r.descartadosChars).toBe(0);
  });

  it("con recientesChars 0 se pliega el historial entero", () => {
    const h = largos(40);
    const r = plegarHistorial(h, { presupuestoChars: 4000, recientesChars: 0 });
    expect(r.recientes).toEqual([]);
    expect(r.bloques[0].desde).toBe(0);
    expect(r.bloques[r.bloques.length - 1].hasta).toBe(40);
    expect(r.texto.length).toBeLessThanOrEqual(4000);
  });

  it("estabilidad: turnos nuevos no rehacen los bloques de nivel 1", () => {
    const r1 = plegarHistorial(largos(40), OP);
    const r2 = plegarHistorial(largos(43), OP);
    expect(r1.bloques).toHaveLength(5);
    expect(r2.bloques).toHaveLength(6);
    expect(r2.bloques.slice(0, r1.bloques.length)).toEqual(r1.bloques);
    expect(r2.bloques.every((b) => b.nivel === 1)).toBe(true);
    expect(r2.descartadosChars).toBe(0);
  });

  it("restaurarBloque devuelve el trozo original del historial", () => {
    const h = largos(40);
    const r = plegarHistorial(h, { presupuestoChars: 4000, recientesChars: 0 });
    expect(restaurarBloque(h, r.bloques[1])).toEqual(h.slice(6, 12));
  });

  it("buscarEnBloques acierta y devuelve vacío sin coincidencias", () => {
    const h: Turno[] = Array.from({ length: 12 }, (_, i) => ({
      rol: i % 2 ? "assistant" : "user",
      texto: `Línea ${i} sin palabras clave de interés.`,
    }));
    h[2] = { rol: "user", texto: "Hablemos esta vez de astronomía y de telescopios." };
    h[8] = { rol: "assistant", texto: "La bicicleta eléctrica gana en ciudad." };
    const r = plegarHistorial(h, { presupuestoChars: 5000, recientesChars: 0 });
    expect(r.bloques).toHaveLength(2);
    expect(buscarEnBloques(h, r.bloques, "astronomía")).toEqual([r.bloques[0]]);
    expect(buscarEnBloques(h, r.bloques, "bicicleta")).toEqual([r.bloques[1]]);
    expect(buscarEnBloques(h, r.bloques, "astronomía bicicleta")).toEqual([
      r.bloques[0],
      r.bloques[1],
    ]);
    expect(buscarEnBloques(h, r.bloques, "murciélago")).toEqual([]);
    expect(buscarEnBloques(h, r.bloques, "zz")).toEqual([]);
  });
});

describe("pliegue · resumidor y determinismo", () => {
  it("usa el resumidor inyectado cuando existe", () => {
    const r = plegarHistorial(largos(12), {
      presupuestoChars: 4000,
      recientesChars: 0,
      resumidor: (turnos, maxChars) => `S(${turnos.length}|${maxChars})`,
    });
    expect(r.bloques).toHaveLength(2);
    expect(r.bloques.every((b) => b.resumen === "S(6|240)")).toBe(true);
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const a = plegarHistorial(largos(40), OP);
    const b = plegarHistorial(largos(40), OP);
    expect(a).toEqual(b);
  });
});

describe("pliegue · resumenExtractivo", () => {
  it("une una primera frase por turno con « | »", () => {
    const t: Turno[] = [
      { rol: "user", texto: "Hola mundo. ¿Qué tal?" },
      { rol: "assistant", texto: "Todo correcto. Sigo aquí." },
    ];
    expect(resumenExtractivo(t, 400)).toBe("U: Hola mundo. | A: Todo correcto.");
  });

  it("recorta a maxChars, en palabra y con «…» si el turno es largo", () => {
    const t: Turno[] = [{ rol: "user", texto: "x".repeat(200) }];
    const r = resumenExtractivo(t, 400);
    expect(r.startsWith("U: ")).toBe(true);
    expect(r.endsWith("…")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(143);
    expect(resumenExtractivo(t, 9)).toBe("U: xxxxxx");
  });
});
