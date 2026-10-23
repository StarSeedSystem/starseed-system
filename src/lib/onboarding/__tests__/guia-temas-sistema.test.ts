/**
 * Pruebas de la guía de textos del sistema (Ola 1021G · GUI1021A).
 * Solo funciones puras: claves únicas, rutas reales, voz más corta que el
 * cuerpo y honestidad (la verificación biométrica no se presenta como hecho).
 */

import { describe, it, expect } from "vitest";
import { TEMAS_SISTEMA, temaPorClave } from "../guia-temas-sistema";

describe("TEMAS_SISTEMA · temas del sistema", () => {
  it("trae los temas exactos en orden", () => {
    expect(TEMAS_SISTEMA.map((t) => t.key)).toEqual([
      "protomolecula",
      "malla",
      "capas-conciencia",
      "neuronas-cerebro",
    ]);
  });

  it("las claves son únicas y todos los campos tienen contenido", () => {
    const claves = TEMAS_SISTEMA.map((t) => t.key);
    expect(new Set(claves).size).toBe(claves.length);
    for (const t of TEMAS_SISTEMA) {
      expect(t.titulo.length).toBeGreaterThan(0);
      expect(t.cuerpo.length).toBeGreaterThan(0);
      expect(t.voz.length).toBeGreaterThan(0);
      expect(t.preguntaAurora.length).toBeGreaterThan(0);
      expect(t.puntos.length).toBeGreaterThan(1);
      for (const p of t.puntos) expect(p.length).toBeGreaterThan(0);
    }
  });

  it("las rutas empiezan por «/» y capas-conciencia lleva al ajuste de inteligencia real", () => {
    // Rutas editables verificadas hoy en el código: «/cuenta?section=aurora-ia»
    // abre «Aurora e inteligencia» en la cuenta (src/app/(app)/cuenta/page.tsx).
    const capas = TEMAS_SISTEMA.find((t) => t.key === "capas-conciencia");
    expect(capas?.ruta).toBe("/cuenta?section=aurora-ia");
    for (const t of TEMAS_SISTEMA) {
      if (t.key === "capas-conciencia") continue;
      expect(t.ruta.startsWith("/")).toBe(true);
    }
  });

  it("la voz es más corta que el cuerpo en todos los temas", () => {
    for (const t of TEMAS_SISTEMA) expect(t.voz.length).toBeLessThan(t.cuerpo.length);
  });

  it("ningún texto presenta la verificación biométrica como hecho", () => {
    for (const t of TEMAS_SISTEMA) {
      const textos = [t.titulo, t.cuerpo, t.voz, t.preguntaAurora, ...t.puntos];
      for (const texto of textos) expect(texto).not.toMatch(/biométric/i);
    }
  });

  it("temaPorClave encuentra por clave y devuelve undefined si no existe", () => {
    expect(temaPorClave("malla")?.ruta).toBe("/red-mesh");
    expect(temaPorClave("neuronas-cerebro")?.ruta).toBe("/cerebro");
    expect(temaPorClave("protomolecula")?.ruta).toBe("/protomolecula");
    expect(temaPorClave("tema-que-no-existe")).toBeUndefined();
  });
});
