import { describe, it, expect } from "vitest";
import {
  HABILIDADES_INGENIERIA,
  NINGUNA_HABILIDAD,
  TAMANO_POR_CAPA,
  bloqueHabilidad,
  preguntaHabilidad,
  type CapaHabilidad,
  type HabilidadElegible,
  type RespuestaLayaHabilidad,
} from "../elegir-habilidad";
import { HABILIDADES_INGENIERIA_A } from "../ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "../ingenieria-b";
import { SKILL_CAPABILITIES } from "../../skills";

/** Respuestas de Laya de ejemplo, con la forma REAL de system_one:
 *  `choice` + `probabilities` + `answer_confidence` (la calibrada), y las dos
 *  formas tipadas ajenas a esta pregunta (noul y score), que no inyectan nada. */
const RESPUESTA_TDD: RespuestaLayaHabilidad = {
  type: "choice",
  choice: "tdd",
  probabilities: { tdd: 0.8, [NINGUNA_HABILIDAD]: 0.2 },
  answer_confidence: 0.83,
};

const RESPUESTA_NINGUNA: RespuestaLayaHabilidad = {
  type: "choice",
  choice: NINGUNA_HABILIDAD,
  probabilities: { [NINGUNA_HABILIDAD]: 0.92 },
  answer_confidence: 0.91,
};

const RESPUESTA_DUDOSA: RespuestaLayaHabilidad = {
  type: "choice",
  choice: "diagnosing-bugs",
  probabilities: { "diagnosing-bugs": 0.5, [NINGUNA_HABILIDAD]: 0.5 },
  answer_confidence: 0.55,
};

const TDD = HABILIDADES_INGENIERIA_A[0];
const ESPECIFICACION = HABILIDADES_INGENIERIA_B[0];

describe("HABILIDADES_INGENIERIA", () => {
  it("une A + B en orden, sin repetir ids", () => {
    expect(HABILIDADES_INGENIERIA.map((h) => h.id)).toEqual([
      ...HABILIDADES_INGENIERIA_A.map((h) => h.id),
      ...HABILIDADES_INGENIERIA_B.map((h) => h.id),
    ]);
  });
});

describe("TAMANO_POR_CAPA", () => {
  it("tarjeta para reflejo y palabra pequeña; resumen para palabra y razón; completa para profunda y nube", () => {
    expect(TAMANO_POR_CAPA.reflejo).toBe("tarjeta");
    expect(TAMANO_POR_CAPA["palabra-pequena"]).toBe("tarjeta");
    expect(TAMANO_POR_CAPA.palabra).toBe("resumen");
    expect(TAMANO_POR_CAPA.razon).toBe("resumen");
    expect(TAMANO_POR_CAPA.profunda).toBe("completa");
    expect(TAMANO_POR_CAPA.nube).toBe("completa");
  });
});

describe("preguntaHabilidad", () => {
  it("arma la pregunta choice de Laya: criterio = el `cuando` de cada una + «ninguna»", () => {
    const p = preguntaHabilidad(HABILIDADES_INGENIERIA);
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("¿Qué habilidad aplica");
    expect(Object.keys(p.criteria)).toEqual([
      ...HABILIDADES_INGENIERIA.map((h) => h.id),
      NINGUNA_HABILIDAD,
    ]);
    for (const h of HABILIDADES_INGENIERIA) {
      expect(p.criteria[h.id]).toBe(`${h.nombre}: ${h.cuando}`);
    }
  });

  it("con otra lista de habilidades solo aparecen sus ids y la «ninguna»", () => {
    const p = preguntaHabilidad([TDD, ESPECIFICACION]);
    expect(Object.keys(p.criteria)).toEqual([TDD.id, ESPECIFICACION.id, NINGUNA_HABILIDAD]);
  });
});

