/**
 * Pruebas del orden de pasos del onboarding (`/onboarding`), la costura que usa
 * `StepKind` para decidir el paso siguiente/anterior según el tipo de cuenta.
 */
import { describe, it, expect } from "vitest";
import { PASOS_ONBOARDING, ordenPasos, siguientePaso, anteriorPaso } from "../pasos";

describe("orden de pasos del onboarding", () => {
  it("el orden base no repite pasos y termina en «done»", () => {
    expect(new Set(PASOS_ONBOARDING).size).toBe(PASOS_ONBOARDING.length);
    expect(PASOS_ONBOARDING[PASOS_ONBOARDING.length - 1]).toBe("done");
  });

  it("para cuenta individual se salta la fase comunitaria", () => {
    expect(ordenPasos("individual")).not.toContain("phase");
    expect(ordenPasos(undefined)).not.toContain("phase");
  });

  it("para grupo la fase comunitaria va antes del final", () => {
    const orden = ordenPasos("grupo");
    expect(orden).toContain("phase");
    expect(orden.indexOf("phase")).toBeGreaterThan(0);
    expect(orden[orden.length - 1]).toBe("done");
  });

  it("siguientePaso avanza y devuelve null al final", () => {
    expect(siguientePaso("kind", "individual")).toBe("authMode");
    expect(siguientePaso("ai-guide", "individual")).toBe("done");
    expect(siguientePaso("done", "grupo")).toBeNull();
  });

  it("anteriorPaso retrocede sin saltar la fase y devuelve null al inicio", () => {
    expect(anteriorPaso("done", "grupo")).toBe("phase");
    expect(anteriorPaso("done", "individual")).toBe("ai-guide");
    expect(anteriorPaso("kind", "individual")).toBeNull();
  });
});
