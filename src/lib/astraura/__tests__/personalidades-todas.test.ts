/**
 * personalidades-todas — cubre el chip «Todas» de la bandeja «Personalidades
 * activas»: detectar si están todas activas y alternar de forma reversible
 * («Todas» ⇄ «Solo una»), incluido el cambio de modo cuando hace falta.
 * Todo puro: sin red, sin DOM.
 */

import { describe, expect, it } from "vitest";
import {
  alternarTodasPersonalidades,
  todasPersonalidadesActivas,
  type SeleccionPersonalidades,
} from "@/lib/astraura/personalidades-todas";

const TODOS = ["astraura_prime", "aurora", "hermione", "hephaestus", "hermes"];

describe("todasPersonalidadesActivas", () => {
  it("es true cuando la selección cubre exactamente el catálogo", () => {
    expect(todasPersonalidadesActivas([...TODOS], TODOS)).toBe(true);
  });

  it("es true con el mismo conjunto en otro orden o con duplicados", () => {
    expect(todasPersonalidadesActivas([...TODOS].reverse(), TODOS)).toBe(true);
    expect(todasPersonalidadesActivas([...TODOS, "aurora"], TODOS)).toBe(true);
  });

  it("es false si falta al menos una", () => {
    expect(todasPersonalidadesActivas(TODOS.slice(0, -1), TODOS)).toBe(false);
  });

  it("es false con un catálogo vacío (nunca hay 'todas' de la nada)", () => {
    expect(todasPersonalidadesActivas([], [])).toBe(false);
  });
});

describe("alternarTodasPersonalidades", () => {
  it("activa TODAS cuando no lo estaban, y sube el modo 'single' a 'multi_dialogue'", () => {
    const actual: SeleccionPersonalidades = { personas: ["aurora"], mode: "single" };
    const r = alternarTodasPersonalidades(actual, TODOS, null, "astraura_prime");
    expect(r.siguiente.personas).toEqual(TODOS);
    expect(r.siguiente.mode).toBe("multi_dialogue");
    // Recuerda el estado previo para poder volver con el siguiente toggle.
    expect(r.recordar).toEqual(actual);
  });

  it("NO toca el modo si ya era 'multi_dialogue' o 'coral_synthesis'", () => {
    const dialogo: SeleccionPersonalidades = { personas: ["aurora", "hermes"], mode: "multi_dialogue" };
    expect(alternarTodasPersonalidades(dialogo, TODOS, null, "astraura_prime").siguiente.mode).toBe(
      "multi_dialogue",
    );
    const coral: SeleccionPersonalidades = { personas: ["aurora"], mode: "coral_synthesis" };
    expect(alternarTodasPersonalidades(coral, TODOS, null, "astraura_prime").siguiente.mode).toBe(
      "coral_synthesis",
    );
  });

  it("con todas ya activas, actúa como «Solo una»: vuelve a lo recordado y lo consume", () => {
    const actual: SeleccionPersonalidades = { personas: [...TODOS], mode: "multi_dialogue" };
    const recordada: SeleccionPersonalidades = { personas: ["hermione"], mode: "single" };
    const r = alternarTodasPersonalidades(actual, TODOS, recordada, "astraura_prime");
    expect(r.siguiente).toEqual(recordada);
    expect(r.recordar).toBeNull();
  });

  it("con todas activas y NADA recordado, cae a la personalidad de respaldo en modo Individual", () => {
    const actual: SeleccionPersonalidades = { personas: [...TODOS], mode: "coral_synthesis" };
    const r = alternarTodasPersonalidades(actual, TODOS, null, "hermes");
    expect(r.siguiente).toEqual({ personas: ["hermes"], mode: "single" });
    expect(r.recordar).toBeNull();
  });

  it("es reversible: activar todas y volver a alternar restaura EXACTAMENTE lo anterior", () => {
    const original: SeleccionPersonalidades = { personas: ["aurora", "logos"], mode: "multi_dialogue" };
    const activadas = alternarTodasPersonalidades(original, TODOS, null, "astraura_prime");
    const restaurado = alternarTodasPersonalidades(activadas.siguiente, TODOS, activadas.recordar, "astraura_prime");
    expect(restaurado.siguiente).toEqual(original);
  });
});
