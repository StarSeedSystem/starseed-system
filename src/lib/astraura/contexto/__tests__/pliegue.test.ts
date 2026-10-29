import { describe, it, expect } from "vitest";
import {
  plegarHistorial,
  restaurarBloque,
  buscarEnBloques,
  type Turno,
} from "../pliegue";

function turno(indice: number): Turno {
  const rol: Turno["rol"] = indice % 2 === 0 ? "user" : "assistant";
  return { rol, texto: `Tema ${indice} ${"dato ".repeat(15)}.` };
}

function historialLargo(cantidad: number): Turno[] {
  return Array.from({ length: cantidad }, (_, indice) => turno(indice));
}

describe("plegarHistorial", () => {
  it("no pliega nada cuando todo cabe", () => {
    const historial: Turno[] = [
      { rol: "user", texto: "Hola" },
      { rol: "assistant", texto: "Qué tal" },
    ];
    const resultado = plegarHistorial(historial, { presupuestoChars: 5000 });
    expect(resultado.bloques).toEqual([]);
    expect(resultado.texto).toBe("");
    expect(resultado.recientes).toEqual(historial);
    expect(resultado.descartadosChars).toBe(0);
  });

  it("cubre lo antiguo en bloques contiguos sin pasarse del presupuesto", () => {
    const historial = historialLargo(40);
    const resultado = plegarHistorial(historial, { presupuestoChars: 2000, recientesChars: 600, maxResumenChars: 120 });
    const usados = resultado.recientes.reduce((total, t) => total + t.texto.length, 0);
    expect(usados).toBeLessThanOrEqual(600);
    expect(resultado.recientes.length).toBeGreaterThan(0);
    expect(resultado.bloques.length).toBeGreaterThan(0);
    let esperado = 0;
    for (const bloque of resultado.bloques) {
      expect(bloque.desde).toBe(esperado);
      expect(bloque.hasta).toBeGreaterThan(bloque.desde);
      esperado = bloque.hasta;
    }
    expect(esperado).toBe(historial.length - resultado.recientes.length);
    expect(resultado.texto.length).toBeLessThanOrEqual(2000);
  });

  it("mantiene estables los bloques completos al añadir turnos", () => {
    const opciones = { presupuestoChars: 1800, recientesChars: 200 };
    const base = plegarHistorial(historialLargo(40), opciones);
    const ampliado = plegarHistorial(historialLargo(43), opciones);
    const completos = base.bloques.filter((b) => b.hasta - b.desde === 6);
    expect(completos.length).toBeGreaterThan(0);
    for (const bloque of completos) {
      const equivalente = ampliado.bloques.find((b) => b.desde === bloque.desde);
      expect(equivalente).toMatchObject({ hasta: bloque.hasta, resumen: bloque.resumen, nivel: 1 });
    }
  });

  it("restaura exactamente el trozo original", () => {
    const historial = historialLargo(40);
    const resultado = plegarHistorial(historial, { presupuestoChars: 1000, recientesChars: 200 });
    const bloque = resultado.bloques[0];
    expect(restaurarBloque(historial, bloque)).toEqual(historial.slice(bloque.desde, bloque.hasta));
  });
});

describe("búsqueda y determinismo", () => {
  it("encuentra el bloque con la palabra y vacío si no hay coincidencias", () => {
    const historial = historialLargo(20);
    historial[0] = { rol: "user", texto: "El ornitorrinco vive en el arroyo. Más detalle." };
    historial[7] = { rol: "assistant", texto: "Hablamos de la armonía de las esferas. Más texto." };
    const resultado = plegarHistorial(historial, { presupuestoChars: 1200, recientesChars: 200 });
    const encontrados = buscarEnBloques(historial, resultado.bloques, "ornitorrinco");
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].desde).toBe(0);
    expect(buscarEnBloques(historial, resultado.bloques, "inexistente")).toEqual([]);
    const conAcento = buscarEnBloques(historial, resultado.bloques, "armonia");
    expect(conAcento).toHaveLength(1);
    expect(conAcento[0].desde).toBeLessThanOrEqual(7);
    expect(conAcento[0].hasta).toBeGreaterThan(7);
  });

  it("usa el resumidor inyectado", () => {
    let llamadas = 0;
    const resultado = plegarHistorial(historialLargo(20), {
      presupuestoChars: 1200,
      recientesChars: 200,
      resumidor: (turnos) => {
        expect(turnos.length).toBeGreaterThan(0);
        llamadas += 1;
        return "RESUMEN-X";
      },
    });
    expect(llamadas).toBeGreaterThan(0);
    expect(resultado.bloques.length).toBeGreaterThan(0);
    expect(resultado.bloques.every((b) => b.resumen === "RESUMEN-X")).toBe(true);
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const historial = historialLargo(40);
    const opciones = { presupuestoChars: 1500, recientesChars: 300, maxResumenChars: 90 };
    expect(plegarHistorial(historial, opciones)).toEqual(plegarHistorial(historial, opciones));
  });
});
