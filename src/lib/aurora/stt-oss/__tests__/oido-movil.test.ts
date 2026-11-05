import { describe, it, expect } from "vitest";
import { elegirOidoMovil, debeReiniciarNavegador, oidoParaReconocer } from "../oido-movil";

describe("elegirOidoMovil", () => {
  it("prefiere nube cuando está activado", () => {
    const r = elegirOidoMovil({ nube: true, whisperDescargado: false, navegador: false });
    expect(r.motor).toBe('nube');
    expect(r.motivo).toContain('nube');
  });

  it("elige whisper-web cuando está descargado y no nube", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: true, navegador: false });
    expect(r.motor).toBe('whisper-web');
    expect(r.motivo).toContain('Whisper');
  });

  it("elige navegador-por-voz cuando navegador es true", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: true });
    expect(r.motor).toBe('navegador-por-voz');
    expect(r.motivo).toContain('reconocedor');
  });

  it("suelo: navegador por defecto cuando nada más aplica", () => {
    const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: false });
    expect(r.motor).toBe('navegador');
    expect(r.motivo).toContain('por defecto');
  });
});

describe("oidoParaReconocer", () => {
  it("escritorio sin nube ni whisper -> navegador", () => {
    expect(oidoParaReconocer({ esMovil: false, nube: false, whisperListo: false })).toBe("navegador");
  });
  it("escritorio con nube -> navegador", () => {
    expect(oidoParaReconocer({ esMovil: false, nube: true, whisperListo: false })).toBe("navegador");
  });
  it("escritorio con whisper -> navegador", () => {
    expect(oidoParaReconocer({ esMovil: false, nube: false, whisperListo: true })).toBe("navegador");
  });
  it("escritorio con nube y whisper -> navegador", () => {
    expect(oidoParaReconocer({ esMovil: false, nube: true, whisperListo: true })).toBe("navegador");
  });
  it("móvil sin nube ni whisper -> navegador", () => {
    expect(oidoParaReconocer({ esMovil: true, nube: false, whisperListo: false })).toBe("navegador");
  });
  it("móvil con nube -> nube", () => {
    expect(oidoParaReconocer({ esMovil: true, nube: true, whisperListo: false })).toBe("nube");
  });
  it("móvil con whisper -> whisper-web", () => {
    expect(oidoParaReconocer({ esMovil: true, nube: false, whisperListo: true })).toBe("whisper-web");
  });
  it("móvil con nube y whisper -> nube (prioridad nube)", () => {
    expect(oidoParaReconocer({ esMovil: true, nube: true, whisperListo: true })).toBe("nube");
  });
});

describe("debeReiniciarNavegador", () => {
  it("devuelve false en móvil tras 2 ciclos en silencio y sin turno", () => {
    const r = debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: false });
    expect(r).toBe(false);
  });

  it("devuelve true si hay turno pendiente a pesar de ciclos en silencio", () => {
    const r = debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: true });
    expect(r).toBe(true);
  });

  it("devuelve true cuando no hay ciclos en silencio", () => {
    const r = debeReiniciarNavegador({ ciclosEnSilencio: 0, enTurno: false });
    expect(r).toBe(true);
  });

  it("devuelve true cuando hay 1 ciclo en silencio", () => {
    const r = debeReiniciarNavegador({ ciclosEnSilencio: 1, enTurno: false });
    expect(r).toBe(true);
  });

  it("devuelve true cuando hay 3 ciclos en silencio y turno", () => {
    const r = debeReiniciarNavegador({ ciclosEnSilencio: 3, enTurno: true });
    expect(r).toBe(true);
  });
});