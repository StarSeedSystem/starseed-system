// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  anuncioDesdeCruda, coordenadaValida, coordenadasDeVista, haceCuanto, leerAnuncio, POSICION_POR_PRESENCIA_CONFIRMADA,
  posicionEsViva, posicionVistaDeAnuncio, POSICION_VIVA_MS,
} from "../modelo-geo";
import {
  anuncioParaMiCuenta, fijarCompartirPosicion, guardarPosicionCruda, leerCompartirPosicion, leerPosicionCruda, olvidarPosicionCruda,
} from "../almacen-posicion";

const ZOCALO = { lat: 19.4326, lon: -99.1332 };

describe("modelo-geo: posición exacta, sin redondeo ni zona", () => {
  it("valida coordenadas", () => {
    expect(coordenadaValida(19.4, -99.1)).toBe(true);
    expect(coordenadaValida(91, 0)).toBe(false);
    expect(coordenadaValida(NaN, 0)).toBe(false);
    expect(coordenadaValida("1", 2)).toBe(false);
  });

  it("el anuncio conserva el punto tal cual lo midió el aparato", () => {
    const a = anuncioDesdeCruda({ ...ZOCALO, lat: 19.432612345, precisionM: 7.3, t: 1000 });
    expect(a).toEqual({ lat: 19.432612345, lon: ZOCALO.lon, precisionM: 7.3, t: 1000 });
  });

  it("sin precisión informada no la inventa", () => {
    const a = anuncioDesdeCruda({ ...ZOCALO, precisionM: null, t: 5 });
    expect(a).toEqual({ ...ZOCALO, t: 5 });
    expect(a && "precisionM" in a).toBe(false);
  });

  it("leerAnuncio no se fía de la forma y no corrige nada", () => {
    expect(leerAnuncio(null)).toBeNull();
    expect(leerAnuncio({ lat: 1, lon: 2 })).toBeNull();
    expect(leerAnuncio({ lat: 200, lon: 2, t: 1 })).toBeNull();
    expect(leerAnuncio({ lat: 19.4326, lon: -99.1332, t: 9, zona: "x", publico: true })).toEqual({ lat: 19.4326, lon: -99.1332, t: 9 });
  });

  it("posición vista: desconocida lleva su motivo y nunca coordenadas", () => {
    const v = posicionVistaDeAnuncio(null, "motivo X");
    expect(v).toEqual({ tipo: "desconocida", motivo: "motivo X" });
    expect(coordenadasDeVista(v)).toBeNull();
    const e = posicionVistaDeAnuncio({ ...ZOCALO, t: 1 }, "m");
    expect(coordenadasDeVista(e)).toEqual(ZOCALO);
  });

  it("viva = medida hace menos de 3 min; después es «última conocida»", () => {
    expect(POSICION_VIVA_MS).toBe(180_000);
    expect(posicionEsViva(1000, 1000 + POSICION_VIVA_MS)).toBe(true);
    expect(posicionEsViva(1000, 1001 + POSICION_VIVA_MS)).toBe(false);
  });

  it("haceCuanto", () => {
    expect(haceCuanto(0, 40_000)).toBe("hace 40 s");
    expect(haceCuanto(0, 5 * 60_000)).toBe("hace 5 min");
    expect(haceCuanto(0, (2 * 60 + 5) * 60_000)).toBe("hace 2 h 5 min");
    expect(haceCuanto(null, 1)).toBe("");
  });

  it("el envío por presencia está en pausa mientras el canal no esté confirmado como privado", () => {
    expect(POSICION_POR_PRESENCIA_CONFIRMADA).toBe(false);
  });
});

describe("almacen-posicion", () => {
  beforeEach(() => { localStorage.clear(); });

  it("el interruptor viene activado de fábrica y se puede apagar", () => {
    expect(leerCompartirPosicion()).toBe(true);
    fijarCompartirPosicion(false);
    expect(leerCompartirPosicion()).toBe(false);
  });

  it("guarda y lee la posición sin tocarla; ignora basura", () => {
    guardarPosicionCruda({ ...ZOCALO, precisionM: 12, t: 77 });
    expect(leerPosicionCruda()).toEqual({ ...ZOCALO, precisionM: 12, t: 77 });
    localStorage.setItem("starseed.mapa.posicion.v2", "{no json");
    expect(leerPosicionCruda()).toBeNull();
    olvidarPosicionCruda();
    expect(leerPosicionCruda()).toBeNull();
  });

  it("no anuncia nada a la cuenta mientras el envío esté en pausa (aunque haya posición y interruptor)", () => {
    guardarPosicionCruda({ ...ZOCALO, precisionM: 5, t: 1 });
    expect(leerCompartirPosicion()).toBe(true);
    expect(anuncioParaMiCuenta()).toBeNull();
  });
});
