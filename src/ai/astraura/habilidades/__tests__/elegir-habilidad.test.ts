import { describe, it, expect } from "vitest";
import {
  HABILIDADES_INGENIERIA,
} from "@/ai/astraura/skills-ingenieria";
import { NINGUNA, bloqueHabilidad, preguntaHabilidad } from "../elegir-habilidad";

// Respuestas de Laya de ejemplo, con su forma real: choice, probabilities y
// answer_confidence (la calibrada, la que sirve para decidir con umbral).

describe("preguntaHabilidad", () => {
  it("arma la choice de Laya con el «cuando» de cada habilidad y «ninguna» al final", () => {
    const p = preguntaHabilidad();
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("habilidad");
    expect(Object.keys(p.criteria)).toEqual([
      ...HABILIDADES_INGENIERIA.map((h) => h.id),
      NINGUNA,
    ]);
    for (const h of HABILIDADES_INGENIERIA) {
      expect(p.criteria[h.id]).toBe(h.cuando);
    }
    expect(p.criteria[NINGUNA]).toContain("Ninguna habilidad");
  });

  it("solo trae en las opciones el subconjunto pedido", () => {
    const p = preguntaHabilidad(HABILIDADES_INGENIERIA.slice(0, 2));
    expect(Object.keys(p.criteria)).toEqual([
      HABILIDADES_INGENIERIA[0].id,
      HABILIDADES_INGENIERIA[1].id,
      NINGUNA,
    ]);
  });
});

describe("bloqueHabilidad", () => {
  const tdd = HABILIDADES_INGENIERIA[0];
  const alta = { choice: tdd.id, probabilities: { [tdd.id]: 0.9 }, answer_confidence: 0.8 };
  const baja = { choice: tdd.id, answer_confidence: 0.3 };

  it("sin respuesta, sin confianza o sin dígitos devuelve «»", () => {
    expect(bloqueHabilidad(null, "reflejo")).toBe("");
    expect(bloqueHabilidad({ choice: tdd.id }, "reflejo")).toBe("");
    expect(bloqueHabilidad({ choice: tdd.id, answer_confidence: Number.NaN }, "reflejo")).toBe("");
  });

  it("confianza por debajo del umbral o «ninguna» devuelven «»", () => {
    expect(bloqueHabilidad(baja, "reflejo")).toBe("");
    expect(bloqueHabilidad(baja, "reflejo", 0.2)).not.toBe("");
    expect(bloqueHabilidad({ ...alta, choice: NINGUNA }, "reflejo")).toBe("");
  });

  it("reflejo y palabra pequeña reciben la tarjeta", () => {
    expect(bloqueHabilidad(alta, "reflejo")).toBe(
      `Aplica la habilidad «${tdd.nombre}»: ${tdd.tarjeta}`,
    );
    expect(bloqueHabilidad(alta, "palabra-pequena")).toBe(
      `Aplica la habilidad «${tdd.nombre}»: ${tdd.tarjeta}`,
    );
  });

  it("palabra y razón con Bonsai reciben el resumen", () => {
    expect(bloqueHabilidad(alta, "palabra")).toBe(
      `Aplica la habilidad «${tdd.nombre}»: ${tdd.resumen}`,
    );
    const revision = HABILIDADES_INGENIERIA.find((h) => h.id === "code-review");
    expect(
      bloqueHabilidad({ ...alta, choice: "code-review" }, "razon"),
    ).toBe(`Aplica la habilidad «${revision?.nombre ?? ""}»: ${revision?.resumen ?? ""}`);
  });

  it("profunda y nube solo apuntan al SKILL.md completo", () => {
    expect(bloqueHabilidad(alta, "profunda")).toBe(
      `Ha elegido Laya la habilidad «${tdd.nombre}»: lee y aplica el texto íntegro de ${tdd.rutaCompleta}.`,
    );
    expect(bloqueHabilidad(alta, "nube")).toContain(tdd.rutaCompleta);
  });

  it("capa sin entrada, id desconocido o catálogo vacío devuelven «»", () => {
    expect(bloqueHabilidad(alta, "memoria")).toBe("");
    expect(bloqueHabilidad(alta, "voz")).toBe("");
    expect(bloqueHabilidad(alta, "adaptador")).toBe("");
    expect(bloqueHabilidad({ ...alta, choice: "no-existe" }, "reflejo")).toBe("");
    expect(bloqueHabilidad(alta, "reflejo", 0.6, [])).toBe("");
  });

  it("usa el catálogo real de ingeniería por defecto", () => {
    const resumen = bloqueHabilidad(alta, "palabra");
    expect(resumen).toContain(tdd.resumen);
  });
});

describe("invariantes del contrato", () => {
  it("una habilidad elegible es pregunta y también texto a inyectar", () => {
    expect(HABILIDADES_INGENIERIA.length).toBe(12);
    for (const h of HABILIDADES_INGENIERIA) {
      expect(h.cuando.length).toBeGreaterThan(20);
      expect(h.tarjeta.length).toBeGreaterThan(0);
      expect(h.resumen.length).toBeGreaterThan(0);
      expect(h.rutaCompleta.startsWith("vendor/")).toBe(true);
    }
  });
});
