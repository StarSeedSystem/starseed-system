import { describe, expect, it } from "vitest";
import { adnPorDefecto, sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";
import {
  adnConEmocion,
  adnConVisema,
  adnDeBot,
  auraDeEmocion,
  esFormaAvatar3d,
  expresionesDeEmocion,
  gestoDeBot,
  refAdnDeBot,
  visemasDeTexto,
} from "../adn-de-bot";

/** Bot mínimo con cuerpo 3D; cada prueba cambia solo lo que necesita. */
function bot(over: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    nombre: "Astraura",
    dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "avatar-3d", avatarRef: "biblioteca:adn-1", tono: 210, escala: 1 },
    sentidosHabilitados: [],
    activo: true,
    ...over,
  };
}

const estado = (over: Partial<EstadoEmocional> = {}): EstadoEmocional => ({
  emocion: "calma",
  valencia: 0.2,
  activacion: 0.3,
  ...over,
});

const adnGuardado = (over: Partial<AdnAvatar> = {}): AdnAvatar =>
  sanearAdn({
    ...adnPorDefecto("adn-1", "Astraura 3D", { tipo: "bot", id: "bot-1" }, 300),
    base: { tipo: "vrm", ref: "biblioteca:vrm-1" },
    esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
    ...over,
  })!;

describe("adnDeBot", () => {
  it("reconoce solo las formas con cuerpo 3D", () => {
    expect(esFormaAvatar3d("avatar-3d")).toBe(true);
    expect(esFormaAvatar3d("vrm")).toBe(true);
    expect(esFormaAvatar3d("orbe")).toBe(false);
    expect(esFormaAvatar3d("ser-genesis")).toBe(false);
  });

  it("solo acepta la referencia interna biblioteca: del ADN", () => {
    expect(refAdnDeBot(bot())).toBe("biblioteca:adn-1");
    expect(refAdnDeBot(bot({ cuerpo: { forma: "avatar-3d", avatarRef: "https://otro.sitio/x.vrm", tono: 0, escala: 1 } }))).toBeNull();
    expect(refAdnDeBot(bot({ cuerpo: { forma: "orbe", avatarRef: "biblioteca:adn-1", tono: 0, escala: 1 } }))).toBeNull();
  });

  it("crea el ADN por defecto con el tono de la orbe y dueño bot", () => {
    const adn = adnDeBot(bot());
    expect(adn.id).toBe("adn-1");
    expect(adn.dueno).toEqual({ tipo: "bot", id: "bot-1" });
    expect(adn.aura.tono).toBe(210);
    expect(adn.aura.ligadaEmocion).toBe(true);
    expect(adn.nombre).toBe("Astraura");
    expect(adn.visibilidad).toBe("privado");
  });

  it("carga el ADN guardado cuando es del mismo bot y de la misma referencia", () => {
    const guardado = adnGuardado();
    const adn = adnDeBot(bot(), guardado);
    expect(adn.base).toEqual({ tipo: "vrm", ref: "biblioteca:vrm-1" });
    expect(adn.id).toBe("adn-1");
    expect(adn.rev).toBe(guardado.rev);
  });

  it("no pisa el ADN de otro dueño ni de otra referencia: crea el de por defecto", () => {
    const ajeno = adnGuardado({ dueno: { tipo: "bot", id: "bot-2" } });
    expect(adnDeBot(bot(), ajeno).dueno).toEqual({ tipo: "bot", id: "bot-1" });
    const otraRef = adnGuardado({ id: "adn-2" });
    expect(adnDeBot(bot(), otraRef).id).toBe("adn-1");
  });

  it("acepta un cargador puro y nunca guarda una URL externa suelta", () => {
    const cargado = adnDeBot(bot(), (ref: string) => (ref === "biblioteca:adn-1" ? adnGuardado() : null));
    expect(cargado.base.tipo).toBe("vrm");
    const raro = bot({ cuerpo: { forma: "vrm", avatarRef: "https://mal.example/x.vrm", tono: 20, escala: 1 } });
    const adn = adnDeBot(raro, () => ({ base: { tipo: "vrm", ref: "https://mal.example/x.vrm" } }));
    expect(JSON.stringify(adn)).not.toContain("https://mal.example");
  });
});

