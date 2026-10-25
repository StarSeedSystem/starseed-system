import { describe, expect, it } from "vitest";
import { crearEnlaceSesion, etiquetaDeEnvio, type DepsEnlacePm, type MensajePm } from "../transporte-protomolecula";
import { parametrosDeSesion, sesionConValores } from "../adaptador-estaciones";
import { aplicarOperacion } from "../parametros";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";
import type { Sesion, Operacion, Cambio, Molecula, Parametro, ParametroRef, EstadoValores } from "../tipos";

const sesion: Sesion = {
  id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "A",
  miembros: {}, transporte: "malla-p2p", consentimientos: [], creadaEn: 0,
};
const molecula: Molecula = {
  id: "m1", titulo: "T", ambito: "personal",
  capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 1,
};
const ref: ParametroRef = { atomoId: "a1", parametroId: "vol" };
const param: Parametro = { id: "vol", nombre: "Volumen", tipo: "numero", min: 0, max: 1, paso: 0.01 };
const opNueva = (): Operacion => ({
  id: "op1", objetivo: ref, accion: { tipo: "exacta", valor: 0.5 },
  autor: { tipo: "persona", id: "lolo" }, origen: "mano", t: 0,
});
const cambioNueva = (): Cambio => ({
  operacion: opNueva(), antes: 0, despues: 0.5, acotado: false, reversible: true,
});

/** Dos enlaces falsos conectados: lo que A envía llega a B al punto y viceversa (sin red real). */
function montarPar() {
  const rutas: { A: ((d: unknown) => void) | null; B: ((d: unknown) => void) | null } = { A: null, B: null };
  const lado = (miId: "A" | "B", reloj: RelojComun): DepsEnlacePm => ({
    sesion,
    miId,
    reloj,
    enviar: (m: MensajePm) => {
      rutas[miId === "A" ? "B" : "A"]?.(m);
      return { ok: true, etiqueta: "Aparato vinculado" };
    },
    recibir: (cb) => { rutas[miId] = cb; return () => { rutas[miId] = null; }; },
  });
  const enlaceA = crearEnlaceSesion(lado("A", new RelojComun({ relojLocal: () => 10_000, esReferencia: true })));
  const enlaceB = crearEnlaceSesion(lado("B", new RelojComun({ relojLocal: () => 9_900 })));
  return { enlaceA, enlaceB };
}

describe("transporte-protomolecula", () => {
  it("dos enlaces falsos conectados convergen", () => {
    const { enlaceA, enlaceB } = montarPar();
    const recibidas: Operacion[] = [];
    let estadoB: EstadoValores = {};
    enlaceB.alConfirmar((opR) => {
      if (!opR) return;
      recibidas.push(opR);
      const r = aplicarOperacion(estadoB, param, opR);
      if (r.ok) estadoB = r.estado;
    });
    enlaceA.confirmar(opNueva(), cambioNueva());
    expect(recibidas).toHaveLength(1);
    expect(recibidas[0].t).toBe(10_000); // la `t` salió del reloj común (A es referencia)
    expect(estadoB["a1::vol"]).toBe(0.5); // el valor llegó y se aplicó en B
    expect(enlaceB.elementos()).toHaveLength(1);
    expect(enlaceB.elementos()[0].datos.valor).toBe(0.5);
    expect(enlaceB.fusionar(molecula).id).toBe("m1");
    expect(enlaceA.etiqueta()).toBe("por Aparato vinculado");
  });

  it("el gesto efímero llega a todos y NUNCA se guarda", () => {
    const { enlaceA, enlaceB } = montarPar();
    const gestos: Array<[ParametroRef, number, string]> = [];
    enlaceB.alGesto((r, v, de) => gestos.push([r, v, de]));
    enlaceA.gesto(ref, 0.5);
    expect(gestos).toEqual([[ref, 0.5, "A"]]);
    expect(enlaceB.elementos()).toHaveLength(0); // efímero: no entra en el almacén de la sala
    expect(enlaceB.fusionar(molecula)).toEqual(molecula);
  });

  it("el reloj sin muestras no inventa precisión y la latencia dice «sin medir»", () => {
    const { enlaceB } = montarPar();
    const r = enlaceB.estadoReloj();
    expect(r.modo).toBe("sin-referencia");
    expect(r.precisionMs).toBeNull();
    expect(r.muestras).toBe(0);
    expect(enlaceB.latencia()).toEqual({ estado: "sin medir", p50Ms: null, p95Ms: null, muestras: 0 });
  });

  it("latencia medida con p50/p95 tras el mínimo de muestras", () => {
    const { enlaceA } = montarPar();
    expect(enlaceA.latencia().estado).toBe("sin medir");
    for (let i = 0; i < 5; i++) enlaceA.medir(); // B responde al ping, cada ida y vuelta es una muestra
    expect(enlaceA.latencia()).toEqual({ estado: "medida", p50Ms: 0, p95Ms: 0, muestras: 5 });
  });

  it("presencia P0 viva y «solo en este aparato» sin enlace", () => {
    const { enlaceA, enlaceB } = montarPar();
    enlaceA.presencia("Lolo", "a1::vol");
    const enB = enlaceB.presencias();
    expect(enB).toHaveLength(1);
    expect(enB[0]).toMatchObject({ de: "A", nombre: "Lolo", mueve: "a1::vol" });
    expect(enlaceB.elementos()).toHaveLength(0); // también efímera
    const libre = crearEnlaceSesion({
      sesion,
      miId: "C",
      reloj: new RelojComun({ relojLocal: () => 0 }),
      enviar: () => ({ ok: false }),
      recibir: () => () => undefined,
    });
    expect(libre.etiqueta()).toBe("solo en este aparato");
    expect(etiquetaDeEnvio(null)).toBe("solo en este aparato");
  });

  it("adaptador de estaciones ida y vuelta", () => {
    const entonacion: ParametrosSesion = {
      tipo: "omnifrecuencias",
      entonacion: { osciladores: [{ id: "o0", f: 432, onda: "sine", vol: 0.4, x: 0, y: 0, z: 0 }], volumen: 0.7 },
    };
    const ad = parametrosDeSesion(entonacion);
    expect(ad.valores["osc:0::f"]).toBe(432);
    expect(ad.valores["estacion::volumen"]).toBe(0.7);
    const vuelta = sesionConValores(entonacion, { ...ad.valores, "osc:0::f": 880, "estacion::volumen": 1 });
    expect(vuelta && vuelta.tipo === "omnifrecuencias" ? vuelta.entonacion.osciladores[0].f : null).toBe(880);
    expect(vuelta && vuelta.tipo === "omnifrecuencias" ? vuelta.entonacion.volumen : null).toBe(1);
    const igual = sesionConValores(entonacion, ad.valores); // sin cambios, ida y vuelta limpia
    expect(igual && igual.tipo === "omnifrecuencias" ? igual.entonacion.osciladores[0].vol : null).toBe(0.4);
    const visual: ParametrosSesion = { tipo: "audiomorphic", visual: { brillo: 0.5, forma: "onda" } };
    const ad2 = parametrosDeSesion(visual);
    expect(ad2.valores["visual::brillo"]).toBe(0.5);
    const v2 = sesionConValores(visual, { ...ad2.valores, "visual::brillo": 1 });
    expect(v2 && v2.tipo === "audiomorphic" ? v2.visual.brillo : null).toBe(1);
  });
});
