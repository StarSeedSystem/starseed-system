import { describe, it, expect } from "vitest";
import {
  esContextoComercial,
  esUsoPersonalNoComercial,
  motoresOpcionalesPersonales,
  motoresProductoLibre,
  puedeUsarMotor,
  fichaMotor,
  veredictoVoz,
  comprobarVersion,
  FICHAS_MOTORES,
} from "../voces-no-comerciales";

describe("voces-no-comerciales — filtro de licencia y contexto", () => {
  it("detecta contexto comercial", () => {
    expect(esContextoComercial("comercial")).toBe(true);
    expect(esContextoComercial("publico-red")).toBe(true);
    expect(esContextoComercial("personal-local")).toBe(false);
    expect(esContextoComercial("grupo-comunitario")).toBe(false);
  });

  it("detecta uso personal no comercial", () => {
    expect(esUsoPersonalNoComercial("personal-local")).toBe(true);
    expect(esUsoPersonalNoComercial("grupo-comunitario")).toBe(true);
    expect(esUsoPersonalNoComercial("comercial")).toBe(false);
  });

  it("lista motores opcionales personales (F5-TTS, XTTS-v2)", () => {
    const opt = motoresOpcionalesPersonales();
    expect(opt).toContain("f5-tts");
    expect(opt).toContain("xtts-v2");
    expect(opt).toHaveLength(2);
  });

  it("lista motores con licencia libre para producto", () => {
    const libre = motoresProductoLibre();
    expect(libre).toContain("chatterbox");
    expect(libre).toContain("openvoice2");
  });

  it("puede usar motor libre en contexto comercial", () => {
    expect(puedeUsarMotor("chatterbox", "comercial")).toBe(true);
    expect(puedeUsarMotor("openvoice2", "publico-red")).toBe(true);
  });

  it("rechaza opcionales no comerciales en contexto comercial", () => {
    expect(puedeUsarMotor("f5-tts", "comercial")).toBe(false);
    expect(puedeUsarMotor("xtts-v2", "comercial")).toBe(false);
  });

  it("permite opcionales personales en contexto no comercial", () => {
    expect(puedeUsarMotor("f5-tts", "personal-local")).toBe(true);
    expect(puedeUsarMotor("xtts-v2", "grupo-comunitario")).toBe(true);
  });

  it("ChatTTS nunca es permitido (solo ficha)", () => {
    expect(puedeUsarMotor("chatt-ts", "personal-local")).toBe(false);
    expect(puedeUsarMotor("chatt-ts", "comercial")).toBe(false);
  });

  it("ficha exacta del contrato §1 verificada", () => {
    const ficha = fichaMotor("f5-tts");
    expect(ficha).toBeDefined();
    expect(ficha?.licenciaCodigo).toBe("MIT");
    expect(ficha?.licenciaPesos).toBe("CC-BY-NC-4.0 (pesos no comerciales)");
    expect(ficha?.soloUsoPersonalNoComercial).toBe(true);
  });

  it("ficha XTTS-v2 verificada", () => {
    const ficha = fichaMotor("xtts-v2");
    expect(ficha?.licenciaCodigo).toBe("MPL-2.0");
    expect(ficha?.licenciaPesos).toContain("Coqui Public Model License");
  });

  it("ficha ChatTTS verificada (solo ficha, sin español)", () => {
    const ficha = fichaMotor("chatt-ts");
    expect(ficha?.soloAcademico).toBe(true);
    expect(ficha?.cubreEspanol).toBe(false);
    expect(ficha?.usoComercialLibre).toBe(false);
    expect(ficha?.soloUsoPersonalNoComercial).toBe(false);
  });

  it("veredicto de F5-TTS en contexto personal", () => {
    const v = veredictoVoz("f5-tts", "personal-local");
    expect(v.permitido).toBe(true);
    expect(v.esOpcionalPersonal).toBe(true);
    expect(v.estaEnCadenaAuto).toBe(false);
    expect(v.licenciaExacta).toContain("MIT");
    expect(v.requiereAceptacionLicencia).toBe(true);
  });

  it("veredicto de F5-TTS en contexto comercial (rechazado)", () => {
    const v = veredictoVoz("f5-tts", "comercial");
    expect(v.permitido).toBe(false);
    expect(v.motivo).toContain("NO comercial");
    expect(v.motivo).toContain("CC-BY-NC");
  });

  it("veredicto de ChatTTS siempre rechazado con mensaje claro", () => {
    const v = veredictoVoz("chatt-ts", "personal-local");
    expect(v.permitido).toBe(false);
    expect(v.motivo).toContain("AGPLv3+");
    expect(v.motivo).toContain("CC BY-NC 4.0");
    expect(v.motivo).toContain("sin español");
  });

  it("comprobación de versión funciona sin red", () => {
    const ok = comprobarVersion("f5-tts", "1.0 (código MIT · pesos CC-BY-NC verificados 2026-10-11)");
    expect(ok).toContain("coincide");
    const noOk = comprobarVersion("xtts-v2", "1.0.0");
    expect(noOk).toContain("≠ verificada");
  });
});
