import { describe, it, expect } from "vitest";
import { requisitosNativos, planBama } from "../destino-nativo";
import type { AppBama } from "../destino-nativo";

const CLT = (disco = 10) => ({
  so: "macOS",
  versionSo: "26.3.1",
  xcode: "",
  swift: "6.0.2",
  discoLibreGb: disco,
});

const app: AppBama = {
  nombre: "Vitrineo",
  descripcion: "Catálogo de la Librería en escritorio",
  pantallas: ["Inicio", "Ficha", "Ajustes"],
};

describe("requisitosNativos", () => {
  it("Command Line Tools: planifica sí, construye no y falta «Xcode 26»", () => {
    const r = requisitosNativos(CLT());
    expect(r.puedePlanificar).toBe(true);
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("Xcode 26");
  });

  it("Xcode 26 en macOS 26 construye sin faltas", () => {
    const r = requisitosNativos({ ...CLT(), xcode: "26.0.1" });
    expect(r).toEqual({ puedeConstruir: true, puedePlanificar: true, faltan: [] });
  });

  it("macOS 25 no construye aunque haya Xcode 26", () => {
    const r = requisitosNativos({ ...CLT(), versionSo: "25.5", xcode: "26.0" });
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("macOS 26");
  });

  it("Xcode 15 no sirve para construir", () => {
    const r = requisitosNativos({ ...CLT(), xcode: "15.4" });
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("Xcode 26");
  });

  it("sin Xcode y sin disco para instalarlo, avisa del disco", () => {
    const r = requisitosNativos(CLT(6));
    expect(r.faltan).toContain("10 GB de disco libres (Xcode 26 ocupa más de 10 GB)");
  });

  it("con Xcode 26 el disco ya no entra en las faltas", () => {
    const r = requisitosNativos({ ...CLT(6), xcode: "26.0" });
    expect(r.faltan).toEqual([]);
  });

  it("un sistema que no es macOS solo planifica", () => {
    const r = requisitosNativos({ ...CLT(), so: "Linux", xcode: "26.0" });
    expect(r.puedePlanificar).toBe(true);
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("macOS 26");
  });
});

describe("planBama", () => {
  const plan = planBama(app);

  it("devuelve el destino y los dos comandos de instalación del plugin", () => {
    expect(plan.destino).toBe("Nativa · macOS (BAMA)");
    expect(plan.comandos).toEqual([
      "claude plugin marketplace add daveebbelaar/bama",
      "claude plugin install bama@bama",
    ]);
  });

  it("clona exactamente las pantallas de la app", () => {
    expect(plan.pantallasClonar).toEqual(app.pantallas);
  });

  it("genera una historia con criterios de aceptación por pantalla", () => {
    expect(plan.historias).toHaveLength(3);
    expect(plan.historias[0].titulo).toBe("Implementar pantalla «Inicio»");
    expect(plan.historias[0].criterios.length).toBeGreaterThanOrEqual(3);
  });

  it("traduce los tokens Trinity a nombres SwiftUI", () => {
    const nombres = plan.kitDisenoTokens.map((o) => o.swiftui);
    expect(nombres).toContain("zenith");
    expect(nombres).toContain("horizonte");
    for (const t of plan.kitDisenoTokens) {
      expect(t.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("usa el nombre de la app y no toca disco ni procesos (datos puros)", () => {
    expect(plan.notas.join("\n")).toContain(app.nombre);
    expect(plan.notas.join("\n")).toContain("Xcode 26");
  });
});
