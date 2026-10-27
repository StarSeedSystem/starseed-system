/**
 * VZR1011C — Filtro comercial de las voces no comerciales.
 *
 * Sin red, disco ni GPU: solo funciones puras del módulo. Las licencias son las
 * verificadas el 2026-10-11 en `architecture/astraura-voces-y-robots.md` §1.
 */
import { describe, expect, it } from "vitest";
import {
  VOCES_LICENCIAS,
  buscarFichaVoz,
  esMotorNoComercial,
  esUsoComercial,
  filtrarCadenaPorUso,
  motoresOpcionalesPersonales,
  puedeUsarVozOpcional,
  textoCasillaLicencia,
} from "@/lib/aurora/tts-oss/voces-no-comerciales";

const CADENA = ["omnivoice", "openvoice2", "chatterbox", "f5-tts", "xtts-v2", "chattts", "kokoro"];

describe("licencias verificadas", () => {
  it("las cinco fichas llevan la licencia exacta del contrato", () => {
    const porId = new Map(VOCES_LICENCIAS.map((v) => [v.id, v]));
    expect(porId.get("chatterbox")).toMatchObject({ licenciaCodigo: "MIT", licenciaPesos: "MIT", comercial: true });
    expect(porId.get("openvoice2")).toMatchObject({ licenciaCodigo: "MIT", licenciaPesos: "MIT", comercial: true });
    expect(porId.get("f5-tts")).toMatchObject({ licenciaCodigo: "MIT", licenciaPesos: "CC-BY-NC", comercial: false });
    expect(porId.get("xtts-v2")).toMatchObject({ licenciaCodigo: "MPL-2.0", licenciaPesos: "Coqui Public Model License", comercial: false });
    expect(porId.get("chattts")).toMatchObject({ licenciaCodigo: "AGPL-3.0", licenciaPesos: "CC BY-NC 4.0 (solo académico)", comercial: false });
  });

  it("F5-TTS y XTTS-v2 son los únicos opcionales personales y están apagados", () => {
    const opcionales = motoresOpcionalesPersonales();
    expect(opcionales.map((v) => v.id)).toEqual(["f5-tts", "xtts-v2"]);
    for (const v of opcionales) {
      expect(v.porDefecto).toBe(false);
      expect(v.comercial).toBe(false);
    }
  });

  it("ChatTTS solo tiene ficha: no se integra y no habla español", () => {
    const chat = buscarFichaVoz("chattts");
    expect(chat).not.toBeNull();
    expect(chat?.opcionalPersonal).toBe(false);
    expect(chat?.espanol).toBe(false);
    expect(motoresOpcionalesPersonales().some((v) => v.id === "chattts")).toBe(false);
  });
});

describe("filtro comercial", () => {
  it("reconoce páginas, grupos y empresas con fines comerciales", () => {
    expect(esUsoComercial("comercial")).toBe(true);
    expect(esUsoComercial("Grupo-Comercial")).toBe(true);
    expect(esUsoComercial("pagina-comercial")).toBe(true);
    expect(esUsoComercial("personal")).toBe(false);
    expect(esUsoComercial("")).toBe(false);
    expect(esUsoComercial(undefined)).toBe(false);
  });

  it("en comercio caen F5, XTTS y ChatTTS; en personal se queda la cadena entera", () => {
    expect(filtrarCadenaPorUso(CADENA, "comercial")).toEqual(["omnivoice", "openvoice2", "chatterbox", "kokoro"]);
    expect(filtrarCadenaPorUso(CADENA, "personal")).toEqual(CADENA);
  });

  it("clasifica cada motor por la licencia de SUS pesos", () => {
    expect(esMotorNoComercial("f5-tts")).toBe(true);
    expect(esMotorNoComercial("xtts-v2")).toBe(true);
    expect(esMotorNoComercial("chattts")).toBe(true);
    expect(esMotorNoComercial("chatterbox")).toBe(false);
    expect(esMotorNoComercial("openvoice2")).toBe(false);
    expect(esMotorNoComercial("inventado")).toBe(false);
  });
});

describe("permiso de uso del motor opcional", () => {
  const listo = { contexto: "personal", instalada: true, licenciaAceptada: true };

  it("apagado por defecto: sin instalar no suena aunque sea personal", () => {
    expect(puedeUsarVozOpcional("f5-tts", { ...listo, instalada: false }).permitido).toBe(false);
    expect(puedeUsarVozOpcional("xtts-v2", { ...listo, instalada: false }).motivo).toContain("apagado por defecto");
  });

  it("instalado pero sin aceptar la licencia tampoco suena", () => {
    const r = puedeUsarVozOpcional("f5-tts", { ...listo, licenciaAceptada: false });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain("CC-BY-NC");
  });

  it("instalado y aceptado: solo vale en uso personal, nunca en comercio", () => {
    expect(puedeUsarVozOpcional("f5-tts", listo)).toEqual({ permitido: true, motivo: null });
    expect(puedeUsarVozOpcional("xtts-v2", listo)).toEqual({ permitido: true, motivo: null });
    for (const contexto of ["comercial", "grupo-comercial", "empresa"]) {
      const r = puedeUsarVozOpcional("xtts-v2", { ...listo, contexto });
      expect(r.permitido).toBe(false);
      expect(r.motivo).toContain("fines comerciales");
    }
  });

  it("ChatTTS no se puede usar nunca: ni instalado ni aceptado", () => {
    const r = puedeUsarVozOpcional("chattts", listo);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain("no se integra");
  });

  it("Chatterbox y OpenVoice V2 (MIT) valen también en comercio", () => {
    expect(puedeUsarVozOpcional("chatterbox", { ...listo, contexto: "comercial" })).toEqual({ permitido: true, motivo: null });
    expect(puedeUsarVozOpcional("openvoice2", { ...listo, contexto: "comercial" }).permitido).toBe(true);
  });

  it("un motor desconocido se rechaza con motivo", () => {
    expect(puedeUsarVozOpcional("inventado", listo)).toEqual({ permitido: false, motivo: "Motor de voz desconocido." });
  });
});

describe("casilla que explica la licencia", () => {
  it("nombra código y pesos, y avisa del uso personal no comercial", () => {
    const texto = textoCasillaLicencia("f5-tts");
    expect(texto).toContain("F5-TTS");
    expect(texto).toContain("MIT");
    expect(texto).toContain("CC-BY-NC");
    expect(texto).toContain("no comercial");
    expect(texto).toContain("fines comerciales");
  });

  it("no hay casilla para las voces que ya son comerciales ni para un id inventado", () => {
    expect(textoCasillaLicencia("chatterbox")).toBe("");
    expect(textoCasillaLicencia("openvoice2")).toBe("");
    expect(textoCasillaLicencia("inventado")).toBe("");
  });
});
