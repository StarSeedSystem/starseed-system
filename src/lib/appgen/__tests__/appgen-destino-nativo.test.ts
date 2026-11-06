import { describe, it, expect } from "vitest";
import {
  newApp,
  requisitosNativos as requisitosDelGenerador,
  type AppFile,
} from "@/lib/appgen/appgen";
import {
  requisitosNativos as decidirRequisitos,
  planBama as paqueteDePlan,
  type AppParaPlan,
  type EntornoNativo,
} from "@/lib/appgen/destino-nativo";

const MAC_SIN_XCODE: EntornoNativo = {
  so: "macOS",
  versionSo: "26.3.1",
  xcode: null,
  swift: "6.0.2",
  discoLibreGb: 9.7,
};

const MAC_CON_XCODE: EntornoNativo = {
  so: "macOS",
  versionSo: "26.3.1",
  xcode: "26.0",
  swift: "6.2",
  discoLibreGb: 60,
};

const ARCHIVOS: AppFile[] = [
  { path: "index.html", content: "<html></html>", language: "html" },
  { path: "main.swift", content: "import SwiftUI", language: "swift" },
];

const APP_PARA_PLAN: AppParaPlan = {
  name: "Notas nativas",
  files: ARCHIVOS,
  meta: { spec: "App de notas con identidad Trinity", notes: "Plan de prueba" },
};

describe("destino nativa-macos del generador de apps", () => {
  it("newApp ofrece el destino y expone sus requisitos visibles", () => {
    const app = newApp("Notas nativas", null, "nativa-macos");
    expect(app.destino).toBe("nativa-macos");
    expect(app.meta.requisitosNativos).toMatchObject({
      xcode: true,
      swift: "6.2",
      swiftUI: true,
      swiftData: true,
      macOS: "26",
    });
  });

  it("newApp sin destino no pide requisitos nativos", () => {
    const app = newApp("App web", null);
    expect(app.destino).toBeUndefined();
    expect(app.meta.requisitosNativos).toBeUndefined();
  });

  it("con solo Command Line Tools planifica en vez de construir", () => {
    const req = decidirRequisitos(MAC_SIN_XCODE);
    expect(req.puedePlanificar).toBe(true);
    expect(req.puedeConstruir).toBe(false);
    expect(req.faltan).toContain("Xcode 26");
  });

  it("con macOS 26 y Xcode 26 construye sin requisitos pendientes", () => {
    const req = decidirRequisitos(MAC_CON_XCODE);
    expect(req.puedeConstruir).toBe(true);
    expect(req.faltan).toEqual([]);
  });

  it("el plan queda como proyecto de Librería en datos puros", () => {
    const plan = paqueteDePlan(APP_PARA_PLAN);
    expect(plan.destino).toBe("nativa-macos");
    expect(plan.requisitosMinimos).toEqual({ macOS: "26", xcode: "26", swift: "6.2" });
    expect(plan.pantallas.map((p) => p.origen)).toContain("index.html");
    expect(plan.historias.length).toBeGreaterThan(0);
    expect(plan.tokensSwiftUI).toHaveLength(4);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("el generador y el plan declaran los mismos mínimos", () => {
    const plan = paqueteDePlan(APP_PARA_PLAN);
    const req = requisitosDelGenerador();
    expect(req.macOS).toBe(plan.requisitosMinimos.macOS);
    expect(req.swift).toBe(plan.requisitosMinimos.swift);
  });

  it("planificar siempre es posible y es puro", () => {
    const vacia = paqueteDePlan({ name: "Vacía" });
    expect(vacia.pantallas).toHaveLength(1);
    expect(vacia.archivos.total).toBe(0);
    expect(paqueteDePlan(APP_PARA_PLAN)).toEqual(paqueteDePlan(APP_PARA_PLAN));
  });
});
