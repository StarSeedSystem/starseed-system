/**
 * VZR1011C — F5-TTS y XTTS-v2 como OPCIONALES de uso personal no comercial;
 * ChatTTS solo ficha. Funciones puras con deps inyectadas: sin red, sin GPU,
 * sin disco (la licencia, contexto y estado se pasan como valores/maps).
 * Licencias EXACTAS del contrato `architecture/astraura-voces-y-robots.md` §1.
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_ENDPOINT_ORDER,
  buildVoiceChain,
  VOICE_ENGINE_REGISTRY,
} from "@/lib/aurora/tts-oss/engine-registry";
import {
  CLAVE_VOCES_NO_COMERCIALES,
  FICHA_CHATTTS,
  FICHA_F5_TTS,
  FICHA_XTTS_V2,
  aceptarLicenciaNoComercial,
  aptoParaProducto,
  depsDeNavegador,
  esContextoComercial,
  esMotorNoComercial,
  evaluarUsoNoComercial,
  licenciaAceptadaNoComercial,
  puedeUsarseNoComercial,
  revocarLicenciaNoComercial,
  sinNoComercialesNoAceptados,
  type DepsVozNoComercial,
} from "@/lib/aurora/tts-oss/voces-no-comerciales";
import { getVoiceConfig } from "@/lib/aurora/tts-oss/voice-config";

/** Deps falsas sobre un Map: sin localStorage ni red. */
function depsFalsas(): DepsVozNoComercial & { almacen: Map<string, string> } {
  const almacen = new Map<string, string>();
  return {
    almacen,
    leer: (c) => almacen.get(c) ?? null,
    escribir: (c, v) => almacen.set(c, v),
    ahora: () => 1_000_000,
  };
}

describe("licencias exactas del contrato §1 (2026-10-11)", () => {
  it("F5-TTS: código MIT, pesos CC-BY-NC, sin español oficial", () => {
    expect(FICHA_F5_TTS).toMatchObject({
      id: "f5-tts",
      licenciaCodigo: "MIT",
      licenciaPesos: "CC-BY-NC",
      espanol: false,
      repo: "https://github.com/SWivid/F5-TTS",
      soloFicha: false,
    });
  });

  it("XTTS-v2: código MPL-2.0, CPML no comercial, español y 16 idiomas declarados", () => {
    expect(FICHA_XTTS_V2).toMatchObject({
      id: "xtts-v2",
      licenciaCodigo: "MPL-2.0",
      licenciaPesos: "Coqui Public Model License (no comercial)",
      espanol: true,
      repo: "https://github.com/coqui-ai/TTS",
      soloFicha: false,
    });
  });

  it("ChatTTS: solo ficha, modelo CC BY-NC 4.0 «solo académico», sin español", () => {
    expect(FICHA_CHATTTS).toMatchObject({
      id: "chat-tts",
      licenciaCodigo: "AGPLv3+",
      licenciaPesos: "CC BY-NC 4.0 (solo académico)",
      espanol: false,
      soloFicha: true,
    });
  });

  it("la casilla explica la licencia y que nadie descarga pesos por la persona", () => {
    expect(FICHA_F5_TTS.textoCasilla).toMatch(/no comerciales/);
    expect(FICHA_XTTS_V2.textoCasilla).toMatch(/no comercial/);
    for (const f of [FICHA_F5_TTS, FICHA_XTTS_V2]) {
      expect(f.textoCasilla).toMatch(/fines comerciales/);
      expect(f.textoCasilla).toMatch(/no descargamos pesos/);
    }
    expect(FICHA_CHATTTS.textoCasilla).toMatch(/académico/);
    expect(FICHA_CHATTTS.textoCasilla).toMatch(/No se integra/);
  });

  it("OpenVoice V2 y Chatterbox (MIT, ya integrados) permanecen en el registro", () => {
    expect(VOICE_ENGINE_REGISTRY.openvoice2.license).toMatch(/MIT/);
    expect(VOICE_ENGINE_REGISTRY.chatterbox.license).toBe("MIT");
  });
});

