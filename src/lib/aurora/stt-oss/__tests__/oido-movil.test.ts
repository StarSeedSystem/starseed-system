import { describe, it, expect } from "vitest";
import { elegirOidoMovil, debeReiniciarNavegador } from "../oido-movil";

describe("elegirOidoMovil", () => {
  it("elige nube cuando está disponible", () => {
    const r = elegirOidoMovil({ nube: true, whisperDescargado: false, navegador: true });
    expect(r.motor).toBe("nube");
    expect(r.motivo).toContain("nube");
  });

  it("elige whisper-web cuando nube no está y whisper está descargado", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: true, navegador: true });
    expect(r.motor).toBe("whisper-web");
  });

  it("elige navegador-por-voz cuando no hay nube ni whisper pero navegador sí", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: true });
    expect(r.motor).toBe("navegador-por-voz");
  });

  it("cayó a navegador cuando nada está disponible", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: false });
    expect(r.motor).toBe("navegador");
  });
});

describe("debeReiniciarNavegador", () => {
  it("no reinicia tras 2 ciclos en silencio sin turno pendiente", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: false })).toBe(false);
  });

  it("no reinicia tras >2 ciclos en silencio sin turno", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 5, enTurno: false })).toBe(false);
  });

  it("reinicia si hay turno pendiente aunque haya silencio", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: true })).toBe(true);
  });

  it("reinicia si silencio es menor a 2", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 1, enTurno: false })).toBe(true);
  });
});
