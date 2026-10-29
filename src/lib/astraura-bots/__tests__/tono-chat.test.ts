/**
 * BOT1011S · tono del bot en el chat: bloque «TONO DEL BOT:», preferencias de la
 * persona, situación del turno y límites honestos. Puro: sin red, sin disco, sin mock.
 */
import { describe, it, expect, afterEach } from "vitest";

import {
  CLAVE_PREFERENCIAS, bloqueTono, preferenciasPersona, sanearPreferencias, situacionDeTexto,
} from "@/lib/astraura-bots/adaptadores/tono-chat";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";

const bot = botPredeterminado("p1", "c1");

describe("situacionDeTexto (BOT1011S)", () => {
  it("palabras simples del turno → situación", () => {
    expect(situacionDeTexto("Vamos a jugar una partida")).toBe("juego");
    expect(situacionDeTexto("Falleció mi abuela, lo siento")).toBe("duelo");
    expect(situacionDeTexto("Esto es urgente, ayuda")).toBe("crisis");
    expect(situacionDeTexto("Tengo que estudiar mi curso")).toBe("aprendizaje");
    expect(situacionDeTexto("preparo la reunión con el cliente")).toBe("trabajo");
  });

  it("sin señales: nada", () => {
    expect(situacionDeTexto("hola, ¿qué tal?")).toBeUndefined();
    expect(situacionDeTexto("")).toBeUndefined();
  });
});

describe("preferencias de la persona (BOT1011S)", () => {
  const guardada = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = guardada;
  });

  it("basura en preferencias no lanza ni aplica nada", () => {
    expect(sanearPreferencias(null)).toEqual({});
    expect(sanearPreferencias(42)).toEqual({});
    expect(sanearPreferencias([1])).toEqual({});
    expect(sanearPreferencias({ rasgos: "no", sinHumor: "sí", brevedad: 1 })).toEqual({});
    expect(sanearPreferencias({ rasgos: { humor: 9, calidez: 0.5 } })).toEqual({ rasgos: { calidez: 0.5 } });
  });

  it("sin ventana (node) devuelve {} y no lanza", () => {
    expect(preferenciasPersona()).toEqual({});
  });

  it("lee `starseed.astraura.bots.preferencias.v1` y sanea lo guardado", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (k === CLAVE_PREFERENCIAS ? '{"sinHumor":true,"brevedad":true}' : null),
      },
    };
    expect(preferenciasPersona()).toEqual({ sinHumor: true, brevedad: true });
  });

  it("JSON roto en preferencias no lanza: cae a {}", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: () => "{no-sirve" },
    };
    expect(preferenciasPersona()).toEqual({});
  });
});


describe("bloqueTono (BOT1011S)", () => {
  it("sin agente: cabecera, ≤ 6 líneas y límites honestos al final", () => {
    const b = bloqueTono(bot);
    const lineas = b.split("\n");
    expect(lineas[0]).toBe("TONO DEL BOT:");
    expect(lineas.length).toBeLessThanOrEqual(6);
    expect(lineas[lineas.length - 1]).toContain("Eres una IA");
  });

  it("con agente (BOT1011D1): entra su personalidad y cambia el tono", () => {
    const sin = bloqueTono(bot);
    const con = bloqueTono(bot, { params: { brevity: 0 }, emotions: {}, tags: [] });
    expect(con).toContain("brevedad baja");
    expect(sin).toContain("brevedad media");
    expect(con).not.toBe(sin);
  });

  it("preferencias de la persona aplicadas: sinHumor y brevedad ganan", () => {
    const b = bloqueTono(
      bot, undefined, { sesion: "privada" },
      { sinHumor: true, brevedad: true, rasgos: { humor: 0.9 } },
    );
    expect(b).toContain("humor baja");
    expect(b).toContain("brevedad alta");
  });

  it("los límites honestos van SIEMPRE, incluso con preferencias raras", () => {
    const b = bloqueTono(bot, undefined, { sesion: "publica" }, { sinHumor: true });
    expect(b.trim().split("\n").pop()).toContain("No metas prisa");
  });

  it("crisis baja el humor (local): es cuidado y no deriva", () => {
    const normal = bloqueTono(bot, undefined, { sesion: "privada", situacion: "neutra" });
    const crisis = bloqueTono(bot, undefined, { sesion: "privada", situacion: "crisis" });
    expect(crisis).toContain("humor baja");
    expect(normal).toContain("humor media");
  });
});
