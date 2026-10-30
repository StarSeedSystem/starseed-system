/**
 * Voces OPCIONALES de uso personal no comercial · APLICACIÓN del filtro (VZR1011C).
 * ============================================================================
 * Prueba que `voces-no-comerciales.ts` está CONECTADO donde sus resultado
 * decide de verdad — el router web de OmniVoice (omnivoice-web-router.ts):
 *   · ChatTTS jamás entra en el router (solo ficha; sin español, «solo académico»).
 *   · F5-TTS y XTTS-v2 apagados por defecto; solo con la casilla de licencia
 *     aceptada y jamás en contextos comerciales (forja §4).
 *   · La casilla guarda (y revoca) la aceptación por ficha.
 * Pruebas sin red ni GPU: el router solo se importa; nunca se sintetiza.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  aceptarLicenciaMotor,
  familiaExtraPermitida,
  licenciaMotorAceptada,
} from "@/lib/aurora/tts-oss/omnivoice-web-router";
import { motoresOpcionalesPersonales, fichaMotor } from "@/lib/aurora/tts-oss/voces-no-comerciales";

beforeEach(() => {
  window.localStorage.clear();
});

describe("la casilla de licencia (voces-no-comerciales aplicado)", () => {
  it("está APAGADA por defecto: sin aceptación no hay licencia aceptada", () => {
    expect(licenciaMotorAceptada("f5-tts")).toBe(false);
    expect(licenciaMotorAceptada("xtts-v2")).toBe(false);
  });

  it("guarda la aceptación y la revoca", () => {
    aceptarLicenciaMotor("f5-tts", true);
    expect(licenciaMotorAceptada("f5-tts")).toBe(true);
    expect(licenciaMotorAceptada("xtts-v2")).toBe(false); // casilla por ficha
    aceptarLicenciaMotor("f5-tts", false);
    expect(licenciaMotorAceptada("f5-tts")).toBe(false);
  });

  it("un registro corrupto no habilita nada y no revienta al aceptar", () => {
    window.localStorage.setItem("starseed.aurora.licencias-no-comerciales.v1", "{no es json");
    expect(licenciaMotorAceptada("f5-tts")).toBe(false);
    expect(() => aceptarLicenciaMotor("f5-tts", true)).not.toThrow();
    expect(licenciaMotorAceptada("f5-tts")).toBe(true); // el registro se rehace sano
  });
});

describe("familiaExtraPermitida — el filtro aplicado al router web", () => {
  it("ChatTTS NUNCA entra en el router, en ningún contexto", () => {
    for (const ctx of [
      "personal-local",
      "grupo-comunitario",
      "comercial",
      "publico-red",
    ] as const) {
      expect(familiaExtraPermitida("chattts", ctx), ctx).toBe(false);
    }
  });

  it("F5-TTS y XTTS-v2 están APAGADOS por defecto (ni sondeo ni failover)", () => {
    for (const kind of ["f5-tts", "xtts"] as const) {
      expect(familiaExtraPermitida(kind, "personal-local"), kind).toBe(false);
      expect(familiaExtraPermitida(kind, "grupo-comunitario"), kind).toBe(false);
    }
  });

  it("F5-TTS suena en contexto personal SOLO con su casilla aceptada", () => {
    aceptarLicenciaMotor("f5-tts", true);
    expect(familiaExtraPermitida("f5-tts", "personal-local")).toBe(true);
    expect(familiaExtraPermitida("f5-tts", "grupo-comunitario")).toBe(true);
    expect(familiaExtraPermitida("xtts", "personal-local")).toBe(false); // la otra casilla no
  });

  it("aun aceptando la licencia, JAMÁS en contexto comercial (forja §4)", () => {
    aceptarLicenciaMotor("f5-tts", true);
    aceptarLicenciaMotor("xtts-v2", true);
    expect(familiaExtraPermitida("f5-tts", "comercial")).toBe(false);
    expect(familiaExtraPermitida("f5-tts", "publico-red")).toBe(false);
    expect(familiaExtraPermitida("xtts", "comercial")).toBe(false);
    expect(familiaExtraPermitida("xtts", "publico-red")).toBe(false);
  });

  it("las familias sin ficha (openvoice-v2, fish-speech) no las mira esta regla", () => {
    expect(familiaExtraPermitida("openvoice-v2")).toBe(true);
    expect(familiaExtraPermitida("fish-speech")).toBe(true);
  });
});

describe("lo que la casilla de la interfaz muestra y habilita", () => {
  it("las opciones personales del panel son fichas solo-personal verificadas", () => {
    for (const id of motoresOpcionalesPersonales()) {
      const f = fichaMotor(id);
      expect(f, id).toBeDefined();
      expect(f?.soloUsoPersonalNoComercial, id).toBe(true);
      expect(f?.usoComercialLibre, id).toBe(false);
    }
  });
});
