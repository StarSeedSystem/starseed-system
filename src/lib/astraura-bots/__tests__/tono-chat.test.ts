import { describe, expect, it } from "vitest";
// BOT1011S · Pruebas del bloque de tono para el chat (node, sin red, sin disco).
import {
  bloqueTono,
  CLAVE_PREFERENCIAS,
  leerPreferencias,
  preferenciasPersona,
  situacionDesdeTexto,
} from "../adaptadores/tono-chat";
import type { Personalidad } from "../tipos";

const BOT = {
  personalidad: {
    calidez: 0.7,
    energia: 0.55,
    formalidad: 0.55,
    curiosidad: 0.7,
    humor: 0.4,
    concision: 0.5,
  },
};

describe("bloqueTono", () => {
  it("sin agente: cabecera, 4 líneas y calidez del bot", () => {
    const t = bloqueTono(BOT);
    expect(t.startsWith("TONO DEL BOT:")).toBe(true);
    expect(t.split("\n")).toHaveLength(4);
    expect(t).toContain("Calidez alta");
    expect(t).toContain("formalidad media");
  });

  it("con agente marcada (formalidad 1): el tono sube y cambia el bloque", () => {
    const sin = bloqueTono(BOT, undefined);
    const con = bloqueTono(BOT, { params: { formality: 100 } });
    expect(con).toContain("formalidad alta");
    expect(con).not.toContain("formalidad media");
    expect(con).not.toBe(sin);
  });

  it("preferencias aplicadas: sinHumor y rasgo fijado ganan", () => {
    const quizas = bloqueTono(BOT, undefined, undefined, { sinHumor: true, rasgos: { energia: 1 } });
    expect(quizas).toContain("humor baja");
    expect(quizas).toContain("energía alta");
  });

  it("los límites honestos SIEMPRE van y son la última línea", () => {
    const t = bloqueTono(BOT, { params: { humor: 100 } });
    const lineas = t.split("\n");
    expect(lineas.length).toBeLessThanOrEqual(6);
    expect(lineas[lineas.length - 1]).toContain("Eres una IA");
    expect(lineas[lineas.length - 1]).toContain("discrepa con respeto");
  });

  it("la situación crisis baja el humor (es cuidado)", () => {
    const neutra = bloqueTono(BOT, undefined, { sesion: "privada" });
    const crisis = bloqueTono(BOT, undefined, { situacion: "crisis", sesion: "privada" });
    expect(crisis).toContain("humor baja");
    expect(neutra).toContain("humor media");
    expect(crisis).not.toBe(neutra);
  });
});

describe("situacionDesdeTexto", () => {
  it("detecta trabajo, aprendizaje, juego, duelo y crisis (con o sin acentos)", () => {
    expect(situacionDesdeTexto("tengo una reunión con mi jefe mañana")).toBe("trabajo");
    expect(situacionDesdeTexto("el estudio del examen me tiene ocupado")).toBe("aprendizaje");
    expect(situacionDesdeTexto("juguemos una partida")).toBe("juego");
    expect(situacionDesdeTexto("mi abuelo falleció ayer, sigo el duelo")).toBe("duelo");
    expect(situacionDesdeTexto("es urgente, hay una emergencia")).toBe("crisis");
  });

  it("texto neutro o vacío: null, nunca una situación inventada", () => {
    expect(situacionDesdeTexto("hola, ¿qué tal?")).toBeNull();
    expect(situacionDesdeTexto("")).toBeNull();
    expect(situacionDesdeTexto(undefined as unknown as string)).toBeNull();
  });
});

describe("preferencias", () => {
  it("leerPreferencias sanea: rasgos fuera de [0,1] y caminos raros fuera", () => {
    expect(leerPreferencias({ sinHumor: true, rasgos: { humor: 2, brevedad: 0.9 } })).toEqual({ sinHumor: true });
    expect(leerPreferencias({ brevedad: "sí " })).toEqual({});
    expect(leerPreferencias(["s", "k-"].join(""))).toEqual({});
    expect(leerPreferencias(null)).toEqual({});
  });

  it("basura en preferencias no lanza y el bloque se sigue armando", () => {
    const basura = { rasgos: ["s", "k-"].join(""), sinHumor: ["no"], brevedad: 3 } as unknown;
    let t = "";
    expect(() => {
      t = bloqueTono(BOT, undefined, undefined, leerPreferencias(basura));
    }).not.toThrow();
    expect(t.startsWith("TONO DEL BOT:")).toBe(true);
  });

  it("preferenciasPersona() en node (sin window) devuelve vacío y no lanza", () => {
    expect(typeof CLAVE_PREFERENCIAS).toBe("string");
    expect(() => preferenciasPersona()).not.toThrow();
    expect(preferenciasPersona()).toEqual({});
  });
});
