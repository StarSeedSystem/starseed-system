// Tests del consenso de las decisiones básicas de 1,58 bits con Laya (tarea C de la Ola 1018L).
// Solo `consensuar` pura: respuestas de Laya de ejemplo con la forma real de la System One
// (choice con su opción, probabilities y answer_confidence), sin red ni modelos cargados.
import { describe, it, expect } from "vitest";
import { consensuar, UMBRAL_CONSENSO, type EntradaConsenso, type RespuestaLayaBasicos } from "../consenso";

/** Respuesta real de Laya a una choice: opción elegida, probabilidades calibradas y answer_confidence. */
const laya = (respuesta: string, answer_confidence: number, probAlt = 1 - answer_confidence): RespuestaLayaBasicos => ({
  respuesta,
  answer_confidence,
  probabilities: { [respuesta]: answer_confidence, ordenar_habitos: probAlt },
});

/** Respuesta del modelo pequeño (BitNet, Bonsai, Needle) a la misma pregunta tipada. */
const pequeno = (respuesta: string, motor = "bitnet", confianza?: number) =>
  ({ respuesta, motor, ...(confianza === undefined ? {} : { confianza }) });

const consenso = (cambios: Partial<EntradaConsenso>): EntradaConsenso => ({
  pequeno: pequeno("ordenar_habitos", "bitnet", 0.8),
  laya: laya("ordenar_habitos", 0.9),
  umbral: UMBRAL_CONSENSO,
  ...cambios,
});

describe("UMBRAL_CONSENSO", () => {
  it("sale del umbral del punto `basico.consenso` del catálogo (sobre answer_confidence)", () => {
    expect(UMBRAL_CONSENSO).toBe(0.6);
  });
});
describe("consensuar · rama 1: coinciden", () => {
  it("acepta la decisión común sin mirar confianzas", () => {
    expect(consensuar(consenso({}))).toEqual({
      decision: "ordenar_habitos",
      quien: "ambos",
      accion: "aceptar",
      motivo: "Coinciden bitnet y Laya en «ordenar_habitos»: vale.",
    });
  });

  it("coincide aunque Laya esté débil y el pequeño sin confianza: el acuerdo basta", () => {
    const v = consensuar(consenso({ laya: laya("ordenar_habitos", 0.3), pequeno: pequeno("ordenar_habitos", "needle") }));
    expect(v).toMatchObject({ decision: "ordenar_habitos", quien: "ambos", accion: "aceptar" });
  });

  it("compara sin tropezar con espacios de más", () => {
    const v = consensuar(consenso({ pequeno: pequeno("ordenar_habitos ", "bitnet", 0.2), laya: laya(" ordenar_habitos", 0.9) }));
    expect(v).toMatchObject({ quien: "ambos", accion: "aceptar" });
  });
});

describe("consensuar · rama 2: discrepan y Laya manda", () => {
  it("manda Laya al discrepar si su answer_confidence (calibrada) supera el umbral", () => {
    expect(consensuar(consenso({ laya: laya("apuntar_recordatorio", 0.85) }))).toEqual({
      decision: "apuntar_recordatorio",
      quien: "laya",
      accion: "aceptar",
      motivo: "Discrepan (bitnet «ordenar_habitos», Laya «apuntar_recordatorio»): manda Laya con 0.85 ≥ 0.60.",
    });
  });

  it("al umbral justo Laya también manda (≥, no >)", () => {
    expect(consensuar(consenso({ laya: laya("apuntar_recordatorio", 0.6) }))).toMatchObject({ quien: "laya", accion: "aceptar", decision: "apuntar_recordatorio" });
  });

  it("cuenta la española real: confianza baja pero por encima del umbral manda igual", () => {
    const v = consensuar(consenso({ laya: laya("apuntar_recordatorio", 0.62), pequeno: pequeno("ordenar_habitos", "bonsai", 0.9) }));
    expect(v).toMatchObject({ quien: "laya", accion: "aceptar", decision: "apuntar_recordatorio" });
  });

  it("discrepancia con Laya débil (como su 0,61 en español bajo umbral 0,62): se escala", () => {
    const v = consensuar(consenso({ laya: laya("apuntar_recordatorio", 0.59), umbral: 0.62 }));
    expect(v).toEqual({
      decision: null,
      quien: "ninguno",
      accion: "escalar",
      motivo: "Discrepan (bitnet «ordenar_habitos», Laya «apuntar_recordatorio») y Laya duda (0.59 < 0.62): se escala.",
    });
  });

  it("discrepancia y Laya sin answer_confidence: la calibrada manda, se escala", () => {
    const v = consensuar(consenso({ laya: { respuesta: "apuntar_recordatorio" } as unknown as RespuestaLayaBasicos }));
    expect(v).toEqual({ decision: null, quien: "ninguno", accion: "escalar", motivo: expect.stringContaining("no dio answer_confidence") });
  });
});

describe("consensuar · rama 3: Laya no llegó, manda lo pequeño", () => {
  it("acepta al pequeño con su confianza por encima del umbral (en CPU Laya tarda segundos)", () => {
    expect(consensuar(consenso({ laya: null }))).toEqual({
      decision: "ordenar_habitos",
      quien: "pequeno",
      accion: "aceptar",
      motivo: "Laya no llegó a tiempo; manda bitnet con 0.80 ≥ 0.60.",
    });
  });

  it("vale también si Laya llega caída o sin opción elegida", () => {
    expect(consensuar(consenso({ laya: null, pequeno: pequeno("recordar_cita", "bonsai", 0.7) }))).toMatchObject({ quien: "pequeno", decision: "recordar_cita" });
  });

  it("sin confianza del pequeño no hay salvavidas: se escala", () => {
    const v = consensuar(consenso({ laya: null, pequeno: pequeno("ordenar_habitos", "needle") }));
    expect(v).toEqual({
      decision: null,
      quien: "ninguno",
      accion: "escalar",
      motivo: "Laya no llegó a tiempo y needle no dio confianza: se escala.",
    });
  });

  it("confianza del pequeño por debajo del umbral: también se escala", () => {
    const v = consensuar(consenso({ laya: null, pequeno: pequeno("ordenar_habitos", "bitnet", 0.55) }));
    expect(v).toMatchObject({ decision: null, accion: "escalar", motivo: expect.stringContaining("duda (0.55 < 0.60)") });
  });
});

describe("consensuar · rama 4: nadie puede decidir", () => {
  it("la decisión común vacía no vale («no respondió») y se escala", () => {
    expect(consensuar(consenso({ pequeno: pequeno("  ", "bitnet"), laya: laya("", 0.9) }))).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" });
  });
});
