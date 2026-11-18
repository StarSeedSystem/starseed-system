"use strict";

import { describe, it, expect } from "vitest";
import { TablaAlcance } from "../relevo/tabla";
import { elegirRuta, RutaCandidata } from "../relevo/ruta";
import { VecinaAnunciada } from "../relevo/tabla";
import { crearAnuncio, AnuncioRelevo } from "../relevo/tabla";

describe("relevo-tres-neuronas-1118", () => {
  const mac = "mac";
  const tab = "tab";
  const nodo = "nodo";

  const ahora = Date.now();

  const vecinasParaNodo: VecinaAnunciada = {
    n: nodo,
    c: "local",
    k: 20000,
    l: 10,
    r: 1,
    h: "hash-nodo",
    e: { kty: "EC", crv: "P-256", x: "x1", y: "y1" },
  };

  const anuncioMac: AnuncioRelevo = crearAnuncio({
    yo: mac,
    uid: mac,
    nombre: "mac",
    seq: 1,
    ofrezco: true,
    clave: { kty: "EC", crv: "P-256", x: "x1", y: "y1" },
    vecinas: [vecinasParaNodo],
  });

  const tabla = new TablaAlcance();
  tabla.registrar(mac, anuncioMac, ahora);

  it("a) la tabla ofrece a 'mac' como relevo hacia 'nodo'", () => {
    const relevos = tabla.relevosHacia(nodo, ahora);
    expect(relevos).toHaveLength(1);
    expect(relevos[0].relevo).toBe(mac);
    expect(relevos[0].tramo.n).toBe(nodo);
    expect(relevos[0].tramo.c).toBe("local");
  });

  it("b) elegirRuta con relevo='mac' y sin directo devuelve 'inicial' y ruta.relevo === 'mac'", () => {
    const candidata: RutaCandidata = {
      relevo: mac,
      tramos: [{ carril: "local", kbps: 20000, rttMs: 10 }],
    };
    const decision = elegirRuta([candidata], null);
    expect(decision.motivo).toBe("inicial");
    expect(decision.ruta).not.toBeNull();
    expect(decision.ruta!.relevo).toBe(mac);
  });

  it("c) si hay directo gana siempre ('directo'), aunque el relevo cueste menos", () => {
    const candidataConRelevo: RutaCandidata = {
      relevo: mac,
      tramos: [{ carril: "local", kbps: 20000, rttMs: 10 }],
    };
    const candidataDirecta: RutaCandidata = {
      relevo: null,
      tramos: [],
    };
    const decision = elegirRuta([candidataConRelevo, candidataDirecta], null);
    expect(decision.motivo).toBe("directo");
    expect(decision.ruta!.relevo).toBeNull();
  });

  it("d) con actual={relevo:'mac'} y una segunda candidata ligeramente mejor (<25 %) se mantiene ('se-mantiene')", () => {
    const actual = { relevo: mac };
    const candidataActual: RutaCandidata = {
      relevo: mac,
      tramos: [{ carril: "local", kbps: 20000, rttMs: 10 }],
    };
    const candidataMejorLigeramente: RutaCandidata = {
      relevo: mac,
      tramos: [{ carril: "local", kbps: 25000, rttMs: 8 }],
    };
    const decision = elegirRuta([candidataActual, candidataMejorLigeramente], actual);
    expect(decision.motivo).toBe("se-mantiene");
    expect(decision.ruta!.relevo).toBe(mac);
    expect(decision.cambia).toBe(false);
  });

  it("e) con 'mac' vetado devuelve 'sin-ruta' cuando no hay otras rutas válidas", () => {
    const actual = { relevo: mac };
    const vetados = new Set([mac]);
    const candidata: RutaCandidata = {
      relevo: mac,
      tramos: [{ carril: "local", kbps: 20000, rttMs: 10 }],
    };
    const decision = elegirRuta([candidata], actual, vetados);
    expect(decision.motivo).toBe("sin-ruta");
    expect(decision.ruta).toBeNull();
  });

  it("f) caducar tras CADUCA_MS + 1 olvida a 'mac' y ya no hay relevo", async () => {
    const caducado = await tabla.caducar(ahora + 36000);
    expect(caducado).toContain(mac);
    const relevos = tabla.relevosHacia(nodo, ahora + 36000);
    expect(relevos).toHaveLength(0);
  });

  it("g) un anuncio de 'mac' registrado como deVecina='tab' (id distinto) devuelve 'rechazado'", () => {
    const anuncioMacDistinto: AnuncioRelevo = crearAnuncio({
      yo: mac,
      uid: mac,
      nombre: "mac",
      seq: 2,
      ofrezco: true,
      clave: { kty: "EC", crv: "P-256", x: "x1", y: "y1" },
      vecinas: [vecinasParaNodo],
    });
    const resultado = tabla.registrar(tab, anuncioMacDistinto, ahora);
    expect(resultado).toBe("rechazado");
  });
});