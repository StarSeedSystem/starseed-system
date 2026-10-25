import { describe, it, expect } from "vitest";
import {
  bloqueTono,
  CABECERA_TONO,
  preferenciasPersona,
  saneaPreferencias,
  situacionDeTexto,
  tonoDeChatAstraura,
  CLAVE_PREFERENCIAS,
} from "../adaptadores/tono-chat";
import { botPredeterminado } from "../predeterminado";
import type { Bot } from "../tipos";
import type { EntradaAurora } from "../personalidad-desde-aurora";

const bot: Bot = botPredeterminado("perfil-prueba", "cuenta-prueba");

/** Agente encarnado muy claro: concisión al máximo (persona de réplica corta). */
const AGENTE: EntradaAurora = { params: { concision: 1, calidez: 0.9 }, emotions: {}, tags: [] };

describe("bloqueTono (BOT1011S)", () => {
  it("sin agente: cabecera, menos de 6 líneas y límites honestos como última línea", () => {
    const lineas = bloqueTono(bot, undefined, { sesion: "privada" }, {}).split("\n");
    expect(lineas[0]).toBe(CABECERA_TONO);
    expect(lineas.length).toBeLessThanOrEqual(6);
    expect(lineas[lineas.length - 1]).toContain("Eres una IA");
    expect(lineas[2]).toContain("brevedad media");
  });

  it("con agente encarnado: sus rasgos entran en la mezcla", () => {
    const conAgente = bloqueTono(bot, AGENTE, { sesion: "privada" }, {});
    const sinAgente = bloqueTono(bot, undefined, { sesion: "privada" }, {});
    expect(conAgente).toContain("brevedad alta");
    expect(sinAgente).toContain("brevedad media");
  });

  it("preferencias de la persona aplicadas: sinHumor y brevedad mandan", () => {
    const sinHumor = bloqueTono(bot, undefined, { sesion: "privada" }, { sinHumor: true });
    expect(sinHumor).toContain("humor baja");
    const breve = bloqueTono(bot, undefined, { sesion: "privada" }, { brevedad: true });
    expect(breve).toContain("brevedad alta");
  });

  it("situación crisis: baja el humor, nombra la situación y conserva los límites", () => {
    const lineas = bloqueTono(bot, undefined, { sesion: "privada", situacion: "crisis" }, {}).split("\n");
    expect(lineas.join("\n")).toContain("Situación: crisis");
    expect(lineas.join("\n")).toContain("humor baja");
    expect(lineas.length).toBeLessThanOrEqual(6);
    expect(lineas[lineas.length - 1]).toContain("Eres una IA");
  });

  it("situación desde el texto por palabras clave simples", () => {
    expect(situacionDeTexto("estamos en una crisis urgente")).toBe("crisis");
    expect(situacionDeTexto("hoy toca trabajo en el proyecto")).toBe("trabajo");
    expect(situacionDeTexto("hola, qué tal")).toBe("neutra");
  });
});

describe("preferencias (BOT1011S)", () => {
  it("la clave de guardado es la del contrato", () => {
    expect(CLAVE_PREFERENCIAS).toBe("starseed.astraura.bots.preferencias.v1");
  });

  it("basura en preferencias no lanza y sale vacía", () => {
    expect(saneaPreferencias(null)).toEqual({});
    expect(saneaPreferencias(42)).toEqual({});
    expect(saneaPreferencias(["a", "b"] as never)).toEqual({});
    expect(saneaPreferencias("texto" as never)).toEqual({});
    expect(saneaPreferencias({ rasgos: "humor" })).toEqual({});
    expect(saneaPreferencias({ sinHumor: "sí" })).toEqual({});
    expect(preferenciasPersona(() => "{" + "{roto}")).toEqual({});
    expect(preferenciasPersona(() => 1)).toEqual({});
  });

  it("preferencias leídas de una cadena JSON saneada se aplican", () => {
    const prefs = preferenciasPersona(() => JSON.stringify({ sinHumor: true, brevedad: true, rasgos: { calidez: 7 } }));
    expect(prefs.sinHumor).toBe(true);
    expect(prefs.brevedad).toBe(true);
    expect(prefs.rasgos?.calidez).toBe(1);
  });
});

describe("tonoDeChatAstraura (el bloque que entra al motor)", () => {
  it("devuelve un bloque ≤ 6 líneas con cabecera y límites, y crisis por texto", () => {
    const neutro = tonoDeChatAstraura("hola, qué tal");
    expect(neutro.split("\n")[0]).toBe(CABECERA_TONO);
    expect(neutro.split("\n").length).toBeLessThanOrEqual(6);
    expect(neutro.split("\n")[neutro.split("\n").length - 1]).toContain("Eres una IA");
    const enCrisis = tonoDeChatAstraura("necesito auxilio");
    expect(enCrisis).toContain("Situación: crisis");
    expect(enCrisis).toContain("humor baja");
  });

  it("en node sin localStorage nunca lanza", () => {
    expect(() => tonoDeChatAstraura("hola")).not.toThrow();
  });
});
