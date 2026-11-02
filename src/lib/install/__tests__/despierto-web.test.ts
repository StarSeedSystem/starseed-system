import { describe, it, expect } from "vitest";
import {
  accionDespierto,
  etiquetaProceso,
  avisoDespierto,
  hayWakeLock,
  type EstadoDespierto,
} from "../despierto-web";

const VIVO = { wakeLock: { request: () => Promise.resolve({ release: () => Promise.resolve() }) } };

const estado = (d: Partial<EstadoDespierto>): EstadoDespierto => ({
  proceso: null,
  visible: true,
  lockVivo: false,
  ...d,
});

describe("hayWakeLock", () => {
  it("sin visor (SSR) devuelve false", () => {
    expect(hayWakeLock(undefined)).toBe(false);
    expect(hayWakeLock(null)).toBe(false);
  });

  it("un objeto sin wakeLock o sin request devuelve false", () => {
    expect(hayWakeLock({})).toBe(false);
    expect(hayWakeLock({ wakeLock: {} })).toBe(false);
  });

  it("con wakeLock.request devuelve true", () => {
    expect(hayWakeLock(VIVO)).toBe(true);
  });
});

describe("accionDespierto", () => {
  it("sin soporte y sin lock no hace nada", () => {
    expect(
      accionDespierto(estado({ proceso: "estacion" }), false),
    ).toBe("nada");
  });

  it("sin soporte pero con lock vivo lo suelta", () => {
    expect(accionDespierto(estado({ lockVivo: true }), false)).toBe("soltar");
  });

  it("proceso activo, pestaña visible y sin lock pide el lock", () => {
    expect(
      accionDespierto(estado({ proceso: "transmision" }), true),
    ).toBe("pedir");
  });

  it("proceso activo, visible y lock vivo lo sigue manteniendo", () => {
    expect(
      accionDespierto(estado({ proceso: "contenedor", lockVivo: true }), true),
    ).toBe("seguir");
  });

  it("sin proceso pero con lock vivo lo suelta", () => {
    expect(accionDespierto(estado({ lockVivo: true }), true)).toBe("soltar");
  });

  it("pestaña oculta suelta el lock aunque el proceso siga", () => {
    expect(
      accionDespierto(
        estado({ proceso: "estacion", visible: false, lockVivo: true }),
        true,
      ),
    ).toBe("soltar");
  });

  it("pestaña oculta sin lock no hace nada", () => {
    expect(
      accionDespierto(estado({ proceso: "contenedor", visible: false }), true),
    ).toBe("nada");
  });
});

describe("etiquetaProceso", () => {
  it("traduce cada proceso a su nombre en pantalla", () => {
    expect(etiquetaProceso("transmision")).toBe("Transmisión");
    expect(etiquetaProceso("estacion")).toBe("Estación");
    expect(etiquetaProceso("contenedor")).toBe("Contenedor");
  });
});

describe("avisoDespierto", () => {
  it("con soporte admite el límite honesto: pantalla cerrada duerme igual", () => {
    const texto = avisoDespierto(true);
    expect(texto).toContain("pantalla");
    expect(texto).toContain("keepalive");
    expect(texto).toContain("app nativa");
  });

  it("sin soporte lo dice y ofrece la alternativa nativa", () => {
    const texto = avisoDespierto(false);
    expect(texto).toContain("no permite");
    expect(texto).toContain("app nativa");
    expect(texto).toContain("keepalive");
  });
});
