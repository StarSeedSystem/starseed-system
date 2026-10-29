import { describe, expect, it } from "vitest";
import {
  CLAVE_PREFERENCIAS,
  bloqueTono,
  preferenciasPersona,
  situacionDeTexto,
} from "../adaptadores/tono-chat";
import { PERSONALIDAD_ASTRAURA } from "../predeterminado";
import type { Personalidad } from "../tipos";

const botBase = (personalidad: Personalidad = { ...PERSONALIDAD_ASTRAURA }) => ({ personalidad });
const almacen = (valor: string | null) => ({ getItem: (_clave: string) => valor });
const lineas = (bloque: string) => bloque.split("\n");

describe("preferenciasPersona", () => {
  it("lee rasgos fijados, sinHumor y brevedad de la clave de la persona", () => {
    const guardado = JSON.stringify({ rasgos: { calidez: 0.9, formalidad: 2 }, sinHumor: true, brevedad: true });
    const p = preferenciasPersona(almacen(guardado));
    expect(p.rasgos?.calidez).toBe(0.9);
    expect(p.rasgos?.formalidad).toBe(1);
    expect(p.sinHumor).toBe(true);
    expect(p.brevedad).toBe(true);
  });

  it("clave ausente, JSON inválido o basura no lanza y devuelve vacío", () => {
    expect(preferenciasPersona(almacen(null))).toEqual({});
    expect(preferenciasPersona(almacen("{no-json"))).toEqual({});
    expect(preferenciasPersona(almacen(JSON.stringify({ rasgos: "basura", sinHumor: "sí" })))).toEqual({});
    expect(preferenciasPersona(null)).toEqual({});
    expect(CLAVE_PREFERENCIAS).toBe("starseed.astraura.bots.preferencias.v1");
  });
});

describe("bloqueTono", () => {
  it("sin agente usa los rasgos del bot y cabe en 6 líneas", () => {
    const bloque = bloqueTono(botBase());
    expect(lineas(bloque)[0]).toBe("TONO DEL BOT:");
    expect(bloque).toContain("humor media");
    expect(lineas(bloque).length).toBeLessThanOrEqual(6);
  });

  it("con agente encarnado acerca los rasgos a la personalidad del agente", () => {
    const base = botBase({ ...PERSONALIDAD_ASTRAURA, calidez: 0.5 });
    const sin = bloqueTono(base);
    const con = bloqueTono(base, { params: { calidez: 100 } });
    expect(sin).toContain("Calidez media");
    expect(con).toContain("Calidez alta");
  });

  it("aplica lo que la persona fijó: sin humor y brevedad", () => {
    const bloque = bloqueTono(botBase(), null, {
      preferencias: { sinHumor: true, brevedad: true, rasgos: { calidez: 1 } },
    });
    expect(bloque).toContain("humor baja");
    expect(bloque).toContain("brevedad alta");
    expect(bloque).toContain("Calidez alta");
  });

  it("lleva siempre los límites honestos como última línea", () => {
    const bloque = bloqueTono(botBase(), null, { situacion: "crisis" });
    const ultima = lineas(bloque).at(-1) ?? "";
    expect(ultima).toContain("Eres una IA");
    expect(ultima).toContain("No metas prisa");
  });

  it("una crisis baja el humor respecto a una situación neutra", () => {
    const neutra = bloqueTono(botBase(), null, { situacion: "neutra" });
    const crisis = bloqueTono(botBase(), null, { situacion: "crisis" });
    expect(neutra).toContain("humor media");
    expect(crisis).toContain("humor baja");
    expect(crisis).not.toContain("humor media");
  });
});

describe("situacionDeTexto", () => {
  it("detecta trabajo, aprendizaje, juego, duelo y crisis por palabras clave", () => {
    expect(situacionDeTexto("la reunión de trabajo fue larga")).toBe("trabajo");
    expect(situacionDeTexto("quiero aprender a estudiar mejor")).toBe("aprendizaje");
    expect(situacionDeTexto("vamos a jugar una partida")).toBe("juego");
    expect(situacionDeTexto("se murió mi perro, estoy de luto")).toBe("duelo");
    expect(situacionDeTexto("esto es una emergencia, necesito socorro")).toBe("crisis");
    expect(situacionDeTexto("hola, ¿qué tal?")).toBe("neutra");
  });
});
