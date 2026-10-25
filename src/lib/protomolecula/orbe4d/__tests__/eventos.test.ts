import { describe, expect, it } from "vitest";
import { dentroDeZona, leerDetalle, leerEstilo, nivelDeVoz, zonaApagado } from "../eventos";

describe("eventos de la orbe 4D", () => {
  it("valida lo que llega por el evento: nada raro pasa al motor", () => {
    expect(leerDetalle({ estado: "cargando", progreso: 1.7 })).toEqual({ estado: "cargando", progreso: 1, etiqueta: undefined });
    expect(leerDetalle({ estado: "forma", forma: "teseracto" })).toEqual({ estado: "forma", forma: "teseracto" });
    expect(leerDetalle({ estado: "forma", forma: "modelo" })).toEqual({ estado: "forma", forma: null });
    expect(leerDetalle({ estado: "estilo", estilo: "experimental" })).toEqual({ estado: "estilo", estilo: "experimental" });
    expect(leerDetalle({ estado: "estilo", estilo: "x" })).toBeNull();
    expect(leerDetalle({ estado: "transformar", modelo: "javascript:alert(1)" })).toBeNull();
    expect(leerDetalle({ estado: "transformar", modelo: "blob:http://localhost/abc" })).toMatchObject({ estado: "transformar" });
    expect(leerDetalle({ estado: "transformar", modelo: new Float32Array(9) })).toMatchObject({ estado: "transformar" });
    expect(leerDetalle({ estado: "borrar-todo" })).toBeNull();
    expect(leerDetalle(null)).toBeNull();
  });

  it("su zona de apagado es el borde izquierdo, centrada en vertical", () => {
    const z = zonaApagado(1440, 900);
    expect(z.x).toBe(0);
    expect(z.y + z.alto / 2).toBeCloseTo(450, 0);
    expect(dentroDeZona(30, 450, z)).toBe(true);
    expect(dentroDeZona(720, 20, z)).toBe(false); // arriba al centro es la de Astraura
    // En pantallas chicas la franja guarda su proporción con la diana (44 px en un móvil estrecho, 45 px en uno ancho).
    expect(zonaApagado(390, 844).ancho).toBe(97);
    expect(zonaApagado(500, 844).ancho).toBe(99);
    expect(zonaApagado(1440, 900).ancho).toBe(120);
    for (const ancho of [320, 360, 390, 414, 500, 639]) expect(zonaApagado(ancho, 800).ancho).toBeGreaterThanOrEqual(2 * 44);
  });

  it("estilo por defecto y voz de Astraura", () => {
    expect(leerEstilo(null)).toBe("expresiva");
    expect(leerEstilo({ getItem: () => "sobria", setItem: () => undefined })).toBe("sobria");
    expect(nivelDeVoz("start")).toBe(0.8);
    expect(nivelDeVoz("end")).toBe(0);
  });
});
