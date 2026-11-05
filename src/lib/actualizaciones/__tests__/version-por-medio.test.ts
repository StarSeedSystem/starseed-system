import { describe, it, expect } from "vitest";
import { medioActual, hayActualizacion } from "../version-por-medio";

describe("medioActual", () => {
  it("detecta web cuando no hay Tauri ni standalone", () => {
    expect(medioActual({})).toBe("web");
    expect(medioActual({ tauriPresente: false, modoStandalone: false })).toBe("web");
  });

  it("detecta pwa en modo standalone sin Tauri", () => {
    expect(medioActual({ tauriPresente: false, modoStandalone: true })).toBe("pwa");
  });

  it("detecta escritorio con Tauri desktop", () => {
    expect(medioActual({ tauriPresente: true, plataforma: "desktop" })).toBe("escritorio");
  });

  it("detecta android con Tauri android", () => {
    expect(medioActual({ tauriPresente: true, plataforma: "android" })).toBe("android");
  });

  it("detecta ios con Tauri ios", () => {
    expect(medioActual({ tauriPresente: true, plataforma: "ios" })).toBe("ios");
  });

  it("prioriza Tauri sobre standalone", () => {
    expect(medioActual({ tauriPresente: true, plataforma: "desktop", modoStandalone: true })).toBe("escritorio");
  });
});

describe("hayActualizacion", () => {
  it("devuelve false sin datos", () => {
    expect(hayActualizacion({ medio: "escritorio", instalada: null, publicada: "0.3.1" })).toBe(false);
    expect(hayActualizacion({ medio: "web", instalada: "abc", publicada: null })).toBe(false);
  });

  it("para web/pwa compara por igualdad de sha/build", () => {
    expect(hayActualizacion({ medio: "web", instalada: "sha1", publicada: "sha1" })).toBe(false);
    expect(hayActualizacion({ medio: "web", instalada: "sha1", publicada: "sha2" })).toBe(true);
    expect(hayActualizacion({ medio: "pwa", instalada: "2026.10.09", publicada: "2026.10.10" })).toBe(true);
  });

  it("para nativos usa esVersionMasNueva", () => {
    expect(hayActualizacion({ medio: "escritorio", instalada: "0.3.0", publicada: "0.3.0" })).toBe(false);
    expect(hayActualizacion({ medio: "android", instalada: "0.3.0", publicada: "0.3.1" })).toBe(true);
    expect(hayActualizacion({ medio: "ios", instalada: "0.3.1", publicada: "0.3.0" })).toBe(false);
  });
});
