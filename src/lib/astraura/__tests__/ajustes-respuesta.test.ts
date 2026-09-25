/**
 * `ajustes-respuesta.ts` — botón «Más ajustes» del compositor de Astraura.
 * Cubre: automático real (sin cambios), cada control por separado, la
 * combinación de varios a la vez (badge), el atajo global `auto=true` que
 * ignora `manual`, y la degradación defensiva ante un valor guardado que ya
 * no existe en el catálogo (p.ej. tras quitar un nivel).
 */

import { describe, expect, it } from "vitest";
import {
  ajustesAutomaticosPorDefecto,
  AJUSTES_RESUELTOS_AUTOMATICOS,
  esTodoAutomatico,
  NIVELES_ESFUERZO,
  ORDEN_ESFUERZO,
  ORDEN_TIEMPOS,
  ORDEN_TIPOS,
  resolverAjustes,
  TIEMPOS_MAXIMOS,
  TIPOS_RESPUESTA,
  type AjustesManualRespuesta,
} from "@/lib/astraura/ajustes-respuesta";

/** Manual con TODO en automático (equivalente a lo que pinta el popover sin tocar nada). */
function manualAutomatico(): AjustesManualRespuesta {
  return ajustesAutomaticosPorDefecto();
}

describe("resolverAjustes — automático real (sin cambios)", () => {
  it("con auto=true global, ignora `manual` por completo", () => {
    const manualConTodoFijado: AjustesManualRespuesta = {
      esfuerzo: { auto: false, valor: "maximo" },
      tipo: { auto: false, valor: "codigo" },
      tiempo: { auto: false, valor: "5s" },
    };
    const r = resolverAjustes(true, manualConTodoFijado);
    expect(r).toEqual(AJUSTES_RESUELTOS_AUTOMATICOS);
    expect(r.maxTokens).toBeUndefined();
    expect(r.instruccion).toBe("");
    expect(r.plazoMs).toBeUndefined();
    expect(r.pistaDeRuta.difficultyDelta).toBe(0);
    expect(r.badge).toBe("");
  });

  it("con auto=false pero los tres controles en automático, el resultado es idéntico al automático global", () => {
    const r = resolverAjustes(false, manualAutomatico());
    expect(r).toEqual(AJUSTES_RESUELTOS_AUTOMATICOS);
  });

  it("esTodoAutomatico() refleja el estado inicial del popover", () => {
    expect(esTodoAutomatico(manualAutomatico())).toBe(true);
    expect(esTodoAutomatico({ ...manualAutomatico(), esfuerzo: { auto: false, valor: "rapido" } })).toBe(false);
  });
});

describe("resolverAjustes — Esfuerzo", () => {
  it("Rápido: dificultad negativa (favorece modelos rápidos/locales) y tope de tokens bajo", () => {
    const m = manualAutomatico();
    m.esfuerzo = { auto: false, valor: "rapido" };
    const r = resolverAjustes(false, m);
    expect(r.pistaDeRuta.difficultyDelta).toBeLessThan(0);
    expect(r.maxTokens).toBe(NIVELES_ESFUERZO.rapido.maxTokens);
    expect(r.badge).toContain("Rápido");
    // Los otros controles siguen automáticos: no aportan nada.
    expect(r.instruccion).toBe("");
    expect(r.plazoMs).toBeUndefined();
  });

  it("Máximo: dificultad positiva y el mayor tope de tokens del catálogo", () => {
    const m = manualAutomatico();
    m.esfuerzo = { auto: false, valor: "maximo" };
    const r = resolverAjustes(false, m);
    expect(r.pistaDeRuta.difficultyDelta).toBeGreaterThan(0);
    expect(r.maxTokens).toBe(NIVELES_ESFUERZO.maximo.maxTokens);
    const todos = ORDEN_ESFUERZO.map((n) => NIVELES_ESFUERZO[n].maxTokens);
    expect(r.maxTokens).toBe(Math.max(...todos));
  });

  it("el orden de niveles es monótono: cada nivel pide igual o más dificultad/tokens que el anterior", () => {
    for (let i = 1; i < ORDEN_ESFUERZO.length; i++) {
      const prev = NIVELES_ESFUERZO[ORDEN_ESFUERZO[i - 1]];
      const cur = NIVELES_ESFUERZO[ORDEN_ESFUERZO[i]];
      expect(cur.difficultyDelta).toBeGreaterThanOrEqual(prev.difficultyDelta);
      expect(cur.maxTokens).toBeGreaterThanOrEqual(prev.maxTokens);
    }
  });

  it("con el control en automático, el nivel elegido (valor) no importa", () => {
    const m = manualAutomatico();
    m.esfuerzo = { auto: true, valor: "maximo" }; // valor "recordado" pero apagado
    const r = resolverAjustes(false, m);
    expect(r.pistaDeRuta.difficultyDelta).toBe(0);
    expect(r.maxTokens).toBeUndefined();
    expect(r.badge).toBe("");
  });
});

