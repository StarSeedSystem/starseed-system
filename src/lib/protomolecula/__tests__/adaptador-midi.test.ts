import { describe, expect, it, vi } from "vitest";
import { analizarMensaje, conectarMidi, hayMidi, pedirAccesoMidi, SIN_MIDI, SIN_PERMISO, type EntradaMidi, type EventoMensajeMidi } from "../adaptador-midi";
import { MensajeControl } from "../almacen-vinculos";
import { cargarVinculos, claveVinculos, crearEnrutador, guardarVinculos, type OpcionesEnrutador, type MensajeControl } from "../almacen-vinculos";
import { crearControlador } from "../controlador";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { CURVA_LINEAL, type FuenteControl, type Vinculo } from "../vinculos-control";
import type { Operacion, Parametro, ParametroRef } from "../tipos";
/** NO hay ningún mando real conectado: los aparatos y el acceso del navegador están simulados aquí. */
type Oyente = (ev: EventoMensajeMidi) => void;
const entrada = (id: string, name: string | null) => {
  const oyentes = new Set<Oyente>();
  return { id, name, state: "connected", oyentes, addEventListener: (_t: "midimessage", f: Oyente) => void oyentes.add(f),
    removeEventListener: (_t: "midimessage", f: Oyente) => void oyentes.delete(f), enviar: (...b: number[]) => oyentes.forEach((f) => f({ data: new Uint8Array(b) })) };
};
const acceso = (...entradas: ReturnType<typeof entrada>[]) => {
  const avisos = new Set<() => void>();
  return { entradas, avisos, inputs: { forEach: (f: (e: EntradaMidi) => void) => entradas.forEach((e) => f(e)) }, cambiar: () => avisos.forEach((f) => f()),
    addEventListener: (_t: "statechange", f: () => void) => void avisos.add(f), removeEventListener: (_t: "statechange", f: () => void) => void avisos.delete(f) };
};
const ref: ParametroRef = { atomoId: "at-1", parametroId: "vol" };
const PARAMS: Record<string, Parametro> = { vol: { id: "vol", nombre: "Volumen", tipo: "numero", min: 0, max: 10, paso: 1 }, mudo: { id: "mudo", nombre: "Silencio", tipo: "booleano" } };
const cc = (numero: number, canal = 1, dispositivo?: string): FuenteControl => ({ tipo: "midi", mensaje: "cc", canal, numero, dispositivo });
const vin = (fuente: FuenteControl, o: Partial<Vinculo> = {}): Vinculo => ({ id: "v1", fuente, objetivo: ref, modo: "absoluto", curva: { ...CURVA_LINEAL }, activo: true, creadoPor: "ana", ...o });
const msg = (b: number[]): MensajeControl => analizarMensaje(b, "nanoKONTROL2") ?? { fuente: { tipo: "midi", mensaje: "cc", canal: 99 }, bruto: -1 };
let reloj = 1000, n = 0;
const montar = (vinculos: Vinculo[], extra: Partial<OpcionesEnrutador> = {}) => {
  const ops: Operacion[] = [], en = crearEnrutador({ vinculos, parametroDe: (r) => PARAMS[r.parametroId], autor: { tipo: "persona", id: "ana" }, ahora: () => reloj, nuevoId: () => `id-${++n}`,
    controlador: { mover: (op) => { ops.push(op); return { ok: false, motivo: "solo se anota" }; } }, ...extra });
  return { en, ops };
};
describe("analizarMensaje: bytes → fuente y valor bruto", () => {
  it("CC, nota, soltar y pitch bend de 14 bits, con canal 1–16 y aparato por nombre", () => {
    expect(analizarMensaje([0xb0, 7, 100], "Teclado")).toEqual({ fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 7, dispositivo: "Teclado" }, bruto: 100 });
    expect(analizarMensaje([0x9f, 36, 90])).toEqual({ fuente: { tipo: "midi", mensaje: "nota", canal: 16, numero: 36 }, bruto: 90 });
    expect([analizarMensaje([0x83, 36, 64])?.bruto, analizarMensaje([0x90, 36, 0])?.bruto, analizarMensaje([0xe0, 0x00, 0x40])?.bruto]).toEqual([0, 0, 8192]);
    expect(analizarMensaje([0xe5, 0x7f, 0x7f])).toEqual({ fuente: { tipo: "midi", mensaje: "pitch", canal: 6 }, bruto: 16383 });
  });
  it("ignora reloj, sysex, cambio de programa, presión, mensajes cortos y bytes de datos imposibles", () => {
    for (const b of [[0xf8, 0, 0], [0xf0, 1, 2], [0xc0, 5, 0], [0xd0, 9, 0], [0xb0, 7], [0x07, 1, 2], [0xb0, 0x80, 1], null]) expect(analizarMensaje(b)).toBeNull();
  });
});
describe("conectarMidi", () => {
  it("entrega cada mensaje con el nombre del aparato (o su id si no lo tiene)", () => {
    const a = entrada("in-1", "nanoKONTROL2"), b = entrada("in-2", null), recibidos: MensajeControl[] = [];
    conectarMidi(acceso(a, b), (m) => recibidos.push(m)); a.enviar(0xb0, 7, 64); b.enviar(0x90, 36, 100); a.enviar(0xf8, 0, 0);
    expect(recibidos.map((m) => m.fuente.dispositivo)).toEqual(["nanoKONTROL2", "in-2"]);
  });
  it("altas y bajas: escucha lo que se enchufa y suelta lo que se desenchufa", () => {
    const a = entrada("in-1", "A"), b = entrada("in-2", "B"), ac = acceso(a), nombres: string[][] = [];
    conectarMidi(ac, () => {}, (x) => nombres.push(x)); ac.entradas.push(b); ac.cambiar(); a.state = "disconnected"; ac.cambiar();
    expect(nombres).toEqual([["A"], ["A", "B"], ["B"]]); expect([a.oyentes.size, b.oyentes.size]).toEqual([0, 1]);
  });
  it("desconectar: no llega nada más y se sueltan todos los oyentes", () => {
    const a = entrada("in-1", "A"), ac = acceso(a), recibir = vi.fn(), desconectar = conectarMidi(ac, recibir);
    a.enviar(0xb0, 1, 10); desconectar(); a.enviar(0xb0, 1, 20); ac.cambiar();
    expect(recibir).toHaveBeenCalledTimes(1); expect([a.oyentes.size, ac.avisos.size]).toEqual([0, 0]);
  });
});
describe("pedirAccesoMidi: el permiso solo se pide al pulsar «Conectar mandos»", () => {
  it("sin Web MIDI (Safari) dice el motivo; denegado da el suyo; concedido devuelve el acceso, sin sysex", async () => {
    expect([hayMidi({}), hayMidi(undefined)]).toEqual([false, false]); expect(await pedirAccesoMidi({})).toEqual({ ok: false, motivo: SIN_MIDI });
    const negado = { requestMIDIAccess: () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })) };
    expect(await pedirAccesoMidi(negado)).toEqual({ ok: false, motivo: SIN_PERMISO });
    const ac = acceso(), pedir = vi.fn(async (_o?: { sysex?: boolean }) => ac), r = await pedirAccesoMidi({ requestMIDIAccess: pedir });
    expect(r.ok && r.acceso).toBe(ac); expect(pedir).toHaveBeenCalledWith({ sysex: false });
  });
});
describe("crearEnrutador: mandos → controlador.mover con origen midi", () => {
  it("fader absoluto: respeta el paso y no repite cambios menores que medio paso; sin aparato vale cualquiera", () => {
    const { en, ops } = montar([vin(cc(7))]); for (const v of [64, 65, 127]) en.recibir(msg([0xb0, 7, v]));
    expect(ops.map((o) => o.accion)).toEqual([{ tipo: "exacta", valor: 5 }, { tipo: "exacta", valor: 10 }]);
    expect(ops.every((o) => o.origen === "midi" && o.autor.id === "ana" && o.fuente === "midi:*:cc:1:7")).toBe(true);
  });
  it("encoder relativo: 1–63 suma pasos, 65–127 resta y 64 no hace nada", () => {
    const { en, ops } = montar([vin(cc(10), { modo: "relativo" })]); for (const v of [1, 64, 127, 3]) en.recibir(msg([0xb0, 10, v]));
    expect(ops.map((o) => o.accion)).toEqual([1, -1, 3].map((cantidad) => ({ tipo: "relativa", cantidad, modo: "pasos" })));
  });
  it("nota → alternar: cualquier velocidad pulsa; soltar (también velocidad 0) no hace nada", () => {
    const { en, ops } = montar([vin({ tipo: "midi", mensaje: "nota", canal: 1, numero: 36 }, { modo: "alternar", objetivo: { ...ref, parametroId: "mudo" } })]);
    for (const b of [[0x90, 36, 30], [0x80, 36, 64], [0x90, 36, 100], [0x90, 36, 0], [0x90, 37, 100]]) en.recibir(msg(b));
    expect(ops.map((o) => o.accion.tipo)).toEqual(["alternar", "alternar"]);
  });
  it("vínculo apagado no mueve; el de otro aparato tampoco; un parámetro que ya no existe se dice", () => {
    const { en, ops } = montar([vin(cc(7), { activo: false }), vin(cc(7, 1, "Otro"), { id: "v2" }), vin(cc(7), { id: "v3", objetivo: { ...ref, parametroId: "borrado" } })]);
    expect(en.recibir(msg([0xb0, 7, 100]))).toEqual([{ vinculoId: "v3", resultado: { ok: false, motivo: "El parámetro de este vínculo ya no existe" } }]); expect(ops).toHaveLength(0);
  });
  it("aprender un CC entre el ruido de otro control: no mueve nada mientras aprende, confirma, guarda y caduca a los 15 s", () => {
    const guardar = vi.fn(), { en, ops } = montar([vin(cc(1))], { alCambiarVinculos: guardar });
    en.aprender(ref); expect(en.confirmar()).toMatchObject({ ok: false });
    for (const [num, v] of [[1, 64], [7, 0], [1, 65], [7, 40], [1, 64], [7, 90]]) en.recibir(msg([0xb0, num, v]));
    expect(ops).toHaveLength(0); expect(en.estadoAprender()).toMatchObject({ fase: "detectado", fuente: { mensaje: "cc", numero: 7, dispositivo: "nanoKONTROL2" } });
    const r = en.confirmar();
    expect([r.ok && r.vinculo.modo, en.estadoAprender().fase, guardar.mock.calls.length, en.vinculos().length]).toEqual(["absoluto", "inactivo", 1, 2]);
    en.recibir(msg([0xb0, 7, 127])); expect(ops.map((o) => o.fuente)).toEqual(["midi:nanoKONTROL2:cc:1:7"]);
    en.aprender(ref); reloj += 15001; expect(en.tic()).toEqual({ fase: "cancelado", motivo: "caducado" });
  });
  it("con el controlador real: el valor de la molécula cambia con origen midi y se puede deshacer", () => {
    limpiarRegistro();
    registrarAtomo({ herramientaId: "mezclador", nombre: "Mezclador", categoria: "audio", integracion: "libreria-js", control: "total", parametros: [PARAMS.vol], entradas: [], salidas: [] });
    const c = crearControlador({ molecula: { id: "m1", titulo: "Prueba", ambito: "personal", capas: [], atomos: [{ id: "at-1", herramientaId: "mezclador", estado: "activo" }], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 },
      rol: "dueno", ahora: () => reloj, nuevoId: () => `c-${++n}` });
    expect(montar([vin(cc(7))], { controlador: c }).en.recibir(msg([0xb0, 7, 127]))[0].resultado.ok).toBe(true);
    expect(c.obtener().molecula.valores["at-1::vol"]).toBe(10); expect(c.deshacer("ana").ok).toBe(true);
  });
});
describe("almacén de vínculos por molécula", () => {
  it("ida y vuelta por molécula, descartando lo que no es un vínculo válido", () => {
    const datos = new Map<string, string>(), v = vin(cc(7, 2, "Teclado"));
    const a = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, x: string) => void datos.set(k, x), removeItem: (k: string) => void datos.delete(k) };
    expect([guardarVinculos(a, "m1", [v]), guardarVinculos(a, "m1", [{ ...v, modo: "magia" } as unknown as Vinculo])]).toEqual([true, false]);
    expect([cargarVinculos(a, "m1"), cargarVinculos(a, "m2")]).toEqual([[v], []]);
    datos.set(claveVinculos("m1"), JSON.stringify([v, { ...v, fuente: { tipo: "midi", mensaje: "cc", canal: 17 } }, "basura"]));
    expect(cargarVinculos(a, "m1")).toEqual([v]); expect(claveVinculos("m1")).toBe("starseed.protomolecula.vinculos.v1:m1");
  });
  it("un almacén que lanza, JSON roto o ningún almacén: nunca rompe", () => {
    const roto = { getItem: (): string | null => { throw new Error("cuota"); }, setItem: () => { throw new Error("cuota"); }, removeItem: () => {} };
    expect([cargarVinculos(roto, "m1"), guardarVinculos(roto, "m1", [vin(cc(7))]), cargarVinculos({ ...roto, getItem: () => "{no es json" }, "m1")]).toEqual([[], false, []]);
    expect([cargarVinculos(null, "m1"), guardarVinculos(null, "m1", [])]).toEqual([[], false]);
  });
});
