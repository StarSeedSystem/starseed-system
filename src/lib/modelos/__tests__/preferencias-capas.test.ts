// src/lib/modelos/__tests__/preferencias-capas.test.ts

import { describe, it, expect } from "vitest";
import { preferenciasEfectivas, Licencias, CapasPrefs, Contexto, ResultadoPreferencias } from "../preferencias-capas";

describe("preferenciasEfectivas", () => {
  it("should return only libre when sistema is libre and other layers are not specified", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre" },
      "publico" as Contexto
    );
    expect(result.licenciaPermitida).toEqual(["libre"]);
    expect(result.permiteUsoPersonal).toBe(false);
  });

  it("should allow condicionada when grupo specifies condicionada and context is grupo", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre", grupo: "condicionada" },
      "grupo" as Contexto
    );
    expect(result.licenciaPermitida).toEqual(["libre", "condicionada"]);
    expect(result.permiteUsoPersonal).toBe(false);
  });

  it("should not allow personal in public context even if persona specifies personal", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre", persona: "personal" },
      "publico" as Contexto
    );
    expect(result.licenciaPermitida).toEqual(["libre"]);
    expect(result.permiteUsoPersonal).toBe(false);
  });

  it("should allow personal in personal context when persona specifies personal", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre", persona: "personal" },
      "personal" as Contexto
    );
    expect(result.licenciaPermitida).toEqual(["libre", "personal"]);
    expect(result.permiteUsoPersonal).toBe(true);
  });

  it("should respect neurona layer when it specifies a more restrictive license", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre", comunidad: "libre", neurona: "condicionada" },
      "comunidad" as Contexto
    );
    expect(result.licenciaPermitida).toEqual(["libre"]);
    expect(result.permiteUsoPersonal).toBe(false);
  });

  it("should allow condicionada when comunidad and grupo both allow it and context is comunidad", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre", comunidad: "condicionada", grupo: "condicionada" },
      "comunidad" as Contexto
    );
    expect(result.licenciaPermitida).toEqual(["libre", "condicionada"]);
    expect(result.permiteUsoPersonal).toBe(false);
  });

  it("should not allow desconocida under any circumstances", () => {
    const result = preferenciasEfectivas(
      { sistema: "libre" },
      "publico" as Contexto
    );
    // We expect that desconocida is not added to the allowed licenses
    expect(result.licenciaPermitida).toEqual(["libre"]);
    expect(result.permiteUsoPersonal).toBe(false);
  });
});