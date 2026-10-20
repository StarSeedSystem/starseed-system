import { describe, it, expect } from "vitest";
import { aParametrosOrbe } from "../adaptadores/expresion-orbe";

describe("aParametrosOrbe", () => {
  it("should convert expresión to parameters correctly", () => {
    const expresion = {
      tono: 0,
      pulsoHz: 0.2,
      escala: 0.5,
      animacion: "respira",
    };
    const params = aParametrosOrbe(expresion);
    expect(params).toEqual({
      turbulencia: 0,
      filo: 0.1,
      simetria: 0.9,
      matiz: 0,
      respiracion: 0,
    });
  });

  it("should handle tono 360", () => {
    const expresion = {
      tono: 360,
      pulsoHz: 0.2,
      escala: 0.5,
      animacion: "respira",
    };
    const params = aParametrosOrbe(expresion);
    expect(params.matiz).toBe(1); // 360/360 = 1
  });

  it("should handle pulsoHz out of range", () => {
    const expresion = {
      tono: 0,
      pulsoHz: 0.0, // below 0.2
      escala: 0.5,
      animacion: "respira",
    };
    const params = aParametrosOrbe(expresion);
    expect(params.respiracion).toBe(0); // (0.0 - 0.2) / 1.0 = -0.2 -> clamped to 0
  });

  it("should handle escala out of range", () => {
    const expresion = {
      tono: 0,
      pulsoHz: 0.2,
      escala: 0.0, // below 0.5
      animacion: "respira",
    };
    const params = aParametrosOrbe(expresion);
    expect(params.turbulencia).toBe(0); // (0.0 - 0.5) / 1.0 = -0.5 -> clamped to 0
  });

  it("should handle different animations", () => {
    const expresion = {
      tono: 0,
      pulsoHz: 0.2,
      escala: 0.5,
      animacion: "habla",
    };
    const params = aParametrosOrbe(expresion);
    expect(params.filo).toBe(0.4); // from the map
  });

  it("should clamp values to 0..1", () => {
    const expresion = {
      tono: 720, // 2*360 -> matiz = 2 -> clamped to 1
      pulsoHz: 2.2, // (2.2 - 0.2) / 1.0 = 2.0 -> clamped to 1
      escala: 2.5, // (2.5 - 0.5) / 1.0 = 2.0 -> clamped to 1
      animacion: "orbita",
    };
    const params = aParametrosOrbe(expresion);
    expect(params.matiz).toBeCloseTo(1);
    expect(params.respiracion).toBeCloseTo(1);
    expect(params.turbulencia).toBeCloseTo(1);
    expect(params.filo).toBe(0.7); // orbita -> 0.7
    expect(params.simetria).toBeCloseTo(0.3); // 1 - 0.7
  });
});