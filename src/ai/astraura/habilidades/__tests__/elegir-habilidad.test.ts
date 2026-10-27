import { describe, it, expect } from "vitest";
import {
  HABILIDADES_INGENIERIA_A,
  type HabilidadIngenieria,
} from "../ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "../ingenieria-b";
import {
  NINGUNA_HABILIDAD,
  TAMANIO_POR_CAPA,
  UMBRAL_HABILIDAD,
  bloqueHabilidad,
  preguntaHabilidad,
} from "../elegir-habilidad";

const TODAS: HabilidadIngenieria[] = [
  ...HABILIDADES_INGENIERIA_A,
  ...HABILIDADES_INGENIERIA_B,
];
const TDD = TODAS.find((h) => h.id === "tdd") as HabilidadIngenieria;

/** Respuesta de Laya con su forma real (system_one): choice + probabilidades + answer_confidence. */
const respuestaTDD = (answer_confidence: number) => ({
  type: "choice",
  choice: "tdd",
  probabilities: { tdd: answer_confidence, ninguna: 1 - answer_confidence },
  answer_confidence,
});

/** Misma respuesta pero sin la cadena `choice`: la opción cae a la mayor de `probabilities`. */
const probabilitiesTDD = (answer_confidence: number) => ({
  type: "choice",
  probabilities: { tdd: 0.8, ninguna: 0.2 },
  answer_confidence,
});

describe("preguntaHabilidad", () => {
  it("arma la pregunta choice del punto «habilidad.elegir» con las 12 más «ninguna»", () => {
    const p = preguntaHabilidad(TODAS);
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("¿Qué habilidad conviene");
    expect(Object.keys(p.criteria)).toEqual([
      ...TODAS.map((h) => h.id),
      NINGUNA_HABILIDAD.id,
    ]);
  });

  it("el criterio de cada opción es el «cuando» de la habilidad", () => {
    const p = preguntaHabilidad(TODAS);
    expect(p.criteria["tdd"]).toBe(TDD.cuando);
    expect(p.criteria[NINGUNA_HABILIDAD.id]).toBe(NINGUNA_HABILIDAD.texto);
  });

  it("funciona con cualquier lista (por ejemplo solo una habilidad)", () => {
    const p = preguntaHabilidad([TDD]);
    expect(Object.keys(p.criteria)).toEqual(["tdd", "ninguna"]);
  });
});

describe("TAMANIO_POR_CAPA y umbral", () => {
  it("la capa da el tamaño: tarjeta para reflejo, resumen para palabra y referencia para profunda/nube", () => {
    expect(TAMANIO_POR_CAPA.reflejo).toBe("tarjeta");
    expect(TAMANIO_POR_CAPA.memoria).toBe("tarjeta");
    expect(TAMANIO_POR_CAPA.palabra).toBe("resumen");
    expect(TAMANIO_POR_CAPA.razon).toBe("resumen");
    expect(TAMANIO_POR_CAPA.profunda).toBe("completa");
    expect(TAMANIO_POR_CAPA.nube).toBe("completa");
  });

  it("el umbral sale del punto «habilidad.elegir» (0,6 por defecto)", () => {
    expect(UMBRAL_HABILIDAD).toBe(0.6);
  });
});

describe("bloqueHabilidad", () => {
  it("inyecta la TARJETA en reflejo y memoria, con el nombre de la habilidad", () => {
    const r = respuestaTDD(0.83);
    const reflejo = bloqueHabilidad(r, "reflejo");
    expect(reflejo).toBe(`${TDD.nombre}. ${TDD.tarjeta}`);
    expect(bloqueHabilidad(r, "memoria")).toBe(reflejo);
  });

  it("inyecta el RESUMEN en palabra y razón (Bonsai)", () => {
    const r = respuestaTDD(0.83);
    expect(bloqueHabilidad(r, "palabra")).toBe(`${TDD.nombre}. ${TDD.resumen}`);
    expect(bloqueHabilidad(r, "razon")).toBe(`${TDD.nombre}. ${TDD.resumen}`);
  });

  it("en profunda y nube devuelve la REFERENCIA a la guía completa, ruta relativa al SKILL.md", () => {
    const profunda = bloqueHabilidad(respuestaTDD(0.83), "profunda");
    expect(profunda).toContain(TDD.rutaCompleta);
    expect(profunda).toContain("Matt Pocock");
    expect(profunda).toContain("MIT");
    expect(bloqueHabilidad(respuestaTDD(0.83), "nube")).toBe(profunda);
    const rutas = [TDD.rutaCompleta, ...TODAS.map((h) => h.rutaCompleta)];
    for (const ruta of rutas) {
      expect(ruta.startsWith("/")).toBe(false);
      expect(ruta.endsWith("SKILL.md")).toBe(true);
    }
  });

  it("«ninguna» devuelve vacío en cualquier capa", () => {
    const r = {
      type: "choice",
      choice: "ninguna",
      probabilities: { ninguna: 0.91, tdd: 0.09 },
      answer_confidence: 0.91,
    };
    for (const capa of ["reflejo", "palabra", "razon", "profunda", "nube"]) {
      expect(bloqueHabilidad(r, capa)).toBe("");
    }
  });

  it("answer_confidence por debajo del umbral o ausente devuelve vacío", () => {
    expect(bloqueHabilidad(respuestaTDD(0.59), "reflejo")).toBe("");
    expect(
      bloqueHabilidad({ type: "choice", choice: "tdd", probabilities: { tdd: 0.9 } }, "reflejo"),
    ).toBe("");
    expect(bloqueHabilidad(respuestaTDD(0.59), "reflejo", 0.3)).not.toBe("");
  });

  it("decide SOLO con answer_confidence la calibrada; `confidence` de OpenRouter no cuenta", () => {
    expect(
      bloqueHabilidad(
        { type: "choice", choice: "tdd", probabilities: { tdd: 1 }, confidence: 0.99 },
        "reflejo",
      ),
    ).toBe("");
  });

  it("sin `choice` cae a la opción mayor de probabilities; id desconocido y forma rota dan vacío", () => {
    expect(bloqueHabilidad(probabilitiesTDD(0.8), "reflejo")).toBe(
      `${TDD.nombre}. ${TDD.tarjeta}`,
    );
    expect(bloqueHabilidad({ type: "choice", choice: "no-existe", answer_confidence: 0.9 }, "reflejo")).toBe("");
    expect(bloqueHabilidad(null, "reflejo")).toBe("");
    expect(bloqueHabilidad(undefined, "palabra", 0.6, TODAS)).toBe("");
    expect(bloqueHabilidad("rara" as never, "reflejo")).toBe("");
    expect(bloqueHabilidad(respuestaTDD(0.9), "capa-inventada")).toBe("");
    expect(
      bloqueHabilidad({ type: "score", score: "media", score2: "x", answer_confidence: 0.9 } as never, "reflejo"),
    ).toBe("");
    expect(
      bloqueHabilidad({ type: "noul", noul: 0.9, answer_confidence: 0.9 } as never, "reflejo"),
    ).toBe("");
  });

  it("respeta una lista de habilidades propia y un umbral propio", () => {
    const solo = [TDD];
    expect(bloqueHabilidad(probabilitiesTDD(0.9), "reflejo", 0.6, solo)).toBe(`${TDD.nombre}. ${TDD.tarjeta}`);
    expect(bloqueHabilidad(respuestaTDD(0.7), "reflejo", 0.8, solo)).toBe("");
  });
});
