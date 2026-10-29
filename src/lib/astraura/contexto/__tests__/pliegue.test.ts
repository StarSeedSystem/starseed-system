import { describe, it, expect } from "vitest";
import {
  CABECERA_PLIEGUE,
  buscarEnBloques,
  plegarHistorial,
  restaurarBloque,
  resumenExtractivo,
  type BloquePlegado,
  type Turno,
} from "../pliegue";

function turnos(n: number, largo = 300): Turno[] {
  return Array.from({ length: n }, (_, i) => ({
    rol: i % 2 === 0 ? "user" : "assistant",
    texto: `Turno ${i} ${"palabra ".repeat(Math.ceil(largo / 8))}`.slice(0, largo),
  }));
}

function cubre(bloques: BloquePlegado[], fin: number): boolean {
  const orden = [...bloques].sort((a, b) => a.desde - b.desde);
  if (orden[0]?.desde !== 0) return false;
  for (let i = 1; i < orden.length; i++) if (orden[i].desde !== orden[i - 1].hasta) return false;
  return orden[orden.length - 1]?.hasta === fin;
}

describe("resumenExtractivo", () => {
  it("usa U:/A:, primera frase y recorta con puntos suspensivos", () => {
    const resumen = resumenExtractivo([
      { rol: "user", texto: "Primera frase corta. Segunda que no debe salir." },
      { rol: "assistant", texto: "Respuesta " + "muy ".repeat(60) },
    ], 400);
    expect(resumen.startsWith("U: Primera frase corta.")).toBe(true);
    expect(resumen).toContain(" | A: ");
    expect(resumen).not.toContain("Segunda que no debe salir");
    expect(resumen).toContain("…");
  });
});

describe("plegarHistorial", () => {
  it("si cabe todo no pliega nada", () => {
    const historial = turnos(4, 20);
    const res = plegarHistorial(historial, { presupuestoChars: 9000 });
    expect(res.bloques).toEqual([]);
    expect(res.recientes).toEqual(historial);
    expect(res.texto).toBe("");
    expect(res.descartadosChars).toBe(0);
  });

  it("con 40 turnos largos respeta recientes, cubre el rango y no pasa del presupuesto", () => {
    const historial = turnos(40, 300);
    const recientesChars = 700;
    const presupuestoChars = 2000;
    const res = plegarHistorial(historial, { presupuestoChars, recientesChars });
    const usados = res.recientes.reduce((s, t) => s + t.texto.length, 0);
    expect(usados).toBeLessThanOrEqual(recientesChars);
    expect(cubre(res.bloques, historial.length - res.recientes.length)).toBe(true);
    expect(res.texto.length).toBeLessThanOrEqual(presupuestoChars);
    expect(res.texto.startsWith(CABECERA_PLIEGUE)).toBe(true);
  });

  it("los bloques de nivel 1 ya hechos no cambian al añadir turnos al final", () => {
    const base = turnos(42, 100);
    const op = { presupuestoChars: 20000, recientesChars: 1800, maxResumenChars: 200 };
    const antes = plegarHistorial(base, op).bloques;
    const despues = plegarHistorial([...base, ...turnos(3, 100)], op).bloques;
    expect(antes.length).toBe(4);
    for (const bloque of antes) {
      const igual = despues.find((b) => b.id === bloque.id);
      expect(igual?.desde).toBe(bloque.desde);
      expect(igual?.hasta).toBe(bloque.hasta);
      expect(igual?.resumen).toBe(bloque.resumen);
    }
  });

  it("restaurarBloque devuelve exactamente el trozo original", () => {
    const historial = turnos(40, 300);
    const res = plegarHistorial(historial, { presupuestoChars: 2000, recientesChars: 700 });
    const bloque = res.bloques[0];
    expect(restaurarBloque(historial, bloque)).toEqual(historial.slice(bloque.desde, bloque.hasta));
  });

  it("usa el resumidor inyectado", () => {
    let llamadas = 0;
    const res = plegarHistorial(turnos(12, 40), {
      presupuestoChars: 5000,
      recientesChars: 0,
      resumidor: (ts, max) => {
        llamadas++;
        return `INYECTADO(${ts.length},${max})`;
      },
    });
    expect(llamadas).toBeGreaterThan(0);
    expect(res.bloques.every((b) => b.resumen.startsWith("INYECTADO"))).toBe(true);
  });

  it("es determinista", () => {
    const historial = turnos(40, 300);
    const op = { presupuestoChars: 2000, recientesChars: 700 };
    expect(plegarHistorial(historial, op)).toEqual(plegarHistorial(historial, op));
  });
});

describe("buscarEnBloques", () => {
  const historial: Turno[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ rol: "user" as const, texto: `hablamos del ornitorrinco ${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ rol: "assistant" as const, texto: `otra cosa distinta ${i}` })),
  ];

  it("encuentra el bloque que contiene la palabra y devuelve [] si no hay coincidencias", () => {
    const res = plegarHistorial(historial, { presupuestoChars: 5000, recientesChars: 0 });
    const encontrados = buscarEnBloques(historial, res.bloques, "ornitorrinco");
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].desde).toBe(0);
    expect(buscarEnBloques(historial, res.bloques, "inexistente")).toEqual([]);
  });
});
