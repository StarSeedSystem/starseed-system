import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import {
  adnConEmocion,
  adnDeBot,
  conVisema,
  expresionesDeEmocion,
  gestoDeHabla,
  idAdnDeBot,
  intensidadAuraEmocion,
  refAdnDeBot,
  usaAvatar3d,
  visemaEn,
  visemasDeTexto,
} from "../adn-de-bot";

function botCon(cuerpo: Partial<Bot["cuerpo"]> = {}): Bot {
  const base = botPredeterminado("p1", "c1");
  return { ...base, cuerpo: { ...base.cuerpo, ...cuerpo } };
}

const estado = (emocion: EstadoEmocional["emocion"], valencia: number, activacion: number): EstadoEmocional =>
  ({ emocion, valencia, activacion });

describe("adnDeBot", () => {
  it("usa el avatar 3D solo en las formas avatar-3d y vrm", () => {
    expect(usaAvatar3d("avatar-3d")).toBe(true);
    expect(usaAvatar3d("vrm")).toBe(true);
    expect(usaAvatar3d("orbe")).toBe(false);
    expect(usaAvatar3d("avatar-2d")).toBe(false);
  });

  it("crea un ADN por defecto con el id del avatarRef, el tono de la orbe y dueño bot", () => {
    const bot = botCon({ forma: "avatar-3d", avatarRef: "biblioteca:adn-abc", tono: 200 });
    const adn = adnDeBot(bot);
    expect(adn.id).toBe("adn-abc");
    expect(refAdnDeBot(bot)).toBe("biblioteca:adn-abc");
    expect(adn.dueno).toEqual({ tipo: "bot", id: bot.id });
    expect(adn.nombre).toBe(bot.nombre);
    expect(adn.base.tipo).toBe("orbe");
    expect(adn.aura.tono).toBe(200);
    expect(adn.rev).toBe(0);
  });

  it("sin avatarRef usa un id determinista y limpio", () => {
    const bot = botCon({ forma: "vrm" });
    expect(idAdnDeBot(bot)).toBe(`adn-bot-${bot.id.replace(/[^\w.-]+/g, "-")}`);
    expect(adnDeBot(bot).id).toBe(idAdnDeBot(bot));
  });

  it("normaliza el tono de la orbe al rango 0…359", () => {
    expect(adnDeBot(botCon({ tono: 400 })).aura.tono).toBe(40);
    expect(adnDeBot(botCon({ tono: -10 })).aura.tono).toBe(350);
  });

  it("devuelve el ADN guardado si pertenece a ese bot", () => {
    const bot = botCon({ forma: "avatar-3d", avatarRef: "biblioteca:adn-x" });
    const guardado = adnPorDefecto("adn-x", "Otro nombre", { tipo: "bot", id: bot.id }, 100);
    expect(adnDeBot(bot, guardado)).toBe(guardado);
  });

  it("ignora un ADN de otro dueño y crea el suyo", () => {
    const bot = botCon({ forma: "avatar-3d", avatarRef: "biblioteca:adn-x" });
    const ajeno = adnPorDefecto("adn-x", "Ajeno", { tipo: "perfil", id: "otro" }, 100);
    const adn = adnDeBot(bot, ajeno);
    expect(adn).not.toBe(ajeno);
    expect(adn.dueno).toEqual({ tipo: "bot", id: bot.id });
    expect(adn.id).toBe("adn-x");
  });
});

describe("emoción → expresiones VRM", () => {
  it("la alegría activa sube happy y no toca sad ni angry", () => {
    const e = expresionesDeEmocion(estado("alegria", 0.8, 0.8));
    expect(e.happy).toBeGreaterThan(e.sad ?? 0);
    expect(e.happy).toBeGreaterThan(e.angry ?? 0);
    expect(e.sad).toBe(0);
    expect(e.angry).toBe(0);
  });

  it("la tristeza con poca activación sube sad más que angry", () => {
    const e = expresionesDeEmocion(estado("preocupacion", -0.6, 0.2));
    expect(e.sad).toBeGreaterThan(e.angry ?? 0);
    expect(e.sad).toBeGreaterThan(e.happy ?? 0);
  });

  it("la valencia negativa con mucha activación sube angry", () => {
    const e = expresionesDeEmocion(estado("preocupacion", -0.6, 0.9));
    expect(e.angry).toBeGreaterThan(e.sad ?? 0);
  });

  it("una activación muy alta produce asombro", () => {
    const e = expresionesDeEmocion(estado("asombro", 0.3, 0.95));
    expect(e.surprised).toBeGreaterThan(0);
  });

  it("la calma con valencia positiva y poca activación es relaxed", () => {
    const e = expresionesDeEmocion(estado("calma", 0.5, 0.1));
    expect(e.relaxed).toBeGreaterThan(e.happy ?? 0);
  });

  it("sin emoción clara manda neutral", () => {
    const e = expresionesDeEmocion(estado("calma", 0, 0.2));
    expect(e.neutral).toBeGreaterThan(e.happy ?? 0);
    expect(e.neutral).toBeGreaterThan(e.sad ?? 0);
  });

  it("acota valores fuera de rango y nunca pasa de 1", () => {
    const e = expresionesDeEmocion(estado("alegria", 9, 9));
    for (const v of Object.values(e)) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(e)) expect(v).toBeLessThanOrEqual(1);
  });
});

