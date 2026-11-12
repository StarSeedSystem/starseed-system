/** Tests puros para controles-llamada (LLA1112B). */
import { describe, expect, it } from "vitest";
import { botonCamaraDeshabilitado, camaraLocalSinImagen, PADDING_FOOTER_DOCK } from "../controles-llamada";

function flujo(pistas: Array<{ readyState: "live" | "ended"; muted: boolean }>) {
  return { id: "f", getVideoTracks: () => pistas, getAudioTracks: () => [], getTracks: () => pistas } as unknown as MediaStream;
}

const streamTraeVideo = (s: MediaStream | null | undefined): boolean => {
  try {
    return !!s && s.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);
  } catch {
    return false;
  }
};

describe("botonCamaraDeshabilitado", () => {
  it("cámara encendida: nunca deshabilitado (se puede apagar)", () => {
    expect(botonCamaraDeshabilitado(true, "motivo cualquiera")).toBe(false);
    expect(botonCamaraDeshabilitado(true, undefined)).toBe(false);
  });

  it("cámara apagada sin motivo: habilitado (se puede intentar encender)", () => {
    expect(botonCamaraDeshabilitado(false, undefined)).toBe(false);
    expect(botonCamaraDeshabilitado(false, "")).toBe(false);
  });

  it("cámara apagada CON motivo: deshabilitado (no se puede encender)", () => {
    expect(botonCamaraDeshabilitado(false, "El vídeo no cabe por Bluetooth")).toBe(true);
    expect(botonCamaraDeshabilitado(false, "Deja de compartir la pantalla")).toBe(true);
  });
});

describe("camaraLocalSinImagen", () => {
  it("no viva: false", () => {
    expect(camaraLocalSinImagen(false, true, flujo([{ readyState: "live", muted: false }]), streamTraeVideo)).toBe(false);
  });

  it("cámara apagada: false", () => {
    expect(camaraLocalSinImagen(true, false, flujo([{ readyState: "live", muted: true }]), streamTraeVideo)).toBe(false);
  });

  it("sin stream local: false", () => {
    expect(camaraLocalSinImagen(true, true, null, streamTraeVideo)).toBe(false);
  });

  it("stream con vídeo vivo y no muted: false (hay imagen)", () => {
    expect(camaraLocalSinImagen(true, true, flujo([{ readyState: "live", muted: false }]), streamTraeVideo)).toBe(false);
  });

  it("stream con vídeo muted: true (cámara encendida pero sin imagen)", () => {
    expect(camaraLocalSinImagen(true, true, flujo([{ readyState: "live", muted: true }]), streamTraeVideo)).toBe(true);
  });

  it("stream con vídeo ended: true (cámara encendida pero sin imagen)", () => {
    expect(camaraLocalSinImagen(true, true, flujo([{ readyState: "ended", muted: false }]), streamTraeVideo)).toBe(true);
  });
});

describe("PADDING_FOOTER_DOCK", () => {
  it("incluye safe-area-inset-bottom y var(--dock-height)", () => {
    expect(PADDING_FOOTER_DOCK).toContain("env(safe-area-inset-bottom)");
    expect(PADDING_FOOTER_DOCK).toContain("var(--dock-height, 80px)");
    expect(PADDING_FOOTER_DOCK).toContain("max(");
  });
});