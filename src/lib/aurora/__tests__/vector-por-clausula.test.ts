import { beforeEach, describe, expect, it } from "vitest";
import { quantumOrbBus, onQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import { vectorDeClausula, emitirVectorPorClausula } from "@/lib/aurora/vector-por-clausula";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

describe("vector-por-clausula — vectorDeClausula", () => {
  it("devuelve las cinco claves del vector en rango 0..1", () => {
    const v = vectorDeClausula("Aurora te saluda con calma.");
    expect(Object.keys(v).sort()).toEqual(
      ["breath", "hueShift", "spikiness", "symmetry", "turbulence"],
    );
    for (const n of Object.values(v)) {
      expect(typeof n).toBe("number");
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it("cláusula vacía o en blanco: no expresa nada", () => {
    expect(vectorDeClausula("")).toEqual({});
    expect(vectorDeClausula("   \n\t ")).toEqual({});
  });

  it("una pregunta agita la orbe más que una declaración", () => {
    const pregunta = vectorDeClausula("¿Qué quieres explorar hoy?");
    const declaracion = vectorDeClausula("Vamos a explorarlo hoy.");
    expect(pregunta.turbulence).toBeGreaterThan(declaracion.turbulence as number);
    expect(pregunta.symmetry).toBeLessThan(declaracion.symmetry as number);
  });

  it("una exclamación afila la orbe más que una declaración", () => {
    const exclama = vectorDeClausula("¡Aquí está el resultado!");
    const declaracion = vectorDeClausula("Aquí está el resultado.");
    expect(exclama.spikiness).toBeGreaterThan(declaracion.spikiness as number);
    expect(exclama.symmetry).toBeLessThan(declaracion.symmetry as number);
  });

  it("una cláusula más larga respira más que una breve", () => {
    const breve = vectorDeClausula("Sí.");
    const larga = vectorDeClausula(
      "Voy a repasar contigo cada una de las catorce palabras de este mensaje largo.",
    );
    expect(larga.breath).toBeGreaterThan(breve.breath as number);
  });
});

describe("vector-por-clausula — emitirVectorPorClausula", () => {
  beforeEach(() => {
    quantumOrbBus.clear("params");
  });

  it("publica el vector en el canal params del bus de la orbe", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((params) => received.push(params));

    emitirVectorPorClausula("¿Cómo estás?");
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject(vectorDeClausula("¿Cómo estás?"));

    unsub();
  });

  it("no publica nada si la cláusula no tiene nada pronunciable", () => {
    const received: Partial<QuantumOrbParams>[] = [];
    const unsub = onQuantumOrbParams((params) => received.push(params));

    emitirVectorPorClausula("¡¿!");
    expect(received).toHaveLength(0);

    unsub();
  });

  it("nunca lanza, ni con texto raro ni con entrada vacía", () => {
    expect(() => emitirVectorPorClausula("")).not.toThrow();
    expect(() => emitirVectorPorClausula("¿¿?? ¡¡!! ...")).not.toThrow();
  });
});
