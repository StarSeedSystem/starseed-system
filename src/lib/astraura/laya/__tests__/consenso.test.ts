// Pruebas del consenso entre los modelos pequeños de 1,58 bits y Laya (LYS1018C).
// Sin red y sin cargar modelos: las respuestas de Laya son de ejemplo con la forma real
// de system_one (`choice`/`probabilities`/`answer_confidence`, `score`, `noul`).
import { describe, expect, it } from "vitest";
import { UMBRAL_CONSENSO, consensuar, type RespuestaConsenso, type RespuestaLLaya } from "../consenso";

const RESPUESTA_LAYA = {
  herramienta: { choice: "chat", probabilities: { chat: 0.71, voz: 0.05, tarea: 0.24 }, confidence: 0.68, answer_confidence: 0.83 },
  tono: { choice: "calido", probabilities: { calido: 0.31, neutro: 0.69 }, confidence: 0.4, answer_confidence: 0.22 },
  dificultad: { score: 1.5, probabilities: [0.4, 0.45, 0.15], confidence: 0.52, answer_confidence: 0.7 },
  basta: { noul: 0.42, confidence: 0.9, answer_confidence: 0.44 },
} as const;

const deLaya = (respuesta: RespuestaConsenso, answer_confidence: number): RespuestaLLaya => ({ respuesta, answer_confidence });
const layaHerramienta = deLaya(RESPUESTA_LAYA.herramienta.choice, RESPUESTA_LAYA.herramienta.answer_confidence);
const layaTono = deLaya(RESPUESTA_LAYA.tono.choice, RESPUESTA_LAYA.tono.answer_confidence);
const pequeno = (respuesta: RespuestaConsenso, confianza?: number, motor = "bitnet") => ({ respuesta, confianza, motor });

describe("consensuar · las cuatro ramas del contrato", () => {
  it("si coinciden, se acepta lo dicho por ambos aunque lo pequeño dude", () => {
    expect(consensuar({ pequeno: pequeno("chat", 0.51), laya: layaHerramienta })).toMatchObject({
      decision: "chat", quien: "ambos", accion: "aceptar",
    });
  });

  it("si no coinciden y Laya alcanza el umbral, manda Laya", () => {
    const r = consensuar({ pequeno: pequeno("resumir", 0.99), laya: layaHerramienta });
    expect(r).toMatchObject({ decision: "chat", quien: "laya", accion: "aceptar" });
    expect(r.motivo).toMatch(/0\.83 ≥ 0\.60/);
  });

  it("si no coinciden y Laya duda, se escala aunque lo pequeño esté seguro", () => {
    const r = consensuar({ pequeno: pequeno("chat", 0.99), laya: layaTono });
    expect(r).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" });
    expect(r.motivo).toMatch(/0\.22 < 0\.60/);
  });
});

describe("consensuar · cuando Laya no llega a tiempo", () => {
  it("se acepta lo pequeño solo si su confianza alcanza el umbral", () => {
    const r = consensuar({ pequeno: pequeno("chat", 0.72, "bonsai"), laya: null });
    expect(r).toMatchObject({ decision: "chat", quien: "pequeno", accion: "aceptar" });
    expect(r.motivo).toMatch(/bonsai/);
  });

  it("se escala si lo pequeño no alcanza el umbral o no declara confianza", () => {
    expect(consensuar({ pequeno: pequeno("chat", 0.32), laya: null })).toMatchObject({
      decision: null, quien: "ninguno", accion: "escalar",
    });
    expect(consensuar({ pequeno: pequeno("chat"), laya: null })).toMatchObject({ accion: "escalar" });
  });
});

describe("consensuar · detalles del contrato", () => {
  it("decide con answer_confidence (calibrada) y nunca con confidence", () => {
    // `confidence` 0.68 queda por debajo del umbral, pero `answer_confidence` 0.83 manda.
    expect(consensuar({ pequeno: pequeno("resumir", 0.99), laya: layaHerramienta }))
      .toMatchObject({ quien: "laya", accion: "aceptar" });
    // `confidence` 0.4 parece alta para su escala, pero `answer_confidence` 0.22 no decide.
    expect(consensuar({ pequeno: pequeno("chat", 0.99), laya: layaTono }))
      .toMatchObject({ accion: "escalar" });
  });

  it("respeta el umbral configurable y el 0,6 por defecto", () => {
    expect(UMBRAL_CONSENSO).toBe(0.6);
    const laya = deLaya("chat", 0.83);
    expect(consensuar({ pequeno: pequeno("resumir", 0.9), laya })).toMatchObject({ quien: "laya" });
    expect(consensuar({ pequeno: pequeno("resumir", 0.9), laya, umbral: 0.9 })).toMatchObject({ accion: "escalar" });
    expect(consensuar({ pequeno: pequeno("resumir", 0.9), laya: deLaya("chat", 0.2), umbral: 0.2 }))
      .toMatchObject({ quien: "laya" });
  });

  it("compara el valor tipado: score y noul también coinciden o discrepan", () => {
    const dificultad = RESPUESTA_LAYA.dificultad;
    expect(consensuar({
      pequeno: pequeno(dificultad.score, 0.2),
      laya: deLaya(dificultad.score, dificultad.answer_confidence),
    })).toMatchObject({ decision: 1.5, quien: "ambos", accion: "aceptar" });

    const basta = RESPUESTA_LAYA.basta;
    expect(consensuar({
      pequeno: pequeno(basta.noul, 0.9),
      laya: deLaya(0.8, basta.answer_confidence),
    })).toMatchObject({ decision: null, accion: "escalar" });
  });

  it("normaliza espacios y mayúsculas al comparar texto, y valida el umbral", () => {
    expect(consensuar({ pequeno: pequeno(" CHAT ", 0.1), laya: layaHerramienta }))
      .toMatchObject({ quien: "ambos" });
    for (const umbral of [1.5, -0.1, Number.NaN]) {
      expect(() => consensuar({ pequeno: pequeno("chat", 0.9), laya: null, umbral })).toThrow(RangeError);
    }
  });
});
