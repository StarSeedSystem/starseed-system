import { describe, it, expect } from "vitest";
import type { RespuestaLaya } from "@/ai/astraura/router-laya";
import {
  CRITERIO_NINGUNA,
  HABILIDADES_INGENIERIA,
  ID_NINGUNA,
  TAMANO_POR_CAPA,
  bloqueHabilidad,
  preguntaHabilidad,
  type CapaHabilidad,
} from "../elegir-habilidad";
import { HABILIDADES_INGENIERIA_A } from "../ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "../ingenieria-b";

const UMBRAL = 0.7;
const TDD = HABILIDADES_INGENIERIA_A[0];
const TOSPEC = HABILIDADES_INGENIERIA_B[0];

/** Respuesta de Laya con la forma real de system_one: choice/probabilities/answer_confidence. */
const elige = (id: string, answer_confidence: number): RespuestaLaya => ({
  type: "choice",
  choice: id,
  probabilities: { [id]: answer_confidence, [ID_NINGUNA]: 1 - answer_confidence },
  answer_confidence,
});

describe("HABILIDADES_INGENIERIA", () => {
  it("une las dos manos sin repetir y son las 12 habilidades de ingeniería", () => {
    const ids = HABILIDADES_INGENIERIA.map((h) => h.id);
    expect(ids).toHaveLength(12);
    expect([...ids].sort()).toEqual(
      [...HABILIDADES_INGENIERIA_A, ...HABILIDADES_INGENIERIA_B].map((h) => h.id).sort(),
    );
    expect(new Set(ids).size).toBe(12);
  });

  it("el tamaño por capa cumple el contrato: tarjeta, resumen o completa", () => {
    expect(TAMANO_POR_CAPA.reflejo).toBe("tarjeta");
    expect(TAMANO_POR_CAPA["palabra-pequena"]).toBe("tarjeta");
    expect(TAMANO_POR_CAPA.palabra).toBe("resumen");
    expect(TAMANO_POR_CAPA.razon).toBe("resumen");
    expect(TAMANO_POR_CAPA.profunda).toBe("completa");
    expect(TAMANO_POR_CAPA.nube).toBe("completa");
  });
});

describe("preguntaHabilidad", () => {
  it("arma la pregunta choice de Laya con el «cuando» de cada una + «ninguna»", () => {
    const p = preguntaHabilidad([TDD, TOSPEC]);
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("habilidad");
    const ids = Object.keys(p.criteria);
    expect(ids).toEqual([TDD.id, TOSPEC.id, ID_NINGUNA]);
    expect(p.criteria[TDD.id]).toBe(TDD.cuando);
    expect(p.criteria[TOSPEC.id]).toBe(TOSPEC.cuando);
    expect(p.criteria[ID_NINGUNA]).toBe(CRITERIO_NINGUNA);
  });

  it("con la lista completa lleva las 12 habilidades más «ninguna»", () => {
    const p = preguntaHabilidad(HABILIDADES_INGENIERIA);
    expect(Object.keys(p.criteria)).toHaveLength(13);
    expect(CRITERIO_NINGUNA.trim().length).toBeGreaterThan(0);
  });
});

describe("bloqueHabilidad", () => {
  it("para reflejo y palabra pequeña devuelve la TARJETA de la habilidad", () => {
    for (const capa of ["reflejo", "palabra-pequena"] as const) {
      const texto = bloqueHabilidad(elige(TDD.id, 0.83), capa, UMBRAL);
      expect(texto).toContain(`«${TDD.nombre}»`);
      expect(texto).toContain(TDD.tarjeta);
      expect(texto).not.toContain(TDD.resumen.slice(0, 40));
    }
  });

  it("para palabra y razón con Bonsai devuelve el RESUMEN", () => {
    for (const capa of ["palabra", "razon"] as const) {
      const texto = bloqueHabilidad(elige(TOSPEC.id, 0.8), capa, UMBRAL);
      expect(texto).toContain(TOSPEC.resumen);
    }
  });

  it("para profunda y nube devuelve la REFERENCIA a la completa, no el texto entero", () => {
    for (const capa of ["profunda", "nube"] as const) {
      const texto = bloqueHabilidad(elige(TDD.id, 0.9), capa, UMBRAL);
      expect(texto).toContain(TDD.rutaCompleta);
      expect(texto).toContain("guía completa");
      expect(texto?.length ?? 0).toBeLessThan(TDD.resumen.length);
    }
  });

  it("con «ninguna» no inyecta nada, aunque la confianza sea alta", () => {
    expect(bloqueHabilidad(elige(ID_NINGUNA, 0.95), "reflejo", UMBRAL)).toBeNull();
  });

  it("no llega al umbral de answer_confidence → nada; justo el umbral → inyecta", () => {
    expect(bloqueHabilidad(elige(TDD.id, UMBRAL - 0.01), "reflejo", UMBRAL)).toBeNull();
    expect(bloqueHabilidad(elige(TDD.id, UMBRAL), "reflejo", UMBRAL)).not.toBeNull();
  });

  it("decide SOLO con la calibrada: confidence de OpenRouter no cuenta", () => {
    const sinCalibrada: RespuestaLaya = {
      type: "choice",
      choice: TDD.id,
      probabilities: { [TDD.id]: 0.99 },
      confidence: 0.99,
    };
    expect(bloqueHabilidad(sinCalibrada, "reflejo", UMBRAL)).toBeNull();
  });

  it("tolera respuestas rotas: sin choice usa la opción mayor de probabilities", () => {
    const sinChoice: RespuestaLaya = {
      probabilities: { [TDD.id]: 0.6, [ID_NINGUNA]: 0.4 },
      answer_confidence: 0.9,
    };
    expect(bloqueHabilidad(sinChoice, "reflejo", UMBRAL)).toContain(TDD.tarjeta);
    expect(bloqueHabilidad(null, "reflejo", UMBRAL)).toBeNull();
    expect(bloqueHabilidad(undefined, "reflejo", UMBRAL)).toBeNull();
    expect(bloqueHabilidad({ answer_confidence: 0.9 }, "reflejo", UMBRAL)).toBeNull();
  });

  it("rechaza habilidad desconocida, capa inválida y id vacío", () => {
    expect(bloqueHabilidad(elige("no-existe", 0.9), "reflejo", UMBRAL)).toBeNull();
    expect(bloqueHabilidad(elige(TDD.id, 0.9), "voz" as unknown as CapaHabilidad, UMBRAL)).toBeNull();
    expect(bloqueHabilidad(elige("", 0.9), "reflejo", UMBRAL)).toBeNull();
  });
});
