import { describe, it, expect } from "vitest";
import { crearEnlaceSesion, MIN_MUESTRAS_LATENCIA, type OpcionesEnlaceSesion, type RelojSesion } from "../transporte-protomolecula";
import { parametrosDeSesion, sesionDeParametros } from "../adaptador-estaciones";
import { aplicarOperacion } from "../parametros";
import type { Cambio, Operacion, Parametro, Sesion } from "../tipos";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

type Enviar = OpcionesEnlaceSesion["enviar"];
type Recibir = OpcionesEnlaceSesion["recibir"];
type RelojPrueba = RelojSesion & { avanzar(ms: number): void };

const P: Parametro = { id: "brillo", nombre: "brillo", tipo: "numero", min: 0, max: 100, unidad: "%" };
const sesion = (anfitrion: string): Sesion => ({
  id: `s-${anfitrion}`, moleculaId: "mol-1", ambito: "personal", anfitrion,
  miembros: { [anfitrion]: "dueno" }, transporte: "malla-p2p", consentimientos: [], creadaEn: 0,
});
const relojPrueba = (precisionMs: number | null = 1.5, muestras = 10): RelojPrueba => {
  let t = 1000;
  return {
    ahora: () => t,
    avanzar: (ms) => { t += ms; },
    estado: () => ({ modo: muestras > 0 ? "sincronizado" : "sin-referencia", precisionMs, cotaMs: precisionMs == null ? null : 2, muestras }),
  };
};
const operacion = (valor: number, autor: string): Operacion => ({
  id: `op-${valor}`, objetivo: { atomoId: "at-1", parametroId: "brillo" },
  accion: { tipo: "exacta", valor }, autor: { tipo: "persona", id: autor }, origen: "mano", t: 0,
});
const cambio = (valor: number, autor: string): Cambio => {
  const r = aplicarOperacion({}, P, operacion(valor, autor));
  if (!r.ok) throw new Error("cambio de prueba inválido");
  return r.cambio;
};
const crearPar = () => {
  let a: ((m: unknown) => void) | null = null, b: ((m: unknown) => void) | null = null;
  const enlace = { id: "l-1", tipo: "local", etiqueta: "Enlace local" };
  const enviarA: Enviar = (m) => { b?.(m); return { ok: true, enlace }; };
  const enviarB: Enviar = (m) => { a?.(m); return { ok: true, enlace }; };
  const recibirA: Recibir = (cb) => { a = cb; return () => { a = null; }; };
  const recibirB: Recibir = (cb) => { b = cb; return () => { b = null; }; };
  return { enviarA, enviarB, recibirA, recibirB };
};

describe("transporte de la Protomolécula", () => {
  it("dos enlaces falsos conectados convergen y la t sale del reloj común", () => {
    const reloj = relojPrueba(), par = crearPar();
    const a = crearEnlaceSesion({ sesion: sesion("A"), enviar: par.enviarA, recibir: par.recibirA, reloj });
    const b = crearEnlaceSesion({ sesion: sesion("B"), enviar: par.enviarB, recibir: par.recibirB, reloj });
    const enviada = a.enviarConfirmacion(operacion(40, "u-a"), cambio(40, "u-a"));
    expect(enviada.t).toBe(reloj.ahora());
    reloj.avanzar(1);
    b.enviarConfirmacion(operacion(60, "u-b"), cambio(60, "u-b"));
    expect(a.valores()["at-1::brillo"]).toBe(60);
    expect(b.valores()["at-1::brillo"]).toBe(60);
    expect(a.enlace().descripcion).toContain("Enlace local");
    expect(b.elementos()).toHaveLength(1);
  });

  it("un gesto efímero no se guarda ni en la molécula ni en los valores", () => {
    const reloj = relojPrueba(), par = crearPar();
    const a = crearEnlaceSesion({ sesion: sesion("A"), enviar: par.enviarA, recibir: par.recibirA, reloj });
    const b = crearEnlaceSesion({ sesion: sesion("B"), enviar: par.enviarB, recibir: par.recibirB, reloj });
    a.enviarGesto({ atomoId: "at-1", parametroId: "brillo" }, 55);
    reloj.avanzar(16);
    expect(a.elementos()).toHaveLength(0);
    expect(b.elementos()).toHaveLength(0);
    expect(b.valores()["at-1::brillo"]).toBeUndefined();
    expect(b.gestos()).toHaveLength(1);
    expect(b.gestos()[0].valor).toBe(55);
    a.moverPresencia({ atomoId: "at-1", parametroId: "brillo" }, 30);
    expect(b.presencias()).toHaveLength(1);
    expect(b.presencias()[0].de).toBe("A");
  });

  it("sin muestras no inventa precisión de reloj ni latencia", () => {
    const reloj = relojPrueba(null, 0);
    const enviar: Enviar = () => ({ ok: true, enlace: { id: "l-1", tipo: "local", etiqueta: "Enlace local" } });
    const e = crearEnlaceSesion({ sesion: sesion("A"), enviar, recibir: () => () => {}, reloj });
    expect(e.enlace().descripcion).toBe("solo en este aparato");
    expect(e.latencia()).toMatchObject({ medido: false, p50Ms: null, p95Ms: null, texto: "sin medir" });
    expect(e.precisionReloj().precisionMs).toBeNull();
    expect(e.precisionReloj().texto).toContain("sin muestras");
    for (let i = 0; i < MIN_MUESTRAS_LATENCIA - 1; i++) {
      const id = e.ping();
      reloj.avanzar(5);
      e.recibirMensaje({ v: 1, tipo: "pong", de: "B", t: reloj.ahora(), id });
    }
    expect(e.latencia().medido).toBe(false);
    const id = e.ping();
    reloj.avanzar(7);
    e.recibirMensaje({ v: 1, tipo: "pong", de: "B", t: reloj.ahora(), id });
    const latencia = e.latencia();
    expect(latencia.medido).toBe(true);
    expect(latencia.muestras).toBe(MIN_MUESTRAS_LATENCIA);
    expect(latencia.p50Ms).toBeGreaterThan(0);
    expect(latencia.p95Ms).toBeGreaterThanOrEqual(latencia.p50Ms ?? 0);
  });

  it("adaptador de estaciones: ida y vuelta sin pérdida", () => {
    const omni: ParametrosSesion = { tipo: "omnifrecuencias", entonacion: { volumen: 0.7, osciladores: [
      { id: "o0", f: 432, onda: "sine", vol: 0.6, x: 0.1, y: -0.2, z: 0.3 },
      { id: "o1", f: 528, onda: "triangle", vol: 0.4, x: 0, y: 0, z: 0, onda2: "square", mezcla: 0.25, pulso: 4 },
    ] } };
    const lienzo = parametrosDeSesion(omni);
    expect(lienzo.valores["estacion::volumen"]).toBe(0.7);
    expect(sesionDeParametros(lienzo)).toEqual(omni);
    const audiomorphic: ParametrosSesion = { tipo: "audiomorphic", visual: { a: 1, b: true, c: "x" } };
    expect(sesionDeParametros(parametrosDeSesion(audiomorphic))).toEqual(audiomorphic);
  });
});
