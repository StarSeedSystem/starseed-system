import { describe, it, expect } from "vitest";
import {
  MedidaPlazo,
  MAX_MEDIDAS,
  MIN_MEDIDAS_APRENDIZAJE,
  PLAZO_DEFECTO_MS,
  PLAZO_MAX_MS,
  PLAZO_MIN_MS,
  plazoAprendido,
  registrarMedida,
} from "../plazo-aprendido";

const local = (msPrimerToken: number | null): MedidaPlazo => ({
  local: true,
  msPrimerToken,
});
const nube = (msPrimerToken: number | null): MedidaPlazo => ({
  local: false,
  msPrimerToken,
});

describe("registrarMedida", () => {
  it("añade la medida al final sin mutar la lista original", () => {
    const lista: MedidaPlazo[] = [local(1000)];
    const resultado = registrarMedida(lista, local(2000));
    expect(resultado).toHaveLength(2);
    expect(resultado.at(-1)).toEqual(local(2000));
    expect(lista).toHaveLength(1);
  });

  it("recorta a MAX_MEDIDAS dejando las más recientes", () => {
    let lista: MedidaPlazo[] = [];
    for (let i = 1; i <= MAX_MEDIDAS; i++) lista = registrarMedida(lista, local(i));
    lista = registrarMedida(lista, local(9999));
    expect(lista).toHaveLength(MAX_MEDIDAS);
    expect(lista[0]).toEqual(local(2));
    expect(lista.at(-1)).toEqual(local(9999));
  });

  it("respeta un max personalizado", () => {
    let lista: MedidaPlazo[] = [];
    for (let i = 1; i <= 5; i++) lista = registrarMedida(lista, local(i), 3);
    expect(lista.map((m) => m.msPrimerToken)).toEqual([3, 4, 5]);
  });
});

describe("plazoAprendido", () => {
  it("devuelve el plazo por defecto sin medidas", () => {
    expect(plazoAprendido([])).toBe(PLAZO_DEFECTO_MS);
  });

  it("devuelve el defecto con menos de MIN_MEDIDAS_APRENDIZAJE locales válidas", () => {
    const medidas = Array.from(
      { length: MIN_MEDIDAS_APRENDIZAJE - 1 },
      () => local(1000),
    );
    expect(plazoAprendido(medidas)).toBe(PLAZO_DEFECTO_MS);
  });

  it("ignora medidas de la nube y con msPrimerToken null", () => {
    const medidas: MedidaPlazo[] = [
      ...Array.from({ length: MIN_MEDIDAS_APRENDIZAJE }, () => nube(500)),
      local(null),
    ];
    expect(plazoAprendido(medidas)).toBe(PLAZO_DEFECTO_MS);
  });

  it("aprende el percentil 80 de los turnos locales", () => {
    const medidas = [1500, 2000, 2500, 3000, 5500].map((v) => local(v));
    // p80 por rango próximo: ceil(0.8 · 5) = 4 → 3000
    expect(plazoAprendido(medidas)).toBe(3000);
  });

  it("acota por abajo al plazo mínimo", () => {
    const medidas = [100, 150, 200, 250, 300].map((v) => local(v));
    expect(plazoAprendido(medidas)).toBe(PLAZO_MIN_MS);
  });

  it("acota por arriba al plazo máximo", () => {
    const medidas = [7000, 8000, 9000, 10000, 11000].map((v) => local(v));
    expect(plazoAprendido(medidas)).toBe(PLAZO_MAX_MS);
  });

  it("solo mira las últimas MAX_MEDIDAS medidas", () => {
    const viejas = Array.from({ length: MAX_MEDIDAS }, () => local(100));
    const nuevas = Array.from({ length: MAX_MEDIDAS }, () => local(5000));
    expect(plazoAprendido([...viejas, ...nuevas])).toBe(5000);
  });
});
