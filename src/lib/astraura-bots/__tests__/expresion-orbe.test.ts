import { describe, expect, it, vi } from "vitest";

// El adaptador importa módulos de navegador: aquí solo se prueba la traducción pura.
vi.mock("@/lib/aurora/personalities", () => ({ getActivePersonality: () => null, PERSONALITY_CHANGED_EVENT: "x" }));
vi.mock("@/lib/aurora/audio-emotion", () => ({ isEmotionalHearingEnabled: () => false, subscribeUserVoiceEmotion: () => () => {} }));
vi.mock("@/lib/aurora/quantum-orb-bus", () => ({ emitQuantumOrbParams: vi.fn() }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => null }));
vi.mock("../adaptadores/almacen-bots", () => ({ leerBots: () => [], suscribirBots: () => () => {} }));

import { aParametrosOrbe, type ExpresionOrbe } from "../adaptadores/expresion-orbe";
import { estadoEmocional, expresionCuerpo, mezclarPersonalidad } from "../personalidad-adaptable";
import { PERSONALIDAD_ASTRAURA } from "../predeterminado";

const exp = (o: Partial<ExpresionOrbe>): ExpresionOrbe => ({ tono: 200, pulsoHz: 0.5, escala: 1, animacion: "brilla", ...o });
const CUERPO = { forma: "orbe" as const, tono: 200, escala: 1 };

describe("aParametrosOrbe", () => {
  it("sin desplazamiento de tono deja el matiz en el centro (0,5)", () => {
    expect(aParametrosOrbe(exp({ tono: 200 })).hueShift).toBe(0.5);
  });

  it("valencia positiva sube el matiz y la simetría; negativa los baja", () => {
    const luz = aParametrosOrbe(exp({ tono: 230 }));
    const sombra = aParametrosOrbe(exp({ tono: 170 }));
    expect(luz.hueShift).toBeGreaterThan(0.5);
    expect(sombra.hueShift).toBeLessThan(0.5);
    expect(luz.symmetry).toBeCloseTo(0.9);
    expect(sombra.symmetry).toBeCloseTo(0.1);
  });

  it("el desplazamiento cruza el 0/360 sin saltar", () => {
    const p = aParametrosOrbe(exp({ tono: 5 }), 350);
    expect(p.hueShift).toBeGreaterThan(0.5);
    expect(p.hueShift).toBeLessThan(0.7);
  });

  it("más activación = más respiración y turbulencia", () => {
    const quieta = aParametrosOrbe(exp({ pulsoHz: 0.2 }));
    const viva = aParametrosOrbe(exp({ pulsoHz: 1.2 }));
    expect(viva.breath).toBeGreaterThan(quieta.breath);
    expect(viva.turbulence).toBeGreaterThan(quieta.turbulence);
  });

  it("ternura y calma son suaves: filo bajo", () => {
    expect(aParametrosOrbe(exp({ animacion: "acoge", pulsoHz: 1.2 })).spikiness).toBeLessThanOrEqual(0.1);
    expect(aParametrosOrbe(exp({ animacion: "respira" })).spikiness).toBeLessThanOrEqual(0.1);
    expect(aParametrosOrbe(exp({ animacion: "brilla", pulsoHz: 1 })).spikiness).toBeGreaterThan(0.5);
  });

  it("todo queda en 0..1 aunque la entrada se salga", () => {
    const p = aParametrosOrbe(exp({ tono: 999, pulsoHz: 9 }));
    for (const v of Object.values(p)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("con el núcleo: ante la tristeza ajena la orbe acoge, no se agita", () => {
    const senales = { sesion: "privada" as const, animo: { valencia: -0.6, activacion: 0.15 } };
    const e = estadoEmocional(mezclarPersonalidad(PERSONALIDAD_ASTRAURA, senales), senales);
    const p = aParametrosOrbe(expresionCuerpo(e, CUERPO), CUERPO.tono);
    expect(p.spikiness).toBeLessThanOrEqual(0.1);
    expect(p.turbulence).toBeLessThanOrEqual(0.4);
  });
});
