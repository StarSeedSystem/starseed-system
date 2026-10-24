import { describe, expect, it } from "vitest";
import { crearEnlaceSesion, type EnlaceVia, type MensajeMolecula, type GestoRecibido } from "../transporte-protomolecula";
import { parametrosDeSesion, sesionDesdeParametros, PREFIJO_OSC, ATOMO_SALA, ATOMO_VISUAL } from "../adaptador-estaciones";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import type { Operacion, Cambio, Sesion, Molecula, ParametroRef } from "../tipos";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

type Cb = (m: MensajeMolecula, via: EnlaceVia | null) => void;

const via: EnlaceVia = { id: "local:ab12", tipo: "local", etiqueta: "Vecino (enlace local)" };
const HORA = { t: 1000 };
const sesion: Sesion = {
  id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "yo", miembros: {},
  transporte: "malla-p2p", consentimientos: [], creadaEn: 0,
};
const refVol: ParametroRef = { atomoId: "ato1", parametroId: "volumen" };

/** Dos enlaces falsos conectados: lo que uno manda llega al otro, con la misma hora local. */
function par(o: { reloj?: RelojComun; alGestoB?: (g: GestoRecibido) => void } = {}) {
  const entregado: Record<"dsA" | "dsB", Cb | undefined> = { dsA: undefined, dsB: undefined };
  const lado = (yo: "dsA" | "dsB", otro: "dsA" | "dsB", reloj: RelojComun) =>
    crearEnlaceSesion({
      sesion,
      yo: { dispositivo: yo },
      enviar: (m, v) => entregado[otro]?.(m, v),
      recibir: (cb) => {
        entregado[yo] = cb;
        return () => {
          entregado[yo] = undefined;
        };
      },
      reloj,
      ...(o.alGestoB && yo === "dsB" ? { alGesto: o.alGestoB } : {}),
    });
  const relojFalso = () => new RelojComun({ esReferencia: true, relojLocal: () => HORA.t });
  return { a: lado("dsA", "dsB", o.reloj ?? relojFalso()), b: lado("dsB", "dsA", o.reloj ?? relojFalso()) };
}

const opExacta = (ref: ParametroRef, valor: number | boolean, de: "dsA" | "dsB"): Operacion => ({
  id: `op-${de}`, objetivo: ref, accion: { tipo: "exacta", valor }, autor: { tipo: "persona", id: de }, origen: "mano", t: HORA.t,
});
const cambio = (op: Operacion, antes: number | boolean, despues: number | boolean): Cambio => ({
  operacion: op, antes, despues, acotado: false, reversible: true,
});
const baseMolecula: Molecula = {
  id: "m1", titulo: "Mi molécula", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1,
};
const sinMedir = { medida: false, texto: "sin medir" };