describe("el filtro comercial", () => {
  const PERSONAL = { tipo: "personal" as const };

  it("personal sin declarar no es comercial; lo dicen sí", () => {
    expect(esContextoComercial(PERSONAL)).toBe(false);
    expect(esContextoComercial({ ...PERSONAL, finesComerciales: true })).toBe(true);
    expect(esContextoComercial({ ...PERSONAL, finesComerciales: false })).toBe(false);
  });

  it("página o grupo comercial: nunca; sin el «no» a la vista se presupone comercial", () => {
    expect(esContextoComercial({ tipo: "pagina", finesComerciales: true })).toBe(true);
    expect(esContextoComercial({ tipo: "grupo", finesComerciales: true })).toBe(true);
    expect(esContextoComercial({ tipo: "pagina" })).toBe(true);
    expect(esContextoComercial({ tipo: "grupo" })).toBe(true);
    expect(esContextoComercial({ tipo: "pagina", finesComerciales: false })).toBe(false);
    expect(esContextoComercial({ tipo: "grupo", finesComerciales: false })).toBe(false);
  });

  it("sin licencia aceptada no se usan ni en uso personal", () => {
    expect(evaluarUsoNoComercial("f5-tts", false, PERSONAL)).toEqual({
      permitido: false,
      motivo: "sin-aceptar-licencia",
    });
    expect(evaluarUsoNoComercial("xtts-v2", false, PERSONAL)).toEqual({
      permitido: false,
      motivo: "sin-aceptar-licencia",
    });
  });

  it("en contexto comercial NO se usan ni aceptando la licencia", () => {
    for (const id of ["f5-tts", "xtts-v2"] as const) {
      expect(evaluarUsoNoComercial(id, true, { tipo: "pagina", finesComerciales: true })).toEqual({
        permitido: false,
        motivo: "contexto-comercial",
      });
      expect(evaluarUsoNoComercial(id, true, { tipo: "grupo" })).toEqual({
        permitido: false,
        motivo: "contexto-comercial",
      });
    }
  });

  it("aceptada + personal no comercial: sí, con ok", () => {
    expect(evaluarUsoNoComercial("f5-tts", true, { tipo: "personal" })).toEqual({
      permitido: true,
      motivo: "ok",
    });
    expect(evaluarUsoNoComercial("xtts-v2", true, { tipo: "grupo", finesComerciales: false })).toEqual({
      permitido: true,
      motivo: "ok",
    });
  });

  it("ChatTTS jamás (solo ficha) y motor desconocido no", () => {
    expect(evaluarUsoNoComercial("chat-tts", true, PERSONAL)).toEqual({ permitido: false, motivo: "solo-ficha" });
    expect(evaluarUsoNoComercial("voxcpm", true, PERSONAL)).toEqual({ permitido: false, motivo: "motor-desconocido" });
    expect(evaluarUsoNoComercial("", false, PERSONAL)).toEqual({ permitido: false, motivo: "motor-desconocido" });
    expect(esMotorNoComercial("chat-tts")).toBe(true);
    expect(esMotorNoComercial("omnivoice")).toBe(false);
  });
});

