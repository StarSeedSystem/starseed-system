import { describe, it, expect } from "vitest";
import {
  CLAVE_TRANSPORTE_PREFERIDO,
  CLAVE_VOZ_SUPERTONIC,
  CLAVE_VOZ_IDIOMA,
  normalizarInferenciaLocal,
  evaluarNivelVozBorde,
  obtenerListaTransportes,
  obtenerListaIdiomasVoz,
} from "../red-mesh-settings";

describe("red-mesh-settings", () => {
  it("define constantes de clave", () => {
    expect(CLAVE_TRANSPORTE_PREFERIDO).toBe("starseed.mesh.transporte-preferido.v1");
    expect(CLAVE_VOZ_SUPERTONIC).toBe("starseed.mesh.voz.supertonic.v1");
    expect(CLAVE_VOZ_IDIOMA).toBe("starseed.mesh.voz.idioma.v1");
  });

  it("normaliza valores de inferencia local", () => {
    expect(normalizarInferenciaLocal(null)).toBe(true);
    expect(normalizarInferenciaLocal("true")).toBe(true);
    expect(normalizarInferenciaLocal("false")).toBe(false);
    expect(normalizarInferenciaLocal("1")).toBe(true);
    expect(normalizarInferenciaLocal("0")).toBe(false);
  });

  it("evalúa nivel de voz por supertonic activo", () => {
    expect(evaluarNivelVozBorde(true)).toBe("suptonica");
    expect(evaluarNivelVozBorde(false)).toBe("nube");
  });

  it("lista transportes disponibles", () => {
    const transportes = obtenerListaTransportes();
    expect(Array.isArray(transportes)).toBe(true);
    expect(transportes.length).toBeGreaterThan(0);
    const keys = transportes.map((t) => t.key);
    expect(keys.some((k) => k === "webrtc-local")).toBe(true);
  });

  it("lista idiomas de voz con etiquetas en español", () => {
    const idiomas = obtenerListaIdiomasVoz();
    expect(Array.isArray(idiomas)).toBe(true);
    expect(idiomas.length).toBeGreaterThan(0);
    const es = idiomas.find((i) => i.code === "es");
    expect(es).toBeDefined();
    expect(es!.label).toContain("Español");
  });
});
