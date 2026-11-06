import { describe, it, expect } from "vitest";
import {
  requisitosNativos,
  planBama,
  type AppParaPlan,
  type EntornoNativo,
} from "@/lib/appgen/destino-nativo";

const MAC_SOLO_CLT: EntornoNativo = {
  so: "macOS",
  versionSo: "26.3.1",
  xcode: null,
  swift: "6.0.2",
  discoLibreGb: 9.7,
};

const MAC_COMPLETA: EntornoNativo = {
  so: "macOS",
  versionSo: "26.3.1",
  xcode: "26.0",
  swift: "6.2",
  discoLibreGb: 60,
};

describe("requisitosNativos", () => {
  it("con solo Command Line Tools planifica sí y construye no, falta Xcode 26", () => {
    const r = requisitosNativos(MAC_SOLO_CLT);
    expect(r.puedePlanificar).toBe(true);
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("Xcode 26");
    expect(r.faltan).not.toContain("macOS 26");
  });

  it("con macOS 26 y Xcode 26 puede construir sin faltantes", () => {
    const r = requisitosNativos(MAC_COMPLETA);
    expect(r.puedeConstruir).toBe(true);
    expect(r.puedePlanificar).toBe(true);
    expect(r.faltan).toEqual([]);
  });

  it("con macOS anterior no construye aunque haya Xcode 26", () => {
    const r = requisitosNativos({ ...MAC_COMPLETA, versionSo: "15.5" });
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("macOS 26");
  });

  it("fuera de macOS solo planifica", () => {
    const r = requisitosNativos({ ...MAC_COMPLETA, so: "Linux" });
    expect(r.puedePlanificar).toBe(true);
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("macOS 26");
  });
});

const APP: AppParaPlan = {
  name: "Mi App",
  files: [
    { path: "index.html", content: "<html></html>", language: "html" },
    { path: "ajustes.html", content: "<html></html>", language: "html" },
    { path: "main.swift", content: "import SwiftUI", language: "swift" },
  ],
  meta: {
    spec: "Una app de notas con identidad Trinity",
    notes: "Hecha con el estudio de apps",
    plugins: ["supabase"],
    connections: ["api-notas"],
  },
};

describe("planBama", () => {
  it("devuelve el paquete de planificación como datos", () => {
    const plan = planBama(APP);
    expect(plan.app).toBe("Mi App");
    expect(plan.destino).toBe("nativa-macos");
    expect(plan.requisitosMinimos).toEqual({ macOS: "26", xcode: "26", swift: "6.2" });
    expect(plan.pantallas.map((p) => p.nombre)).toEqual(["index", "ajustes"]);
    expect(plan.pantallas[0].origen).toBe("index.html");
    expect(plan.archivos).toEqual({ total: 3, swift: ["main.swift"] });
    expect(plan.notas).toBe("Hecha con el estudio de apps");
  });

  it("cada historia lleva criterios de aceptación no vacíos", () => {
    const plan = planBama(APP);
    expect(plan.historias.length).toBeGreaterThanOrEqual(1);
    for (const historia of plan.historias) {
      expect(historia.criterios.length).toBeGreaterThan(0);
      for (const criterio of historia.criterios) {
        expect(criterio.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("traduce los cuatro ejes Trinity a nombres y literales SwiftUI", () => {
    const plan = planBama(APP);
    const zenith = plan.tokensSwiftUI.find((t) => t.token === "trinity.zenith.active");
    expect(zenith).toMatchObject({
      valor: "#007FFF",
      nombreSwiftUI: "Color.trinityZenith",
    });
    expect(zenith?.literalSwiftUI).toContain("Color(red:");
    expect(plan.tokensSwiftUI).toHaveLength(4);
  });

  it("incluye los comandos de BAMA sin ejecutar nada", () => {
    const comandos = planBama(APP).comandos.map((c) => c.comando);
    expect(comandos).toContain("claude plugin marketplace add daveebbelaar/bama");
    expect(comandos).toContain("claude plugin install bama@bama");
  });

  it("planifica siempre, aunque la app no tenga archivos", () => {
    const plan = planBama({ name: "Vacía" });
    expect(plan.pantallas).toHaveLength(1);
    expect(plan.archivos.total).toBe(0);
    expect(plan.historias.length).toBeGreaterThan(0);
  });

  it("es pura: dos llamadas con la misma app dan el mismo paquete", () => {
    expect(planBama(APP)).toEqual(planBama(APP));
  });
});
