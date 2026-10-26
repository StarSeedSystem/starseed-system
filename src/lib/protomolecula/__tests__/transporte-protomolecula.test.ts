import { describe, expect, it } from "vitest";
import { CANAL_SESION, crearEnlaceSesion, type MensajeSesion, type OpcionesEnlaceSesion, type PuertaSesion, type RelojSesion, type VistaEnlace } from "../transporte-protomolecula";
import type { Cambio, EstadoValores, Molecula, Operacion, ValorParametro } from "../tipos";
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";

/** Pruebas SIN red: cada enlace falsa la puerta (`PuertaSesion`) y el reloj (todo inyectado). */
type Oyente = (m: MensajeSesion, e: VistaEnlace | null) => void;
const barrera: VistaEnlace = { tipo: "local", etiqueta: "Enlace local de prueba" };
let comun = 5_000;
let local = 20_000;

/** Una red falsa: `enviar` lo entrega de golpe a los demás aparatos (y a sí misma, si se pide). */
const crearRed = (ecoPropio = false) => {
  const bocas = new Map<string, Oyente>();
  const ida = { ms: 0 };
  const boca = (id: string): PuertaSesion => ({
    enviar: (m) => {
      local += ida.ms; // el retardo del camino de ida, simulado con el reloj
      for (const [dest, cb] of bocas) if (dest !== id || ecoPropio) cb(m, barrera);
      return barrera;
    },
    recibir: (cb) => { bocas.set(id, cb); },
  });
  return { boca, ida };
};

const estadoReloj = (modo: EstadoReloj["modo"], precisionMs: number | null): EstadoReloj =>
  ({ modo, desfaseMs: 0, derivaPpm: 0, precisionMs, cotaMs: null, retardoMinMs: null, muestras: precisionMs === null ? 0 : 3, ultimaMuestra: null });
const reloj = (e: EstadoReloj = estadoReloj("referencia", 0)): RelojSesion => ({ hora: () => comun, horaLocal: () => local, informe: () => e });

