import { describe, it, expect } from "vitest";
import { plegarHistorial, restaurarBloque, buscarEnBloques, resumenExtractivo, type Turno } from "@/lib/astraura/contexto/pliegue";

const turno = (i: number, extra = ""): Turno => ({
  rol: i % 2 === 0 ? "user" : "assistant",
  texto: `Turno ${i} ${extra} ${"palabra ".repeat(16)}`,
});

describe("plegarHistorial", () => {
  it("cabe todo: sin bloques, texto vacío y todo reciente", () => {
    const historial = [turno(0), turno(1)];
    const r = plegarHistorial(historial, { presupuestoChars: 10_000 });
    expect(r.bloques).toEqual([]);
    expect(r.texto).toBe("");
    expect(r.recientes).toEqual(historial);
    expect(r.descartadosChars).toBe(0);
  });

  it("40 turnos largos: acota recientes, cubre [0, n) y respeta el presupuesto", () => {
    const historial = Array.from({ length: 40 }, (_, i) => turno(i));
    const r = plegarHistorial(historial, { presupuestoChars: 900, recientesChars: 300 });
    expect(r.recientes.reduce((n, t) => n + t.texto.length, 0)).toBeLessThanOrEqual(300);
    expect(r.texto.length).toBeLessThanOrEqual(900);
    const bloques = [...r.bloques].sort((a, b) => a.desde - b.desde);
    expect(bloques[0].desde).toBe(0);
    expect(bloques[bloques.length - 1].hasta).toBe(40 - r.recientes.length);
    bloques.slice(1).forEach((b, i) => expect(b.desde).toBe(bloques[i].hasta));
  });

  it("estable: 3 turnos más al final no cambian los bloques de nivel 1 ya hechos", () => {
    const historial = Array.from({ length: 40 }, (_, i) => turno(i, "estable"));
    const op = { presupuestoChars: 4000, recientesChars: 600 };
    const antes = plegarHistorial(historial, op);
    const despues = plegarHistorial([...historial, turno(40), turno(41), turno(42)], op);
    const limite = antes.bloques[antes.bloques.length - 1].hasta;
    expect(despues.bloques.filter((b) => b.hasta <= limite)).toEqual(antes.bloques);
  });

  it("restaurarBloque devuelve el trozo original", () => {
    const historial = Array.from({ length: 24 }, (_, i) => turno(i));
    const r = plegarHistorial(historial, { presupuestoChars: 700, recientesChars: 200 });
    expect(restaurarBloque(historial, r.bloques[0])).toEqual(historial.slice(r.bloques[0].desde, r.bloques[0].hasta));
  });

  it("usa el resumidor inyectado", () => {
    let llamadas = 0;
    const resumidor = (turnos: Turno[]) => `R${(llamadas += 1)}-${turnos.length}`;
    const historial = Array.from({ length: 20 }, (_, i) => turno(i));
    const r = plegarHistorial(historial, { presupuestoChars: 4000, recientesChars: 300, resumidor });
    expect(llamadas).toBeGreaterThan(0);
    expect(r.bloques.every((b) => b.resumen.startsWith("R"))).toBe(true);
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const historial = Array.from({ length: 33 }, (_, i) => turno(i, "determinista"));
    const op = { presupuestoChars: 700, recientesChars: 250 };
    expect(plegarHistorial(historial, op)).toEqual(plegarHistorial(historial, op));
  });
});

describe("resumenExtractivo", () => {
  it("usa U:/A:, la primera frase y recorta con puntos suspensivos", () => {
    const resumen = resumenExtractivo([
      { rol: "user", texto: "Primera frase. Segunda que no va." },
      { rol: "assistant", texto: "Respuesta larga ".repeat(30) },
    ], 60);
    expect(resumen.startsWith("U: Primera frase.")).toBe(true);
    expect(resumen).toContain(" | A: ");
    expect(resumen.length).toBeLessThanOrEqual(60);
    expect(resumen.endsWith("…")).toBe(true);
  });
});

describe("buscarEnBloques", () => {
  it("encuentra el bloque con la palabra y devuelve [] sin coincidencias", () => {
    const historial = Array.from({ length: 24 }, (_, i) => turno(i, i === 2 ? "vestigio" : ""));
    const r = plegarHistorial(historial, { presupuestoChars: 1000, recientesChars: 200 });
    const hallado = buscarEnBloques(historial, r.bloques, "VESTIGIO");
    expect(hallado).toHaveLength(1);
    expect(hallado[0].desde).toBeLessThanOrEqual(2);
    expect(hallado[0].hasta).toBeGreaterThan(2);
    expect(buscarEnBloques(historial, r.bloques, "inexistente")).toEqual([]);
  });
});
