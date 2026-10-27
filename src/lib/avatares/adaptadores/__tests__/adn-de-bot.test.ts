import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import {
  adnConEmocion, adnDeBot, adnDeBotPorDefecto, expresionesDeEmocion, gestoDeHabla,
  intensidadAuraDeEmocion, resolverAdnDeBot, usaAdnDeBot, visemasDeTexto,
} from "@/lib/avatares/adaptadores/adn-de-bot";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

const bot = (parche: Partial<Bot> = {}): Bot => ({
  id: "bot-1", nombre: "Astraura", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-1", tono: 200, escala: 1 },
  sentidosHabilitados: [], activo: true, ...parche,
});

const guardado = (dueno: AdnAvatar["dueno"] = { tipo: "bot", id: "bot-1" }): AdnAvatar => ({
  ...adnPorDefecto("adn-1", "Avatar de prueba", dueno, 40),
  base: { tipo: "vrm", ref: "biblioteca:avatares/plantillas/arla.vrm" },
  esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
});

const estado = (valencia: number, activacion: number, emocion: EstadoEmocional["emocion"] = "calma"): EstadoEmocional =>
  ({ emocion, valencia, activacion });

describe("adnDeBot", () => {
  it("crea la orbe con el tono y el dueño del bot cuando no hay referencia", async () => {
    const a = await adnDeBot(bot({ cuerpo: { forma: "avatar-3d", tono: 123, escala: 1 } }));
    expect([a.base.tipo, a.aura.tono, a.dueno.tipo, a.dueno.id]).toEqual(["orbe", 123, "bot", "bot-1"]);
    expect(a.id).toBe("adn-bot-bot-1");
  });

  it("carga el ADN guardado del bot y conserva su id y su malla", async () => {
    const a = await adnDeBot(bot(), { cargar: async () => guardado() });
    expect([a.id, a.base.tipo]).toEqual(["adn-1", "vrm"]);
    expect((await resolverAdnDeBot(bot(), async () => guardado())).origen).toBe("guardado");
  });

  it("no usa el ADN de otro dueño y lo dice", async () => {
    const r = await resolverAdnDeBot(bot(), { cargar: async () => guardado({ tipo: "perfil", id: "p1" }) });
    expect([r.origen, r.adn.dueno.tipo]).toEqual(["por-defecto", "bot"]);
    expect(r.motivo).toContain("otro dueño");
  });

  it("si la referencia no existe, cae a la orbe y conserva el id de la referencia", async () => {
    const r = await resolverAdnDeBot(bot(), { cargar: async () => null });
    expect([r.origen, r.adn.id, r.adn.base.tipo]).toEqual(["por-defecto", "adn-1", "orbe"]);
    expect(r.motivo).toContain("No se encontró");
  });

  it("rechaza una URL externa suelta", async () => {
    const r = await resolverAdnDeBot(bot({ cuerpo: { forma: "vrm", avatarRef: "https://ejemplo.com/a.vrm", tono: 0, escala: 1 } }));
    expect(r.adn.base.tipo).toBe("orbe");
    expect(r.motivo).toContain("no es interna");
  });

  it("solo avatar-3d y vrm usan ADN; el ADN por defecto es estable", () => {
    expect(usaAdnDeBot(bot())).toBe(true);
    expect(usaAdnDeBot(bot({ cuerpo: { forma: "orbe", tono: 0, escala: 1 } }))).toBe(false);
    expect(adnDeBotPorDefecto(bot())).toEqual(adnDeBotPorDefecto(bot()));
  });
});

describe("emoción → expresiones", () => {
  it("valencia alta sonríe; valencia baja y poca activación entristece", () => {
    expect(expresionesDeEmocion(estado(0.9, 0.4)).happy).toBeGreaterThan(0.5);
    const triste = expresionesDeEmocion(estado(-0.8, 0.2));
    expect(triste.sad).toBeGreaterThan(0.3);
    expect(triste.angry ?? 0).toBe(0);
  });

  it("valencia baja con activación alta enfada; activación alta sin valencia asombra", () => {
    expect(expresionesDeEmocion(estado(-0.8, 0.9)).angry).toBeGreaterThan(0.2);
    expect(expresionesDeEmocion(estado(0, 0.95)).surprised).toBeGreaterThan(0.5);
  });

  it("la emoción nombrada matiza y todo queda en [0, 1]", () => {
    const r = expresionesDeEmocion(estado(0, 0.5, "ternura"));
    expect(r.relaxed).toBeGreaterThan(0);
    for (const v of Object.values(r)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("el aura sigue a la emoción solo si está ligada", () => {
    const a = { ...adnPorDefecto("a", "A", { tipo: "bot", id: "bot-1" }, 200), aura: { tono: 200, intensidad: 0.4, ligadaEmocion: true } };
    expect(intensidadAuraDeEmocion(a, estado(0.8, 0.9))).toBeGreaterThan(intensidadAuraDeEmocion(a, estado(0.8, 0.1)));
    expect(intensidadAuraDeEmocion({ ...a, aura: { ...a.aura, ligadaEmocion: false } }, estado(1, 1))).toBe(0.4);
    expect(intensidadAuraDeEmocion(a, estado(-1, 1))).toBeLessThanOrEqual(1);
  });

  it("adnConEmocion deja expresiones y visema listos para el visor", () => {
    const a = adnPorDefecto("a", "A", { tipo: "bot", id: "bot-1" }, 200);
    const feliz = adnConEmocion(a, estado(0.9, 0.6));
    expect(feliz.expresionBase.happy).toBeGreaterThan(0);
    expect(feliz.expresionBase.sad).toBe(0);
    const hablando = adnConEmocion(a, estado(0, 0.5), "aa");
    expect([hablando.expresionBase.aa, hablando.expresionBase.oh]).toEqual([0.8, 0]);
    expect(adnConEmocion(a, estado(0, 0.5), null).expresionBase.aa).toBe(0);
  });
});

describe("habla: visemas y gesto", () => {
  it("mapea las vocales de «Hola, mundo» a visemas contiguos", () => {
    const e = visemasDeTexto("Hola, mundo");
    expect(e.map((x) => x.visema)).toEqual(["oh", "aa", "ou", "oh"]);
    expect(e[0].desdeMs).toBe(0);
    expect(e[1].desdeMs).toBe(e[0].hastaMs);
    expect(e[e.length - 1].hastaMs).toBeGreaterThan(0);
  });

  it("sin texto o sin vocales no inventa visemas", () => {
    expect(visemasDeTexto("")).toEqual([]);
    expect(visemasDeTexto("mmm")).toEqual([]);
  });

  it("el gesto respeta el carácter de movimiento del ADN", () => {
    const a = { ...adnPorDefecto("a", "A", { tipo: "bot", id: "bot-1" }), movimiento: { energia: 0.9, amplitud: 0.9, ritmo: 0.1, postura: 0.9 } };
    const g = gestoDeHabla(a, estado(0.5, 0.8), "Hola, ¿qué tal?");
    expect(g.prompt).toContain("broad gestures");
    expect(g.prompt).toContain("slow tempo");
    expect(g.energia).toBeGreaterThan(0.5);
    expect(g.energia).toBeLessThanOrEqual(1);
  });
});
