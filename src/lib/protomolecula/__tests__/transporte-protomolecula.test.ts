import { describe, expect, it } from "vitest";
import { crearEnlaceSesion, type MensajeProtomolecula } from "../transporte-protomolecula";
import { parametrosDeSesion, sesionDeParametros } from "../adaptador-estaciones";
import type { Cambio, Molecula, Operacion, Sesion } from "../tipos";
import { RelojComun } from "@/lib/estaciones/reloj-comun";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

const sesion = (transporte: Sesion["transporte"]): Sesion => ({
  id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "ana", miembros: { ana: "dueno" }, transporte, consentimientos: [], creadaEn: 0,
});
const molecula = (): Molecula => ({ id: "m1", titulo: "Prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0 });
const operacion = (id = "op1", valor = 0.7): Operacion => ({
  id, objetivo: { atomoId: "a1", parametroId: "vol" }, accion: { tipo: "exacta", valor }, autor: { tipo: "persona", id: "ana" }, origen: "mano", t: 0,
});
const cambio = (op: Operacion, antes = 0.2): Cambio => ({
  operacion: op, antes, despues: op.accion.tipo === "exacta" ? (op.accion.valor as number) : antes, acotado: false, reversible: true,
});

function bus() {
  const oyentes = new Map<string, Set<(m: MensajeProtomolecula) => void>>();
  const cola: Array<{ canal: string; mensaje: MensajeProtomolecula }> = [];
  const enviar = (canal: string, mensaje: MensajeProtomolecula) => { cola.push({ canal, mensaje }); };
  const entregar = () => { const lote = cola.splice(0, cola.length); for (const { canal, mensaje } of lote) for (const cb of oyentes.get(canal) ?? []) cb(mensaje); };
  const recibir = (canal: string, cb: (m: MensajeProtomolecula) => void) => {
    const set = oyentes.get(canal) ?? new Set<(m: MensajeProtomolecula) => void>();
    set.add(cb); oyentes.set(canal, set);
    return () => { set.delete(cb); };
  };
  return { recibir, enviar, entregar };
}

describe("transporte-protomolecula", () => {
  it("dos enlaces falsos conectados convergen y el t sale del reloj común", () => {
    const canal = bus();
    const reloj = new RelojComun({ relojLocal: () => 1000, esReferencia: true });
    const a = crearEnlaceSesion({ sesion: sesion("malla-p2p"), molecula: molecula(), reloj, dispositivo: "a", ...canal });
    const b = crearEnlaceSesion({ sesion: sesion("malla-p2p"), molecula: molecula(), reloj, dispositivo: "b", ...canal });
    const primera = operacion();
    const elemento = a.confirmar(primera, cambio(primera));
    canal.entregar();
    expect(elemento.actualizadoEn).toBe(1000);
    expect(a.estado().descripcionEnlace).toBe("malla P2P");
    expect(b.molecula().valores["a1::vol"]).toBe(0.7);
    const segunda = operacion("op2", 0.3);
    b.confirmar(segunda, cambio(segunda, 0.7));
    canal.entregar();
    expect(a.molecula().valores["a1::vol"]).toBe(0.3);
  });

  it("un gesto efímero se reenvía pero no se guarda; la presencia tampoco", () => {
    const canal = bus();
    const reloj = new RelojComun({ relojLocal: () => 1000, esReferencia: true });
    const a = crearEnlaceSesion({ sesion: sesion("malla-p2p"), molecula: molecula(), reloj, dispositivo: "a", ...canal });
    const b = crearEnlaceSesion({ sesion: sesion("malla-p2p"), molecula: molecula(), reloj, dispositivo: "b", ...canal });
    const antes = b.molecula();
    a.gesto({ atomoId: "a1", parametroId: "vol" }, 0.99);
    canal.entregar();
    expect(b.molecula()).toBe(antes);
    expect(b.molecula().valores).toEqual({});
    a.presencia("ana", "vol");
    canal.entregar();
    expect(b.estado().presencia).toEqual([{ dispositivo: "a", quien: "ana", que: "vol", t: 1000 }]);
  });

  it("sin muestras no inventa reloj ni latencia, y sin enlace es «solo en este aparato»", () => {
    const reloj = new RelojComun({ relojLocal: () => 500 });
    const enlace = crearEnlaceSesion({ sesion: sesion("local"), molecula: molecula(), reloj, dispositivo: "a", enviar: () => {}, recibir: () => () => {} });
    expect(enlace.estado().descripcionEnlace).toBe("solo en este aparato");
    expect(enlace.estado().reloj.precisionMs).toBeNull();
    expect(enlace.estado().precisionTexto).toContain("sin muestras");
    expect(enlace.estado().latencia).toEqual({ muestras: 0, p50Ms: null, p95Ms: null, texto: "sin medir" });
  });

  it("mide p50/p95 solo con el mínimo de muestras (reloj simulado)", () => {
    const canal = bus();
    let ahora = 0;
    const reloj = new RelojComun({ relojLocal: () => 0 });
    const a = crearEnlaceSesion({ sesion: sesion("malla-p2p"), molecula: molecula(), reloj, dispositivo: "a", ahora: () => ahora, minimoMuestras: 3, ...canal });
    crearEnlaceSesion({ sesion: sesion("malla-p2p"), molecula: molecula(), reloj, dispositivo: "b", ahora: () => ahora, ...canal });
    for (const rtt of [10, 20]) {
      a.medirLatencia(); canal.entregar(); ahora += rtt; canal.entregar();
    }
    expect(a.estado().latencia.texto).toBe("sin medir");
    for (const rtt of [30, 40, 50]) {
      a.medirLatencia(); canal.entregar(); ahora += rtt; canal.entregar();
    }
    expect(a.estado().latencia.muestras).toBe(5);
    expect(a.estado().latencia.p50Ms).toBe(30);
    expect(a.estado().latencia.p95Ms).toBe(48);
    expect(a.estado().latencia.texto).toContain("ida y vuelta");
  });
});

describe("adaptador-estaciones", () => {
  const base: ParametrosSesion = {
    tipo: "omnifrecuencias",
    entonacion: { volumen: 0.7, osciladores: [{ id: "o1", f: 440, onda: "sine", vol: 0.5, x: -0.2, y: 0.1, z: 0, onda2: "square", mezcla: 0.4, pulso: 2, nombre: "Graves" }] },
  };

  it("ida y vuelta de una entonación con el mismo panel", () => {
    const { parametros, valores } = parametrosDeSesion(base);
    expect(parametros.find((p) => p.id === "osc:o1:f")?.unidad).toBe("Hz");
    expect(valores["estacion::osc:o1:f"]).toBe(440);
    const vuelta = sesionDeParametros(base, { ...valores, "estacion::osc:o1:f": 880, "estacion::volumen": 0.9 });
    expect(vuelta.tipo).toBe("omnifrecuencias");
    if (vuelta.tipo === "omnifrecuencias") {
      expect(vuelta.entonacion.osciladores[0]).toMatchObject({ f: 880, onda: "sine", onda2: "square", mezcla: 0.4, pulso: 2 });
      expect(vuelta.entonacion.volumen).toBe(0.9);
    }
  });

  it("ida y vuelta de una espiral visual (número, booleano y texto)", () => {
    const visual: ParametrosSesion = { tipo: "audiomorphic", visual: { brillo: 0.4, activo: true, modo: "espiral" } };
    const { parametros, valores } = parametrosDeSesion(visual);
    expect(parametros.map((p) => p.tipo)).toEqual(["numero", "booleano", "opcion"]);
    const vuelta = sesionDeParametros(visual, { ...valores, "estacion::visual:brillo": 0.8 });
    expect(vuelta).toEqual({ tipo: "audiomorphic", visual: { brillo: 0.8, activo: true, modo: "espiral" } });
  });
});
