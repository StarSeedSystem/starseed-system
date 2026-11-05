import { describe, it, expect } from "vitest";
import { entradaDesdeDeteccion, requisitosNativos, planBama } from "../destino-nativo";
import type { AppBama } from "../destino-nativo";
import type { DeteccionMaquina } from "@/lib/recursos-ia/deteccion-tipos";

const maquina = (extras: Partial<DeteccionMaquina> = {}): DeteccionMaquina => ({
  t: "",
  host: "mando",
  so: "macOS 26.3.1",
  arquitectura: "arm64",
  nucleos: 8,
  ramGb: 8,
  gpus: [],
  volumenes: [
    { montaje: "/", nombre: "Macintosh HD", totalGb: 100, libreGb: 10, externo: false, tipoDisco: "nvme", conexion: "interna" },
  ],
  herramientas: ["swift-6.0.2", "node-22"],
  runtimes: [],
  servidoresIA: [],
  avisos: [],
  ...extras,
});

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

describe("entradaDesdeDeteccion", () => {
  it("del sondeo de la Mac con solo Command Line Tools: planifica sí, construye no y falta «Xcode 26»", () => {
    const r = requisitosNativos(entradaDesdeDeteccion(maquina()));
    expect(r.puedePlanificar).toBe(true);
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("Xcode 26");
    expect(r.faltan).not.toContain("macOS 26");
  });

  it("con «xcode-26» en el sondeo entra el disco y construye sin faltas", () => {
    const conXcode = maquina({ herramientas: ["xcode-26", "swift-6.2"] });
    const entrada = entradaDesdeDeteccion(conXcode);
    expect(entrada.xcode).toBe("26");
    expect(entrada.swift).toBe("6.2");
    expect(requisitosNativos(entrada)).toEqual({ puedeConstruir: true, puedePlanificar: true, faltan: [] });
  });

  it("el disco libre sale del volumen interno más holgado, aunque haya un disco externo", () => {
    const entrada = entradaDesdeDeteccion(
      maquina({
        volumenes: [
          { montaje: "/", nombre: "Macintosh HD", totalGb: 100, libreGb: 4, externo: false, tipoDisco: "ssd", conexion: "interna" },
          { montaje: "/Volumes/SSD", nombre: "SSD", totalGb: 500, libreGb: 400, externo: true, tipoDisco: "ssd", conexion: "usb" },
        ],
      }),
    );
    expect(entrada.discoLibreGb).toBe(4);
  });

  it("«ubuntu 24.04» solo planifica: no es macOS", () => {
    const r = requisitosNativos(entradaDesdeDeteccion(maquina({ so: "Ubuntu 24.04.2" })));
    expect(r.puedePlanificar).toBe(true);
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("macOS 26");
  });

  it("«Mac OS X 15» se normaliza a macOS y no construye por versión", () => {
    const r = requisitosNativos(entradaDesdeDeteccion(maquina({ so: "Mac OS X 15.7" })));
    expect(r.puedeConstruir).toBe(false);
    expect(r.faltan).toContain("macOS 26");
  });

  it("sin volúmenes ni Xcode mide disco 0 y avisa de ambos faltantes", () => {
    const entrada = entradaDesdeDeteccion(maquina({ volumenes: [], herramientas: [] }));
    expect(entrada).toEqual({ so: "macOS", versionSo: "26.3.1", xcode: "", swift: "", discoLibreGb: 0 });
    const r = requisitosNativos(entrada);
    expect(r.faltan).toContain("Xcode 26");
    expect(r.faltan).toContain("10 GB de disco libres (Xcode 26 ocupa más de 10 GB)");
  });
});
