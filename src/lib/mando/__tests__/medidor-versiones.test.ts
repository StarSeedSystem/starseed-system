import { describe, it, expect } from "vitest";
import { detalleDeMedidor } from "@/lib/mando/medidores";

const estadoBase = {
  fase: "esperando-lista",
  detalle: "lista terminada",
  version: "0.3.0",
  pasos: [],
  jobs: [],
  medios: {
    web: { estado: "al-dia", faltan: [], pequenos: [] },
    pwa: { estado: "al-dia", faltan: [], pequenos: [] },
    macos: { estado: "atascado", faltan: ["StarSeed_OS_0.3.0_universal.dmg"], pequenos: [] },
    windows: { estado: "al-dia", faltan: [], pequenos: [] },
    linux: { estado: "al-dia", faltan: [], pequenos: [] },
    android: { estado: "no-disponible", faltan: [], pequenos: [] },
    ios: { estado: "no-disponible", faltan: [], pequenos: [] },
    canales: { estado: "al-dia", faltan: [], pequenos: [] },
    libreria: { estado: "al-dia", faltan: [], pequenos: [] },
  },
  historial: [],
  pausado: false,
  tono: "normal",
};

describe("medidor versiones", () => {
  it("resumen es fase y detalle", () => {
    const d = detalleDeMedidor("versiones", { lanzamientos: estadoBase });
    expect(d.clave).toBe("versiones");
    expect(d.titulo).toBe("Versiones");
    expect(d.resumen).toBe("esperando-lista · lista terminada");
  });

  it("una fila por medio con estado y porque", () => {
    const d = detalleDeMedidor("versiones", { lanzamientos: estadoBase });
    expect(d.filas).toHaveLength(9);
    const mac = d.filas.find((f) => f.id === "macos");
    expect(mac).toBeDefined();
    expect(mac?.estado).toBe("atascado");
    expect(mac?.porque).toContain("Faltan:");
    expect(mac?.porque).toContain("StarSeed_OS_0.3.0_universal.dmg");
    const web = d.filas.find((f) => f.id === "web");
    expect(web?.estado).toBe("al-dia");
    expect(web?.porque).toBe("Al día");
  });

  it("sin estado devuelve mensaje vacío", () => {
    const d = detalleDeMedidor("versiones", { lanzamientos: null });
    expect(d.resumen).toBe("sin estado del director de lanzamientos");
    expect(d.filas).toHaveLength(0);
  });
});
