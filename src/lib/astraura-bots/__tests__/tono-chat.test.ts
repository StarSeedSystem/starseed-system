/**
 * Pruebas de BOT1011S · tono-chat (node): bloque con y sin agente,
 * preferencias aplicadas, límites honestos presentes, la situación de crisis
 * baja el humor y la basura en preferencias no lanza. Sin red ni disco.
 */
import { describe, it, expect } from "vitest";
import { botPredeterminado } from "../predeterminado";
import {
  bloqueTono,
  preferenciasDesdeJson,
  preferenciasPersona,
  situacionDeTexto,
} from "../adaptadores/tono-chat";

const bot = () => botPredeterminado("p1", "c1");
const agente = { params: { calidez: 20, energia: 100 } as Record<string, number | string>, emotions: {} as Record<string, number> };

describe("bloqueTono", () => {
  it("sin agente: encabezado y límites honestos", () => {
    const b = bloqueTono(bot(), undefined, { sesion: "privada" });
    expect(b.startsWith("TONO DEL BOT:")).toBe(true);
    expect(b).toContain("Eres una IA");
    // ≤ 6 líneas (encabezado + instrucciones del núcleo).
    expect(b.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("con agente: el tono refleja su personalidad (otro texto que sin él)", () => {
    const sin = bloqueTono(bot(), undefined, { sesion: "privada" });
    const con = bloqueTono(bot(), agente, { sesion: "privada" });
    expect(con.startsWith("TONO DEL BOT:")).toBe(true);
    expect(con).toContain("Eres una IA");
    expect(con.split("\n").length).toBeLessThanOrEqual(6);
    // Energía 100 del agente (peso 0,35 → 0,71): la línea de energía cambia a alta.
    expect(sin).toContain("energía media");
    expect(con).toContain("energía alta");
  });

  it("preferencias de la persona aplicadas: brevedad (concisión) y sinHumor gana", () => {
    const b = bloqueTono(bot(), undefined, { sesion: "privada" }, {
      rasgos: { calidez: 0.9, humor: 0.9 } as Partial<ReturnType<typeof bot>["personalidad"]>,
      sinHumor: true,
      brevedad: true,
    });
    expect(b).toContain("brevedad alta");
    // sinHumor obliga a humor 0 aunque un rasgo fijado diga 0,9.
    expect(b).toContain("humor baja");
  });

  it("situación crisis baja el humor y los límites honestos siguen al final", () => {
    const neutra = bloqueTono(bot(), undefined, { sesion: "privada" });
    const crisis = bloqueTono(bot(), undefined, { sesion: "privada", situacion: "crisis" });
    expect(neutra).toContain("humor media");
    expect(crisis).toContain("humor baja");
    expect(crisis).toContain("Eres una IA");
    // Los límites honestos SIEMPRE van y son la última línea.
    expect(crisis.endsWith(instruccionLimites(crisis))).toBe(true);
  });
});

describe("preferencias: la basura nunca lanza", () => {
  it("preferenciasDesdeJson devuelve vacía ante JSON roto o de otro tipo", () => {
    expect(preferenciasDesdeJson("{{{{no-json}}{{")).toEqual({});
    expect(preferenciasDesdeJson("null")).toEqual({});
    expect(preferenciasDesdeJson("[1,2,3]")).toEqual({});
    expect(preferenciasDesdeJson(JSON.stringify({ rasgos: "todo text", sinHumor: "sí", brevedad: 1 }))).toEqual({});
    // Rasgos que no son del núcleo ni números se descartan; lo válido queda.
    const mezcla = preferenciasDesdeJson(JSON.stringify({ rasgos: { humor: 0.7, inventado: 5, anualidad: "x" } }));
    expect(mezcla.rasgos).toEqual({ humor: 0.7 });
    // Un número fuera de rango se acota a [0, 1].
    const acotado = preferenciasDesdeJson(JSON.stringify({ rasgos: { calidez: 42 } }));
    expect(acotado.rasgos).toEqual({ calidez: 1 });
  });

  it("preferenciasPersona y bloqueTono nunca lanzan (sin/desde basura)", () => {
    expect(() => preferenciasPersona()).not.toThrow();
    expect(() => bloqueTono(bot(), agente, { sesion: "privada", situacion: "duelo" }, preferenciasDesdeJson("?¿!"))).not.toThrow();
    expect(bloqueTono(bot(), undefined, { sesion: "privada" }, preferenciasDesdeJson("{{"))).toContain("Eres una IA");
  });
});

describe("situacionDeTexto", () => {
  it("palabras clave → situaciones del núcleo; nadaMatchea → undefined", () => {
    expect(situacionDeTexto("Tenemos una reunión de trabajo a las 3")).toBe("trabajo");
    expect(situacionDeTexto("Quiero aprender álgebra")).toBe("aprendizaje");
    expect(situacionDeTexto("vamos a jugar una partida")).toBe("juego");
    // Caza con y sin acento.
    expect(situacionDeTexto("El informe está urgente")).toBe("crisis");
    expect(situacionDeTexto("Lo siento por tu pérdida")).toBe("duelo");
    expect(situacionDeTexto("hola, ¿cómo va todo?")).toBeUndefined();
    expect(situacionDeTexto("")).toBeUndefined();
  });
});

/** Última línea del bloque: la de los límites honestos (núcleo §4). */
function instruccionLimites(bloque: string): string {
  const lineas = bloque.split("\n");
  return lineas[lineas.length - 1];
}

