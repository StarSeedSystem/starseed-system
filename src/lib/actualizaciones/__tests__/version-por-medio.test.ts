import { describe, expect, it } from "vitest";
import {
  medioActual,
  hayActualizacion,
  verificarActualizacion,
  type MedioOS,
  type BanderasEntorno,
} from "../version-por-medio";
import { esVersionMasNueva } from "@/lib/version/os-release";

describe("medioActual", () => {
  const webBase: BanderasEntorno = {
    tauriPresente: false,
    esAndroid: false,
    esIOS: false,
    estaStandalone: false,
    esLocal: false,
    displayModeWeb: false,
  };

  it("retorna 'android' cuando esAndroid es true", () => {
    expect(medioActual({ ...webBase, esAndroid: true })).toBe("android");
    expect(medioActual({ ...webBase, esAndroid: true, esIOS: true })).toBe("android");
  });

  it("retorna 'ios' cuando esIOS es true", () => {
    expect(medioActual({ ...webBase, esIOS: true })).toBe("ios");
    expect(medioActual({ ...webBase, esIOS: true, esAndroid: true })).toBe("android");
  });

  it("retorna 'escritorio' cuando tauriPresente es true", () => {
    expect(medioActual({ ...webBase, tauriPresente: true })).toBe("escritorio");
    expect(medioActual({ ...webBase, tauriPresente: true, esAndroid: true })).toBe("android");
  });

  it("retorna 'pwa' cuando estaStandalone o displayModeWeb son true (y no es nativo)", () => {
    expect(medioActual({ ...webBase, estaStandalone: true })).toBe("pwa");
    expect(medioActual({ ...webBase, displayModeWeb: true })).toBe("pwa");
    expect(medioActual({ ...webBase, estaStandalone: true, displayModeWeb: true })).toBe("pwa");
  });

  it("retorna 'web' cuando esLocal es true (localhost)", () => {
    expect(medioActual({ ...webBase, esLocal: true })).toBe("web");
  });

  it("retorna 'web' por defecto cuando no hay banderas distintivas", () => {
    expect(medioActual({ ...webBase, esLocal: false, estaStandalone: false, displayModeWeb: false })).toBe("web");
  });

  it("prioriza android sobre todo excepto si no hay android", () => {
    expect(medioActual({ ...webBase, esAndroid: true, esIOS: true, estaStandalone: true })).toBe("android");
  });
});

describe("hayActualizacion", () => {
  it("retorna false cuando instalada es null", () => {
    expect(hayActualizacion({ medio: "web", instalada: null, publicada: "2026.10.10" })).toBe(false);
  });

  it("retorna false cuando instalada es empty string", () => {
    expect(hayActualizacion({ medio: "pwa", instalada: "", publicada: "2026.10.10" })).toBe(false);
  });

  it("retorna false cuando publicada es empty", () => {
    expect(hayActualizacion({ medio: "escritorio", instalada: "0.3.0", publicada: "" })).toBe(false);
  });

  it("retorna true cuando publicada es más nueva que instalada", () => {
    expect(hayActualizacion({ medio: "web", instalada: "2026.10.09", publicada: "2026.10.10" })).toBe(true);
    expect(hayActualizacion({ medio: "escritorio", instalada: "0.3.0", publicada: "0.4.0" })).toBe(true);
  });

  it("retorna false cuando instalada es igual o más nueva que publicada", () => {
    expect(hayActualizacion({ medio: "web", instalada: "2026.10.10", publicada: "2026.10.10" })).toBe(false);
    expect(hayActualizacion({ medio: "pwa", instalada: "2026.10.11", publicada: "2026.10.10" })).toBe(false);
    expect(hayActualizacion({ medio: "android", instalada: "0.4.0", publicada: "0.3.0" })).toBe(false);
  });

  it("funciona con versiones con prefijo 'v'", () => {
    expect(hayActualizacion({ medio: "escritorio", instalada: "v0.3.0", publicada: "v0.4.0" })).toBe(true);
    expect(hayActualizacion({ medio: "web", instalada: "v2026.10.09", publicada: "v2026.10.10" })).toBe(true);
  });

  it("considera todos los medios del OS", () => {
    const medios: MedioOS[] = ["web", "pwa", "escritorio", "android", "ios"];
    for (const medio of medios) {
      expect(hayActualizacion({ medio, instalada: "0.1.0", publicada: "0.2.0" })).toBe(true);
    }
  });
});

describe("verificarActualizacion", () => {
  it("devuelve objeto con la verificación completa", () => {
    const resultado = verificarActualizacion("web", "2026.10.09", "2026.10.10");

    expect(resultado).toEqual({
      hayActualizacion: true,
      versionInstalada: "2026.10.09",
      versionPublicada: "2026.10.10",
    });
  });

  it("indica false cuando no hay actualización", () => {
    const resultado = verificarActualizacion("escritorio", "0.4.0", "0.3.0");

    expect(resultado).toEqual({
      hayActualizacion: false,
      versionInstalada: "0.4.0",
      versionPublicada: "0.3.0",
    });
  });

  it("maneja versiones null de forma segura", () => {
    const resultado = verificarActualizacion("android", null, "0.3.0");

    expect(resultado).toEqual({
      hayActualizacion: false,
      versionInstalada: null,
      versionPublicada: "0.3.0",
    });
  });
});

describe("integración con esVersionMasNueva", () => {
  it("usa esVersionMasNueva del sistema de versiones", () => {
    expect(hayActualizacion({ medio: "web", instalada: "2026.10.09", publicada: "2026.10.10" })).toBe(
      esVersionMasNueva("2026.10.10", "2026.10.09"),
    );
    expect(hayActualizacion({ medio: "escritorio", instalada: "0.3.0", publicada: "0.4.0" })).toBe(
      esVersionMasNueva("0.4.0", "0.3.0"),
    );
  });
});