describe("crearEnlaceSesion", () => {
  it("dos enlaces falsos conectados convergen; la operación se sella con el reloj común", () => {
    const { a, b } = par();
    const opA = opExacta(refVol, 0.5, "dsA");
    HORA.t = 4523; // el reloj común avanza; el sello del enlace debe seguirlo
    a.anunciaOperacion(opA, cambio(opA, 0, 0.5));
    const opB = opExacta({ atomoId: "ato2", parametroId: "eco" }, true, "dsB");
    b.anunciaOperacion(opB, cambio(opB, false, true));
    const esperado = { "ato1::volumen": 0.5, "ato2::eco": true };
    expect(a.valores()).toEqual(esperado);
    expect(b.valores()).toEqual(esperado);
    expect(b.confirmaciones()[0].actualizadoEn).toBe(4523); // t del reloj común, no del aparato local
    const fusionada = b.moleculaFusionada(baseMolecula);
    expect(fusionada.valores).toEqual(esperado);
    expect(fusionada.actualizadaEn).toBe(4523);
    HORA.t = 1000;
  });

  it("el gesto efímero del otro se ve en vivo pero NO se guarda ni se confirma", () => {
    const vistos: GestoRecibido[] = [];
    const { a, b } = par({ alGestoB: (g) => vistos.push(g) });
    a.gesto(refVol, 0.9);
    expect(vistos).toEqual([{ de: "dsA", ref: refVol, valor: 0.9 }]);
    expect(b.confirmaciones()).toHaveLength(0);
    expect(b.valores()).toEqual({});
  });

  it("presencia P0 (quién mueve qué), no se guarda, y el texto del enlace", () => {
    const { a, b } = par();
    expect(b.textoEnlace()).toBe("solo en este aparato");
    a.presenciar(refVol, via);
    const mueven = b.quienMueve();
    expect(mueven).toHaveLength(1);
    expect(mueven[0].de).toBe("dsA");
    expect(mueven[0].ref?.parametroId).toBe("volumen");
    expect(b.textoEnlace()).toBe(via.etiqueta);
    expect(b.confirmaciones()).toHaveLength(0);
  });

  it("latencia: «sin medir» hasta el mínimo de muestras; después p50 ≤ p95", () => {
    const { a } = par();
    expect(a.latencia()).toEqual(sinMedir);
    a.medirPing();
    a.medirPing();
    expect(a.latencia()).toEqual(sinMedir);
    a.medirPing();
    const l = a.latencia();
    expect(l.medida).toBe(true);
    if (l.medida) {
      expect(l.muestras).toBe(3);
      expect(l.p50Ms).toBeGreaterThanOrEqual(0);
      expect(l.p50Ms).toBeLessThanOrEqual(l.p95Ms);
    }
  });

  it("el reloj común sin muestras no inventa precisión", () => {
    const { a } = par({ reloj: new RelojComun({ relojLocal: () => HORA.t }) });
    const e = a.estadoReloj();
    expect(e.modo).toBe("sin-referencia");
    expect(e.precisionMs).toBeNull();
    expect(e.cotaMs).toBeNull();
  });
});

describe("adaptador-estaciones", () => {
  it("omnifrecuencias: ida y vuelta, y los movimientos del panel se traducen a la estación", () => {
    const p: ParametrosSesion = {
      tipo: "omnifrecuencias",
      entonacion: {
        osciladores: [{ id: "o1", f: 432, onda: "sine", vol: 0.5, x: -1, y: 0, z: 0, pulso: 2, mezcla: 0.4, nombre: "Tono" }],
        volumen: 0.7,
      },
    };
    const { parametros, valores } = parametrosDeSesion(p);
    expect(parametros).toHaveLength(9); // el volumen general + los 8 del oscilador
    expect(valores[`${ATOMO_SALA}::volumen`]).toBe(0.7);
    expect(sesionDesdeParametros(p, valores)).toEqual(p); // ida y vuelta intacta
    const tocado = { ...valores, [`${PREFIJO_OSC}o1::frecuencia`]: 528, [`${ATOMO_SALA}::volumen`]: 0.9, [`${PREFIJO_OSC}o1::forma`]: "triangular" };
    const p2 = sesionDesdeParametros(p, tocado);
    expect(p2.tipo).toBe("omnifrecuencias");
    if (p2.tipo === "omnifrecuencias") {
      const o0 = p2.entonacion.osciladores[0];
      expect(o0.f).toBe(528);
      expect(p2.entonacion.volumen).toBe(0.9);
      expect(o0.onda).toBe("triangle");
      expect(o0.pulso).toBe(2); // lo que el panel no tocó queda igual
    }
  });

  it("audiomorphic: el visual del panel es el de la espiral, con ida y vuelta", () => {
    const p: ParametrosSesion = { tipo: "audiomorphic", visual: { intensidad: 0.5, activo: true, modo: "onda" } };
    const { valores } = parametrosDeSesion(p);
    expect(valores[`${ATOMO_VISUAL}::modo`]).toBe("onda");
    expect(sesionDesdeParametros(p, valores)).toEqual(p);
    const tocado = { ...valores, [`${ATOMO_VISUAL}::intensidad`]: 0.8 };
    const p2 = sesionDesdeParametros(p, tocado);
    expect(p2.tipo).toBe("audiomorphic");
    if (p2.tipo === "audiomorphic") {
      expect(p2.visual).toEqual({ intensidad: 0.8, activo: true, modo: "onda" });
    }
  });
});
