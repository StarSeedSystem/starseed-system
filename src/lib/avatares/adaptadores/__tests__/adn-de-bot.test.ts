import { describe, expect, it } from "vitest";
import {
  adnConEmocion,
  adnDeBot,
  esFormaAvatar3d,
  expresionesDeEmocion,
  EXPRESIONES_EMOCION,
  gestoConMovimiento,
  intensidadAuraConEmocion,
  refAdnDeBot,
  visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";
import { adnPorDefecto } from "@/lib/avatares/adn/adn";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

const botDe = (sobres: Partial<Bot> = {}): Bot => ({
  id: "bot-1",
  nombre: "Semilla",
  dueno: { tipo: "perfil", id: "u1", cuentaId: "c1" },
  origen: "astraura",
  gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-bot-1", tono: 190, escala: 1 },
  sentidosHabilitados: ["pantalla"],
  activo: true,
  ...sobres,
});

const emo = (emocion: EstadoEmocional["emocion"], valencia: number, activacion: number): EstadoEmocional =>
  ({ emocion, valencia, activacion });

describe("adnDeBot: la referencia manda y el ADN por defecto conserva la orbe", () => {
  it("con forma 3D y una referencia interna usa ese id y el dueño «bot»", () => {
    const bot = botDe();
    expect(refAdnDeBot(bot)).toBe("biblioteca:adn-bot-1");
    const adn = adnDeBot(bot);
    expect(adn.id).toBe("adn-bot-1");
    expect(adn.dueno).toEqual({ tipo: "bot", id: "bot-1" });
    expect(adn.aura.tono).toBe(190);
    expect(adn.visibilidad).toBe("privado");
  });

  it("si el ADN guardado es válido y de este bot, se reutiliza tal cual", () => {
    const guardado = { ...adnPorDefecto("adn-bot-1", "Semilla", { tipo: "bot", id: "bot-1" }, 190), rev: 7 };
    expect(adnDeBot(botDe(), guardado).rev).toBe(7);
  });

  it("un ADN guardado de otro dueño no se cuela", () => {
    const ajeno = { ...adnPorDefecto("adn-bot-1", "Otra", { tipo: "perfil", id: "u2" }, 10), rev: 9 };
    expect(adnDeBot(botDe(), ajeno).rev).toBe(0);
  });

  it("una referencia externa no se acepta: cae al ADN por defecto", () => {
    const bot = botDe({ cuerpo: { forma: "vrm", avatarRef: "https://malo.com/a.vrm", tono: 40, escala: 1 } });
    expect(refAdnDeBot(bot)).toBeNull();
    expect(adnDeBot(bot).id).not.toContain("http");
    expect(adnDeBot(bot).aura.tono).toBe(40);
  });

  it("con forma «orbe» no hay referencia de ADN y el tono es el de la orbe", () => {
    const bot = botDe({ cuerpo: { forma: "orbe", tono: 300, escala: 1 } });
    expect(refAdnDeBot(bot)).toBeNull();
    expect(adnDeBot(bot).aura.tono).toBe(300);
  });
});

describe("emoción del bot → expresiones (happy/sad/angry/surprised/relaxed)", () => {
  it("la alegría con activación alta enciende «happy»", () => {
    const r = expresionesDeEmocion(emo("alegria", 0.8, 0.7));
    expect(r.expresion).toBe("happy");
    expect(r.expresiones.happy).toBeGreaterThan(0.5);
  });

  it("la preocupación con valencia baja enciende «sad»", () => {
    expect(expresionesDeEmocion(emo("preocupacion", -0.6, 0.2)).expresion).toBe("sad");
  });

  it("una valencia muy negativa con activación alta enciende «angry»", () => {
    expect(expresionesDeEmocion(emo("preocupacion", -0.8, 0.9)).expresion).toBe("angry");
  });

  it("el asombro enciende «surprised» y la calma enciende «relaxed»", () => {
    expect(expresionesDeEmocion(emo("asombro", 0, 0.5)).expresion).toBe("surprised");
    expect(expresionesDeEmocion(emo("calma", 0, 0.1)).expresion).toBe("relaxed");
  });

  it("la intensidad crece con la valencia y la activación, y queda entre 0 y 1", () => {
    const floja = expresionesDeEmocion(emo("calma", 0.1, 0.1)).intensidad;
    const fuerte = expresionesDeEmocion(emo("alegria", 0.9, 0.9)).intensidad;
    expect(fuerte).toBeGreaterThan(floja);
    expect(fuerte).toBeLessThanOrEqual(1);
    expect(floja).toBeGreaterThan(0);
  });

  it("adnConEmocion cambia solo la expresión emocional y respeta visemas y parpadeo", () => {
    const base = {
      ...adnPorDefecto("adn-bot-1", "Semilla", { tipo: "bot", id: "bot-1" }, 190),
      expresionBase: { happy: 0.9, sad: 0.4, aa: 0.5, blink: 0.2 },
    };
    const adn = adnConEmocion(base, emo("alegria", 0.8, 0.7));
    expect(adn.expresionBase.happy).toBeGreaterThan(0);
    expect(adn.expresionBase.sad).toBeUndefined();
    expect(adn.expresionBase.aa).toBe(0.5);
    expect(adn.expresionBase.blink).toBe(0.2);
  });

  it("el aura solo late con la emoción si está ligada a ella", () => {
    const ligada = { ...adnPorDefecto("a", "A", { tipo: "bot", id: "b" }), aura: { tono: 10, intensidad: 0.5, ligadaEmocion: true } };
    const suelta = { ...ligada, aura: { ...ligada.aura, ligadaEmocion: false } };
    expect(intensidadAuraConEmocion(ligada, emo("asombro", 0.8, 0.9))).toBeGreaterThan(0.5);
    expect(intensidadAuraConEmocion(suelta, emo("asombro", 0.8, 0.9))).toBe(0.5);
  });
});

describe("visemas y gesto con el carácter del ADN", () => {
  it("el texto produce visemas del repertorio VRM 1.0", () => {
    const visemas = visemasDeTexto("Hola, ¿qué tal estás?");
    expect(visemas.length).toBeGreaterThan(0);
    expect(visemas.length).toBeLessThanOrEqual(12);
    for (const v of visemas) expect(["aa", "ih", "ou", "ee", "oh"]).toContain(v);
  });

  it("sin texto no hay visemas", () => {
    expect(visemasDeTexto("")).toEqual([]);
  });

  it("el gesto respeta la energía y el ritmo del ADN del bot", () => {
    const gesto = { prompt: "friendly wave", energia: 0.2, duracionMs: 1000 };
    const rapido = gestoConMovimiento(gesto, { energia: 1, amplitud: 0.5, ritmo: 1, postura: 0.5 });
    const lento = gestoConMovimiento(gesto, { energia: 0, amplitud: 0.5, ritmo: 0, postura: 0.5 });
    expect(rapido.prompt).toBe("friendly wave");
    expect(rapido.energia).toBeGreaterThan(lento.energia ?? 0);
    expect(rapido.duracionMs!).toBeLessThan(lento.duracionMs!);
  });
});

// Casos rescatados de la rama archivada nube/41430071907 (AV1011C), adaptados a la API de hoy.
describe("casos rescatados (rama nube/41430071907)", () => {
  it("reconoce solo las formas con cuerpo 3D", () => {
    expect(esFormaAvatar3d("avatar-3d")).toBe(true);
    expect(esFormaAvatar3d("vrm")).toBe(true);
    expect(esFormaAvatar3d("orbe")).toBe(false);
    expect(esFormaAvatar3d("ser-genesis")).toBe(false);
  });

  it("el ADN por defecto conserva el nombre del bot y el aura ligada a la emoción", () => {
    const adn = adnDeBot(botDe());
    expect(adn.nombre).toBe("Semilla");
    expect(adn.aura.ligadaEmocion).toBe(true);
  });

  it("un ADN guardado de otra referencia (mismo dueño) no se cuela: crea el derivado del bot", () => {
    const otraRef = adnPorDefecto("adn-bot-2", "Semilla", { tipo: "bot", id: "bot-1" }, 190);
    const adn = adnDeBot(botDe(), otraRef);
    expect(adn.id).toBe("adn-bot-1");
    expect(adn.rev).toBe(0);
    expect(adn.dueno).toEqual({ tipo: "bot", id: "bot-1" });
  });

  it("acota la intensidad de cada expresión a 0…1 aunque la entrada se salga de rango", () => {
    for (const e of [
      emo("alegria", 5, 5),
      emo("calma", -5, -5),
      emo("asombro", Number.NaN, Number.POSITIVE_INFINITY),
    ]) {
      const r = expresionesDeEmocion(e);
      for (const v of Object.values(r.expresiones)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("adnConEmocion no muta el original, deja una sola expresión emocional y no sube la revisión", () => {
    const adn = {
      ...adnPorDefecto("adn-bot-1", "Semilla", { tipo: "bot", id: "bot-1" }, 190),
      expresionBase: { happy: 0.7, blink: 0.2, aa: 0.4 },
    };
    const antes = JSON.stringify(adn);
    const r = adnConEmocion(adn, emo("preocupacion", -0.7, 0.2));
    expect(JSON.stringify(adn)).toBe(antes);
    const emocionales = EXPRESIONES_EMOCION.filter((k) => (r.expresionBase[k] ?? 0) > 0);
    expect(emocionales).toEqual(["sad"]);
    expect(r.expresionBase.happy).toBeUndefined();
    expect(r.expresionBase.blink).toBe(0.2);
    expect(r.expresionBase.aa).toBe(0.4);
    expect(r.rev).toBe(adn.rev);
  });

  it("traduce las vocales del español al visema correspondiente, en orden y sin acentos", () => {
    expect(visemasDeTexto("hola")).toEqual(["oh", "aa"]);
    expect(visemasDeTexto("holá")).toEqual(["oh", "aa"]);
    expect(visemasDeTexto("miau")).toEqual(["ih", "aa", "ou"]);
    expect(visemasDeTexto("e")).toEqual(["ee"]);
    expect(visemasDeTexto("rrr")).toEqual([]);
    expect(visemasDeTexto("")).toEqual([]);
  });
});
