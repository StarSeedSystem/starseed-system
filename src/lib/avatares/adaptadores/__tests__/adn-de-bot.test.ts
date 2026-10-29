import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import {
  adnConEmocion, adnConVisemas, adnDeBot, expresionDeEmocion, expresionesDeEmocion, gestoDeBot,
  idAdnDeBot, intensidadAuraEmocion, usaAdnDeBot, visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";

const bot = (over: Partial<Bot> = {}): Bot => ({
  id: "bot-1",
  nombre: "Aria",
  dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
  origen: "astraura",
  gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-aria", tono: 190, escala: 1 },
  sentidosHabilitados: [],
  activo: true,
  ...over,
});

const estado = (valencia: number, activacion: number, emocion: EstadoEmocional["emocion"] = "calma"): EstadoEmocional =>
  ({ emocion, valencia, activacion });

describe("ADN de avatar de un bot (AV1011C)", () => {
  it("reconoce solo cuerpos 3D/VRM con referencia interna de Biblioteca", () => {
    expect(usaAdnDeBot(bot())).toBe(true);
    expect(usaAdnDeBot(bot({ cuerpo: { forma: "vrm", avatarRef: "biblioteca:adn-aria", tono: 190, escala: 1 } }))).toBe(true);
    expect(usaAdnDeBot(bot({ cuerpo: { forma: "orbe", avatarRef: "biblioteca:adn-aria", tono: 190, escala: 1 } }))).toBe(false);
    expect(usaAdnDeBot(bot({ cuerpo: { forma: "avatar-3d", avatarRef: "https://externa/avatar.vrm", tono: 190, escala: 1 } }))).toBe(false);
  });

  it("toma el id del ADN de su referencia o deriva uno estable", () => {
    expect(idAdnDeBot(bot())).toBe("adn-aria");
    expect(idAdnDeBot(bot({ cuerpo: { forma: "vrm", tono: 10, escala: 1 } }))).toBe("adn-bot-bot-1");
  });

  it("crea adnPorDefecto con el tono de la orbe y dueño bot cuando no hay guardado", () => {
    const adn = adnDeBot(bot());
    expect(adn.id).toBe("adn-aria");
    expect(adn.nombre).toBe("Aria");
    expect(adn.dueno).toEqual({ tipo: "bot", id: "bot-1" });
    expect(adn.aura.tono).toBe(190);
    expect(adn.base.tipo).toBe("orbe");
    expect(adn.visibilidad).toBe("privado");
  });

  it("carga el ADN guardado si pertenece al mismo bot", () => {
    const guardado = { ...adnPorDefecto("adn-aria", "Aria guardada", { tipo: "bot", id: "bot-1" }, 42), base: { tipo: "vrm" as const, ref: "biblioteca:avatares/aria.vrm" } };
    const adn = adnDeBot(bot(), guardado);
    expect(adn.nombre).toBe("Aria guardada");
    expect(adn.base.ref).toBe("biblioteca:avatares/aria.vrm");
    expect(adn.aura.tono).toBe(42);
  });

  it("no acepta el ADN de otro dueño y vuelve al de por defecto", () => {
    const ajeno: AdnAvatar = adnPorDefecto("otro-adn", "De otro bot", { tipo: "bot", id: "bot-2" });
    const adn = adnDeBot(bot(), ajeno);
    expect(adn.id).toBe("adn-aria");
    expect(adn.nombre).toBe("Aria");
  });
});

describe("emoción del bot → expresiones y aura", () => {
  it("alegría → happy; tristeza → sad; enfado → angry", () => {
    expect(expresionDeEmocion(estado(0.8, 0.6, "alegria")).expresion).toBe("happy");
    expect(expresionDeEmocion(estado(-0.8, 0.2, "preocupacion")).expresion).toBe("sad");
    expect(expresionDeEmocion(estado(-0.8, 0.9, "preocupacion")).expresion).toBe("angry");
  });

  it("asombro → surprised; calma → relaxed; el resto → neutral", () => {
    expect(expresionDeEmocion(estado(0.1, 0.9, "asombro")).expresion).toBe("surprised");
    expect(expresionDeEmocion(estado(0.1, 0.1, "calma")).expresion).toBe("relaxed");
    expect(expresionDeEmocion(estado(0.1, 0.5, "concentracion")).expresion).toBe("neutral");
  });

  it("el mapa enciende una sola emoción de la cara", () => {
    const caras = expresionesDeEmocion(estado(0.9, 0.7, "alegria"));
    expect(caras.happy).toBeGreaterThan(0);
    expect(caras.sad + caras.angry + caras.surprised + caras.relaxed + caras.neutral).toBe(0);
  });

  it("el aura respira con la emoción solo si está ligada", () => {
    const base = adnPorDefecto("adn-aria", "Aria", { tipo: "bot", id: "bot-1" });
    const intensa = intensidadAuraEmocion(base, estado(1, 1));
    const floja = intensidadAuraEmocion(base, estado(0, 0));
    expect(intensa).toBeGreaterThan(floja);
    const sinLiga = { ...base, aura: { ...base.aura, ligadaEmocion: false } };
    expect(intensidadAuraEmocion(sinLiga, estado(1, 1))).toBe(base.aura.intensidad);
  });

  it("adnConEmocion pinta la cara y ajusta el aura sin subir la revisión", () => {
    const base = adnPorDefecto("adn-aria", "Aria", { tipo: "bot", id: "bot-1" });
    const conEmocion = adnConEmocion(base, estado(0.9, 0.8, "alegria"));
    expect(conEmocion.expresionBase.happy).toBeGreaterThan(0);
    expect(conEmocion.expresionBase.sad).toBe(0);
    expect(conEmocion.aura.intensidad).not.toBe(base.aura.intensidad);
    expect(conEmocion.rev).toBe(base.rev);
  });
});

describe("visemas y gesto del habla", () => {
  it("reparte visemas por las vocales del texto", () => {
    expect(visemasDeTexto("aaa")).toEqual({ aa: 1 });
    expect(visemasDeTexto("hola")).toEqual({ aa: 1, oh: 1 });
    expect(visemasDeTexto("")).toEqual({});
    expect(visemasDeTexto("a e")).toEqual({ aa: 1, ee: 1 });
  });

  it("adnConVisemas suma la boca sin borrar la emoción", () => {
    const base = { ...adnPorDefecto("adn-aria", "Aria", { tipo: "bot", id: "bot-1" }), expresionBase: { happy: 0.8 } };
    const hablando = adnConVisemas(base, "ala");
    expect(hablando.expresionBase.happy).toBe(0.8);
    expect(hablando.expresionBase.aa).toBe(1);
  });

  it("gestoDeBot usa el carácter del ADN y la emoción del bot", () => {
    const tranquilo = { ...adnPorDefecto("adn-aria", "Aria", { tipo: "bot", id: "bot-1" }), movimiento: { energia: 0.1, amplitud: 0.1, ritmo: 0, postura: 0.1 } };
    const vivo = { ...tranquilo, movimiento: { energia: 0.9, amplitud: 0.9, ritmo: 1, postura: 0.9 } };
    const texto = "esta es una frase para mover el avatar con calma";
    const gTranquilo = gestoDeBot(tranquilo, texto, estado(0.5, 0.5, "calma"));
    const gVivo = gestoDeBot(vivo, texto, estado(0.5, 0.9, "alegria"));
    expect(gVivo.energia!).toBeGreaterThan(gTranquilo.energia!);
    expect(gVivo.duracionMs!).toBeLessThan(gTranquilo.duracionMs!);
    expect(gVivo.prompt).toContain("alegria");
    expect(gVivo.prompt).toContain("upright confident posture");
  });
});
