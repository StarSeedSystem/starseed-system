import { describe, it, expect } from "vitest";
import { puedeAplicarAhora, ContextoMomento, UMBRAL_BATERIA_PCT, UMBRAL_DESCARGA_GRANDE_BYTES, MotivoEspera } from "../momento";

describe("puedeAplicarAhora", () => {
  const baseCtx: ContextoMomento = {
    enLlamada: false,
    enDirecto: false,
    escribiendo: false,
    bateriaPct: null,
    cargando: false,
    wifi: true,
    datosPermitidos: false,
  };

  it("should allow when no constraints", () => {
    const ctx = baseCtx;
    expect(puedeAplicarAhora(ctx, 0, "datos")).toEqual({ ok: true });
  });

  it("should block on llamada for non-hot layer", () => {
    const ctx = { ...baseCtx, enLlamada: true };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: false, motivo: "llamada", texto: "Esperando a que acabe la llamada." });
  });

  it("should allow llamada for hot layer (datos)", () => {
    const ctx = { ...baseCtx, enLlamada: true };
    expect(puedeAplicarAhora(ctx, 0, "datos")).toEqual({ ok: true });
  });

  it("should block on directo for non-hot layer", () => {
    const ctx = { ...baseCtx, enDirecto: true };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: false, motivo: "directo", texto: "Esperando a que acabe el directo." });
  });

  it("should allow directo for hot layer (datos)", () => {
    const ctx = { ...baseCtx, enDirecto: true };
    expect(puedeAplicarAhora(ctx, 0, "datos")).toEqual({ ok: true });
  });

  it("should block on escribiendo for non-hot layer", () => {
    const ctx = { ...baseCtx, escribiendo: true };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: false, motivo: "escribiendo", texto: "Esperando a que termines de escribir." });
  });

  it("should allow escribiendo for hot layer (datos)", () => {
    const ctx = { ...baseCtx, escribiendo: true };
    expect(puedeAplicarAhora(ctx, 0, "datos")).toEqual({ ok: true });
  });

  it("should block on bateria-baja", () => {
    const ctx = { ...baseCtx, bateriaPct: 10, cargando: false };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: false, motivo: "bateria-baja", texto: "Batería por debajo del 20 %: espera a que se cargue." });
  });

  it("should allow when bateriaPct is null", () => {
    const ctx = { ...baseCtx, bateriaPct: null };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: true });
  });

  it("should allow when bateriaPct is exactly 20%", () => {
    const ctx = { ...baseCtx, bateriaPct: 20, cargando: false };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: true });
  });

  it("should block on espera-wifi", () => {
    const ctx = { ...baseCtx, wifi: false, datosPermitidos: false };
    const tamanoBytes = UMBRAL_DESCARGA_GRANDE_BYTES + 1;
    expect(puedeAplicarAhora(ctx, tamanoBytes, "interfaz")).toEqual({ ok: false, motivo: "espera-wifi", texto: "Descarga grande: espera a tener Wi-Fi (o permite usar datos)." });
  });

  it("should allow when tamanoBytes is exactly 50 MB", () => {
    const ctx = { ...baseCtx, wifi: false, datosPermitidos: false };
    expect(puedeAplicarAhora(ctx, UMBRAL_DESCARGA_GRANDE_BYTES, "interfaz")).toEqual({ ok: true });
  });

  it("should allow when wifi is true", () => {
    const ctx = { ...baseCtx, wifi: true, datosPermitidos: false };
    const tamanoBytes = UMBRAL_DESCARGA_GRANDE_BYTES + 1;
    expect(puedeAplicarAhora(ctx, tamanoBytes, "interfaz")).toEqual({ ok: true });
  });

  it("should allow when datosPermitidos is true", () => {
    const ctx = { ...baseCtx, wifi: false, datosPermitidos: true };
    const tamanoBytes = UMBRAL_DESCARGA_GRANDE_BYTES + 1;
    expect(puedeAplicarAhora(ctx, tamanoBytes, "interfaz")).toEqual({ ok: true });
  });

  it("should prioritize llamada over bateria-baja", () => {
    const ctx = { ...baseCtx, enLlamada: true, bateriaPct: 10, cargando: false };
    expect(puedeAplicarAhora(ctx, 0, "interfaz")).toEqual({ ok: false, motivo: "llamada", texto: "Esperando a que acabe la llamada." });
  });

  it("should prioritize directo over espera-wifi", () => {
    const ctx = { ...baseCtx, enDirecto: true, wifi: false, datosPermitidos: false };
    const tamanoBytes = UMBRAL_DESCARGA_GRANDE_BYTES + 1;
    expect(puedeAplicarAhora(ctx, tamanoBytes, "interfaz")).toEqual({ ok: false, motivo: "directo", texto: "Esperando a que acabe el directo." });
  });
});