describe("emoción → expresiones y aura", () => {
  it("la valencia y la activación eligen una expresión coherente", () => {
    const feliz = expresionesDeEmocion(estado({ emocion: "alegria", valencia: 0.9, activacion: 0.8 }));
    expect(feliz.happy).toBeGreaterThan(0.5);
    const triste = expresionesDeEmocion(estado({ emocion: "preocupacion", valencia: -0.8, activacion: 0.2 }));
    expect(triste.sad).toBeGreaterThan(0.5);
    const enfadado = expresionesDeEmocion(estado({ emocion: "concentracion", valencia: -0.8, activacion: 0.9 }));
    expect(enfadado.angry).toBeGreaterThan(0.5);
    const asombrado = expresionesDeEmocion(estado({ emocion: "asombro", valencia: 0.2, activacion: 0.95 }));
    expect(asombrado.surprised).toBeGreaterThan(0.5);
    const relajado = expresionesDeEmocion(estado({ emocion: "calma", valencia: 0.1, activacion: 0.1 }));
    expect(relajado.relaxed).toBeGreaterThan(0.5);
  });

  it("acota la intensidad de cada expresión a 0…1", () => {
    for (const e of [
      estado({ valencia: 5, activacion: 5 }),
      estado({ valencia: -5, activacion: -5 }),
      estado({ valencia: Number.NaN, activacion: Number.POSITIVE_INFINITY }),
    ]) {
      const r = expresionesDeEmocion(e);
      for (const v of Object.values(r)) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(r)) expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("el aura solo cambia si está ligada a la emoción", () => {
    const ligada = adnGuardado({ aura: { tono: 120, intensidad: 0.6, ligadaEmocion: true } });
    expect(auraDeEmocion(ligada, estado({ valencia: 1, activacion: 1 }))).toBeGreaterThan(0.6);
    expect(auraDeEmocion(ligada, estado({ valencia: -1, activacion: 0 }))).toBeLessThan(0.6);
    const suelta = adnGuardado({ aura: { tono: 120, intensidad: 0.35, ligadaEmocion: false } });
    expect(auraDeEmocion(suelta, estado({ valencia: 1, activacion: 1 }))).toBe(0.35);
  });

  it("adnConEmocion no muta el original y deja una sola expresión emocional", () => {
    const adn = adnGuardado({ expresionBase: { happy: 0.7, blink: 0.2, aa: 0.4 } });
    const antes = JSON.stringify(adn);
    const r = adnConEmocion(adn, estado({ emocion: "preocupacion", valencia: -0.7, activacion: 0.2 }));
    expect(JSON.stringify(adn)).toBe(antes);
    expect(r.rev).toBe(adn.rev);
    expect(r.expresionBase.sad).toBeGreaterThan(0);
    expect(r.expresionBase.happy).toBe(0);
    expect(r.expresionBase.blink).toBe(0.2);
    expect(r.expresionBase.aa).toBe(0.4);
  });
});

describe("voz → visemas y gesto", () => {
  it("traduce las vocales del español a visemas VRM 1.0", () => {
    expect(visemasDeTexto("hola")).toEqual(["oh", "aa"]);
    expect(visemasDeTexto("miau")).toEqual(["ih", "aa", "ou"]);
    expect(visemasDeTexto("e")).toEqual(["ee"]);
    expect(visemasDeTexto("rrr")).toEqual([]);
    expect(visemasDeTexto("")).toEqual([]);
  });

  it("pone el visema sin borrar las expresiones de la emoción", () => {
    const adn = adnConEmocion(adnGuardado(), estado({ emocion: "alegria", valencia: 0.8, activacion: 0.7 }));
    const hablando = adnConVisema(adn, "aa", 0.9);
    expect(hablando.expresionBase.aa).toBe(0.9);
    expect(hablando.expresionBase.happy).toBeGreaterThan(0);
    expect(hablando.rev).toBe(adn.rev);
  });

  it("el gesto respeta el carácter del movimiento del ADN", () => {
    const lento = adnGuardado({ movimiento: { energia: 0.1, amplitud: 0.2, ritmo: 0.2, postura: 0.5 } });
    const vivo = adnGuardado({ movimiento: { energia: 1, amplitud: 1, ritmo: 1, postura: 0.5 } });
    const gestoLento = gestoDeBot(lento, "Hola, esto es una prueba.", estado({ emocion: "alegria" }));
    const gestoVivo = gestoDeBot(vivo, "Hola, esto es una prueba.", estado({ emocion: "alegria" }));
    expect(gestoVivo.prompt).toContain("with");
    expect(gestoVivo.energia ?? 0).toBeGreaterThan(gestoLento.energia ?? 0);
    expect(gestoVivo.duracionMs ?? 0).toBeGreaterThan(gestoLento.duracionMs ?? 0);
  });
});
