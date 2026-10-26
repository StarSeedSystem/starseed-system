import { describe, expect, it } from "vitest";
import {
  bytesPorMinuto,
  candidatosDeVideo,
  elegirFormato,
  extensionDeMime,
  mimeBase,
  minutosHastaElLimite,
  ofreceAmbosFormatos,
} from "../formato";
import { LIMITE_BIBLIOTECA_BYTES } from "../tipos";

const soloEstos = (...mimes: string[]) => (m: string) => mimes.includes(m);

describe("grabación · elegir el mimeType", () => {
  it("Chrome: prefiere WebM VP9 con Opus cuando hay audio", () => {
    const f = elegirFormato(soloEstos("video/webm;codecs=vp9,opus", "video/webm", "video/mp4"), true);
    expect(f).toEqual({ mimeType: "video/webm;codecs=vp9,opus", extension: "webm", contenedor: "webm" });
  });

  it("sin audio no pide el códec de audio", () => {
    const f = elegirFormato(soloEstos("video/webm;codecs=vp9", "video/webm;codecs=vp9,opus"), false);
    expect(f.mimeType).toBe("video/webm;codecs=vp9");
  });

  it("baja a VP8 si el navegador no sabe VP9", () => {
    expect(elegirFormato(soloEstos("video/webm;codecs=vp8,opus"), true).mimeType).toBe("video/webm;codecs=vp8,opus");
  });

  it("Safari: solo MP4 → MP4 y extensión mp4", () => {
    const f = elegirFormato(soloEstos("video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"), true);
    expect(f).toEqual({ mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4", contenedor: "mp4" });
  });

  it("si soporta los dos, «auto» da WebM y «mp4» da MP4", () => {
    const ambos = soloEstos("video/webm;codecs=vp9,opus", "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
    expect(elegirFormato(ambos, true, "auto").extension).toBe("webm");
    expect(elegirFormato(ambos, true, "mp4").extension).toBe("mp4");
  });

  it("«mp4» sin soporte de MP4 cae a WebM (nunca se queda sin formato)", () => {
    expect(elegirFormato(soloEstos("video/webm"), true, "mp4")).toEqual({ mimeType: "video/webm", extension: "webm", contenedor: "webm" });
  });

  it("nada soportado o sin isTypeSupported: que decida el navegador (mimeType indefinido)", () => {
    expect(elegirFormato(soloEstos(), true).mimeType).toBeUndefined();
    expect(elegirFormato(null, true).mimeType).toBeUndefined();
    expect(elegirFormato(undefined, false).extension).toBe("webm");
  });

  it("un isTypeSupported que lanza cuenta como «no»", () => {
    const f = elegirFormato((m) => {
      if (m.includes("vp9")) throw new Error("boom");
      return m === "video/webm";
    }, true);
    expect(f.mimeType).toBe("video/webm");
  });

  it("la lista de candidatos no repite y siempre acaba ofreciendo mp4 y webm genéricos", () => {
    for (const audio of [true, false]) for (const pref of ["auto", "mp4"] as const) {
      const c = candidatosDeVideo(audio, pref);
      expect(new Set(c).size).toBe(c.length);
      expect(c).toContain("video/mp4");
      expect(c).toContain("video/webm");
    }
  });

  it("extensionDeMime y mimeBase", () => {
    expect(extensionDeMime("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extensionDeMime("video/webm;codecs=vp9")).toBe("webm");
    expect(extensionDeMime("")).toBe("webm");
    expect(extensionDeMime(undefined)).toBe("webm");
    expect(mimeBase("Video/WebM; codecs=vp9,opus")).toBe("video/webm");
    expect(mimeBase("")).toBe("video/webm");
    expect(mimeBase(null, "video/mp4")).toBe("video/mp4");
  });

  it("ofreceAmbosFormatos solo si hay mp4 Y webm", () => {
    expect(ofreceAmbosFormatos(soloEstos("video/mp4", "video/webm"))).toBe(true);
    expect(ofreceAmbosFormatos(soloEstos("video/webm"))).toBe(false);
    expect(ofreceAmbosFormatos(null)).toBe(false);
  });

  it("cuántos minutos caben en los 50 MB de la Biblioteca por calidad", () => {
    expect(bytesPorMinuto("estandar", false)).toBe(18_750_000);
    expect(minutosHastaElLimite("ligera", false, LIMITE_BIBLIOTECA_BYTES)).toBeGreaterThan(minutosHastaElLimite("estandar", false, LIMITE_BIBLIOTECA_BYTES));
    expect(minutosHastaElLimite("estandar", false, LIMITE_BIBLIOTECA_BYTES)).toBeGreaterThan(minutosHastaElLimite("alta", false, LIMITE_BIBLIOTECA_BYTES));
    // El audio ocupa algo más.
    expect(bytesPorMinuto("estandar", true)).toBeGreaterThan(bytesPorMinuto("estandar", false));
  });
});
