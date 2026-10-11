import { describe, expect, it } from "vitest";
import {
  DERIVA_MAXIMA, LIMITES_HONESTOS, estadoEmocional, expresionCuerpo, instruccionesDeTono, mezclarPersonalidad,
} from "../personalidad-adaptable";
import { RASGOS, type Personalidad } from "../tipos";

const BASE: Personalidad = { calidez: 0.6, energia: 0.5, formalidad: 0.4, curiosidad: 0.6, humor: 0.5, concision: 0.5 };
const AGENTE_SERIO: Personalidad = { calidez: 0.2, energia: 0.3, formalidad: 1, curiosidad: 0.4, humor: 0, concision: 0.9 };

describe("mezclarPersonalidad", () => {
  it("es determinista", () => {
    const a = mezclarPersonalidad(BASE, { situacion: "trabajo", sesion: "grupo" }, AGENTE_SERIO);
    const b = mezclarPersonalidad(BASE, { situacion: "trabajo", sesion: "grupo" }, AGENTE_SERIO);
    expect(a).toEqual(b);
  });
  it("el agente tiñe, pero el bot sigue siendo él: ningún rasgo deriva más del límite", () => {
    const p = mezclarPersonalidad(BASE, { situacion: "trabajo", sesion: "publica" }, AGENTE_SERIO);
    for (const k of RASGOS) expect(Math.abs(p[k] - BASE[k]), k).toBeLessThanOrEqual(DERIVA_MAXIMA + 1e-9);
    expect(p.formalidad).toBeGreaterThan(BASE.formalidad);
  });
  it("en una crisis el humor puede bajar del todo y la calidez sube", () => {
    const p = mezclarPersonalidad(BASE, { situacion: "crisis", sesion: "privada" });
    expect(p.humor).toBeLessThan(BASE.humor - DERIVA_MAXIMA);
    expect(p.calidez).toBeGreaterThan(BASE.calidez);
  });
  it("lo que la persona fija a mano gana; sinHumor y brevedad se respetan", () => {
    const p = mezclarPersonalidad(BASE, { situacion: "juego", sesion: "privada" }, undefined, { rasgos: { energia: 0.1 }, sinHumor: true, brevedad: true });
    expect(p.energia).toBe(0.1);
    expect(p.humor).toBe(0);
    expect(p.concision).toBeGreaterThanOrEqual(0.8);
  });
  it("todo queda en [0, 1]", () => {
    const p = mezclarPersonalidad({ ...BASE, humor: 0.95 }, { situacion: "juego", sesion: "privada" }, undefined, { rasgos: { calidez: 7 } });
    for (const k of RASGOS) expect(p[k] >= 0 && p[k] <= 1, k).toBe(true);
  });
});

describe("estadoEmocional: empatía sin manipulación", () => {
  it("ante alguien triste acompaña con ternura y calma, sin hundirse", () => {
    const e = estadoEmocional(BASE, { sesion: "privada", animo: { valencia: -1, activacion: 0.9 } });
    expect(e.emocion).toBe("ternura");
    expect(e.valencia).toBeGreaterThanOrEqual(LIMITES_HONESTOS.valenciaMinima);
    expect(e.activacion).toBeLessThanOrEqual(0.35);
  });
  it("refleja la alegría ajena como mucho a medias", () => {
    const sin = estadoEmocional(BASE, { sesion: "privada" });
    const con = estadoEmocional(BASE, { sesion: "privada", animo: { valencia: 1, activacion: 0.5 } });
    expect(con.valencia).toBeGreaterThan(sin.valencia);
    expect(con.valencia - sin.valencia).toBeLessThanOrEqual(LIMITES_HONESTOS.espejoMaximo * (1 - sin.valencia) + 1e-9);
  });
  it("la situación elige la emoción y la crisis baja la activación", () => {
    expect(estadoEmocional(BASE, { situacion: "trabajo", sesion: "grupo" }).emocion).toBe("concentracion");
    expect(estadoEmocional({ ...BASE, energia: 1 }, { situacion: "crisis", sesion: "privada" }).activacion).toBeLessThanOrEqual(0.3);
  });
  it("tiene inercia: no salta de golpe desde el estado anterior", () => {
    const previo = { emocion: "calma" as const, valencia: 0, activacion: 0 };
    const e = estadoEmocional({ ...BASE, energia: 1 }, { sesion: "privada" }, previo);
    expect(e.activacion).toBeLessThan(0.75);
    expect(e.activacion).toBeGreaterThan(0);
  });
  it("los límites honestos no se pueden apagar", () => {
    expect(Object.isFrozen(LIMITES_HONESTOS)).toBe(true);
    expect(LIMITES_HONESTOS.reconoceQueEsIA && LIMITES_HONESTOS.sinUrgenciaFalsa && LIMITES_HONESTOS.sinAdulacion).toBe(true);
  });
});

describe("cuerpo y tono", () => {
  it("la expresión del cuerpo sale acotada y con animación del catálogo", () => {
    const x = expresionCuerpo({ emocion: "alegria", valencia: 1, activacion: 1 }, { forma: "orbe", tono: 350, escala: 1 });
    expect(x.tono).toBeGreaterThanOrEqual(0);
    expect(x.tono).toBeLessThan(360);
    expect(x.pulsoHz).toBeCloseTo(1.2);
    expect(x.animacion).toBe("brilla");
  });
  it("las instrucciones de tono terminan siempre con los límites honestos", () => {
    const l = instruccionesDeTono(BASE);
    expect(l.at(-1)).toContain("Eres una IA");
    expect(l.join(" ")).toContain("no adules");
  });
});
