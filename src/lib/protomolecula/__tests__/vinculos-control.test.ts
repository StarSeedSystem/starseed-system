import { describe, expect, it } from "vitest";
import {
  CURVA_LINEAL, aplicarCurva, claveFuente, estadoInicial, normalizar01, origenDe, procesar, rangoEntrada,
  siguienteAprender, vinculoAprendido,
} from "../vinculos-control";
import type { EstadoAprender, FuenteControl, Vinculo } from "../vinculos-control";
import type { Autor, Parametro, ParametroRef } from "../tipos";

const ana: Autor = { tipo: "persona", id: "ana" };
const objetivo: ParametroRef = { atomoId: "a1", parametroId: "p" };
const vol: Parametro = { id: "p", nombre: "Volumen", tipo: "numero", min: 0, max: 100 };
const cc7: FuenteControl = { tipo: "midi", mensaje: "cc", canal: 1, numero: 7 };
const vinculo = (o: Partial<Vinculo> = {}): Vinculo => ({ id: "v1", fuente: cc7, objetivo, modo: "absoluto", curva: { ...CURVA_LINEAL }, activo: true, creadoPor: "ana", ...o });
const ctx = { autor: ana, ahora: 5, id: "op" };

describe("fuentes", () => {
  it("rangos y claves por tipo de mando", () => {
    expect(rangoEntrada(cc7)).toEqual([0, 127]);
    expect(rangoEntrada({ tipo: "midi", mensaje: "pitch", canal: 1 })).toEqual([0, 16383]);
    expect(rangoEntrada({ tipo: "gamepad", control: "eje", numero: 0 })).toEqual([-1, 1]);
    expect(rangoEntrada({ tipo: "hid", dispositivo: "d", byte: 2 })).toEqual([0, 255]);
    expect(claveFuente(cc7)).toBe("midi:*:cc:1:7");
    expect(claveFuente({ tipo: "osc", direccion: "/mix/1" })).toBe("osc:/mix/1");
    expect(origenDe({ tipo: "sensor", sensorId: "movil:luz" })).toBe("sensor");
  });
  it("normaliza a 0..1 y acota; un rango propio sirve para sensores (pulso 40–180)", () => {
    expect(normalizar01(cc7, 127)).toBe(1);
    expect(normalizar01(cc7, 300)).toBe(1);
    expect(normalizar01(cc7, Number.NaN)).toBe(0);
    const pulso: FuenteControl = { tipo: "sensor", sensorId: "wearable:pulso" };
    expect(normalizar01(pulso, 110, { ...CURVA_LINEAL, entradaMin: 40, entradaMax: 180 })).toBe(0.5);
  });
});

describe("curva", () => {
  it("lineal no cambia nada; invertir da la vuelta", () => {
    expect(aplicarCurva(0.3, CURVA_LINEAL, false)).toBeCloseTo(0.3);
    expect(aplicarCurva(0.3, { ...CURVA_LINEAL, invertir: true }, false)).toBeCloseTo(0.7);
  });
  it("log responde rápido al principio y exp lento; ambas van de 0 a 1", () => {
    const log = { ...CURVA_LINEAL, forma: "log" as const }, exp = { ...CURVA_LINEAL, forma: "exp" as const };
    expect(aplicarCurva(0.5, log, false)).toBeGreaterThan(0.5);
    expect(aplicarCurva(0.5, exp, false)).toBeLessThan(0.5);
    for (const c of [log, exp]) {
      expect(aplicarCurva(0, c, false)).toBeCloseTo(0);
      expect(aplicarCurva(1, c, false)).toBeCloseTo(1);
    }
  });
  it("zona muerta en los extremos (mando de 0 a 1) o en el centro (eje con centro)", () => {
    const z = { ...CURVA_LINEAL, zonaMuerta: 0.1 };
    expect(aplicarCurva(0.05, z, false)).toBe(0);
    expect(aplicarCurva(0.95, z, false)).toBe(1);
    expect(aplicarCurva(0.55, z, true)).toBeCloseTo(0.5);
    expect(aplicarCurva(0.5, z, true)).toBeCloseTo(0.5);
    expect(aplicarCurva(1, z, true)).toBeCloseTo(1);
    expect(aplicarCurva(0, z, true)).toBeCloseTo(0);
  });
});

