import { describe, it, expect } from "vitest";
import { elegirOidoMovil, debeReiniciarNavegador } from "../oido-movil";

describe("elegirOidoMovil", () => {
  it("elige nube cuando está disponible", () => {
    const r = elegirOidoMovil({ nube: true, whisperDescargado: false, navegador: false });
    expect(r.motor).toBe("nube");
    expect(r.motivo).toContain("nube");
  });

  it("elige whisper-web cuando nube no está y Whisper está descargado", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: true, navegador: true });
    expect(r.motor).toBe("whisper-web");
    expect(r.motivo).toContain("Whisper");
  });

  it("elige navegador-por-voz cuando no hay nube ni Whisper pero navegador disponible", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: true });
    expect(r.motor).toBe("navegador-por-voz");
    expect(r.motivo).toContain("solo al detectar voz");
  });

  it("suelo a navegador cuando nada está disponible", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: false });
    expect(r.motor).toBe("navegador");
    expect(r.motivo).toContain("suelo");
  });

  it("nube tiene prioridad sobre Whisper y navegador", () => {
    const r = elegirOidoMovil({ nube: true, whisperDescargado: true, navegador: true });
    expect(r.motor).toBe("nube");
  });
});

describe("debeReiniciarNavegador", () => {
  it("no reinicia tras 2 ciclos en silencio sin turno", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: false })).toBe(false);
  });

  it("reinicia tras 2 ciclos en silencio si hay turno pendiente", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: true })).toBe(true);
  });

  it("reinicia con 1 ciclo en silencio sin turno", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 1, enTurno: false })).toBe(true);
  });

  it("reinicia con 0 ciclos en silencio", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 0, enTurno: false })).toBe(true);
  });

  it("no reinicia con 3 ciclos en silencio sin turno", () => {
    expect(debeReiniciarNavegador({ ciclosEnSilencio: 3, enTurno: false })).toBe(false);
  });
});
