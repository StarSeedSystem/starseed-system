import { describe, expect, it } from "vitest";
import { ANGULOS_SALTO, CONFORT_DEFECTO, altoMinimoTexto, aplicarMovimientoReducido, opacidadVineta, sanearConfort, siguienteGiro } from "../confort";

describe("valores por defecto", () => {
  it("el giro es por saltos de 30° y no se camina de forma continua: nadie se marea sin pedirlo", () => {
    expect(CONFORT_DEFECTO).toMatchObject({ giro: "saltos", anguloSalto: 30, locomocion: "teletransporte", subtitulos: true });
  });
});

describe("sanear lo persistido", () => {
  it("vacío, null o basura devuelven los valores por defecto sin lanzar", () => {
    for (const x of [undefined, null, 42, "x", [], {}]) expect(sanearConfort(x).confort).toEqual(CONFORT_DEFECTO);
  });
  it("corrige lo inválido, acota los números y lo cuenta en avisos", () => {
    const { confort, avisos } = sanearConfort({ giro: "vertigo", anguloSalto: 33, escala: 9, fuerzaVineta: -1, alturaOjos: 5, inventado: true });
    expect(confort.giro).toBe("saltos");
    expect(confort.anguloSalto).toBe(30);
    expect(confort.escala).toBe(1.5);
    expect(confort.fuerzaVineta).toBe(0);
    expect(confort.alturaOjos).toBe(2.1);
    expect(avisos.join(" ")).toMatch(/inventado/);
    expect(avisos.length).toBeGreaterThanOrEqual(4);
  });
  it("una configuración vieja (sin los campos nuevos) recibe los valores por defecto: la regla de propagación", () => {
    const { confort } = sanearConfort({ giro: "continuo", anguloSalto: 45 });
    expect(confort.giro).toBe("continuo");
    expect(confort.anguloSalto).toBe(45);
    expect(confort.subtitulos).toBe(true);
    expect(confort.reducirTransparencia).toBe(false);
  });
  it("las preferencias del sistema se suman a las de la persona, nunca las anulan", () => {
    expect(sanearConfort({}, { movimientoReducido: true }).confort.movimientoReducido).toBe(true);
    expect(sanearConfort({ contrasteAlto: true }, { contrasteAlto: false }).confort.contrasteAlto).toBe(true);
  });
  it("el movimiento reducido manda: giro por saltos, viñeta siempre y nada de caminar continuo", () => {
    const { confort, avisos } = sanearConfort({ giro: "continuo", locomocion: "continua", vineta: "nunca", movimientoReducido: true });
    expect(confort).toMatchObject({ giro: "saltos", locomocion: "teletransporte", vineta: "siempre" });
    expect(confort.fuerzaVineta).toBeGreaterThanOrEqual(0.6);
    expect(avisos.join(" ")).toMatch(/movimiento reducido/i);
  });
  it("aplicarMovimientoReducido no toca nada si está apagado", () => {
    expect(aplicarMovimientoReducido(CONFORT_DEFECTO)).toBe(CONFORT_DEFECTO);
  });
});

describe("viñeta", () => {
  const auto = { ...CONFORT_DEFECTO, vineta: "auto" as const };
  it("quieto o con giros lentos no hay viñeta", () => {
    expect(opacidadVineta(auto, { lineal: 0, angularGradosS: 0 })).toBe(0);
    expect(opacidadVineta(auto, { lineal: 0.3, angularGradosS: 15 })).toBe(0);
  });
  it("crece con la velocidad y nunca pasa de 0,85", () => {
    const a = opacidadVineta(auto, { lineal: 1.5, angularGradosS: 0 });
    const b = opacidadVineta(auto, { lineal: 3, angularGradosS: 200 });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(opacidadVineta({ ...auto, fuerzaVineta: 1 }, { lineal: 9, angularGradosS: 900 })).toBeLessThanOrEqual(0.85);
  });
  it("«nunca» la apaga, «siempre» deja un mínimo aunque estés quieto, y el movimiento reducido obliga", () => {
    expect(opacidadVineta({ ...auto, vineta: "nunca" }, { lineal: 3, angularGradosS: 200 })).toBe(0);
    expect(opacidadVineta({ ...auto, vineta: "siempre" }, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
    expect(opacidadVineta({ ...auto, vineta: "nunca", movimientoReducido: true }, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
  });
});

describe("giro por saltos", () => {
  it("avanza exactamente un salto y queda alineado a la rejilla", () => {
    const c = { ...CONFORT_DEFECTO, anguloSalto: 45 as const };
    const paso = Math.PI / 4;
    expect(siguienteGiro(0, 1, c)).toBeCloseTo(paso, 6);
    expect(siguienteGiro(0, -1, c)).toBeCloseTo(-paso, 6);
    expect(siguienteGiro(paso * 0.3, 1, c)).toBeCloseTo(paso, 6);
    expect(siguienteGiro(paso * 0.3, -1, c)).toBeCloseTo(0, 6);
  });
  it("ocho saltos de 45° dan la vuelta completa", () => {
    let y = 0;
    for (let i = 0; i < 8; i++) y = siguienteGiro(y, 1, { ...CONFORT_DEFECTO, anguloSalto: 45 });
    expect(y).toBeCloseTo(2 * Math.PI, 6);
  });
  it("todos los ángulos admitidos dividen la vuelta en un número entero de saltos", () => {
    for (const a of ANGULOS_SALTO) expect(360 % a).toBe(0);
  });
});

describe("tamaño mínimo del texto", () => {
  it("1° a 1,8 m son unos 3,1 cm, y el doble de lejos pide el doble de alto", () => {
    expect(altoMinimoTexto(1.8, 1)).toBeCloseTo(0.0314, 3);
    expect(altoMinimoTexto(3.6, 1)).toBeCloseTo(2 * altoMinimoTexto(1.8, 1), 5);
  });
});
