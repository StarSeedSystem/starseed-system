import { describe, expect, it } from "vitest";
import {
  AJUSTES_VINCULO_DEFECTO,
  TODAS_LAS_VIAS,
  alternarVia,
  cambiarAjustes,
  filtrarPasos,
  fraseViasQuitadas,
  leerAjustesVinculo,
  leerMapaAjustes,
  pasoPermitido,
  serializarMapaAjustes,
  viaPermitida,
} from "../ajustes-vinculo";

describe("ajustes por neurona vinculada", () => {
  it("lo ilegible o ausente es el defecto: reconectar sola y todas las vías", () => {
    expect(leerAjustesVinculo(null)).toEqual(AJUSTES_VINCULO_DEFECTO);
    expect(leerAjustesVinculo("x")).toEqual(AJUSTES_VINCULO_DEFECTO);
    expect(leerMapaAjustes("{no es json")).toEqual({});
    expect(leerMapaAjustes(null)).toEqual({});
    expect(leerMapaAjustes("[1,2]")).toEqual({});
  });

  it("descarta vías desconocidas y repetidas; «todas» se guarda como null", () => {
    expect(leerAjustesVinculo({ viasPermitidas: ["rele", "rele", "telepatia"] })).toEqual({ reconectarSola: true, viasPermitidas: ["rele"] });
    expect(leerAjustesVinculo({ viasPermitidas: [...TODAS_LAS_VIAS] }).viasPermitidas).toBeNull();
  });

  it("solo se guarda lo que se aparta del defecto", () => {
    expect(serializarMapaAjustes({ a: AJUSTES_VINCULO_DEFECTO })).toBe("{}");
    const m = cambiarAjustes({}, "tab-1", { reconectarSola: false });
    expect(m).toEqual({ "tab-1": { reconectarSola: false, viasPermitidas: null } });
    expect(leerMapaAjustes(serializarMapaAjustes(m))).toEqual(m);
    // Volver al defecto borra la entrada.
    expect(cambiarAjustes(m, "tab-1", { reconectarSola: true })).toEqual({});
  });

  it("cambiarAjustes no toca el mapa anterior ni acepta una neurona vacía", () => {
    const antes = {};
    cambiarAjustes(antes, "x", { reconectarSola: false });
    expect(antes).toEqual({});
    expect(cambiarAjustes(antes, "", { reconectarSola: false })).toBe(antes);
  });

  it("alternarVia: quita y devuelve vías, y nunca deja cero", () => {
    let a = alternarVia(AJUSTES_VINCULO_DEFECTO, "rele");
    expect(viaPermitida(a, "rele")).toBe(false);
    expect(viaPermitida(a, "red-local-nativa")).toBe(true);
    a = alternarVia(a, "rele");
    expect(a.viasPermitidas).toBeNull(); // otra vez todas
    // Dejar solo una y no poder quitarla.
    let solo = AJUSTES_VINCULO_DEFECTO;
    for (const v of TODAS_LAS_VIAS.filter((x) => x !== "lora")) solo = alternarVia(solo, v);
    expect(solo.viasPermitidas).toEqual(["lora"]);
    expect(alternarVia(solo, "lora")).toBe(solo);
  });

  it("pasoPermitido: el transporte vale si alguna de sus cuatro vías lo está", () => {
    const sinRele = leerAjustesVinculo({ viasPermitidas: ["red-local-nativa", "malla-cuenta"] });
    expect(pasoPermitido(sinRele, "red-local-nativa")).toBe(true);
    expect(pasoPermitido(sinRele, "transporte")).toBe(true);
    expect(pasoPermitido(sinRele, "rele-cuenta")).toBe(false);
    const soloRele = leerAjustesVinculo({ viasPermitidas: ["rele"] });
    expect(pasoPermitido(soloRele, "transporte")).toBe(false);
    expect(pasoPermitido(soloRele, "red-local-nativa")).toBe(false);
  });

  it("filtrarPasos conserva el orden y dice qué quitó, con una frase honesta", () => {
    const a = leerAjustesVinculo({ viasPermitidas: ["rele"] });
    const r = filtrarPasos(a, ["red-local-nativa", "transporte", "rele-cuenta"]);
    expect(r).toEqual({ pasos: ["rele-cuenta"], quitados: ["red-local-nativa", "transporte"] });
    expect(fraseViasQuitadas(r.quitados)).toBe(
      " Ojo: en los ajustes de esa neurona está desactivado la red local y los enlaces directos y la malla; actívalo si quieres que se use.",
    );
    expect(fraseViasQuitadas([])).toBe("");
  });
});