describe("la cadena AUTO no los trae", () => {
  it("AUTO_ENDPOINT_ORDER y la cadena de instalación cero no contienen no comerciales", () => {
    const cfg = { ...getVoiceConfig(), engine: "browser" as const, auto: true };
    const cadena = buildVoiceChain(cfg, null);
    for (const id of ["f5-tts", "xtts-v2", "chat-tts"]) {
      expect(AUTO_ENDPOINT_ORDER).not.toContain(id);
      expect(cadena).not.toContain(id);
    }
  });

  it("si un día se colaran, quedan fuera salvo aceptación explícita de uso personal", () => {
    const cadena = ["omnivoice", "f5-tts", "xtts-v2", "chat-tts", "kokoro"];
    expect(sinNoComercialesNoAceptados(cadena)).toEqual(["omnivoice", "kokoro"]);
    expect(sinNoComercialesNoAceptados(cadena, ["f5-tts"])).toEqual(["omnivoice", "f5-tts", "kokoro"]);
    // ChatTTS solo ficha: nunca en una cadena, ni siquiera «aceptado».
    expect(sinNoComercialesNoAceptados(["chat-tts"], ["chat-tts"])).toEqual([]);
    // ChatTTS solo ficha: nunca en una cadena, ni siquiera aceptado.
    expect(sinNoComercialesNoAceptados([])).toEqual([]);
  });

  it("forja §4: ninguno de los tres es apto para el producto; los MIT sí", () => {
    expect(aptoParaProducto("f5-tts")).toBe(false);
    expect(aptoParaProducto("xtts-v2")).toBe(false);
    expect(aptoParaProducto("chat-tts")).toBe(false);
    expect(aptoParaProducto("chatterbox")).toBe(true);
    expect(aptoParaProducto("openvoice2")).toBe(true);
  });
});

describe("aceptación persistida (opt-in apagado por defecto)", () => {
  it("por defecto no hay nada aceptado; la casilla lo enciende y se puede revocar", () => {
    const d = depsFalsas();
    expect(licenciaAceptadaNoComercial("xtts-v2", d)).toBe(false);
    aceptarLicenciaNoComercial("xtts-v2", d);
    expect(licenciaAceptadaNoComercial("xtts-v2", d)).toBe(true);
    expect(JSON.parse(d.almacen.get(CLAVE_VOCES_NO_COMERCIALES) ?? "{}")).toMatchObject({
      "xtts-v2": { aceptadaAt: 1_000_000 },
    });
    revocarLicenciaNoComercial("xtts-v2", d);
    expect(licenciaAceptadaNoComercial("xtts-v2", d)).toBe(false);
  });

  it("ChatTTS (solo ficha) no se puede aceptar", () => {
    const d = depsFalsas();
    // @ts-expect-error — el tipo no lo permite, la rotura de tipo se prueba igual
    aceptarLicenciaNoComercial("chat-tts", d);
    expect(d.almacen.has(CLAVE_VOCES_NO_COMERCIALES)).toBe(false);
  });

  it("datos corruptos = apagado (nunca lanza)", () => {
    const d = depsFalsas();
    d.almacen.set(CLAVE_VOCES_NO_COMERCIALES, "{roto");
    expect(licenciaAceptadaNoComercial("f5-tts", d)).toBe(false);
  });

  it("puedeUsarseNoComercial junta filtro comercial + estado", () => {
    const d = depsFalsas();
    expect(puedeUsarseNoComercial("f5-tts", { tipo: "personal" }, d)).toEqual({
      permitido: false,
      motivo: "sin-aceptar-licencia",
    });
    aceptarLicenciaNoComercial("f5-tts", d);
    expect(puedeUsarseNoComercial("f5-tts", { tipo: "personal" }, d)).toEqual({ permitido: true, motivo: "ok" });
    expect(puedeUsarseNoComercial("f5-tts", { tipo: "pagina", finesComerciales: true }, d)).toEqual({
      permitido: false,
      motivo: "contexto-comercial",
    });
    expect(puedeUsarseNoComercial("chat-tts", { tipo: "personal" }, d)).toEqual({
      permitido: false,
      motivo: "solo-ficha",
    });
    expect(puedeUsarseNoComercial("voxcpm", { tipo: "personal" }, d)).toEqual({
      permitido: false,
      motivo: "motor-desconocido",
    });
  });

  it("fuera del navegador las deps por defecto son null sin lanzar (SSR-safe)", () => {
    // Entorno node: no hay window → null. Nunca lanza.
    expect(depsDeNavegador()).toBeNull();
  });
});
