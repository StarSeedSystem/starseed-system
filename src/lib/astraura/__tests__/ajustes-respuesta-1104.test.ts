/**
 * Ola 1104R · ajustes de respuesta — revisión con peces e interfaz viva.
 * Cubre SOLO las dos decisiones puras nuevas y sus valores por defecto:
 *   · `debeRevisarConPeces(ajustes, tipoDeTarea)` → creaciones sí, charla no.
 *   · `debeUsarInterfazViva(ajustes, señales)` → auto según datos/pasos/comparación.
 * Cada combinación de la preferencia con su contexto, incluida la ausencia de
 * la preferencia (ajustes antiguos guardados sin los campos nuevos).
 */

import { describe, expect, it } from "vitest";
import {
  ajustesAutomaticosPorDefecto,
  debeRevisarConPeces,
  debeUsarInterfazViva,
  type RevisionPeces,
  type InterfazRespuesta,
} from "@/lib/astraura/ajustes-respuesta";

const TAREAS_DE_CREACION = ["app", "pagina", "publicacion", "plan"];

describe("valores por defecto de los ajustes de respuesta", () => {
  it("revisa creaciones y deja la interfaz en automático", () => {
    const ajustes = ajustesAutomaticosPorDefecto();
    expect(ajustes.revisionPeces).toBe("creaciones");
    expect(ajustes.interfaz).toBe("auto");
  });

  it("sin los campos nuevos (ajustes antiguos) también rige el defecto", () => {
    const antiguos = { ...ajustesAutomaticosPorDefecto() };
    delete (antiguos as { revisionPeces?: RevisionPeces }).revisionPeces;
    delete (antiguos as { interfaz?: InterfazRespuesta }).interfaz;
    expect(debeRevisarConPeces(antiguos, "app")).toBe(true);
    expect(debeRevisarConPeces(antiguos, "charla")).toBe(false);
    expect(debeUsarInterfazViva(antiguos, { tieneDatos: false, tienePasos: false, tieneComparacion: false })).toBe(false);
    expect(debeUsarInterfazViva(antiguos, { tieneDatos: true, tienePasos: false, tieneComparacion: false })).toBe(true);
  });
});

describe("debeRevisarConPeces — cada preferencia con cada tipo de tarea", () => {
  const casos: ReadonlyArray<{ modo: RevisionPeces; esperado: boolean[] }> = [
    { modo: "creaciones", esperado: [true, true, true, true, false] },
    { modo: "siempre", esperado: [true, true, true, true, true] },
    { modo: "nunca", esperado: [false, false, false, false, false] },
  ];
  const tareas = [...TAREAS_DE_CREACION, "charla"];

  for (const { modo, esperado } of casos) {
    it(`con «${modo}» decide ${esperado.join(" · ")} para ${tareas.join(" · ")}`, () => {
      const ajustes = { ...ajustesAutomaticosPorDefecto(), revisionPeces: modo };
      tareas.forEach((tarea, i) => {
        expect(debeRevisarConPeces(ajustes, tarea)).toBe(esperado[i]);
      });
    });
  }

  it("normaliza mayúsculas y acentos del tipo de tarea", () => {
    const ajustes = ajustesAutomaticosPorDefecto();
    expect(debeRevisarConPeces(ajustes, "Página")).toBe(true);
    expect(debeRevisarConPeces(ajustes, "PUBLICACIÓN")).toBe(true);
    expect(debeRevisarConPeces(ajustes, "Aplicación")).toBe(true);
    expect(debeRevisarConPeces(ajustes, "Plan")).toBe(true);
    expect(debeRevisarConPeces(ajustes, "Charla")).toBe(false);
  });

  it("una tarea desconocida no se trata como creación", () => {
    const ajustes = ajustesAutomaticosPorDefecto();
    expect(debeRevisarConPeces(ajustes, "otra-cosa")).toBe(false);
  });
});

describe("debeUsarInterfazViva — cada preferencia con cada combinación de señales", () => {
  const senales = [false, true].flatMap((tieneDatos) =>
    [false, true].flatMap((tienePasos) =>
      [false, true].map((tieneComparacion) => ({ tieneDatos, tienePasos, tieneComparacion })),
    ),
  );
  const hayAlgunaSenal = (s: (typeof senales)[number]) => s.tieneDatos || s.tienePasos || s.tieneComparacion;

  const casos: ReadonlyArray<{ modo: InterfazRespuesta; esperado: (s: (typeof senales)[number]) => boolean }> = [
    { modo: "auto", esperado: hayAlgunaSenal },
    { modo: "viva", esperado: () => true },
    { modo: "texto", esperado: () => false },
  ];

  for (const { modo, esperado } of casos) {
    it(`con «${modo}» cubre las ocho combinaciones de datos/pasos/comparación`, () => {
      const ajustes = { ...ajustesAutomaticosPorDefecto(), interfaz: modo };
      for (const s of senales) {
        expect(debeUsarInterfazViva(ajustes, s)).toBe(esperado(s));
      }
    });
  }
});
