import { describe, expect, it } from "vitest";
import { CANAL_PROTOMOLECULA, crearEnlaceSesion } from "../transporte-protomolecula";
import { parametrosDeSesion, sesionDesdeParametros } from "../adaptador-estaciones";
import type { Cambio, Molecula, Operacion, Sesion } from "../tipos";
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";
const sesion: Sesion = { id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "yo", miembros: { yo: "dueno" }, transporte: "malla-p2p", consentimientos: [], creadaEn: 0 };
const molecula = (): Molecula => ({ id: "m1", titulo: "", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 });
const op = (id: string, valor: number): Operacion => ({ id, objetivo: { atomoId: "ato1", parametroId: "volumen" }, accion: { tipo: "exacta", valor }, autor: { tipo: "persona", id: "ana" }, origen: "mano", t: 0 });
const cambio = (o: Operacion, antes: number, despues: number): Cambio => ({ operacion: o, antes, despues, acotado: false, reversible: true });
function relojFalso(inicial = 1000) {
  let t = inicial;
  return { ahora: () => t, avanzar: (ms: number) => { t += ms; }, estado: (): EstadoReloj => ({ modo: "sin-referencia", desfaseMs: 0, derivaPpm: 0, precisionMs: null, cotaMs: null, retardoMinMs: null, muestras: 0, ultimaMuestra: null }) };
}
type RelojFalso = ReturnType<typeof relojFalso>;
type Oyente = (m: { id: string; cuerpo: unknown }) => void;
interface Extremo {
  latencia: number; otro: Extremo | null;
  recibir(canal: string, cb: Oyente): () => void;
  entregar(canal: string, cuerpo: unknown): void;
  enviar(destino: unknown, canal: string, cuerpo: unknown): Promise<{ ok: boolean; enlace: { id: string; tipo: string; etiqueta: string } }>;
}
function extremo(reloj: RelojFalso): Extremo {
  const oyentes = new Map<string, Set<Oyente>>();
  let n = 0;
  const e: Extremo = {
    latencia: 0, otro: null,
    recibir(canal, cb) { const set = oyentes.get(canal) ?? new Set<Oyente>(); set.add(cb); oyentes.set(canal, set); return () => { set.delete(cb); }; },
    entregar(canal, cuerpo) { expect(canal).toBe(CANAL_PROTOMOLECULA); for (const cb of Array.from(oyentes.get(canal) ?? [])) cb({ id: `m${++n}`, cuerpo }); },
    async enviar(_destino, canal, cuerpo) { reloj.avanzar(e.latencia); e.otro?.entregar(canal, cuerpo); return { ok: true, enlace: { id: `local:${n}`, tipo: "local", etiqueta: "Enlace de prueba" } }; },
  };
  return e;
}
const conectar = (a: Extremo, b: Extremo) => { a.otro = b; b.otro = a; };
const enlaceDe = (ex: Extremo, reloj: RelojFalso, mol = molecula()) => crearEnlaceSesion({ sesion, enviar: ex.enviar, recibir: ex.recibir, reloj, molecula: mol });
describe("transporte de la sesión", () => {
  it("dos enlaces falsos conectados convergen", async () => {
    const reloj = relojFalso();
    const a = extremo(reloj), b = extremo(reloj);
    conectar(a, b);
    const ea = enlaceDe(a, reloj), eb = enlaceDe(b, reloj);
    const oa = op("a", 0.8);
    await ea.confirmar(oa, cambio(oa, 0.2, 0.8));
    expect(eb.molecula().valores["ato1::volumen"]).toBe(0.8);
    const ob = op("b", 0.4);
    await eb.confirmar(ob, cambio(ob, 0.8, 0.4));
    expect(ea.molecula().valores["ato1::volumen"]).toBe(0.4);
    expect(ea.molecula().valores).toEqual(eb.molecula().valores);
    expect(ea.estado().transporte).toBe("local");
    expect(eb.estado().enlace?.etiqueta).toBe("Enlace de prueba");
  });
  it("un gesto efímero se ve pero no se guarda", async () => {
    const reloj = relojFalso();
    const a = extremo(reloj), b = extremo(reloj);
    conectar(a, b);
    const ea = enlaceDe(a, reloj), eb = enlaceDe(b, reloj);
    await ea.gesto({ atomoId: "ato1", parametroId: "volumen" }, 0.9);
    expect(eb.ultimoGesto()).toMatchObject({ de: "yo", valor: 0.9 });
    expect(eb.molecula().valores).toEqual({});
    expect(eb.estado().gestos).toBe(1);
    expect(eb.presencia()).toEqual([{ de: "yo", ref: { atomoId: "ato1", parametroId: "volumen" }, t: 1000 }]);
  });
  it("sin muestras no inventa latencia ni precisión de reloj", () => {
    const reloj = relojFalso();
    const estado = enlaceDe(extremo(reloj), reloj).estado();
    expect(estado.latencia).toEqual({ muestras: 0, p50Ms: null, p95Ms: null, texto: "sin medir" });
    expect(estado.transporte).toBe("solo-en-este-aparato");
    expect(estado.motivo).toBe("solo en este aparato");
    expect(estado.reloj.precisionMs).toBeNull();
  });
  it("mide p50 y p95 con reloj simulado tras el mínimo de muestras", async () => {
    const reloj = relojFalso();
    const a = extremo(reloj), b = extremo(reloj);
    conectar(a, b);
    const enlace = enlaceDe(a, reloj);
    enlaceDe(b, reloj);
    for (const latencia of [5, 10, 15]) {
      a.latencia = latencia; b.latencia = latencia;
      await enlace.ping();
    }
    const lat = enlace.estado().latencia;
    expect(lat.muestras).toBe(3);
    expect(lat.p50Ms).toBe(20);
    expect(lat.p95Ms).toBe(30);
    expect(lat.texto).toBe("p50 20 ms · p95 30 ms");
  });
});
describe("adaptador de estaciones", () => {
  const entonacion: ParametrosSesion = {
    tipo: "omnifrecuencias",
    entonacion: {
      volumen: 0.8,
      osciladores: [
        { id: "osc1", f: 440, onda: "sine", vol: 0.6, x: 0, y: 0, z: 0, onda2: "square", mezcla: 0.25, pulso: 2, nombre: "Voz" },
        { id: "osc2", f: 220, onda: "triangle", vol: 0.4, x: -0.5, y: 0.1, z: 0.2 },
      ],
    },
  };
  it("ida y vuelta de Omnifrecuencias conserva lo que existe", () => {
    const adaptado = parametrosDeSesion(entonacion);
    expect(adaptado.valores["osc1::f"]).toBe(440);
    expect(adaptado.valores["estacion::volumen"]).toBe(0.8);
    expect(adaptado.parametros.find((p) => p.id === "osc1::onda")?.opciones).toContain("sawtooth");
    expect(sesionDesdeParametros(entonacion, adaptado.valores)).toEqual(entonacion);
  });
  it("el panel puede mover la entonación y el inverso lo refleja", () => {
    const adaptado = parametrosDeSesion(entonacion);
    const movido = { ...adaptado.valores, "osc1::vol": 0.15, "osc1::onda": "sawtooth", "estacion::volumen": 0.5 };
    const vuelta = sesionDesdeParametros(entonacion, movido);
    if (vuelta.tipo !== "omnifrecuencias") throw new Error("tipo inesperado");
    expect(vuelta.entonacion.osciladores[0]).toMatchObject({ vol: 0.15, onda: "sawtooth", mezcla: 0.25, pulso: 2 });
    expect(vuelta.entonacion.volumen).toBe(0.5);
  });
  it("ida y vuelta de Audiomorphic conserva números, booleanos y textos", () => {
    const visual: ParametrosSesion = { tipo: "audiomorphic", visual: { zoom: 1.5, activo: true, modo: "espiral" } };
    const adaptado = parametrosDeSesion(visual);
    expect(adaptado.valores["visual::modo"]).toBe("espiral");
    expect(sesionDesdeParametros(visual, adaptado.valores)).toEqual(visual);
  });
});
