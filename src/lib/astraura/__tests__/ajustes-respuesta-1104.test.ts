/**
 * `ajustes-respuesta.ts` — ajustes nuevos de la ola 1104 (revisión con peces e interfaz viva).
 * Cubre: valores por defecto, cada combinación de `revisionPeces` e `interfaz`,
 * y las dos funciones puras de decisión.
 */

import { describe, expect, it } from "vitest";
import {
  ajustesAutomaticosPorDefecto,
  debeRevisarConPeces,
  debeUsarInterfazViva,
  esTodoAutomatico,
  resolverAjustes,
  type AjustesManualRespuesta,
  type TipoDeTarea,
} from "@/lib/astraura/ajustes-respuesta";

function manualPorDefecto(): AjustesManualRespuesta {
  return ajustesAutomaticosPorDefecto();
}

describe("ajustesAutomaticosPorDefecto — nuevos controles", () => {
  it("incluye revisionPeces en 'creaciones' con auto=true", () => {
    const d = ajustesAutomaticosPorDefecto();
    expect(d.revisionPeces).toEqual({ auto: true, valor: "creaciones" });
  });

  it("incluye interfaz en 'auto' con auto=true", () => {
    const d = ajustesAutomaticosPorDefecto();
    expect(d.interfaz).toEqual({ auto: true, valor: "auto" });
  });

  it("esTodoAutomatico devuelve true cuando los nuevos controles también están en auto", () => {
    expect(esTodoAutomatico(manualPorDefecto())).toBe(true);
  });

  it("esTodoAutomatico devuelve false si revisionPeces está en manual", () => {
    const m = manualPorDefecto();
    m.revisionPeces = { auto: false, valor: "siempre" };
    expect(esTodoAutomatico(m)).toBe(false);
  });

  it("esTodoAutomatico devuelve false si interfaz está en manual", () => {
    const m = manualPorDefecto();
    m.interfaz = { auto: false, valor: "viva" };
    expect(esTodoAutomatico(m)).toBe(false);
  });
});

describe("debeRevisarConPeces — decisión pura", () => {
  const ajustesBase = manualPorDefecto();

  it("por defecto (creaciones): true para apps, páginas, publicaciones, planes", () => {
    expect(debeRevisarConPeces(ajustesBase, "app")).toBe(true);
    expect(debeRevisarConPeces(ajustesBase, "pagina")).toBe(true);
    expect(debeRevisarConPeces(ajustesBase, "publicacion")).toBe(true);
    expect(debeRevisarConPeces(ajustesBase, "plan")).toBe(true);
  });

  it("por defecto (creaciones): false para charla", () => {
    expect(debeRevisarConPeces(ajustesBase, "charla")).toBe(false);
  });

  it("revisionPeces='siempre': true para todos los tipos de tarea", () => {
    const m = { ...ajustesBase, revisionPeces: { auto: false, valor: "siempre" as const } };
    expect(debeRevisarConPeces(m, "app")).toBe(true);
    expect(debeRevisarConPeces(m, "pagina")).toBe(true);
    expect(debeRevisarConPeces(m, "publicacion")).toBe(true);
    expect(debeRevisarConPeces(m, "plan")).toBe(true);
    expect(debeRevisarConPeces(m, "charla")).toBe(true);
  });

  it("revisionPeces='nunca': false para todos los tipos de tarea", () => {
    const m = { ...ajustesBase, revisionPeces: { auto: false, valor: "nunca" as const } };
    expect(debeRevisarConPeces(m, "app")).toBe(false);
    expect(debeRevisarConPeces(m, "pagina")).toBe(false);
    expect(debeRevisarConPeces(m, "publicacion")).toBe(false);
    expect(debeRevisarConPeces(m, "plan")).toBe(false);
    expect(debeRevisarConPeces(m, "charla")).toBe(false);
  });

  it("revisionPeces en auto=true usa el valor por defecto 'creaciones'", () => {
    const m = { ...ajustesBase, revisionPeces: { auto: true, valor: "siempre" as const } };
    expect(debeRevisarConPeces(m, "app")).toBe(true);
    expect(debeRevisarConPeces(m, "charla")).toBe(false);
  });
});

describe("debeUsarInterfazViva — decisión pura", () => {
  const ajustesBase = manualPorDefecto();
  const contextoBase = { tieneDatos: false, tienePasos: false, tieneComparacion: false };

  it("por defecto (auto): true cuando hay datos, pasos o comparación", () => {
    expect(debeUsarInterfazViva(ajustesBase, { ...contextoBase, tieneDatos: true })).toBe(true);
    expect(debeUsarInterfazViva(ajustesBase, { ...contextoBase, tienePasos: true })).toBe(true);
    expect(debeUsarInterfazViva(ajustesBase, { ...contextoBase, tieneComparacion: true })).toBe(true);
  });

  it("por defecto (auto): false cuando no hay datos, pasos ni comparación", () => {
    expect(debeUsarInterfazViva(ajustesBase, contextoBase)).toBe(false);
  });

  it("interfaz='viva': true siempre", () => {
    const m = { ...ajustesBase, interfaz: { auto: false, valor: "viva" as const } };
    expect(debeUsarInterfazViva(m, contextoBase)).toBe(true);
    expect(debeUsarInterfazViva(m, { ...contextoBase, tieneDatos: true })).toBe(true);
  });

  it("interfaz='texto': false siempre", () => {
    const m = { ...ajustesBase, interfaz: { auto: false, valor: "texto" as const } };
    expect(debeUsarInterfazViva(m, contextoBase)).toBe(false);
    expect(debeUsarInterfazViva(m, { ...contextoBase, tieneDatos: true })).toBe(false);
    expect(debeUsarInterfazViva(m, { ...contextoBase, tienePasos: true })).toBe(false);
    expect(debeUsarInterfazViva(m, { ...contextoBase, tieneComparacion: true })).toBe(false);
  });

  it("interfaz en auto=true usa el valor por defecto 'auto'", () => {
    const m = { ...ajustesBase, interfaz: { auto: true, valor: "viva" as const } };
    expect(debeUsarInterfazViva(m, contextoBase)).toBe(false);
    expect(debeUsarInterfazViva(m, { ...contextoBase, tieneDatos: true })).toBe(true);
  });
});

describe("resolverAjustes — no rompe los controles existentes con los nuevos", () => {
  it("con auto=true global, ignora los nuevos controles también", () => {
    const manualConTodoFijado: AjustesManualRespuesta = {
      ...manualPorDefecto(),
      esfuerzo: { auto: false, valor: "maximo" },
      tipo: { auto: false, valor: "codigo" },
      tiempo: { auto: false, valor: "5s" },
      revisionPeces: { auto: false, valor: "siempre" },
      interfaz: { auto: false, valor: "viva" },
    };
    const r = resolverAjustes(true, manualConTodoFijado);
    expect(r.maxTokens).toBeUndefined();
    expect(r.instruccion).toBe("");
    expect(r.plazoMs).toBeUndefined();
    expect(r.pistaDeRuta.difficultyDelta).toBe(0);
    expect(r.badge).toBe("");
  });
});