describe("bloqueHabilidad", () => {
  it("inyecta la TARJETA de TDD en reflejo y palabra pequeña", () => {
    const reflejo = bloqueHabilidad(RESPUESTA_TDD, "reflejo", 0.6);
    expect(reflejo).toContain(TDD.tarjeta);
    expect(reflejo).toContain(TDD.nombre);
    expect(bloqueHabilidad(RESPUESTA_TDD, "palabra-pequena", 0.6)).toBe(reflejo);
  });

  it("inyecta el RESUMEN en palabra y razón (Bonsai)", () => {
    const razon = bloqueHabilidad(RESPUESTA_TDD, "razon", 0.6);
    expect(razon).toContain(TDD.resumen);
    expect(bloqueHabilidad(RESPUESTA_TDD, "palabra", 0.6)).toBe(razon);
  });

  it("en profunda y nube solo la referencia al texto completo", () => {
    const profunda = bloqueHabilidad(RESPUESTA_TDD, "profunda", 0.6);
    expect(profunda).toContain(TDD.rutaCompleta);
    expect(profunda).not.toContain(TDD.tarjeta);
    expect(bloqueHabilidad(RESPUESTA_TDD, "nube", 0.6)).toBe(profunda);
  });

  it("nada cuando Laya elige «ninguna» o la calibrada cae bajo el umbral", () => {
    expect(bloqueHabilidad(RESPUESTA_NINGUNA, "reflejo", 0.6)).toBe("");
    expect(bloqueHabilidad(RESPUESTA_DUDOSA, "razon", 0.6)).toBe("");
  });

  it("el umbral compara borde a borde: justo el umbral pasa, uno menos no", () => {
    expect(bloqueHabilidad(RESPUESTA_TDD, "reflejo", 0.83)).not.toBe("");
    expect(bloqueHabilidad(RESPUESTA_TDD, "reflejo", 0.84)).toBe("");
  });

  it("respuestas que NO son esta pregunta (noul y score) no inyectan nada", () => {
    const noul: RespuestaLayaHabilidad = {
      type: "noul",
      noul: 0.42,
      probabilities: {},
      answer_confidence: 0.61,
    };
    const score: RespuestaLayaHabilidad = {
      type: "score",
      score: "alta",
      probabilities: { alta: 0.7 },
      answer_confidence: 0.7,
    };
    expect(bloqueHabilidad(noul, "reflejo", 0.6)).toBe("");
    expect(bloqueHabilidad(score, "razon", 0.6)).toBe("");
  });

  it("sin `choice`, la primera clave de `probabilities` hace de opción elegida", () => {
    const porProbs: RespuestaLayaHabilidad = {
      type: "choice",
      probabilities: { "diagnosing-bugs": 0.7, [NINGUNA_HABILIDAD]: 0.3 },
      answer_confidence: 0.9,
    };
    expect(bloqueHabilidad(porProbs, "palabra", 0.6)).toContain(HABILIDADES_INGENIERIA_A[1].nombre);
  });

  it("acepta la forma ya normalizada (`Decision`: `confianza` como respaldo)", () => {
    const normalizada: RespuestaLayaHabilidad = {
      type: "choice",
      choice: "tdd",
      probabilities: { tdd: 1 },
      confianza: 0.9,
    };
    expect(bloqueHabilidad(normalizada, "reflejo", 0.6)).toContain(TDD.tarjeta);
  });

  it("`answer_confidence` (la calibrada) manda sobre `confidence`, que solo respalda", () => {
    const ambas: RespuestaLayaHabilidad = {
      type: "choice",
      choice: "tdd",
      answer_confidence: 0.5,
      confidence: 0.99,
    };
    expect(bloqueHabilidad(ambas, "reflejo", 0.8)).toBe("");
    expect(bloqueHabilidad({ type: "choice", choice: "tdd", confidence: 0.9 }, "reflejo", 0.8)).toContain(TDD.tarjeta);
    expect(bloqueHabilidad({ type: "choice", choice: "tdd" }, "reflejo", 0.6)).toBe("");
  });

  it("id desconocido devuelve nada y capa desconocida da un error claro", () => {
    expect(bloqueHabilidad({ type: "choice", choice: "no-existe", answer_confidence: 0.95 }, "razon", 0.6)).toBe("");
    expect(() => bloqueHabilidad(RESPUESTA_TDD, "voz" as unknown as CapaHabilidad, 0.6)).toThrow(/desconocida/);
  });

  it("admite otro catálogo de habilidades por parámetro", () => {
    const propias: HabilidadElegible[] = [
      {
        id: "cocina",
        nombre: "Cocina con lo que hay",
        cuando: "Cuando se habla de recetas.",
        tarjeta: "Mira la nevera y elige tres ingredientes como mucho.",
        resumen: "Mira la nevera y la despensa reales, elige tres ingredientes como mucho y escribe el plato que sale con ellos.",
        rutaCompleta: "docs/cocina.md",
      },
    ];
    const r = { type: "choice", choice: "cocina", answer_confidence: 0.9 };
    expect(bloqueHabilidad(r, "reflejo", 0.8, propias)).toContain(propias[0].tarjeta);
    expect(bloqueHabilidad(r, "nube", 0.8, propias)).toContain("docs/cocina.md");
  });
});

describe("capacidad habilidades-ingenieria en skills.ts", () => {
  const cap = SKILL_CAPABILITIES.find((c) => c.id === "habilidades-ingenieria");
  if (!cap) throw new Error("falta la capacidad habilidades-ingenieria en SKILL_CAPABILITIES");

  it("está registrada, encendida por defecto y desactivable como las demás", () => {
    expect(cap.defaultOn).toBe(true);
    expect(cap.label).toContain("ingeniería");
  });

  it("llama a esto: nombra las habilidades y cuenta cómo Laya y la capa eligen", () => {
    for (const h of HABILIDADES_INGENIERIA) expect(cap.systemPrompt).toContain(h.nombre);
    expect(cap.systemPrompt).toContain("Laya");
    expect(cap.systemPrompt).toContain("reflejo");
    expect(cap.systemPrompt).toContain("Matt Pocock");
  });
});