describe("aura ligada a la emoción", () => {
  it("modula la intensidad si ligadaEmocion está activo", () => {
    const adn = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    adn.aura = { tono: 200, intensidad: 0.6, ligadaEmocion: true };
    const intensa = intensidadAuraEmocion(adn, estado("alegria", 0.8, 1));
    const suave = intensidadAuraEmocion(adn, estado("calma", 0.1, 0.1));
    expect(intensa).toBeGreaterThan(suave);
    expect(intensa).toBeLessThanOrEqual(1);
  });

  it("no cambia nada si el ADN no liga el aura a la emoción", () => {
    const adn = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    adn.aura = { tono: 200, intensidad: 0.42, ligadaEmocion: false };
    expect(intensidadAuraEmocion(adn, estado("alegria", 1, 1))).toBe(0.42);
  });

  it("adnConEmocion copia y no muta el ADN original", () => {
    const adn = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    const antes = JSON.stringify(adn);
    const vivo = adnConEmocion(adn, estado("alegria", 0.9, 0.9));
    expect(JSON.stringify(adn)).toBe(antes);
    expect(vivo.expresionBase.happy).toBeGreaterThan(0);
    expect(vivo.aura.intensidad).toBeGreaterThanOrEqual(0);
  });
});

describe("visemas del habla", () => {
  it("saca una postura de boca por vocal y reparte la duración estimada", () => {
    const visemas = visemasDeTexto("hola");
    expect(visemas.map((v) => v.expresion)).toEqual(["oh", "aa"]);
    expect(visemas[0].desdeMs).toBe(0);
    expect(visemas[visemas.length - 1].hastaMs).toBeGreaterThan(0);
  });

  it("quita acentos antes de leer las vocales", () => {
    expect(visemasDeTexto("canción").map((v) => v.expresion)).toEqual(["aa", "ih", "oh"]);
  });

  it("sin vocales no inventa visemas", () => {
    expect(visemasDeTexto("mmmm")).toEqual([]);
    expect(visemasDeTexto("")).toEqual([]);
  });

  it("visemaEn devuelve el que toca y null al terminar", () => {
    const visemas = visemasDeTexto("hola");
    expect(visemaEn(visemas, 0)).toBe("oh");
    const fin = visemas[visemas.length - 1].hastaMs;
    expect(visemaEn(visemas, fin)).toBeNull();
  });

  it("conVisema superpone solo el visema actual y respeta las demás expresiones", () => {
    const adn = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    adn.expresionBase = { happy: 0.4, aa: 0.7 };
    const vivo = conVisema(adn, "oh");
    expect(vivo.expresionBase.happy).toBe(0.4);
    expect(vivo.expresionBase.oh).toBe(0.85);
    expect(vivo.expresionBase.aa).toBeUndefined();
  });

  it("conVisema null no cambia el ADN", () => {
    const adn = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    expect(conVisema(adn, null)).toBe(adn);
  });
});

describe("gestoDeHabla respeta el carácter del ADN", () => {
  it("devuelve un gesto válido con la postura del ADN", () => {
    const adn = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    const g = gestoDeHabla(adn, "Hola, ¿qué tal?", estado("alegria", 0.6, 0.6));
    expect(g.prompt).toContain("posture");
    expect(g.energia).toBeGreaterThanOrEqual(0);
    expect(g.energia).toBeLessThanOrEqual(1);
    expect(g.duracionMs).toBeGreaterThanOrEqual(400);
  });

  it("más energía en el ADN produce un gesto con más energía", () => {
    const flojo = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    flojo.movimiento = { energia: 0.1, amplitud: 0.1, ritmo: 0.5, postura: 0.5 };
    const fuerte = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    fuerte.movimiento = { energia: 1, amplitud: 1, ritmo: 0.5, postura: 0.5 };
    const e = estado("alegria", 0.5, 0.5);
    expect(gestoDeHabla(fuerte, "hola", e).energia).toBeGreaterThan(gestoDeHabla(flojo, "hola", e).energia ?? 0);
  });

  it("más ritmo en el ADN acorta la duración del gesto", () => {
    const lento = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    lento.movimiento = { energia: 0.5, amplitud: 0.5, ritmo: 0, postura: 0.5 };
    const rapido = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    rapido.movimiento = { energia: 0.5, amplitud: 0.5, ritmo: 1, postura: 0.5 };
    const e = estado("calma", 0.2, 0.4);
    expect(gestoDeHabla(rapido, "una frase de prueba", e).duracionMs).toBeLessThan(
      gestoDeHabla(lento, "una frase de prueba", e).duracionMs ?? 0,
    );
  });
});
