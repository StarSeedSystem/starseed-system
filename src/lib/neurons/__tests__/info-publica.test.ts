/**
 * (VER1107B) Lo que cada neurona anuncia de sí misma y cómo se enseña: versión, medio, aparato,
 * «Nueva versión disponible» y «versión desconocida» para las neuronas que no lo anuncian.
 */
import { describe, expect, it } from "vitest";
import { formatearInfoNeurona, infoPublicaDesde, mejorMedio, sanearInfoPublica } from "../info-publica";

const INFO_MAC = {
  app_version: "0.5.1",
  app_nombre: "StarSeed OS",
  identificador: "app.starseed.os",
  sistema: "os",
  plataforma: "macos",
  so_version: "15.1.0",
  arquitectura: "aarch64",
  equipo: "MacBook-de-Alex",
  modelo: null,
  tauri_version: "2.12.5",
  escritorio: true,
  actualizador: true,
};

describe("sanearInfoPublica", () => {
  it("acepta lo bueno, recorta y quita lo que no es", () => {
    expect(sanearInfoPublica({ medio: "android", app: "cafe", so: "Android", soV: "14", equipo: " Samsung SM-X200 ", pa: 1 })).toEqual({
      medio: "android",
      app: "cafe",
      so: "android",
      soV: "14",
      equipo: "Samsung SM-X200",
      pa: 1,
    });
    expect(sanearInfoPublica({ medio: "nevera" })).toBeNull();
    expect(sanearInfoPublica(null)).toBeNull();
    expect(sanearInfoPublica({ medio: "web", app: "otra", pa: 2, equipo: "x".repeat(200) })).toEqual({ medio: "web", equipo: "x".repeat(60) });
  });
});

describe("infoPublicaDesde", () => {
  it("app nativa con info_neurona: medio, app, sistema, arquitectura y equipo; entiende el pedido", () => {
    expect(infoPublicaDesde({ medio: "escritorio", info: INFO_MAC })).toEqual({
      medio: "escritorio",
      app: "os",
      so: "macos",
      soV: "15.1.0",
      arq: "aarch64",
      equipo: "MacBook-de-Alex",
      pa: 1,
    });
  });
  it("Android: el modelo manda sobre el nombre del equipo; navegador: solo el medio", () => {
    const android = { ...INFO_MAC, plataforma: "android", modelo: "Samsung SM-X200", equipo: null };
    expect(infoPublicaDesde({ medio: "android", info: android }).equipo).toBe("Samsung SM-X200");
    expect(infoPublicaDesde({ medio: "web", info: null })).toEqual({ medio: "web", pa: 1 });
  });
});

describe("formatearInfoNeurona", () => {
  const d = { medio: "escritorio" as const, app: "os" as const, so: "macos", soV: "15.1", arq: "aarch64", equipo: "MacBook", pa: 1 as const };

  it("al día", () => {
    expect(formatearInfoNeurona({ version: "0.6.0", info: d }, "v0.6.0")).toEqual({
      version: "0.6.0",
      etiquetaVersion: "Versión 0.6.0",
      medio: "App de escritorio · StarSeed OS",
      aparato: "MacBook · macOS 15.1 · aarch64",
      estado: "al-dia",
      aviso: null,
      entiendePedido: true,
    });
  });

  it("más vieja que la publicada → «Nueva versión disponible»", () => {
    const v = formatearInfoNeurona({ version: "0.5.0", info: d }, "0.6.0");
    expect(v.estado).toBe("nueva");
    expect(v.aviso).toBe("Nueva versión disponible: 0.6.0");
  });

  it("neurona anterior (sin `d` ni versión): «versión desconocida», sin inventar medio ni aparato", () => {
    expect(formatearInfoNeurona({ version: null, info: null, plataforma: "macOS" }, "0.6.0")).toEqual({
      version: null,
      etiquetaVersion: "versión desconocida",
      medio: null,
      aparato: "macOS",
      estado: "desconocida",
      aviso: null,
      entiendePedido: false,
    });
    expect(formatearInfoNeurona({}).etiquetaVersion).toBe("versión desconocida");
  });

  it("app 0.5.0 con web anterior: versión por `v.nativa` pero no entiende el pedido", () => {
    const v = formatearInfoNeurona({ version: "0.5.0", info: null, plataforma: "Windows" }, "0.6.0");
    expect(v).toMatchObject({ estado: "nueva", entiendePedido: false, aparato: "Windows", medio: null });
  });

  it("navegador: la web se actualiza sola; versión basura no cuenta", () => {
    expect(formatearInfoNeurona({ info: { medio: "web", pa: 1 } }, "0.6.0")).toMatchObject({ estado: "web", etiquetaVersion: "Web: se actualiza sola" });
    expect(formatearInfoNeurona({ version: "mvq6sg7z-kt91hk", info: null }, "0.6.0").estado).toBe("desconocida");
  });
});

describe("mejorMedio", () => {
  it("prefiere la app nativa más nueva", () => {
    const web = { m: "w", visible: true, d: { medio: "web" as const } };
    const viejo = { m: "a", v: { nativa: "0.4.3" } };
    const nuevo = { m: "b", v: { nativa: "0.5.0" }, d: { medio: "escritorio" as const } };
    expect(mejorMedio([web, viejo, nuevo])?.m).toBe("b");
    expect(mejorMedio([web])?.m).toBe("w");
    expect(mejorMedio([])).toBeNull();
  });
});
