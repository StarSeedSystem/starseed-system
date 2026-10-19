import { describe, it, expect } from "vitest";
import {
  motoresPermitidos,
  Motor,
  ContextoLicencia,
  ResultadoLicencia,
} from "../licencia-voz";
import type { CapasPrefs } from "../../../modelos/preferencias-capas";

describe("motoresPermitidos", () => {
  it("should return empty arrays for empty input", () => {
    const result: ResultadoLicencia = motoresPermitidos([], "personal", {});
    expect(result.permitidos).toEqual([]);
    expect(result.excluidos).toEqual([]);
  });

  it("should allow personal motor in personal context when capas allow", () => {
    const motores: Motor[] = [
      { id: "omnivoice", claseLicencia: "personal" },
    ];
    const capas: CapasPrefs = { persona: "personal" };
    const result = motoresPermitidos(
      motores,
      "personal",
      capas
    );
    expect(result.permitidos).toEqual(motores);
    expect(result.excluidos).toEqual([]);
  });

  it("should exclude personal motor in grupo context", () => {
    const motores: Motor[] = [
      { id: "omnivoice", claseLicencia: "personal" },
    ];
    const capas: CapasPrefs = {}; // No restrictions
    const result = motoresPermitidos(
      motores,
      "grupo",
      capas
    );
    expect(result.permitidos).toEqual([]);
    expect(result.excluidos).toEqual([
      {
        id: "omnivoice",
        motivo: "uso personal no permitido en contexto grupo",
      },
    ]);
  });

  it("should allow condicionada motor when condition met", () => {
    const motores: Motor[] = [
      { id: "indexTTs", claseLicencia: "condicionada", condicionCumplida: true },
    ];
    const capas: CapasPrefs = { comunidad: "condicionada" }; // Allow condicionada
    const result = motoresPermitidos(
      motores,
      "comunidad",
      capas
    );
    expect(result.permitidos).toEqual(motores);
    expect(result.excluidos).toEqual([]);
  });

  it("should exclude condicionada motor when condition not met", () => {
    const motores: Motor[] = [
      { id: "indexTTs", claseLicencia: "condicionada", condicionCumplida: false },
    ];
    const capas: CapasPrefs = { comunidad: "condicionada" };
    const result = motoresPermitidos(
      motores,
      "comunidad",
      capas
    );
    expect(result.permitidos).toEqual([]);
    expect(result.excluidos).toEqual([
      {
        id: "indexTTs",
        motivo: "condición no cumplida",
      },
    ]);
  });

  it("should allow libre motor in any context", () => {
    const motores: Motor[] = [
      { id: "cosyVoice", claseLicencia: "libre" },
    ];
    const capas: CapasPrefs = {};
    const result = motoresPermitidos(
      motores,
      "publico",
      capas
    );
    expect(result.permitidos).toEqual(motores);
    expect(result.excluidos).toEqual([]);
  });

  it("should treat comercial context as publico but without personal use", () => {
    const motores: Motor[] = [
      { id: "omnivoice", claseLicencia: "personal" },
      { id: "cosyVoice", claseLicencia: "libre" },
    ];
    const capas: CapasPrefs = { persona: "personal" }; // Would allow personal in personal context
    const result = motoresPermitidos(
      motores,
      "comercial",
      capas
    );
    // In comercial context, personal motor should be excluded, libre allowed
    expect(result.permitidos).toEqual([{ id: "cosyVoice", claseLicencia: "libre" }]);
    expect(result.excluidos).toEqual([
      {
        id: "omnivoice",
        motivo: "uso personal no permitido en contexto comercial",
      },
    ]);
  });

  it("should exclude motor with license not permitted by capas", () => {
    const motores: Motor[] = [
      { id: "someMotor", claseLicencia: "personal" },
    ];
    const capas: CapasPrefs = {}; // No capas allowing personal
    const result = motoresPermitidos(
      motores,
      "personal",
      capas
    );
    expect(result.permitidos).toEqual([]);
    expect(result.excluidos).toEqual([
      {
        id: "someMotor",
        motivo: "licencia personal no permitida en contexto personal",
      },
    ]);
  });
});