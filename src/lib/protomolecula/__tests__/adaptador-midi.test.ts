import { describe, it, expect } from "vitest";
import { analisisMensaje, conectarMidi, type AccesoMidiMinimo, type EntradaMidiMinima, type MensajeMidi } from "../adaptador-midi";
import { cargarVinculos, guardarVinculos, crearEnrutador, PREFIJO_VINCULOS } from "../almacen-vinculos";
import { siguienteAprender, vinculoAprendido, CURVA_LINEAL, type EstadoAprender, type Vinculo } from "../vinculos-control";
import type { Autor, Operacion, Parametro, ParametroRef } from "../tipos";

/** Entrada MIDI falsa: sin hardware, los mensajes se inyectan a mano. */
function entradaFalsa(nombre?: string): EntradaMidiMinima & { emitir(d: number[]): void } {
  let f: ((ev: { data: number[] }) => void) | null = null;
  return {
    name: nombre,
    addEventListener: (_t, fn) => { f = fn as (ev: { data: number[] }) => void; },
    removeEventListener: (_t, fn) => { if (f === fn) f = null; },
    emitir: (d) => f?.({ data: d }),
  };
}
function accesoFalso(): { acceso: AccesoMidiMinimo; mapa: Map<string, ReturnType<typeof entradaFalsa>> } {
  const mapa = new Map<string, ReturnType<typeof entradaFalsa>>();
  return { acceso: { inputs: mapa as unknown as Map<string, EntradaMidiMinima>, onstatechange: null }, mapa };
}

describe("analisisMensaje", () => {
  it("CC canal 1 con dispositivo", () => {
    const m = analisisMensaje([0xb0, 7, 100], "nanoKONTROL");
    expect(m).toEqual({ fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 7, dispositivo: "nanoKONTROL" }, bruto: 100 });
  });
  it("CC en canal 16 (0xBF)", () => {
    expect(analisisMensaje([0xbf, 20, 64])?.fuente).toMatchObject({ mensaje: "cc", canal: 16, numero: 20 });
  });
  it("nota pulsada lleva la velocidad; soltada (0x80 o velocidad 0) da 0", () => {
    expect(analisisMensaje([0x90, 36, 127])?.bruto).toBe(127);
    expect(analisisMensaje([0x80, 36, 64])?.bruto).toBe(0);
    expect(analisisMensaje([0x90, 36, 0])?.bruto).toBe(0);
  });
  it("pitch bend de 14 bits (centro 8192)", () => {
    expect(analisisMensaje([0xe0, 0, 64])).toMatchObject({ bruto: 8192, fuente: { mensaje: "pitch", canal: 1 } });
    expect(analisisMensaje([0xe0, 0x7f, 0x7f])?.bruto).toBe(16383);
  });
  it("reloj, sysex e incompletos se ignoran", () => {
    expect(analisisMensaje([0xf8, 0, 0])).toBeNull();
    expect(analisisMensaje([0xf0, 1, 2])).toBeNull();
    expect(analisisMensaje([0xb0, 7])).toBeNull();
  });
});

describe("conectarMidi", () => {
  it("entrega mensajes, engancha altas de dispositivos y la desconexión lo detiene", () => {
    const { acceso, mapa } = accesoFalso();
    mapa.set("a", entradaFalsa("Teclado"));
    const recibidos: MensajeMidi[] = [];
    const desconectar = conectarMidi(acceso, (m) => recibidos.push(m));
    mapa.get("a")!.emitir([0xb0, 1, 50]);
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].fuente).toMatchObject({ mensaje: "cc", numero: 1, dispositivo: "Teclado" });
    // Alta: aparece otra entrada y se anuncia con statechange.
    mapa.set("b", entradaFalsa("Pads"));
    acceso.onstatechange?.({ port: { type: "input", state: "connected" } });
    mapa.get("b")!.emitir([0x90, 40, 100]);
    expect(recibidos).toHaveLength(2);
    // Desconexión: ya no llega nada.
    desconectar();
    mapa.get("a")!.emitir([0xb0, 1, 99]);
    mapa.get("b")!.emitir([0x90, 40, 100]);
    expect(recibidos).toHaveLength(2);
  });
});

describe("almacén de vínculos", () => {
  const vinculo: Vinculo = { id: "v1", fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 7 }, objetivo: { atomoId: "a", parametroId: "vol" }, modo: "absoluto", curva: { ...CURVA_LINEAL }, activo: true, creadoPor: "alex" };
  function almacenMemoria() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), mapa: m };
  }
  it("guarda y carga por molécula, descartando entradas corruptas", () => {
    const a = almacenMemoria();
    expect(guardarVinculos(a, "mol1", [vinculo])).toBe(true);
    expect(cargarVinculos(a, "mol1")).toEqual([vinculo]);
    expect(cargarVinculos(a, "otra")).toEqual([]);
    a.mapa.set(PREFIJO_VINCULOS + "mol1", "{no es json");
    expect(cargarVinculos(a, "mol1")).toEqual([]);
  });
  it("un almacén que lanza devuelve vacío y false, sin romper la sesión", () => {
    const lanzador = { getItem: () => { throw new Error("cuota"); }, setItem: () => { throw new Error("cuota"); }, removeItem: () => { throw new Error("cuota"); } };
    expect(cargarVinculos(lanzador, "mol1")).toEqual([]);
    expect(guardarVinculos(lanzador, "mol1", [vinculo])).toBe(false);
  });
});

