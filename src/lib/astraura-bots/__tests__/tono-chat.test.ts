import { describe, it, expect } from "vitest";
import {
  bloqueTono,
  preferenciasPersona,
  parsearPreferencias,
  situacionDeTexto,
} from "../adaptadores/tono-chat";
import { botPredeterminado } from "../predeterminado";

const bot = botPredeterminado("perfil-tono", "cuenta-tono");
const senales = { sesion: "privada" } as const;

describe("tono-chat · bloque de tono para el prompt", () => {
  it("sin agente: cabecera «TONO DEL BOT», ≤ 6 líneas y límites honestos", () => {
    const t = bloqueTono(bot, undefined, senales);
    expect(t.startsWith("TONO DEL BOT:")).toBe(true);
    expect(t.split("\n").length).toBeLessThanOrEqual(6);
    expect(t).toContain("Eres una IA");
    expect(t).toContain("no adules");
  });

  it("con agente: su personalidad entra en la mezcla y los límites siguen presentes", () => {
    const sinAgente = bloqueTono(bot, undefined, senales);
    const conAgente = bloqueTono(bot, { params: { energia: 1 } }, senales);
    expect(sinAgente).toContain("energía media");
    expect(conAgente).toContain("energía alta");
    expect(conAgente).toContain("Eres una IA");
    expect(conAgente.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("preferencias de la persona aplicadas: sin humor y breve", () => {
    const t = bloqueTono(bot, undefined, senales, { sinHumor: true, brevedad: true });
    expect(t).toContain("humor baja");
    expect(t).toContain("brevedad alta");
    expect(t).toContain("la persona lo fijó");
    expect(t.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("rasgos fijados por la persona ganan sobre el ajuste de situación", () => {
    const t = bloqueTono(bot, undefined, senales, { rasgos: { formalidad: 1 } });
    expect(t).toContain("formalidad alta");
  });

  it("situación crisis baja el humor; neutra lo deja en media", () => {
    const enCrisis = bloqueTono(bot, undefined, { sesion: "privada", situacion: "crisis" });
    expect(enCrisis).toContain("humor baja");
    expect(enCrisis).toContain("Eres una IA");
    expect(bloqueTono(bot, undefined, senales)).toContain("humor media");
  });
});

describe("tono-chat · situación por palabras clave simples", () => {
  const casos: Array<[string, ReturnType<typeof situacionDeTexto>]> = [
    ["tenemos una reunión de trabajo", "trabajo"],
    ["quiero aprender esto bien", "aprendizaje"],
    ["vamos a jugar una partida", "juego"],
    ["esto es una crisis urgente", "crisis"],
    ["mi pésame, fue un duelo duro", "duelo"],
    ["hola, ¿cómo estás?", "neutra"],
  ];
  for (const [texto, esperada] of casos) {
    it(`«${texto}» → ${esperada}`, () => {
      expect(situacionDeTexto(texto)).toBe(esperada);
    });
  }
  it("texto vacío → neutra", () => {
    expect(situacionDeTexto("")).toBe("neutra");
  });
});

describe("tono-chat · preferencias robustas (nunca lanza)", () => {
  it("basura en preferencias descartada", () => {
    expect(parsearPreferencias("no soy objeto")).toEqual({});
    expect(parsearPreferencias(["x"])).toEqual({});
    expect(parsearPreferencias({ rasgos: "todo", sinHumor: "sí", brevedad: 1 })).toEqual({});
    expect(parsearPreferencias({ rasgos: { calidez: "alta", inventado: 1 } })).toEqual({});
  });

  it("preferencias válidas atraviesan el saneo", () => {
    expect(parsearPreferencias({ sinHumor: true, brevedad: true })).toEqual({
      sinHumor: true,
      brevedad: true,
    });
    expect(parsearPreferencias({ rasgos: { calidez: 0.9 } })).toEqual({ rasgos: { calidez: 0.9 } });
  });

  it("preferenciasPersona() sin ventana (node/SSR) devuelve {} sin lanzar", () => {
    expect(preferenciasPersona()).toEqual({});
  });
});
