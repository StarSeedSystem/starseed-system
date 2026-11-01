import { describe, it, expect } from "vitest";
import {
  adnDeBot, adnConEmocion, expresionesPorEmocion, energiaParaGesto, visemasDeTexto,
} from "../adn-de-bot";
import { adnPorDefecto } from "@/lib/avatares/adn/adn";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

const bot = (cuerpo: Partial<Bot["cuerpo"]> = {}, id = "b1"): Bot => ({
  id,
  nombre: "Aurora del jardín",
  dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  origen: "astraura",
  gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "avatar-3d", tono: 140, escala: 1, ...cuerpo },
  sentidosHabilitados: [],
  activo: true,
});

const emo = (emocion: EstadoEmocional["emocion"], valencia: number, activacion: number): EstadoEmocional => ({
  emocion, valencia, activacion,
});

describe("adnDeBot", () => {
  it("crea el ADN por defecto con el tono de la orbe y dueño bot", () => {
    const adn = adnDeBot(bot({ avatarRef: "biblioteca:carpeta/aurora" }));
    expect(adn.dueno).toEqual({ tipo: "bot", id: "b1" });
    expect(adn.id).toBe("carpeta/aurora");
    expect(adn.aura.tono).toBe(140);
    expect(adn.base.tipo).toBe("orbe");
    expect(adn.rev).toBe(0);
  });

  it("usa el ADN guardado del mismo bot y la misma referencia", () => {
    const guardado = {
      ...adnPorDefecto("carpeta/aurora", "Vieja", { tipo: "bot", id: "b1" }, 300),
      base: { tipo: "vrm" as const, ref: "biblioteca:avatares/aurora.vrm" },
      rev: 4,
    };
    const adn = adnDeBot(bot({ avatarRef: "biblioteca:carpeta/aurora" }), guardado);
    expect(adn.rev).toBe(4);
    expect(adn.base).toEqual({ tipo: "vrm", ref: "biblioteca:avatares/aurora.vrm" });
    expect(adn.aura.tono).toBe(300);
  });

  it("no usa un ADN guardado de otro dueño ni de otra referencia", () => {
    const ajeno = { ...adnPorDefecto("otro", "Ajena", { tipo: "perfil", id: "p2" }, 20), rev: 2 };
    const adn = adnDeBot(bot({ avatarRef: "biblioteca:carpeta/aurora" }), ajeno);
    expect(adn.dueno).toEqual({ tipo: "bot", id: "b1" });
    expect(adn.id).toBe("carpeta/aurora");
    expect(adn.rev).toBe(0);
  });

  it("una referencia externa no entra: queda un id seguro y la orbe", () => {
    const adn = adnDeBot(bot({ forma: "vrm", avatarRef: "https://ejemplo.com/avatar.vrm" }));
    expect(adn.base.tipo).toBe("orbe");
    expect(adn.id).toBe("bot-b1");
    expect(adn.dueno).toEqual({ tipo: "bot", id: "b1" });
  });
});

describe("emoción → expresiones", () => {
  it("la alegría con valencia y activación altas mueve happy", () => {
    const p = expresionesPorEmocion(emo("alegria", 0.8, 0.85));
    expect(p.happy).toBeGreaterThan(0.5);
    expect(p.happy).toBeGreaterThan(p.sad ?? 0);
  });

  it("la preocupación con activación alta enciende sad y angry", () => {
    const p = expresionesPorEmocion(emo("preocupacion", -0.7, 0.8));
    expect(p.sad).toBeGreaterThan(0);
    expect(p.angry).toBeGreaterThan(0);
    expect(p.happy ?? 0).toBe(0);
  });

  it("la preocupación con activación baja deja mandar a sad", () => {
    const p = expresionesPorEmocion(emo("preocupacion", -0.6, 0.1));
    expect(p.sad ?? 0).toBeGreaterThan(p.angry ?? 0);
  });

  it("el asombro manda surprised", () => {
    const p = expresionesPorEmocion(emo("asombro", 0.3, 0.9));
    expect(p.surprised ?? 0).toBeGreaterThan(p.happy ?? 0);
  });

  it("la calma baja la activación y deja relaxed", () => {
    const p = expresionesPorEmocion(emo("calma", 0.1, 0.2));
    expect(p.relaxed ?? 0).toBeGreaterThan(0.4);
    expect(p.surprised).toBeUndefined();
  });
});

describe("adnConEmocion", () => {
  const base = adnPorDefecto("a", "Avatar", { tipo: "bot", id: "b1" }, 200);

  it("no muta el ADN de entrada y estampa las expresiones", () => {
    const activo = adnConEmocion(base, emo("alegria", 0.8, 0.9));
    expect(base.expresionBase).toEqual({});
    expect(activo.expresionBase.happy).toBeGreaterThan(0.5);
  });

  it("modula la intensidad del aura solo si está ligada a la emoción", () => {
    const quieto = adnConEmocion(base, emo("calma", 0.2, 0.1));
    const activo = adnConEmocion(base, emo("alegria", 0.8, 0.9));
    expect(activo.aura.intensidad).toBeGreaterThan(quieto.aura.intensidad);
    const suelto = { ...base, aura: { ...base.aura, ligadaEmocion: false, intensidad: 0.42 } };
    expect(adnConEmocion(suelto, emo("alegria", 0.9, 0.9)).aura.intensidad).toBe(0.42);
  });
});

describe("voz del bot", () => {
  it("reparte visemas por las vocales del texto", () => {
    expect(visemasDeTexto("hola")).toEqual({ oh: 0.5, aa: 0.5 });
    expect(visemasDeTexto("ritmo")).toEqual({ ih: 0.5, oh: 0.5 });
    expect(visemasDeTexto("")).toEqual({});
  });

  it("convierte el carácter del movimiento en energía del gesto", () => {
    const adn = { ...adnPorDefecto("a", "Avatar", { tipo: "bot", id: "b1" }), movimiento: { energia: 0.8, amplitud: 0.4, ritmo: 0.5, postura: 0.5 } };
    expect(energiaParaGesto(adn)).toBeCloseTo(0.6, 5);
  });
});