describe("resolverAjustes — Tipo de respuesta", () => {
  it("cada tipo (salvo auto) aporta una instrucción no vacía y distinta", () => {
    const instrucciones = new Set<string>();
    for (const tipo of ORDEN_TIPOS) {
      if (tipo === "auto") continue;
      const m = manualAutomatico();
      m.tipo = { auto: false, valor: tipo };
      const r = resolverAjustes(false, m);
      expect(r.instruccion.length).toBeGreaterThan(0);
      instrucciones.add(r.instruccion);
      expect(r.badge).toBe(TIPOS_RESPUESTA[tipo].etiqueta);
    }
    expect(instrucciones.size).toBe(ORDEN_TIPOS.length - 1); // todas distintas
  });

  it('valor "auto" explícito no aporta instrucción aunque el control diga auto:false', () => {
    const m = manualAutomatico();
    m.tipo = { auto: false, valor: "auto" };
    const r = resolverAjustes(false, m);
    expect(r.instruccion).toBe("");
    expect(r.badge).toBe("");
  });

  it("paso a paso pide pasos numerados y código pide bloques de código", () => {
    const m = manualAutomatico();
    m.tipo = { auto: false, valor: "paso_a_paso" };
    expect(resolverAjustes(false, m).instruccion).toMatch(/paso/i);

    m.tipo = { auto: false, valor: "codigo" };
    expect(resolverAjustes(false, m).instruccion).toMatch(/código/i);
  });
});

describe("resolverAjustes — Tiempo máximo aproximado", () => {
  it("cada tiempo (salvo sin límite) resuelve a los milisegundos correctos", () => {
    const esperado: Record<string, number> = { "5s": 5_000, "15s": 15_000, "30s": 30_000, "1min": 60_000, "3min": 180_000 };
    for (const [valor, ms] of Object.entries(esperado)) {
      const m = manualAutomatico();
      m.tiempo = { auto: false, valor: valor as never };
      expect(resolverAjustes(false, m).plazoMs).toBe(ms);
    }
  });

  it('"sin límite" elegido a mano no fija plazo, pero SÍ aparece en el badge (fue una elección explícita)', () => {
    const m = manualAutomatico();
    m.tiempo = { auto: false, valor: "sin_limite" };
    const r = resolverAjustes(false, m);
    expect(r.plazoMs).toBeUndefined();
    expect(r.badge).toContain("sin límite");
  });

  it("el orden de tiempos es creciente en milisegundos (salvo el último, sin límite)", () => {
    const conMs = ORDEN_TIEMPOS.filter((t) => typeof TIEMPOS_MAXIMOS[t].ms === "number");
    for (let i = 1; i < conMs.length; i++) {
      expect(TIEMPOS_MAXIMOS[conMs[i]].ms!).toBeGreaterThan(TIEMPOS_MAXIMOS[conMs[i - 1]].ms!);
    }
    expect(ORDEN_TIEMPOS[ORDEN_TIEMPOS.length - 1]).toBe("sin_limite");
  });
});

describe("resolverAjustes — combinación de varios controles (badge)", () => {
  it("badge junta SOLO los controles no automáticos, en orden esfuerzo · tipo · tiempo", () => {
    const m: AjustesManualRespuesta = {
      esfuerzo: { auto: false, valor: "profundo" },
      tipo: { auto: false, valor: "paso_a_paso" },
      tiempo: { auto: false, valor: "30s" },
    };
    const r = resolverAjustes(false, m);
    expect(r.badge).toBe("Profundo · Paso a paso · ≤30 s");
  });

  it("badge omite los controles que siguen en automático", () => {
    const m: AjustesManualRespuesta = {
      esfuerzo: { auto: false, valor: "profundo" },
      tipo: { auto: true, valor: "codigo" }, // valor recordado, pero apagado
      tiempo: { auto: false, valor: "1min" },
    };
    const r = resolverAjustes(false, m);
    expect(r.badge).toBe("Profundo · ≤1 min");
    expect(r.instruccion).toBe(""); // el tipo automático no filtra su instrucción
  });
});

describe("resolverAjustes — defensivo ante valores guardados obsoletos", () => {
  it("un `valor` que ya no existe en el catálogo degrada a un default sin lanzar", () => {
    const m: AjustesManualRespuesta = {
      esfuerzo: { auto: false, valor: "nivel-retirado" as never },
      tipo: { auto: false, valor: "tipo-retirado" as never },
      tiempo: { auto: false, valor: "tiempo-retirado" as never },
    };
    expect(() => resolverAjustes(false, m)).not.toThrow();
    const r = resolverAjustes(false, m);
    expect(typeof r.maxTokens).toBe("number");
    expect(typeof r.pistaDeRuta.difficultyDelta).toBe("number");
  });
});