describe("procesar", () => {
  it("absoluto: un fader MIDI mueve el parámetro, con autor, origen y fuente", () => {
    const r = procesar(vinculo(), vol, estadoInicial(), 127, ctx);
    expect(r.operacion).toMatchObject({ origen: "midi", fuente: "midi:*:cc:1:7", autor: ana, accion: { tipo: "exacta", valor: 100 } });
  });
  it("no repite lo que no cambia ni inunda con microcambios", () => {
    let e = estadoInicial();
    e = procesar(vinculo(), vol, e, 64, ctx).estado;
    expect(procesar(vinculo(), vol, e, 64, ctx).operacion).toBeNull();
    expect(procesar(vinculo(), vol, e, 64.01, ctx).operacion).toBeNull();
    expect(procesar(vinculo(), vol, e, 100, ctx).operacion).not.toBeNull();
  });
  it("respeta el paso del parámetro", () => {
    const paso = { ...vol, paso: 25 };
    expect(procesar(vinculo(), paso, estadoInicial(), 60, ctx).operacion?.accion).toEqual({ tipo: "exacta", valor: 50 });
  });
  it("suavizado: el valor se acerca poco a poco", () => {
    const v = vinculo({ curva: { ...CURVA_LINEAL, suavizado: 0.5 } });
    const a = procesar(v, vol, estadoInicial(), 0, ctx);
    const b = procesar(v, vol, a.estado, 127, ctx);
    expect(b.operacion?.accion).toEqual({ tipo: "exacta", valor: 50 });
  });
  it("interruptor y opciones desde un mando continuo", () => {
    const eco: Parametro = { id: "p", nombre: "Eco", tipo: "booleano" };
    expect(procesar(vinculo(), eco, estadoInicial(), 120, ctx).operacion?.accion).toEqual({ tipo: "exacta", valor: true });
    const f: Parametro = { id: "p", nombre: "Tipo", tipo: "opcion", opciones: ["a", "b", "c"] };
    expect(procesar(vinculo(), f, estadoInicial(), 127, ctx).operacion?.accion).toEqual({ tipo: "exacta", valor: "c" });
  });
  it("alternar y disparo actúan solo al pulsar, no al mantener ni al soltar", () => {
    const nota: FuenteControl = { tipo: "midi", mensaje: "nota", canal: 1, numero: 60 };
    const v = vinculo({ fuente: nota, modo: "alternar" });
    const on = procesar(v, vol, estadoInicial(), 100, ctx);
    expect(on.operacion?.accion).toEqual({ tipo: "alternar" });
    expect(procesar(v, vol, on.estado, 100, ctx).operacion).toBeNull();
    const off = procesar(v, vol, on.estado, 0, ctx);
    expect(off.operacion).toBeNull();
    expect(procesar(v, vol, off.estado, 90, ctx).operacion).not.toBeNull();
    expect(procesar({ ...v, modo: "disparo" }, vol, estadoInicial(), 100, ctx).operacion?.accion).toEqual({ tipo: "disparo" });
  });
  it("relativo (encoder MIDI): 1–63 suma y 65–127 resta", () => {
    const v = vinculo({ modo: "relativo" });
    expect(procesar(v, vol, estadoInicial(), 3, ctx).operacion?.accion).toEqual({ tipo: "relativa", cantidad: 3, modo: "pasos" });
    expect(procesar(v, vol, estadoInicial(), 126, ctx).operacion?.accion).toEqual({ tipo: "relativa", cantidad: -2, modo: "pasos" });
    expect(procesar(v, vol, estadoInicial(), 64, ctx).operacion).toBeNull();
  });
  it("un vínculo apagado no hace nada", () => {
    expect(procesar(vinculo({ activo: false }), vol, estadoInicial(), 127, ctx).operacion).toBeNull();
  });
});

describe("modo aprender", () => {
  const empezar = (): EstadoAprender => siguienteAprender({ fase: "inactivo" }, { tipo: "empezar", objetivo, ahora: 0 });
  const mover = (e: EstadoAprender, f: FuenteControl, brutos: number[], ahora = 1) =>
    brutos.reduce((acc, bruto) => siguienteAprender(acc, { tipo: "entrada", fuente: f, bruto, ahora }), e);

  it("detecta el mando que se mueve (3 mensajes y ≥ 15 %) aunque haya ruido de otro", () => {
    const ruido: FuenteControl = { tipo: "gamepad", control: "eje", numero: 1 };
    let e = mover(empezar(), ruido, [0.01, 0.0, 0.02, 0.01]);
    expect(e.fase).toBe("escuchando");
    e = mover(e, cc7, [10, 40, 90]);
    expect(e).toMatchObject({ fase: "detectado", fuente: cc7, objetivo });
  });
  it("un movimiento mínimo no basta; un botón se detecta a la primera pulsación y soltar no cuenta", () => {
    expect(mover(empezar(), cc7, [60, 61, 62, 61]).fase).toBe("escuchando");
    const nota: FuenteControl = { tipo: "midi", mensaje: "nota", canal: 1, numero: 36 };
    expect(mover(empezar(), nota, [0]).fase).toBe("escuchando");
    expect(mover(empezar(), nota, [100]).fase).toBe("detectado");
  });
  it("los sensores no se aprenden moviéndolos: se eligen de la lista", () => {
    expect(mover(empezar(), { tipo: "sensor", sensorId: "wearable:pulso" }, [0, 0.5, 1, 0]).fase).toBe("escuchando");
  });
  it("caduca, se cancela y se confirma", () => {
    expect(siguienteAprender(empezar(), { tipo: "tic", ahora: 20_000 })).toEqual({ fase: "cancelado", motivo: "caducado" });
    expect(mover(empezar(), cc7, [0, 60, 127], 30_000)).toEqual({ fase: "cancelado", motivo: "caducado" });
    expect(siguienteAprender(empezar(), { tipo: "cancelar" })).toEqual({ fase: "cancelado", motivo: "usuario" });
    const det = mover(empezar(), cc7, [0, 60, 127]);
    expect(siguienteAprender(det, { tipo: "confirmar" })).toEqual({ fase: "inactivo" });
    expect(siguienteAprender(empezar(), { tipo: "confirmar" }).fase).toBe("escuchando");
  });
  it("tras detectar ignora lo demás hasta confirmar o cancelar", () => {
    const det = mover(empezar(), cc7, [0, 60, 127]);
    expect(mover(det, { tipo: "osc", direccion: "/x" }, [0, 1, 0])).toEqual(det);
  });
  it("el vínculo aprendido elige el modo según el parámetro", () => {
    const det = mover(empezar(), cc7, [0, 60, 127]);
    if (det.fase !== "detectado") throw new Error("no detectó");
    expect(vinculoAprendido(det, vol, "v9", "ana")).toMatchObject({ modo: "absoluto", activo: true, creadoPor: "ana", objetivo });
    expect(vinculoAprendido(det, { ...vol, tipo: "booleano" }, "v9", "ana").modo).toBe("alternar");
    expect(vinculoAprendido(det, { ...vol, tipo: "disparo" }, "v9", "ana").modo).toBe("disparo");
  });
});
