/**
 * Tests de `validarCola` (colas del Diseñador de olas del Mando).
 * Casos: cola válida, nombre inválido, ids repetidos, dependencia inexistente y ciclos.
 */
import { describe, it, expect } from "vitest";
import { validarCola } from "../mando/colas";

/** Prompt de relleno válido (40 caracteres: pasa el mínimo de 20). */
const PROMPT = "x".repeat(40);

describe("validarCola", () => {
  it("acepta una cola válida y la normaliza", () => {
    const { errores, tareas } = validarCola("242-prueba", [
      { id: "A1", titulo: "t", prompt: PROMPT, archivos: [], depende: [] },
    ]);
    expect(errores).toEqual([]);
    expect(tareas).toHaveLength(1);
    const t = tareas[0];
    expect(t.id).toBe("A1");
    expect(t.titulo).toBe("t");
    expect(t.prompt).toBe(PROMPT);
    expect(t.archivos).toEqual([]);
    expect(t.depende).toEqual([]);
    // La ola deriva del nombre de la cola
    expect(t.ola).toBe("Ola 242 · prueba");
  });

  it("rechaza un nombre que no cumple el patrón", () => {
    const { errores } = validarCola("Malo", [
      { id: "A1", titulo: "t", prompt: PROMPT, archivos: [], depende: [] },
    ]);
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some((e) => e.includes("Nombre de cola no válido"))).toBe(true);
  });

  it("rechaza dos tareas con el mismo id", () => {
    const { errores } = validarCola("242-prueba", [
      { id: "A1", titulo: "uno", prompt: PROMPT, archivos: [], depende: [] },
      { id: "A1", titulo: "dos", prompt: PROMPT, archivos: [], depende: [] },
    ]);
    expect(errores.some((e) => e.includes("Id repetido: A1."))).toBe(true);
  });

  it("rechaza una dependencia a un id inexistente", () => {
    const { errores } = validarCola("242-prueba", [
      { id: "A1", titulo: "t", prompt: PROMPT, archivos: [], depende: ["ZZ9"] },
    ]);
    expect(errores.some((e) => e.includes("A1: depende de «ZZ9», que no está en la cola."))).toBe(true);
  });

  it("detecta un ciclo de dependencias A1 → A2 → A1", () => {
    const { errores } = validarCola("242-prueba", [
      { id: "A1", titulo: "uno", prompt: PROMPT, archivos: [], depende: ["A2"] },
      { id: "A2", titulo: "dos", prompt: PROMPT, archivos: [], depende: ["A1"] },
    ]);
    expect(errores.some((e) => e.includes("Ciclo de dependencias"))).toBe(true);
  });
});
