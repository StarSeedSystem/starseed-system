import { describe, it, expect } from "vitest";
import {
  buscarEnBloques,
  plegarHistorial,
  restaurarBloque,
  resumenExtractivo,
  type Turno,
} from "../pliegue";

function turnos(cantidad: number, largo: number): Turno[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    rol: i % 2 === 0 ? "user" : "assistant",
    texto: `Turno número ${i}. ${"relleno ".repeat(largo)}`,
  }));
}

const op = { presupuestoChars: 2000, recientesChars: 1200, maxResumenChars: 80 };

describe("pliegue de historial", () => {
  it("cabe todo sin bloques ni texto", () => {
    const historial = turnos(3, 1);
    const resultado = plegarHistorial(historial, { presupuestoChars: 10_000 });
    expect(resultado.recientes).toEqual(historial);
    expect(resultado.bloques).toEqual([]);
    expect(resultado.texto).toBe("");
    expect(resultado.descartadosChars).toBe(0);
  });

  it("pliega 40 turnos largos sin huecos y dentro del presupuesto", () => {
    const historial = turnos(40, 40);
    const resultado = plegarHistorial(historial, op);
    const charsRecientes = resultado.recientes.reduce((s, t) => s + t.texto.length, 0);
    expect(charsRecientes).toBeLessThanOrEqual(op.recientesChars);
    expect(resultado.bloques.length).toBeGreaterThan(0);
    let cursor = 0;
    for (const bloque of resultado.bloques) {
      expect(bloque.desde).toBe(cursor);
      expect(bloque.hasta).toBeGreaterThan(bloque.desde);
      cursor = bloque.hasta;
    }
    expect(cursor).toBe(historial.length - resultado.recientes.length);
    expect(resultado.recientes).toEqual(historial.slice(cursor));
    expect(resultado.texto.length).toBeLessThanOrEqual(op.presupuestoChars);
  });

  it("mantiene estables los bloques de nivel 1 al añadir turnos", () => {
    const inicial = turnos(40, 30);
    const opciones = { presupuestoChars: 6000, recientesChars: 2600, maxResumenChars: 140 };
    const antes = plegarHistorial(inicial, opciones);
    const despues = plegarHistorial([...inicial, ...turnos(3, 30)], opciones);
    expect(antes.bloques.length).toBeGreaterThan(0);
    for (const bloque of antes.bloques) {
      const igual = despues.bloques.find((b) => b.desde === bloque.desde && b.hasta === bloque.hasta);
      expect(igual).toBeDefined();
      expect(igual?.resumen).toBe(bloque.resumen);
    }
  });

  it("restaura exactamente el trozo original de un bloque", () => {
    const historial = turnos(40, 40);
    const { bloques } = plegarHistorial(historial, op);
    const bloque = bloques[1];
    expect(restaurarBloque(historial, bloque)).toEqual(historial.slice(bloque.desde, bloque.hasta));
  });

  it("busca dentro de lo plegado y devuelve vacío sin coincidencias", () => {
    const historial = turnos(24, 20).map((turno, i) =>
      i === 13 ? { ...turno, texto: "Recuerdo de la constelación austral." } : turno,
    );
    const opciones = { presupuestoChars: 800, recientesChars: 200, maxResumenChars: 60 };
    const { bloques } = plegarHistorial(historial, opciones);
    const encontrados = buscarEnBloques(historial, bloques, "constelacion");
    expect(encontrados.length).toBeGreaterThan(0);
    expect(encontrados[0].desde).toBeLessThanOrEqual(13);
    expect(encontrados[0].hasta).toBeGreaterThan(13);
    expect(buscarEnBloques(historial, bloques, "inexistente")).toEqual([]);
  });

  it("usa el resumidor inyectado cuando existe", () => {
    let llamadas = 0;
    const resumidor = (lista: Turno[]) => {
      llamadas += 1;
      return `R${lista.length}`;
    };
    const resultado = plegarHistorial(turnos(40, 40), { ...op, resumidor });
    expect(llamadas).toBeGreaterThan(0);
    expect(resultado.bloques.every((bloque) => bloque.resumen.startsWith("R"))).toBe(true);
  });

  it("es determinista entre ejecuciones iguales", () => {
    const historial = turnos(40, 40);
    expect(plegarHistorial(historial, op)).toEqual(plegarHistorial(historial, op));
  });

  it("resume con la primera frase y recorta en palabra", () => {
    expect(resumenExtractivo([{ rol: "user", texto: "Hola mundo. Otra frase." }], 100)).toBe("U: Hola mundo.");
    const recortado = resumenExtractivo([{ rol: "assistant", texto: "palabra ".repeat(40) }], 100);
    expect(recortado.length).toBeLessThanOrEqual(100);
    expect(recortado.endsWith("…")).toBe(true);
  });
});
