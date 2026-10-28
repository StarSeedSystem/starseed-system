/**
 * VZR1011C — Filtro comercial de las voces de uso personal no comercial.
 * Prueba SOLO funciones puras: entrada → salida, sin red, disco, reloj ni audio.
 */
import { describe, expect, it } from "vitest";
import {
  FICHAS_VOCES_NO_COMERCIALES,
  MOTIVO_DESCONOCIDO,
  MOTIVO_FUERA_DE_PERSONAL,
  MOTIVO_LICENCIA_NO_ACEPTADA,
  MOTIVO_NO_INSTALADO,
  MOTIVO_PERMITIDO,
  MOTIVO_SOLO_FICHA,
  consentimientoApagado,
  decidirUsoVozNoComercial,
  esIdVozNoComercial,
  fichaVozNoComercial,
  textoAceptacionLicencia,
  vocesNoComercialesEnAuto,
  type ConsentimientoVozNoComercial,
} from "@/lib/aurora/tts-oss/voces-no-comerciales";
import { AUTO_ENDPOINT_ORDER } from "@/lib/aurora/tts-oss/engine-registry";

const ACEPTADO: ConsentimientoVozNoComercial = { instalado: true, licenciaAceptada: true };

describe("fichas con la licencia exacta del contrato", () => {
  it("F5-TTS: código MIT y pesos CC-BY-NC, opcional y sin español oficial", () => {
    const f = fichaVozNoComercial("f5-tts");
    expect(f).toMatchObject({
      licenciaCodigo: "MIT",
      licenciaPesos: "CC-BY-NC",
      español: false,
      integrado: true,
      opcionalPersonal: true,
      enAutoPorDefecto: false,
    });
  });

  it("XTTS-v2: código MPL-2.0 y modelo Coqui Public Model License (no comercial)", () => {
    const f = fichaVozNoComercial("xtts-v2");
    expect(f).toMatchObject({
      licenciaCodigo: "MPL-2.0",
      licenciaPesos: "Coqui Public Model License (no comercial)",
      español: true,
      integrado: true,
      opcionalPersonal: true,
      enAutoPorDefecto: false,
    });
  });

  it("ChatTTS: solo ficha, sin integrar, sin español y con CC BY-NC 4.0 académico", () => {
    const f = fichaVozNoComercial("chattts");
    expect(f).toMatchObject({
      licenciaCodigo: "AGPLv3+",
      licenciaPesos: "CC BY-NC 4.0 (solo académico)",
      español: false,
      integrado: false,
      opcionalPersonal: false,
      enAutoPorDefecto: false,
    });
  });

  it("el catálogo tiene las tres fichas y ninguna más", () => {
    expect(FICHAS_VOCES_NO_COMERCIALES.map((f) => f.id)).toEqual(["f5-tts", "xtts-v2", "chattts"]);
    expect(esIdVozNoComercial("f5-tts")).toBe(true);
    expect(esIdVozNoComercial("kokoro")).toBe(false);
    expect(fichaVozNoComercial("kokoro")).toBeNull();
  });
});

describe("opt-in apagado por defecto", () => {
  it("de fábrica no está instalado ni aceptado", () => {
    expect(consentimientoApagado()).toEqual({ instalado: false, licenciaAceptada: false });
  });

  it("en personal, sin instalar no suena", () => {
    expect(decidirUsoVozNoComercial("f5-tts", consentimientoApagado(), "personal")).toEqual({
      permitido: false,
      motivo: MOTIVO_NO_INSTALADO,
    });
  });

  it("instalado pero sin aceptar la casilla tampoco suena", () => {
    const c = { instalado: true, licenciaAceptada: false };
    expect(decidirUsoVozNoComercial("xtts-v2", c, "personal")).toEqual({
      permitido: false,
      motivo: MOTIVO_LICENCIA_NO_ACEPTADA,
    });
  });

  it("instalado y aceptado solo suena en contexto personal", () => {
    expect(decidirUsoVozNoComercial("f5-tts", ACEPTADO, "personal")).toEqual({
      permitido: true,
      motivo: MOTIVO_PERMITIDO,
    });
  });
});

describe("filtro comercial", () => {
  it("nunca suena en grupo, comunidad, público ni comercial", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      expect(decidirUsoVozNoComercial("xtts-v2", ACEPTADO, contexto)).toEqual({
        permitido: false,
        motivo: MOTIVO_FUERA_DE_PERSONAL,
      });
    }
  });

  it("ChatTTS no se puede activar ni con consentimiento: solo ficha", () => {
    expect(decidirUsoVozNoComercial("chattts", ACEPTADO, "personal")).toEqual({
      permitido: false,
      motivo: MOTIVO_SOLO_FICHA,
    });
  });

  it("un id ajeno se rechaza sin adivinar", () => {
    expect(decidirUsoVozNoComercial("kokoro", ACEPTADO, "personal")).toEqual({
      permitido: false,
      motivo: MOTIVO_DESCONOCIDO,
    });
  });
});

describe("cadena AUTO y casilla de licencia", () => {
  it("la cadena AUTO por defecto no incluye ninguna voz no comercial", () => {
    expect(vocesNoComercialesEnAuto()).toEqual([]);
    for (const id of ["f5-tts", "xtts-v2", "chattts"]) {
      expect(AUTO_ENDPOINT_ORDER).not.toContain(id);
    }
  });

  it("la casilla explica la licencia exacta y el límite no comercial", () => {
    const texto = textoAceptacionLicencia("xtts-v2");
    expect(texto).toContain("MPL-2.0");
    expect(texto).toContain("Coqui Public Model License (no comercial)");
    expect(texto).toContain("uso personal no comercial");
  });

  it("ChatTTS y los ids ajenos no tienen casilla", () => {
    expect(textoAceptacionLicencia("chattts")).toBeNull();
    expect(textoAceptacionLicencia("kokoro")).toBeNull();
  });
});
