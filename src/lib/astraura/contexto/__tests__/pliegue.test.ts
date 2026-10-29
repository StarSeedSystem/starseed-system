/**
 * Tests PUROS del pliegue de historial (idea de billion-context, código propio):
 * rangos estables, recientes acotados, restauración, búsqueda y determinismo.
 * Sin red, sin disco y sin `node:*`.
 */
import { describe, expect, it } from "vitest";
import {
  ENCABEZADO_PLIEGUE,
  buscarEnBloques,
  plegarHistorial,
  restaurarBloque,
  type Turno,
} from "@/lib/astraura/contexto/pliegue";

function historialLargo(n: number, largo = 100): Turno[] {
  return Array.from({ length: n }, (_, i) => ({
    rol: i % 2 === 0 ? "user" : "assistant",
    texto: `Turno ${i} ${"palabra ".repeat(20)}`.slice(0, largo),
  }));
}

const OPCIONES = { presupuestoChars: 2000, recientesChars: 600, maxResumenChars: 120 };

describe("plegarHistorial", () => {
  it("si todo cabe, no hay bloques y el texto queda vacío", () => {
    const historial: Turno[] = [
      { rol: "user", texto: "Hola." },
      { rol: "assistant", texto: "Buenas." },
    ];
    const resultado = plegarHistorial(historial, { presupuestoChars: 1000 });
    expect(resultado.bloques).toEqual([]);
    expect(resultado.texto).toBe("");
    expect(resultado.recientes).toEqual(historial);
    expect(resultado.descartadosChars).toBe(0);
  });

  it("40 turnos largos: recientes acotados, bloques contiguos y texto dentro del presupuesto", () => {
    const historial = historialLargo(40);
    const resultado = plegarHistorial(historial, OPCIONES);
    const usados = resultado.recientes.reduce((n, turno) => n + turno.texto.length, 0);
    expect(usados).toBeLessThanOrEqual(600);
    expect(resultado.recientes).toEqual(historial.slice(historial.length - resultado.recientes.length));

    const corte = historial.length - resultado.recientes.length;
    let esperado = 0;
    for (const bloque of resultado.bloques) {
      expect(bloque.desde).toBe(esperado);
      expect(bloque.hasta).toBeGreaterThan(bloque.desde);
      esperado = bloque.hasta;
    }
    expect(esperado).toBe(corte);
    expect(resultado.texto.length).toBeLessThanOrEqual(2000);
    expect(resultado.texto.startsWith(ENCABEZADO_PLIEGUE)).toBe(true);
  });

  it("estabilidad: añadir turnos al final no cambia los bloques de nivel 1 ya completos", () => {
    const opciones = { presupuestoChars: 5000, recientesChars: 600, maxResumenChars: 120 };
    const base = historialLargo(40);
    const nuevos = historialLargo(3).map((turno, i) => ({
      ...turno,
      texto: `Nuevo ${i} ${turno.texto}`.slice(0, 100),
    }));
    const antes = plegarHistorial(base, opciones);
    const despues = plegarHistorial([...base, ...nuevos], opciones);
    const completos = antes.bloques.filter((bloque) => bloque.nivel === 1 && bloque.hasta - bloque.desde === 6);
    expect(completos.length).toBeGreaterThan(0);
    for (const bloque of completos) {
      expect(despues.bloques.find((otro) => otro.id === bloque.id)).toEqual(bloque);
    }
  });

  it("restaurarBloque devuelve exactamente el trozo original", () => {
    const historial = historialLargo(40);
    const { bloques } = plegarHistorial(historial, OPCIONES);
    const bloque = bloques[1];
    expect(restaurarBloque(historial, bloque)).toEqual(historial.slice(bloque.desde, bloque.hasta));
  });

  it("buscarEnBloques encuentra el bloque con la palabra y no inventa coincidencias", () => {
    const historial: Turno[] = Array.from({ length: 18 }, (_, i) => ({
      rol: i % 2 === 0 ? "user" : "assistant",
      texto: i === 7 ? "Hablamos de la geometría sagrada y la espiral áurea." : `Relleno número ${i} sin tema especial.`,
    }));
    const { bloques } = plegarHistorial(historial, { presupuestoChars: 400, recientesChars: 120, maxResumenChars: 80 });
    const encontrados = buscarEnBloques(historial, bloques, "geometria");
    expect(encontrados.length).toBeGreaterThan(0);
    expect(encontrados[0].desde).toBe(6);
    expect(encontrados[0].hasta).toBe(12);
    expect(buscarEnBloques(historial, bloques, "xilófono")).toEqual([]);
    expect(buscarEnBloques(historial, bloques, "de")).toEqual([]);
  });

  it("usa el resumidor inyectado", () => {
    const historial = historialLargo(40);
    let llamadas = 0;
    const resultado = plegarHistorial(historial, {
      ...OPCIONES,
      presupuestoChars: 3000,
      resumidor: (turnos, maxChars) => {
        llamadas += 1;
        return `RESUMEN ${turnos.length} ${maxChars}`;
      },
    });
    expect(llamadas).toBeGreaterThan(0);
    expect(resultado.bloques.length).toBeGreaterThan(0);
    for (const bloque of resultado.bloques) {
      expect(bloque.resumen).toContain("RESUMEN");
    }
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const historial = historialLargo(40);
    expect(plegarHistorial(historial, OPCIONES)).toEqual(plegarHistorial(historial, OPCIONES));
  });
});
