/**
 * AUD1117 — el Mapa de señales deja una línea en el registro de enlaces por cada CAMBIO de estado.
 * Herméticas: solo funciones puras (entrada → salida). Nunca latitud, longitud ni nombres.
 */

import { describe, it, expect } from "vitest";
import {
  codigoMotivoCanal, esLineaDeMapa, lineaCanalPosicion, lineasDeCambio, type FotoMapa,
} from "../registro-mapa";

function foto(p: Partial<FotoMapa> = {}): FotoMapa {
  return { union: "unido", motivo: null, permiso: "concedido", total: 3, colocadas: 2, ...p };
}

/** Nada con forma de coordenada (decimales largos, signo, lat/lon). */
function sinCoordenadas(lineas: readonly string[]): boolean {
  return lineas.every((l) => !/-?\d{1,3}\.\d{3,}/.test(l) && !/\b(lat|lon|lng|latitud|longitud)=/i.test(l));
}

describe("registro-mapa · primeras líneas", () => {
  it("la primera foto deja la huella de los tres estados, una línea por cada uno", () => {
    expect(lineasDeCambio(null, foto())).toEqual([
      "mapa · canal-posicion · union=unido",
      "mapa · ubicacion · permiso=concedido",
      "mapa · marcas · total=3 colocadas=2",
    ]);
  });

  it("un estado que aún no se puede anotar no escribe nada (pero las marcas sí dejan su huella)", () => {
    expect(lineasDeCambio(null, foto({ union: "uniendo", permiso: "por-pedir", total: 0, colocadas: 0 }))).toEqual([
      "mapa · marcas · total=0 colocadas=0",
    ]);
  });
});

describe("registro-mapa · una línea por cambio", () => {
  it("sin cambios no escribe ninguna línea", () => {
    const a = foto();
    expect(lineasDeCambio(a, foto())).toEqual([]);
  });

  it("la unión rechazada escribe su motivo como código, una sola vez", () => {
    const a = foto({ union: "unido" });
    const b = foto({ union: "rechazado", motivo: "no hay sesión iniciada: el canal privado es solo para cuentas" });
    expect(lineasDeCambio(a, b)).toEqual(["mapa · canal-posicion · union=rechazado motivo=sin-sesion"]);
    expect(lineasDeCambio(b, { ...b })).toEqual([]);
  });

  it("un motivo distinto con la misma unión rechazada sí es un cambio de estado", () => {
    const a = foto({ union: "rechazado", motivo: "no hay conexión con el servidor de tiempo real" });
    const b = foto({ union: "rechazado", motivo: "el servidor rechazó la unión" });
    expect(lineasDeCambio(a, b)).toEqual([
      "mapa · canal-posicion · union=rechazado motivo=rechazado",
    ]);
  });

  it("el permiso y las marcas también escriben solo cuando cambian", () => {
    const a = foto({ permiso: "concedido", total: 3, colocadas: 2 });
    expect(lineasDeCambio(a, foto({ permiso: "denegado" }))).toEqual([
      "mapa · ubicacion · permiso=denegado",
    ]);
    expect(lineasDeCambio(a, foto({ total: 4, colocadas: 4 }))).toEqual([
      "mapa · marcas · total=4 colocadas=4",
    ]);
  });
});

describe("registro-mapa · nunca una posición ni un nombre", () => {
  it("un motivo con datos crudos se reduce a un código fijo", () => {
    const codigos = [
      codigoMotivoCanal("sin sesión iniciada (uid pos:8f14e45f)"),
      codigoMotivoCanal("no hay conexión; reintento en 41.8781,-87.6298"),
      codigoMotivoCanal("migración 20261114180000 sin aplicar"),
      codigoMotivoCanal("Alex en 19.4326, -99.1332"),
    ];
    expect(codigos).toEqual(["sin-sesion", "sin-red", "sin-migracion", "otro"]);
    expect(codigos.every((c) => /^[a-z-]+$/.test(c))).toBe(true);
  });

  it("ninguna línea lleva números con forma de coordenada", () => {
    const lineas = [
      lineaCanalPosicion("rechazado", "tópico pos:8f14e45f a 19.4326,-99.1332"),
      ...lineasDeCambio(null, foto({ total: 12, colocadas: 7 })),
    ];
    expect(sinCoordenadas(lineas)).toBe(true);
    expect(lineas.every((l) => !/8f14e45f|19\.4326|99\.1332|Alex/.test(l))).toBe(true);
  });
});

describe("registro-mapa · el registro no admite nada fuera de las tres formas", () => {
  it("acepta solo unido, rechazado con código, permiso y recuento", () => {
    expect(esLineaDeMapa("mapa · canal-posicion · union=unido")).toBe(true);
    expect(esLineaDeMapa("mapa · canal-posicion · union=rechazado motivo=sin-sesion")).toBe(true);
    expect(esLineaDeMapa("mapa · ubicacion · permiso=denegado")).toBe(true);
    expect(esLineaDeMapa("mapa · marcas · total=12 colocadas=7")).toBe(true);
  });

  it("rechaza texto libre con coordenadas, nombres o claves", () => {
    const crudas = [
      "mapa · canal-posicion · union=rechazado motivo=Alex en 19.4326,-99.1332",
      "mapa · marcas · total=12 colocadas=7 lat=19.4326 lon=-99.1332",
      "mapa · ubicacion · permiso=concedido token=clave-secreta",
      "",
    ];
    expect(crudas.every((l) => !esLineaDeMapa(l))).toBe(true);
  });

  it("toda línea que emite el mapa pasa el filtro antes de escribirse", () => {
    const estados = [
      foto({ union: "rechazado", motivo: "no hay sesión iniciada (uid 8f14e45f) en 19.4326,-99.1332" }),
      foto({ union: "unido", motivo: null, permiso: "denegado", total: 8, colocadas: 3 }),
      foto({ union: "unido", motivo: null, permiso: "denegado", total: 9, colocadas: 4 }),
    ];
    const lineas = [...lineasDeCambio(null, estados[0]), ...lineasDeCambio(estados[0], estados[1]), ...lineasDeCambio(estados[1], estados[2])];
    expect(lineas.length).toBe(7);
    expect(lineas.every(esLineaDeMapa)).toBe(true);
    expect(sinCoordenadas(lineas)).toBe(true);
  });
});
