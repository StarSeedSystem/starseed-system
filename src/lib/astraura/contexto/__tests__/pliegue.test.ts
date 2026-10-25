import { describe, it, expect } from "vitest";
import {
  buscarEnBloques,
  plegarHistorial,
  restaurarBloque,
  resumenExtractivo,
  type Turno,
} from "../pliegue";

function largo(i: number, tam = 400): Turno {
  const relleno = `turno ${i} ${"palabra ".repeat(Math.ceil(tam / 8))}`.slice(0, tam);
  return { rol: i % 2 === 0 ? "user" : "assistant", texto: relleno };
}

function historial(n: number, tam = 400): Turno[] {
  return Array.from({ length: n }, (_, i) => largo(i, tam));
}

describe("pliegue de historial", () => {
  it("si cabe todo, no hay bloques y el texto queda vacío", () => {
    const corto: Turno[] = [
      { rol: "user", texto: "Hola, ¿qué tal?" },
      { rol: "assistant", texto: "Bien. ¿En qué te ayudo?" },
    ];
    const r = plegarHistorial(corto, { presupuestoChars: 1000 });
    expect(r.bloques).toEqual([]);
    expect(r.texto).toBe("");
    expect(r.recientes).toEqual(corto);
  });

  it("40 turnos largos: recientes acotados, bloques contiguos y texto dentro del presupuesto", () => {
    const h = historial(40, 400);
    const r = plegarHistorial(h, { presupuestoChars: 9000 });
    const usados = r.recientes.reduce((s, t) => s + t.texto.length, 0);
    expect(usados).toBeLessThanOrEqual(Math.floor(9000 * 0.6));
    expect(r.bloques.length).toBeGreaterThan(0);
    expect(r.bloques[0].desde).toBe(0);
    for (let i = 1; i < r.bloques.length; i++) {
      expect(r.bloques[i].desde).toBe(r.bloques[i - 1].hasta);
    }
    expect(r.bloques[r.bloques.length - 1].hasta).toBe(h.length - r.recientes.length);
    expect(r.texto.length).toBeLessThanOrEqual(9000);
  });

  it("añadir turnos al final no cambia los bloques de nivel 1 ya cerrados", () => {
    const base = historial(20, 120);
    const op = { presupuestoChars: 2000, recientesChars: 600 };
    const antes = plegarHistorial(base, op);
    const despues = plegarHistorial([...base, ...[20, 21, 22].map((i) => largo(i, 120))], op);
    const cerrados = antes.bloques.filter((b) => b.hasta <= 12);
    expect(cerrados.length).toBe(2);
    for (const b of cerrados) {
      const igual = despues.bloques.find((x) => x.desde === b.desde && x.hasta === b.hasta);
      expect(igual?.resumen).toBe(b.resumen);
      expect(igual?.nivel).toBe(1);
    }
    expect(despues.bloques.every((b) => b.nivel === 1)).toBe(true);
  });

  it("restaurarBloque devuelve exactamente el trozo original", () => {
    const h = historial(20, 120);
    const r = plegarHistorial(h, { presupuestoChars: 2000, recientesChars: 600 });
    const bloque = r.bloques[0];
    expect(restaurarBloque(h, bloque)).toEqual(h.slice(bloque.desde, bloque.hasta));
  });

  it("buscarEnBloques encuentra el bloque con la palabra y devuelve vacío si no hay coincidencias", () => {
    const h = historial(20, 120);
    h[2] = { rol: "user", texto: "El ornitorrinco aparece aquí. Relleno ".padEnd(120, ".") };
    const r = plegarHistorial(h, { presupuestoChars: 2000, recientesChars: 600 });
    const encontrados = buscarEnBloques(h, r.bloques, "ÓRNITORRINCO");
    expect(encontrados).toEqual([r.bloques[0]]);
    expect(buscarEnBloques(h, r.bloques, "jirafa")).toEqual([]);
  });

  it("usa el resumidor inyectado cuando hay que plegar", () => {
    let llamadas = 0;
    const r = plegarHistorial(historial(20, 120), {
      presupuestoChars: 2000,
      recientesChars: 600,
      resumidor: (turnos, max) => {
        llamadas += 1;
        return `R${llamadas}:${turnos.length}:${max}`;
      },
    });
    expect(llamadas).toBeGreaterThan(0);
    expect(r.texto).toContain("R1:");
  });

  it("dos ejecuciones iguales dan resultados iguales", () => {
    const h = historial(40, 200);
    const a = plegarHistorial(h, { presupuestoChars: 4000 });
    const b = plegarHistorial(h, { presupuestoChars: 4000 });
    expect(a).toEqual(b);
  });

  it("resumen extractivo usa U/A y se queda con la primera frase", () => {
    const turnos: Turno[] = [{ rol: "user", texto: "Primera frase. Segunda que no va." }];
    expect(resumenExtractivo(turnos, 100)).toBe("U: Primera frase.");
  });
});