describe("enrutador", () => {
  const autor: Autor = { tipo: "persona", id: "alex" };
  const ref: ParametroRef = { atomoId: "mezclador", parametroId: "vol" };
  const paramVolumen: Parametro = { id: "vol", nombre: "Volumen", tipo: "numero", min: 0, max: 10, paso: 1 };
  const paramToggle: Parametro = { id: "mute", nombre: "Silencio", tipo: "booleano" };
  const movidas: Operacion[] = [];
  const base = (vinculos: Vinculo[], parametroDe: (r: ParametroRef) => Parametro | undefined) => {
    movidas.length = 0;
    let t = 0, n = 0;
    return crearEnrutador({ vinculos, parametroDe, controlador: { mover: (op) => void movidas.push(op) }, autor, ahora: () => ++t, nuevoId: () => `op${++n}` });
  };
  const cc7: Vinculo = { id: "v1", fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 7 }, objetivo: ref, modo: "absoluto", curva: { ...CURVA_LINEAL }, activo: true, creadoPor: "alex" };

  it("fader absoluto respeta el paso y emite origen midi", () => {
    const ruta = base([cc7], () => paramVolumen);
    expect(ruta({ fuente: cc7.fuente, bruto: 127 })).toBe(1);
    expect(movidas[0]).toMatchObject({ accion: { tipo: "exacta", valor: 10 }, origen: "midi" });
    expect(ruta({ fuente: cc7.fuente, bruto: 0 })).toBe(1);
    expect(movidas[1].accion).toEqual({ tipo: "exacta", valor: 0 });
    // Un cambio menor que medio paso no emite nada.
    expect(ruta({ fuente: cc7.fuente, bruto: 2 })).toBe(0);
  });
  it("encoder relativo: 1–63 suma, 65–127 resta", () => {
    const ruta = base([{ ...cc7, modo: "relativo" }], () => paramVolumen);
    ruta({ fuente: cc7.fuente, bruto: 1 });
    ruta({ fuente: cc7.fuente, bruto: 127 });
    expect(movidas.map((o) => o.accion)).toEqual([
      { tipo: "relativa", cantidad: 1, modo: "pasos" },
      { tipo: "relativa", cantidad: -1, modo: "pasos" },
    ]);
    expect(ruta({ fuente: cc7.fuente, bruto: 64 })).toBe(0); // centro = sin movimiento
  });
  it("nota → alternar solo al pulsar; soltar no repite", () => {
    const nota: Vinculo = { ...cc7, id: "v2", fuente: { tipo: "midi", mensaje: "nota", canal: 1, numero: 36 }, modo: "alternar" };
    const ruta = base([nota], () => paramToggle);
    expect(ruta({ fuente: nota.fuente, bruto: 100 })).toBe(1);
    expect(movidas[0].accion).toEqual({ tipo: "alternar" });
    expect(ruta({ fuente: nota.fuente, bruto: 0 })).toBe(0); // soltar
    expect(ruta({ fuente: nota.fuente, bruto: 100 })).toBe(1); // volver a pulsar
  });
  it("un vínculo apagado no mueve nada", () => {
    const ruta = base([{ ...cc7, activo: false }], () => paramVolumen);
    expect(ruta({ fuente: cc7.fuente, bruto: 127 })).toBe(0);
    expect(movidas).toHaveLength(0);
  });
  it("aprender un CC con ruido de otro control: solo se detecta el que se mueve", () => {
    const { acceso, mapa } = accesoFalso();
    mapa.set("a", entradaFalsa("Mando"));
    let aprender: EstadoAprender = { fase: "inactivo" };
    aprender = siguienteAprender(aprender, { tipo: "empezar", objetivo: ref, ahora: 0 });
    conectarMidi(acceso, (m) => { aprender = siguienteAprender(aprender, { tipo: "entrada", ...m, ahora: 10 }); });
    // Ruido: otro CC apenas se mueve; el nuestro recorre de sobra.
    mapa.get("a")!.emitir([0xb0, 9, 60]);
    mapa.get("a")!.emitir([0xb0, 9, 62]);
    for (const v of [0, 64, 127]) mapa.get("a")!.emitir([0xb0, 7, v]);
    expect(aprender.fase).toBe("detectado");
    if (aprender.fase !== "detectado") return;
    expect(aprender.fuente).toMatchObject({ mensaje: "cc", numero: 7, dispositivo: "Mando" });
    const aprendido = vinculoAprendido(aprender, paramVolumen, "v9", "alex");
    expect(aprendido).toMatchObject({ modo: "absoluto", activo: true, objetivo: ref });
  });
});
