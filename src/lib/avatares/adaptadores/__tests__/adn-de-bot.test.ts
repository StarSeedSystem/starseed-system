import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import { adnConEmocion, adnDeBot, adnPorDefectoDeBot, expresionesDeEmocion, gestoDeBot, idAdnDeBot, intensidadAuraDeEmocion, usaAvatar3d } from "@/lib/avatares/adaptadores/adn-de-bot";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

const bot = (forma: Bot["cuerpo"]["forma"] = "avatar-3d", avatarRef?: string): Bot => ({
  id: "bot-1", nombre: "Astraura del grupo", origen: "astraura", gobierno: "jerarquico",
  dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma, tono: 210, escala: 1, ...(avatarRef ? { avatarRef } : {}) },
  sentidosHabilitados: [], activo: true,
});

const guardado = (duenoId = "bot-1"): AdnAvatar => ({
  ...adnPorDefecto("adn-guardado", "Guardado", { tipo: "bot", id: duenoId }, 120),
  base: { tipo: "vrm", ref: "biblioteca:avatares/uno.vrm" }, rev: 4,
});

describe("adnDeBot", () => {
  it("sin referencia crea el ADN de la orbe con el tono y el dueño del bot", async () => {
    const b = bot("avatar-3d");
    const adn = await adnDeBot(b);
    expect(adn.base.tipo).toBe("orbe");
    expect(adn.dueno).toEqual({ tipo: "bot", id: "bot-1" });
    expect(adn.aura.tono).toBe(210);
    expect(adn.id).toBe(idAdnDeBot(b));
    await expect(adnDeBot(b)).resolves.toEqual(adnPorDefectoDeBot(b));
  });

  it("carga una sola vez el ADN guardado bajo su referencia interna", async () => {
    const b = bot("vrm", "biblioteca:adn-1");
    const refs: string[] = [];
    const adn = await adnDeBot(b, async (ref) => { refs.push(ref); return guardado(); });
    expect(refs).toEqual(["biblioteca:adn-1"]);
    expect(adn.id).toBe("adn-guardado");
    expect(adn.rev).toBe(4);
  });

  it("nunca carga una URL externa ni un ADN que no pasa sanearAdn", async () => {
    let llamado = false;
    const externo = await adnDeBot(bot("avatar-3d", "https://ejemplo.test/a.vrm"), async () => { llamado = true; return guardado(); });
    expect(llamado).toBe(false);
    expect(externo.base.tipo).toBe("orbe");
    const roto = await adnDeBot(bot("vrm", "biblioteca:adn-1"), async () => ({ ...guardado(), v: 99 } as unknown as AdnAvatar));
    expect(roto.base.tipo).toBe("orbe");
    const caido = await adnDeBot(bot("vrm", "biblioteca:adn-1"), async () => { throw new Error("sin almacén"); });
    expect(caido.base.tipo).toBe("orbe");
  });

  it("no toca la Biblioteca si la forma del cuerpo no es 3D", async () => {
    let llamado = false;
    await adnDeBot(bot("orbe", "biblioteca:adn-1"), async () => { llamado = true; return guardado(); });
    expect(llamado).toBe(false);
    expect(usaAvatar3d(bot("orbe"))).toBe(false);
    expect(usaAvatar3d(bot("vrm"))).toBe(true);
  });
});

const emocion = (valencia: number, activacion: number, nombre: EstadoEmocional["emocion"] = "calma"): EstadoEmocional =>
  ({ emocion: nombre, valencia, activacion });

describe("emoción → expresiones y aura", () => {
  it("la valencia positiva ilumina la sonrisa y la negativa baja la mirada", () => {
    const alegre = expresionesDeEmocion(emocion(0.9, 0.9, "alegria"));
    expect(alegre.happy ?? 0).toBeGreaterThan(0.8);
    expect(alegre.angry ?? 0).toBe(0);
    const triste = expresionesDeEmocion(emocion(-0.9, 0.1, "preocupacion"));
    expect(triste.sad ?? 0).toBeGreaterThan(0.5);
    expect(triste.angry ?? 0).toBe(0);
  });

  it("la activación alta con malestar enciende el enfado; con calma no", () => {
    expect(expresionesDeEmocion(emocion(-0.4, 0.95, "preocupacion")).angry ?? 0).toBeGreaterThan(0.3);
    expect(expresionesDeEmocion(emocion(-0.4, 0.2, "preocupacion")).angry ?? 0).toBe(0);
  });

  it("el reposo relaja, la sorpresa asombra y la calma no inventa enfado", () => {
    expect(expresionesDeEmocion(emocion(0.1, 0.05, "calma")).relaxed ?? 0).toBeGreaterThan(0.6);
    expect(expresionesDeEmocion(emocion(0, 0.95, "concentracion")).surprised ?? 0).toBeGreaterThan(0.2);
    expect(expresionesDeEmocion(emocion(0, 0.3, "calma")).angry ?? 0).toBe(0);
  });

  it("aplica las expresiones al ADN y modula el aura solo si está ligada", () => {
    const adn = { ...adnPorDefecto("adn-1", "Bot", { tipo: "bot", id: "bot-1" }), aura: { tono: 200, intensidad: 0.6, ligadaEmocion: true } };
    const conAlegria = adnConEmocion(adn, emocion(0.9, 0.9, "alegria"));
    expect(conAlegria.expresionBase.happy ?? 0).toBeGreaterThan(0.8);
    expect(conAlegria.expresionBase.sad).toBe(0);
    expect(intensidadAuraDeEmocion(adn, emocion(0.9, 0.9))).toBeGreaterThan(adn.aura.intensidad);
    const suelta = { ...adn, aura: { ...adn.aura, ligadaEmocion: false } };
    expect(intensidadAuraDeEmocion(suelta, emocion(0.9, 0.9))).toBe(0.6);
  });
});

describe("gesto de habla", () => {
  it("sin texto no hay gesto y con texto respeta el movimiento del ADN", () => {
    const adn = { ...adnPorDefecto("adn-1", "Bot", { tipo: "bot", id: "bot-1" }), movimiento: { energia: 0.8, amplitud: 0.7, ritmo: 0.6, postura: 0.4 } };
    expect(gestoDeBot(adn, emocion(0.5, 0.5), "   ")).toBeNull();
    const g = gestoDeBot(adn, emocion(0.5, 0.5), "Hola, te cuento una cosa");
    expect(g).not.toBeNull();
    expect(g?.energia ?? 0).toBeGreaterThan(0.5);
    expect(g?.prompt ?? "").toContain("amplitude 0.70");
  });
});
