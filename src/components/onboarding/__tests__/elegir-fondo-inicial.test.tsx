/** «Elige tu fondo» (FON1126A): una sola selección como radio, vista previa del elegido,
 *  catálogo completo con «Personalizar» y las dos tarjetas para añadir fondos. */
import { describe, expect, it } from "vitest";
import { planFondo } from "@/lib/protomolecula/atomos/fondo-shader";
import {
  TARJETAS_ANADIR, elegirUnico, esPersonalizable, opcionesDisponibles, vistaPreviaElegida,
  type OpcionFondoInicial,
} from "../elegir-fondo-inicial";
import { capaShaderDelSet, debeAnimarMiniatura } from "../miniatura-fondo";

const crearOpcion = (id: string, nombre: string): OpcionFondoInicial => ({
  id,
  nombre,
  set: planFondo({ id, nombre, autor: "StarSeed", creado: "2026-10-18T00:00:00.000Z", valores: { efecto: "aurora", capas: 1 } }),
});

const ACTUAL: OpcionFondoInicial = { id: "actual", nombre: "Fondo actual", descripcion: "El motor base sigue debajo." };
const OFICIAL = crearOpcion("oficial-aurora", "Aurora suave");
const CATALOGO_A = crearOpcion("aurora", "Aurora");
const CATALOGO_B = crearOpcion("cristal", "Cristal");

describe("opcionesDisponibles · todo el catálogo, sin repetidos", () => {
  it("pone el fondo actual primero y suma oficiales, catálogo y lo añadido", () => {
    const extra = crearOpcion("propio", "Mi fondo");
    const lista = opcionesDisponibles(ACTUAL, [OFICIAL], [CATALOGO_A, CATALOGO_B], [extra]);
    expect(lista.map((o) => o.id)).toEqual(["actual", "oficial-aurora", "aurora", "cristal", "propio"]);
  });

  it("descarta ids repetidos sin perder el primero (el actual manda)", () => {
    const repetido = { ...CATALOGO_A, nombre: "Aurora repetida" };
    const lista = opcionesDisponibles(ACTUAL, [OFICIAL], [CATALOGO_A, repetido]);
    expect(lista.filter((o) => o.id === "aurora")).toHaveLength(1);
    expect(lista.find((o) => o.id === "aurora")?.nombre).toBe("Aurora");
  });
});

describe("elegirUnico · radio, nunca una lista", () => {
  const opciones = opcionesDisponibles(ACTUAL, [OFICIAL], [CATALOGO_A, CATALOGO_B]);

  it("al tocar otro se queda solo el nuevo", () => {
    expect(elegirUnico(opciones, "actual", "cristal")).toBe("cristal");
    expect(elegirUnico(opciones, "cristal", "actual")).toBe("actual");
  });

  it("un id que no está en la lista no cambia la elección", () => {
    expect(elegirUnico(opciones, "aurora", "no-existe")).toBe("aurora");
  });
});

describe("vistaPreviaElegida · lo elegido se ve arriba", () => {
  it("devuelve la opción elegida y null si no está", () => {
    const opciones = opcionesDisponibles(ACTUAL, [], [CATALOGO_A]);
    expect(vistaPreviaElegida(opciones, "aurora")?.nombre).toBe("Aurora");
    expect(vistaPreviaElegida(opciones, "otra")).toBeNull();
  });
});

describe("esPersonalizable · cada fondo con set abre su edición", () => {
  it("el fondo actual no tiene set; los del catálogo sí", () => {
    expect(esPersonalizable(ACTUAL)).toBe(false);
    expect(esPersonalizable(CATALOGO_A)).toBe(true);
  });
});

describe("TARJETAS_ANADIR · Librería y mis archivos, siempre al final", () => {
  it("son exactamente las dos pedidas", () => {
    expect(TARJETAS_ANADIR.map((t) => t.id)).toEqual(["libreria", "archivos"]);
    expect(TARJETAS_ANADIR[0]?.titulo).toMatch(/Librería/i);
    expect(TARJETAS_ANADIR[1]?.titulo).toMatch(/archivos/i);
  });
});

describe("miniatura-fondo · capa y movimiento", () => {
  it("saca la primera capa shader del set para pintarla de verdad", () => {
    expect(capaShaderDelSet(CATALOGO_A.set)?.kind).toBe("shader");
    expect(capaShaderDelSet(undefined)).toBeNull();
  });

  it("solo anima al pasar el cursor o enfocar, y nunca con movimiento reducido", () => {
    expect(debeAnimarMiniatura({ activa: true, reducirMovimiento: false, ahorroBateria: false })).toBe(true);
    expect(debeAnimarMiniatura({ activa: false, reducirMovimiento: false, ahorroBateria: false })).toBe(false);
    expect(debeAnimarMiniatura({ activa: true, reducirMovimiento: true, ahorroBateria: false })).toBe(false);
    expect(debeAnimarMiniatura({ activa: true, reducirMovimiento: false, ahorroBateria: true })).toBe(false);
  });
});
