/**
 * Pruebas del perfil de voz de cada bot (VZR1011E).
 * Solo funciones puras: nada de red, disco ni mocks de módulos de Node.
 */
import { describe, expect, it } from "vitest";
import { EMOCIONES } from "../tipos";
import type { VozBot } from "../voz-bot";
import {
  ESTILOS_OPENVOICE,
  MOTORES_VOZ,
  adaptarVozANeurona,
  deserializarVozBot,
  fusionarVozBot,
  huellaVoz,
  normalizarVozBot,
  semillaDeBot,
  serializarVozBot,
  timbreUsableDe,
  vozBotDefecto,
} from "../voz-bot";

describe("perfil de voz de un bot", () => {
  it("las emociones del mapa son las del bot y los estilos son los del Space", () => {
    expect(MOTORES_VOZ).toContain("chatterbox");
    expect(ESTILOS_OPENVOICE).toContain("es_default");
    const v = vozBotDefecto("bot-1", 1750000000000);
    expect(Object.keys(v.emociones).sort()).toEqual([...EMOCIONES].sort());
    for (const e of EMOCIONES) {
      expect(v.emociones[e].exageracion).toBeGreaterThanOrEqual(0.25);
      expect(v.emociones[e].exageracion).toBeLessThanOrEqual(0.9);
    }
  });

  it("la semilla es determinista: el mismo bot, la misma voz en todas las neuronas", () => {
    expect(semillaDeBot("bot-1")).toBe(semillaDeBot("bot-1"));
    expect(semillaDeBot("bot-2")).not.toBe(semillaDeBot("bot-1"));
    const a = vozBotDefecto("bot-1", 5);
    const b = vozBotDefecto("bot-1", 5);
    expect(a).toEqual(b);
    expect(a.semilla).toMatch(/^st-[0-9a-f]{8}$/);
  });
});

describe("normalizarVozBot", () => {
  it("acepta el perfil por defecto y rechaza lo que no es un perfil", () => {
    const v = vozBotDefecto("bot-1", 7);
    expect(normalizarVozBot(v)?.botId).toBe("bot-1");
    expect(normalizarVozBot("nada")).toBeNull();
    expect(normalizarVozBot(null)).toBeNull();
    expect(normalizarVozBot([1, 2])).toBeNull();
  });

  it("la exageración se acota y el estilo inválido cae al es_default", () => {
    const s = normalizarVozBot({
      botId: "b", origen: "semilla", actualizado: 1, motorPreferido: "chatterbox",
      emociones: { alegria: { exageracion: 44, estilo: "martiano", tono: "" } },
    });
    expect(s?.emociones.alegria.exageracion).toBe(0.9);
    expect(s?.emociones.alegria.estilo).toBe("es_default");
    expect(s?.emociones.ternura.estilo).toBe("es_default");
  });

  it("REGLA DURA: la voz de una persona real sin consentimiento registrado NO se usa", () => {
    const sinConsentimiento = normalizarVozBot({
      botId: "b", origen: "propia", actualizado: 1, motorPreferido: "chatterbox",
      clon: { timbreId: "voz-de-alex", duenoCuentaId: "c-1", consentimiento: false },
      emociones: {},
    });
    expect(sinConsentimiento?.clon).toBeUndefined();
    expect(sinConsentimiento?.origen).toBe("semilla");
    expect(timbreUsableDe(sinConsentimiento!)!.origen).toBe("semilla");

    const conConsentimiento = normalizarVozBot({
      botId: "b", origen: "propia", actualizado: 1, motorPreferido: "chatterbox",
      clon: { timbreId: "voz-de-alex", duenoCuentaId: "c-1", consentimiento: true },
      emociones: {},
    });
    expect(conConsentimiento?.clon?.timbreId).toBe("voz-de-alex");
    expect(timbreUsableDe(conConsentimiento!)!.timbreId).toBe("voz-de-alex");
  });

  it("el catálogo sin timbre cae a semilla; un motor desconocido cae a chatterbox", () => {
    const s = normalizarVozBot({ botId: "b", origen: "catalogo", actualizado: 1, emociones: {} });
    expect(s?.origen).toBe("semilla");
    const m = normalizarVozBot({
      botId: "b", origen: "catalogo", timbreCatalogo: "fem-aurora", actualizado: 1,
      motorPreferido: "no-existe", emociones: {},
    });
    expect(m?.origen).toBe("catalogo");
    expect(m?.timbreCatalogo).toBe("fem-aurora");
    expect(m?.motorPreferido).toBe("chatterbox");
  });
});

describe("adaptarVozANeurona", () => {
  const v = { ...vozBotDefecto("bot-1", 1), motorPreferido: "chatterbox" as const };

  it("con su motor disponible no avisa nada", () => {
    expect(adaptarVozANeurona(v, ["chatterbox", "openvoice2"])).toEqual({ motor: "chatterbox", aviso: "" });
  });

  it("sin su motor usa el más parecido de su cadena y LO DICE", () => {
    const r = adaptarVozANeurona(v, ["openvoice2"]);
    expect(r.motor).toBe("openvoice2");
    expect(r.aviso).toContain("chatterbox");
    expect(r.aviso).toContain("openvoice2");
  });

  it("sin ningún motor dice que hablará con la voz del sistema", () => {
    const r = adaptarVozANeurona(v, []);
    expect(r.motor).toBeNull();
    expect(r.aviso).toContain("voz del sistema");
  });
});

describe("viaje con la sincronía", () => {
  it("serializado y deserializado dan el mismo perfil y la misma huella", () => {
    const v = vozBotDefecto("bot-1", 99);
    const texto = serializarVozBot(v);
    const de = deserializarVozBot(texto);
    expect(de).not.toBeNull();
    expect(huellaVoz(v)).toBe(huellaVoz(de!));
    expect(deserializarVozBot("{roto")).toBeNull();
  });

  it("la fusión gana por actualizado y descarta lo inválido", () => {
    const vieja = vozBotDefecto("bot-1", 5);
    const nueva = { ...vozBotDefecto("bot-1", 900), motorPreferido: "openvoice2" as const };
    expect(fusionarVozBot(vieja, nueva)?.motorPreferido).toBe("openvoice2");
    expect(fusionarVozBot(vieja, "basura" as unknown as VozBot)?.botId).toBe("bot-1");
    expect(fusionarVozBot(null, null)).toBeNull();
  });
});
