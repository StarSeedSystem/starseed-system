/**
 * OPD1010 · 2026-10-10 — En el navegador, `/estaciones/vivo/<id>` se quedaba en «conectando»:
 * la consola decía «TypeError: Illegal invocation at arrancar / alAbrirCanal». La sesión
 * guardaba `setTimeout` en un campo y lo llamaba como método (`this.poner(fn, ms)`), y el
 * `setTimeout` del navegador exige `this` = window. Node no lo exige, y las pruebas de
 * `sesion-en-vivo.test.ts` inyectan temporizadores propios: nadie probaba el de serie.
 * Aquí se simula el `setTimeout` estricto del navegador y se usa el de serie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearLlaves, idDeLlave } from "../cripto-estacion";
import { SesionEnVivo, type CanalEstacion } from "../sesion-en-vivo";
import type { FichaSesion } from "../transmision-parametrica";

const realSet = globalThis.setTimeout;
const realClear = globalThis.clearTimeout;

/** Como el del navegador: con `this` que no sea el global, «Illegal invocation». */
function estricto<F extends (...a: never[]) => unknown>(real: F): F {
  return function (this: unknown, ...args: Parameters<F>) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return (real as unknown as (...a: Parameters<F>) => unknown)(...args);
  } as unknown as F;
}

function canalAbierto(): CanalEstacion & { abrir(): void } {
  const alAbrir = new Set<() => void>();
  let abierto = false;
  return {
    tipo: "internet",
    etiqueta: "Internet (Supabase Realtime)",
    enviar: () => undefined,
    alRecibir: () => () => undefined,
    abierto: () => abierto,
    oyentes: () => 0,
    alAbrir(cb) {
      alAbrir.add(cb);
      return () => alAbrir.delete(cb);
    },
    abrir() {
      abierto = true;
      for (const cb of Array.from(alAbrir)) cb();
    },
    cerrar: () => undefined,
  };
}

async function ficha(): Promise<FichaSesion> {
  const llaves = await crearLlaves();
  return {
    v: 1,
    id: await idDeLlave(llaves.publica),
    fuente: "omnifrecuencias",
    titulo: "Prueba de temporizadores",
    enlace: "/estaciones",
    pk: llaves.publica,
    privada: false,
    params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.5, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
    creada: Date.now(),
  };
}

describe("SesionEnVivo con los temporizadores de serie del navegador", () => {
  beforeEach(() => {
    vi.stubGlobal("setTimeout", estricto(realSet));
    vi.stubGlobal("clearTimeout", estricto(realClear));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arrancar, abrir el canal de internet y cerrar no lanzan «Illegal invocation»", async () => {
    const s = new SesionEnVivo({ ficha: await ficha() });
    const canal = canalAbierto();
    s.agregarCanal(canal);
    expect(() => s.arrancar()).not.toThrow();
    expect(() => canal.abrir()).not.toThrow();
    expect(s.foto().canales).toEqual([{ tipo: "internet", etiqueta: "Internet (Supabase Realtime)", abierto: true }]);
    expect(() => s.cerrar()).not.toThrow();
  });

  it("un canal ya abierto al añadirse tras arrancar tampoco revienta", async () => {
    const s = new SesionEnVivo({ ficha: await ficha() });
    s.arrancar();
    const canal = canalAbierto();
    canal.abrir();
    expect(() => s.agregarCanal(canal)).not.toThrow();
    s.cerrar();
  });
});
