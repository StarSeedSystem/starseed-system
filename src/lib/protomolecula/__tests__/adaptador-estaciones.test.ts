import { describe, expect, it } from "vitest";
import { ATOMO_ESTACION, ATOMO_VISUAL, parametrosDeSesion, sesionDeValores } from "../adaptador-estaciones";
import type { EntonacionParam, ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

const entonacion: EntonacionParam = {
  osciladores: [
    { id: "o1", f: 432, onda: "sine", vol: 0.6, x: -1, y: 0, z: 0.2 },
    { id: "o2", f: 528, onda: "triangle", vol: 0.3, x: 1, y: 0.1, z: -0.5 },
  ],
  volumen: 0.75,
};

describe("adaptador de estaciones: la entonación en el panel universal", () => {
  it("ida y vuelta de Omnifrecuencias: mismos parámetros y valores", () => {
    const base: ParametrosSesion = { tipo: "omnifrecuencias", entonacion };
    const { parametros, valores } = parametrosDeSesion(base);
    // El volumen general es un átomo; cada oscilador otro (con prefijo para que no se pisen).
    expect(valores).toEqual({
      [`${ATOMO_ESTACION}::volumen`]: 0.75,
      "osc:o1::frecuencia": 432, "osc:o1::volumen": 0.6, "osc:o1::onda": "sine", "osc:o1::x": -1, "osc:o1::y": 0, "osc:o1::z": 0.2,
      "osc:o2::frecuencia": 528, "osc:o2::volumen": 0.3, "osc:o2::onda": "triangle", "osc:o2::x": 1, "osc:o2::y": 0.1, "osc:o2::z": -0.5,
    });
    expect(parametros).toHaveLength(6 * entonacion.osciladores.length + 1);
    expect(parametros.find((p) => p.id === "onda")?.opciones).toEqual(["sine", "square", "triangle", "sawtooth"]);
    expect(sesionDeValores(valores)).toEqual(base);
  });

  it("lo que se mueve por el panel vuelve a la sesión de estación", () => {
    const base: ParametrosSesion = { tipo: "omnifrecuencias", entonacion };
    const { valores } = parametrosDeSesion(base);
    const movido = { ...valores, "osc:o1::frecuencia": 396, [`${ATOMO_ESTACION}::volumen`]: 0.4, "osc:o1::onda": "sawtooth" };
    const vuelta = sesionDeValores(movido);
    if (!vuelta || vuelta.tipo !== "omnifrecuencias") return expect(true).toBe(false);
    expect(vuelta.entonacion.volumen).toBe(0.4);
    expect(vuelta.entonacion.osciladores[0]).toEqual({ id: "o1", f: 396, onda: "sawtooth", vol: 0.6, x: -1, y: 0, z: 0.2 });
    expect(vuelta.entonacion.osciladores[1]?.f).toBe(528);
  });

  it("Audiomorphic: la espiral viaja como parámetros y regresa intacta", () => {
    const base: ParametrosSesion = { tipo: "audiomorphic", visual: { tinta: 0.5, gire: true, filtro: "nube" } };
    const { parametros, valores } = parametrosDeSesion(base);
    expect(valores).toEqual({ [`${ATOMO_VISUAL}::tinta`]: 0.5, [`${ATOMO_VISUAL}::gire`]: true, [`${ATOMO_VISUAL}::filtro`]: "nube" });
    expect(parametros.map((p) => [p.id, p.tipo])).toEqual([["tinta", "numero"], ["gire", "booleano"], ["filtro", "opcion"]]);
    expect(parametros.find((p) => p.id === "filtro")?.opciones).toEqual(["nube"]);
    expect(sesionDeValores(valores)).toEqual(base);
  });

  it("honesto: no se inventan palancas — la transición animada no añade parámetros", () => {
    const conTransicion: ParametrosSesion = {
      tipo: "omnifrecuencias",
      entonacion: {
        osciladores: [{ id: "o1", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0, trans: { a: { f: 200, vol: 0.2, x: 0, y: 0, z: 0 }, b: { f: 800, vol: 0.8, x: 1, y: 0, z: 0 }, dur: 10, vueltas: 2 } }],
        volumen: 0.7,
      },
    };
    const { parametros, valores } = parametrosDeSesion(conTransicion);
    expect(parametros).toHaveLength(7); // volumen general + 6 por oscilador
    expect(valores["osc:o1::frecuencia"]).toBe(432); // el valor quieto, no el de la transición
  });

  it("lo que no es una sesión no se inventa: basura, claves ajenas y vacío → null", () => {
    expect(sesionDeValores({})).toBeNull();
    expect(sesionDeValores({ "at-1::vol": 5, "sin-doble-nave": 1 })).toBeNull();
    expect(sesionDeValores({ "osc:o1::frecuencia": Number.NaN })).toBeNull(); // sin frecuencia, no hay oscilador
    // Una frecuencia imposible se acota con el saneo real de la estación, no con uno propio.
    const acotada = sesionDeValores({ "osc:o1::frecuencia": 9_999_999 });
    if (!acotada || acotada.tipo !== "omnifrecuencias") return expect(true).toBe(false);
    expect(acotada.entonacion.osciladores[0]?.f).toBe(24000);
  });
});
