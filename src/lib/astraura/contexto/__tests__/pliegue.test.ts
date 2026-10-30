import { describe, expect, it } from "vitest";
import type { Turno } from "../pliegue";
import {
  buscarEnBloques,
  ENCABEZADO_PLIEGUE,
  plegarHistorial,
  restaurarBloque,
  resumenExtractivo,
} from "../pliegue";

const turno = (n: number, texto: string): Turno => ({
  rol: n % 2 === 0 ? "user" : "assistant",
  texto,
});

/** Turnos deterministas con texto de longitud exacta `len` (relleno con «·», sin puntos). */
const historialFijo = (n: number, len: number): Turno[] =>
  Array.from({ length: n }, (_, i) => turno(i, `T${i} termino${i} pliegue`.padEnd(len, "·")));

const charsDe = (turnos: Turno[]): number => turnos.reduce((n, t) => n + t.texto.length, 0);

describe("pliegue de historial para el contexto corto del 1.58", () => {
  // ESQUELETO — los casos se completan a continuación
  it("si cabe todo, no hay bloques y el texto queda vacío", () => {
    const r = plegarHistorial(historialFijo(6, 40), { presupuestoChars: 1000 });
    expect(r.bloques).toEqual([]);
    expect(r.texto).toBe("");
    expect(r.descartadosChars).toBe(0);
    expect(r.recientes).toEqual(historialFijo(6, 40));
  });

  it("40 turnos largos: recientes en el tope, bloques contiguos y texto dentro del presupuesto", () => {
    const h = historialFijo(40, 200);
    const r = plegarHistorial(h, { presupuestoChars: 4000 });
    expect(charsDe(r.recientes)).toBeLessThanOrEqual(2400);
    expect(r.recientes).toEqual(h.slice(h.length - r.recientes.length));
    expect(r.bloques.length).toBeGreaterThan(0);
    expect(r.bloques.every((b) => b.nivel === 1)).toBe(true);
    let previo = 0;
    for (const b of r.bloques) {
      expect(b.desde).toBe(previo);
      expect(b.hasta - b.desde).toBeLessThanOrEqual(6);
      previo = b.hasta;
    }
    expect(previo).toBe(h.length - r.recientes.length);
    expect(r.descartadosChars).toBe(0);
    expect(r.texto.startsWith(ENCABEZADO_PLIEGUE)).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(4000);
    expect(r.texto).toContain("(turnos 0–6)");
  });

  it("estabilidad: turnos nuevos al final no cambian los bloques de nivel 1 ya hechos", () => {
    const op = { presupuestoChars: 5000, recientesChars: 144 };
    const r1 = plegarHistorial(historialFijo(12, 24), op);
    const r2 = plegarHistorial(historialFijo(15, 24), op);
    expect(r1.recientes.length).toBe(6);
    expect(r1.bloques.length).toBeGreaterThan(0);
    expect(r1.bloques.every((b) => b.nivel === 1)).toBe(true);
    expect(r2.bloques.length).toBe(r1.bloques.length + 1);
    r1.bloques.forEach((b, i) => {
      expect(r2.bloques[i].id).toBe(b.id);
      expect(r2.bloques[i].desde).toBe(b.desde);
      expect(r2.bloques[i].hasta).toBe(b.hasta);
      expect(r2.bloques[i].resumen).toBe(b.resumen);
    });
  });
  it("restaurarBloque devuelve exactamente el trozo original del historial", () => {
    const h = historialFijo(20, 60);
    const r = plegarHistorial(h, { presupuestoChars: 600, recientesChars: 480 });
    expect(r.bloques.length).toBe(2);
    expect(restaurarBloque(h, r.bloques[0])).toEqual(h.slice(0, 6));
    expect(restaurarBloque(h, r.bloques[1])).toEqual(h.slice(6, 12));
  });

  it("buscarEnBloques: encuentra por palabra, sin acentos, orden estable y nada si no hay", () => {
    const h: Turno[] = [];
    for (let i = 0; i < 18; i++) {
      const texto =
        i < 6 ? "el rosal secreto giraba de noche" : i < 12 ? "llueve sobre el árbol de zumaque" : "canta la iris junto al lugar";
      h.push(turno(i, texto));
    }
    const { bloques } = plegarHistorial(h, { presupuestoChars: 9999, recientesChars: 0 });
    expect(bloques.map((b) => [b.desde, b.hasta])).toEqual([[0, 6], [6, 12], [12, 18]]);
    const conZumaque = buscarEnBloques(h, bloques, "zumaque ÁRBOLES");
    expect(conZumaque.length).toBe(1);
    expect(conZumaque[0].desde).toBe(6);
    expect(buscarEnBloques(h, bloques, "arbol")[0].desde).toBe(6);
    const doble = buscarEnBloques(h, bloques, "rosal iris");
    expect(doble.map((b) => b.desde)).toEqual([0, 12]);
    expect(buscarEnBloques(h, bloques, "de la un")).toEqual([]);
    expect(buscarEnBloques(h, bloques, "mateo elenco")).toEqual([]);
  });

  it("el resumidor inyectado sustituye al extractivo por defecto", () => {
    const r = plegarHistorial(historialFijo(40, 200), {
      presupuestoChars: 4000,
      resumidor: (turnos, maxChars) => `RESUMIDO:${turnos.length}/${maxChars}`,
    });
    expect(r.bloques.length).toBeGreaterThan(0);
    expect(r.bloques[0].resumen).toBe("RESUMIDO:6/240");
    expect(r.texto).toContain("RESUMIDO");
  });

  it("dos ejecuciones iguales dan resultados iguales (determinismo)", () => {
    const a = plegarHistorial(historialFijo(40, 200), { presupuestoChars: 4000 });
    const b = plegarHistorial(historialFijo(40, 200), { presupuestoChars: 4000 });
    expect(a.texto).toBe(b.texto);
    expect(a.bloques).toEqual(b.bloques);
    expect(a.recientes).toEqual(b.recientes);
    expect(a.descartadosChars).toBe(b.descartadosChars);
  });

  it("resumenExtractivo: U:/A: con la primera frase, cortada en palabra y con «…»", () => {
    const turnos: Turno[] = [
      turno(0, `Pregunta amplia sobre ${"historias largas".repeat(14)}`),
      turno(1, "Respuesta breve y clara."),
    ];
    const r = resumenExtractivo(turnos, 500);
    expect(r.startsWith("U: ")).toBe(true);
    expect(r).toContain(" | ");
    expect(r).toContain("A: Respuesta breve y clara.");
    expect(r.split(" | ")[0].endsWith("…")).toBe(true);
    expect(resumenExtractivo(turnos, 40).length).toBe(40);
  });
});