const molecula = (): Molecula => ({ id: "m1", titulo: "Prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 });
const exacta = (valor: number, t = comun): Operacion =>
  ({ id: `op-${valor}`, objetivo: { atomoId: "at-1", parametroId: "vol" }, accion: { tipo: "exacta", valor }, autor: { tipo: "persona", id: "ana" }, origen: "mano", t });
const cambioDe = (o: Operacion): Cambio => ({ operacion: o, antes: 5, despues: (o.accion as { valor: ValorParametro }).valor, acotado: false, reversible: true });

const montar = (puerta: PuertaSesion, extra: Partial<OpcionesEnlaceSesion> = {}) => {
  const estado = molecula();
  const recibidas: Molecula[] = [];
  const gestos: Array<{ atomoId: string; parametroId: string; valor?: ValorParametro }> = [];
  const presencias: Array<{ atomoId: string; parametroId: string; quien?: string }> = [];
  const enl = crearEnlaceSesion({
    sesion: "s1", dispositivo: "X", puerta, molecula: () => estado, reloj: reloj(),
    alMolecula: (m) => recibidas.push(m), alGesto: (d) => gestos.push(d), alPresencia: (d) => presencias.push(d),
    ...extra,
  });
  return { enl, estado, recibidas, gestos, presencias };
};

const valoresDe = (moleculas: Molecula[]): EstadoValores | undefined => moleculas[moleculas.length - 1]?.valores;

describe("canal de sesión sobre una puerta inyectada", () => {
  it("el canal de aplicación es «protomolecula», del contrato", () => {
    expect(CANAL_SESION).toBe("protomolecula");
  });

  it("dos aparatos conectados convergen: lo que difunde uno llega al otro, en las dos direcciones", () => {
    const red = crearRed();
    const a = montar(red.boca("A"), { dispositivo: "A" });
    const b = montar(red.boca("B"), { dispositivo: "B" });
    a.enl.difundir(exacta(7), cambioDe(exacta(7)));
    expect(valoresDe(b.recibidas)).toEqual({ "at-1::vol": 7 });
    expect(b.recibidas.at(-1)?.version).toBe(1);
    b.enl.difundir(exacta(3), cambioDe(exacta(3)));
    expect(valoresDe(a.recibidas)).toEqual({ "at-1::vol": 3 });
    // 3 aparatos en la misma red falsa: todos leen lo mismo.
    const c = montar(red.boca("C"), { dispositivo: "C" });
    a.enl.difundir(exacta(2), cambioDe(exacta(2)));
    expect(valoresDe(b.recibidas)).toEqual({ "at-1::vol": 2 });
    expect(valoresDe(c.recibidas)).toEqual({ "at-1::vol": 2 });
  });

  it("anti-eco: lo propio no se aplica; otra sesión tampoco", () => {
    const red = crearRed(true);
    const a = montar(red.boca("A"), { dispositivo: "A" });
    a.enl.difundir(exacta(7), cambioDe(exacta(7)));
    expect(a.recibidas).toHaveLength(0);
    const otro = montar(red.boca("B"), { dispositivo: "B", sesion: "s2" });
    a.enl.difundir(exacta(7), cambioDe(exacta(7)));
    expect(otro.recibidas).toHaveLength(0);
  });

  it("el gesto efímero se AVISA y jamás se guarda, y no se repite dentro de la rejilla de 16 ms", () => {
    local = 10_000;
    const red = crearRed();
    const a = montar(red.boca("A"), { dispositivo: "A" });
    const b = montar(red.boca("B"), { dispositivo: "B" });
    a.enl.gesto("at-1", "vol", 0.3);
    expect(b.gestos).toEqual([{ atomoId: "at-1", parametroId: "vol", valor: 0.3 }]);
    local += 10; // dentro de los 16 ms: no es el último valor, no se manda
    a.enl.gesto("at-1", "vol", 0.4);
    expect(b.gestos).toHaveLength(1);
    local += 20;
    a.enl.gesto("at-1", "vol", 0.5);
    expect(b.gestos.map((g) => g.valor)).toEqual([0.3, 0.5]);
    // No se guarda: ni fusión ni estado.
    expect(b.recibidas).toHaveLength(0);
    expect(b.estado.valores).toEqual({});
    expect(b.enl.latencia().texto).toBe("sin medir");
  });

  it("la presencia (P0) llega con quién mueve qué y no toca el estado", () => {
    const red = crearRed();
    const a = montar(red.boca("A"), { dispositivo: "A" });
    const b = montar(red.boca("B"), { dispositivo: "B" });
    a.enl.presencia({ atomoId: "at-1", parametroId: "vol", quien: "Ana" });
    expect(b.presencias).toEqual([{ atomoId: "at-1", parametroId: "vol", quien: "Ana" }]);
    expect(b.estado.valores).toEqual({});
  });

  it("el medidor: sin muestras, «sin medir»; con las suficientes, p50 y p95 sobre el reloj local", () => {
    local = 30_000;
    const red = crearRed();
    const a = montar(red.boca("A"), { dispositivo: "A", muestrasMinimas: 3 });
    const b = montar(red.boca("B"), { dispositivo: "B" }); // quien contesta los ecos
    expect(a.enl.latencia()).toEqual({ muestras: 0, minimoMs: null, p50Ms: null, p95Ms: null, texto: "sin medir" });
    for (const ms of [3, 4, 5]) { red.ida.ms = ms; a.enl.medir(); } // ida y vuelta: 6, 8 y 10 ms
    expect(a.enl.latencia()).toEqual({ muestras: 3, minimoMs: 6, p50Ms: 8, p95Ms: 10, texto: "p50 8 ms · p95 10 ms (3 muestras)" });
    // Con menos muestras de las mínimas sigue sin medir, aunque ya haya alguna.
    const corto = montar(red.boca("C"), { dispositivo: "C", muestrasMinimas: 3 });
    red.ida.ms = 4;
    corto.enl.medir();
    expect(corto.enl.latencia()).toEqual({ muestras: 1, minimoMs: expect.any(Number), p50Ms: null, p95Ms: null, texto: "sin medir" });
  });

  it("el reloj común enseña su modo y su precisión; sin muestras, sin cifra; y el enlace se dice", () => {
    const red = crearRed();
    const a = montar(red.boca("A"), { dispositivo: "A", reloj: reloj(estadoReloj("sincronizado", 4)) });
    expect(a.enl.horaComun()).toBe(comun);
    expect(a.enl.informeReloj()).toEqual({ modo: "sincronizado", precisionMs: 4, texto: "sincronizado · precisión ±4 ms" });
    const sin = montar(red.boca("B"), { dispositivo: "B", reloj: reloj(estadoReloj("sin-referencia", null)) });
    expect(sin.enl.informeReloj()).toEqual({ modo: "sin-referencia", precisionMs: null, texto: "sin referencia · sin muestras" });
    expect(sin.enl.canal()).toBe("solo en este aparato");
    a.enl.difundir(exacta(1), cambioDe(exacta(1)));
    expect(a.enl.canal()).toBe("Enlace local de prueba");
    expect(sin.enl.canal()).toBe("Enlace local de prueba"); // recibir también enseña el enlace
  });
});
