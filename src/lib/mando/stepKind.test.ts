import { describe, expect, it } from "vitest";
import {
  PASOS_ONBOARDING,
  indiceDePaso,
  ordenDePasos,
  pasoAnterior,
  pasoSiguiente,
  type PasoOnboarding,
} from "./stepKind";

describe("ordenDePasos", () => {
  it("incluye la fase solo para cuentas de grupo", () => {
    expect(ordenDePasos("grupo")).toEqual([...PASOS_ONBOARDING]);
    expect(ordenDePasos("grupo")).toContain("phase");
  });

  it("la omite para individuos y para un tipo sin elegir", () => {
    expect(ordenDePasos("individual")).not.toContain("phase");
    expect(ordenDePasos(undefined)).not.toContain("phase");
    expect(ordenDePasos(undefined)).toEqual(ordenDePasos("individual"));
  });

  it("no muta el orden canónico", () => {
    const orden = ordenDePasos("grupo");
    orden.pop();
    expect(PASOS_ONBOARDING).toContain("done");
  });
});

describe("pasoSiguiente", () => {
  it("salta la fase en cuentas individuales", () => {
    expect(pasoSiguiente("profile", "individual")).toBe("ai-guide");
    expect(pasoSiguiente("ai-guide", undefined)).toBe("done");
  });

  it("pasa por la fase en cuentas de grupo", () => {
    expect(pasoSiguiente("ai-guide", "grupo")).toBe("phase");
    expect(pasoSiguiente("phase", "grupo")).toBe("done");
  });

  it("devuelve null al final y ante un paso ajeno al recorrido", () => {
    expect(pasoSiguiente("done", "grupo")).toBeNull();
    expect(pasoSiguiente("phase", "individual")).toBeNull();
  });
});

describe("pasoAnterior", () => {
  it("recorre el orden inverso con y sin fase", () => {
    expect(pasoAnterior("done", "grupo")).toBe("phase");
    expect(pasoAnterior("done", "individual")).toBe("ai-guide");
  });

  it("devuelve null al principio y ante un paso ajeno al recorrido", () => {
    expect(pasoAnterior("kind", "grupo")).toBeNull();
    expect(pasoAnterior("phase", "individual")).toBeNull();
  });
});

describe("indiceDePaso", () => {
  it("numera dentro del recorrido visible", () => {
    expect(indiceDePaso("kind", "grupo")).toBe(0);
    expect(indiceDePaso("done", "grupo")).toBe(PASOS_ONBOARDING.length - 1);
    expect(indiceDePaso("done", "individual")).toBe(ordenDePasos("individual").length - 1);
  });

  it("marca -1 cuando el paso no aplica", () => {
    const ajeno: PasoOnboarding = "phase";
    expect(indiceDePaso(ajeno, "individual")).toBe(-1);
  });
});
