import { describe, expect, it } from "vitest";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import {
  adnDeBot, aplicarEmocion, expresionDeEmocion, expresionesDeEmocion,
  gestoDeHabla, idAdnDeBot, intensidadAura, refAdnDeBot, visemaEn, visemasDeTexto,
} from "../adn-de-bot";

function bot(parcial: Partial<Bot> = {}): Bot {
  return {
    id: "astraura:perfil-1",
    nombre: "Astraura",
    dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: { calidez: 0.7, energia: 0.5, formalidad: 0.4, curiosidad: 0.6, humor: 0.3, concision: 0.5 },
    cuerpo: { forma: "avatar-3d", tono: 200, escala: 1 },
    sentidosHabilitados: ["red"],
    activo: true,
    ...parcial,
  };
}

function adnDe(b: Bot, nombre = "Guardado"): AdnAvatar {
  return { ...adnPorDefecto(`adn-guardado-${b.id}`, nombre, { tipo: "bot", id: b.id }, 120), base: { tipo: "vrm", ref: "biblioteca:avatares/ana.vrm" }, esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 } };
}

function emocion(valencia: number, activacion: number): EstadoEmocional {
  return { emocion: "calma", valencia, activacion };
}

describe("adnDeBot", () => {
  it("crea el ADN por defecto con el tono de la orbe y dueño bot", () => {
    const r = adnDeBot(bot());
    expect(r.aplica).toBe(true);
    expect(r.origen).toBe("por-defecto");
    expect(r.adn.dueno).toEqual({ tipo: "bot", id: "astraura:perfil-1" });
    expect(r.adn.aura.tono).toBe(200);
    expect(r.adn.base.tipo).toBe("orbe");
  });
  it("carga el ADN guardado cuando es del mismo bot", () => {
    const b = bot({ cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-guardado-x", tono: 200, escala: 1 } });
    const guardado = adnDe(b);
    const r = adnDeBot(b, () => guardado);
    expect(r.origen).toBe("guardado");
    expect(r.adn.nombre).toBe("Guardado");
    expect(r.adn.base.tipo).toBe("vrm");
  });
  it("no usa el ADN guardado de otro dueño ni una referencia externa", () => {
    const b = bot({ cuerpo: { forma: "vrm", avatarRef: "biblioteca:adn-ajeno", tono: 30, escala: 1 } });
    const ajeno: AdnAvatar = { ...adnDe(b), dueno: { tipo: "perfil", id: "otro" } };
    const r = adnDeBot(b, () => ajeno);
    expect(r.origen).toBe("por-defecto");
    expect(r.aviso).toContain("otro dueño");
    const externo = bot({ cuerpo: { forma: "vrm", avatarRef: "https://malo.example/a.vrm", tono: 30, escala: 1 } });
    expect(adnDeBot(externo).aviso).toContain("interna");
  });
  it("dice con su motivo que no hay ADN guardado", () => {
    const b = bot({ cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-inexistente", tono: 200, escala: 1 } });
    const r = adnDeBot(b, () => null);
    expect(r.origen).toBe("por-defecto");
    expect(r.aviso).toContain("No hay un ADN");
  });
  it("no aplica a una orbe normal y la ref solo vale para formas 3D internas", () => {
    const orbe = bot({ cuerpo: { forma: "orbe", tono: 200, escala: 1 } });
    expect(adnDeBot(orbe).aplica).toBe(false);
    expect(refAdnDeBot(orbe)).toBeNull();
    expect(refAdnDeBot(bot({ cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-1", tono: 200, escala: 1 } }))).toBe("biblioteca:adn-1");
    expect(refAdnDeBot(bot({ cuerpo: { forma: "avatar-3d", avatarRef: "genesis:adn-1", tono: 200, escala: 1 } }))).toBeNull();
  });
  it("el id por defecto es estable y cabe en el ADN", () => {
    expect(idAdnDeBot("astraura:perfil-1")).toBe(idAdnDeBot("astraura:perfil-1"));
    expect(idAdnDeBot("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("emoción → expresiones y aura", () => {
  it.each([
    [0.8, 0.9, "happy"], [-0.8, 0.8, "angry"], [-0.8, 0.1, "sad"],
    [0.8, 0.1, "relaxed"], [0, 0.95, "surprised"], [0, 0.2, "relaxed"],
  ] as const)("valencia %s y activación %s → %s", (v, a, esperada) => {
    expect(expresionDeEmocion(emocion(v, a))).toBe(esperada);
  });
  it("acota valores imposibles sin romperse", () => {
    expect(expresionDeEmocion({ valencia: Number.NaN, activacion: Number.POSITIVE_INFINITY })).toBe("relaxed");
    const x = expresionesDeEmocion(emocion(9, -4));
    expect(Object.keys(x)).toHaveLength(1);
    expect(Object.values(x)[0]).toBeGreaterThanOrEqual(0.35);
  });
  it("el aura sigue la activación solo si está ligada a la emoción", () => {
    const a = adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200);
    expect(intensidadAura(a, emocion(0.5, 0.1))).toBeLessThan(intensidadAura(a, emocion(0.5, 0.9)));
    const fija: AdnAvatar = { ...a, aura: { ...a.aura, ligadaEmocion: false, intensidad: 0.4 } };
    expect(intensidadAura(fija, emocion(0.5, 0.9))).toBe(0.4);
  });
  it("aplicarEmocion limpia la emoción anterior y no toca la revisión", () => {
    const base: AdnAvatar = { ...adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200), rev: 7, expresionBase: { happy: 1, blink: 0.5 } };
    const r = aplicarEmocion(base, emocion(-0.8, 0.1));
    expect(r.expresionBase.happy).toBeUndefined();
    expect(r.expresionBase.sad).toBeGreaterThan(0);
    expect(r.expresionBase.blink).toBe(0.5);
    expect(r.rev).toBe(7);
    expect(base.expresionBase.sad).toBeUndefined();
  });
});

describe("habla → gesto y visemas", () => {
  it("el gesto respeta el carácter del movimiento del ADN", () => {
    const a: AdnAvatar = { ...adnPorDefecto("a", "A", { tipo: "bot", id: "b" }, 200), movimiento: { energia: 0.9, amplitud: 0.9, ritmo: 0.9, postura: 0.1 } };
    const g = gestoDeHabla("Hola, ¿cómo estás?", a, emocion(0.5, 0.7));
    expect(g.energia).toBe(0.9);
    expect(g.prompt).toContain("wide amplitude");
    expect(g.prompt).toContain("quick rhythm");
    expect(g.prompt).toContain("relaxed posture");
    expect(g.duracionMs).toBeGreaterThan(0);
  });
  it("los visemas salen de las vocales y caben en la duración de la voz", () => {
    const v = visemasDeTexto("Hola, ¿qué tal?", 1000);
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.finMs > x.inicioMs)).toBe(true);
    expect(v[v.length - 1].finMs).toBe(1000);
    expect(visemasDeTexto("")).toEqual([]);
  });
  it("visemaEn devuelve el activo y null fuera de rango", () => {
    const v = visemasDeTexto("hola", 400);
    expect(visemaEn(v, 0)?.expresion).toBe(v[0].expresion);
    expect(visemaEn(v, 400)).toBeNull();
  });
});
