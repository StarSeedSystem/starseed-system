import { describe, expect, it, vi } from "vitest";
import {
  PROTO_ORB_CERRAR_EVENT,
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_FAB_KEY,
  alternarOrbe,
  fijarOrbeActivada,
  type AlmacenLocal,
} from "../orbe-bus";

function almacenFalso(inicial: Record<string, string> = {}): AlmacenLocal & { datos: Record<string, string> } {
  const datos = { ...inicial };
  return { datos, getItem: (k) => datos[k] ?? null, setItem: (k, v) => { datos[k] = v; } };
}

function emisorFalso() {
  const eventos: Event[] = [];
  return { eventos, emitir: (e: Event) => { eventos.push(e); return true; } };
}

const detalle = (e: Event) => (e as CustomEvent<{ activada: boolean }>).detail;

describe("puerta única de la orbe de la Protomolécula", () => {
  it("exporta el evento de cerrar", () => {
    expect(PROTO_ORB_CERRAR_EVENT).toBe("starseed:protomolecula-cerrar");
  });

  it("guarda «false» y «true» y devuelve lo guardado", () => {
    const almacen = almacenFalso();
    const { emitir } = emisorFalso();
    expect(fijarOrbeActivada(false, { almacen, emitir, empujar: () => {} })).toBe(false);
    expect(almacen.datos[PROTO_ORB_FAB_KEY]).toBe("false");
    expect(fijarOrbeActivada(true, { almacen, emitir, empujar: () => {} })).toBe(true);
    expect(almacen.datos[PROTO_ORB_FAB_KEY]).toBe("true");
  });

  it("emite el evento con detail.activada", () => {
    const { eventos, emitir } = emisorFalso();
    fijarOrbeActivada(false, { almacen: almacenFalso(), emitir, empujar: () => {} });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].type).toBe(PROTO_ORB_FAB_EVENT);
    expect(detalle(eventos[0])).toEqual({ activada: false });
  });

  it("empuja a las demás neuronas una sola vez", () => {
    const empujar = vi.fn();
    fijarOrbeActivada(true, { almacen: almacenFalso(), emitir: emisorFalso().emitir, empujar });
    expect(empujar).toHaveBeenCalledTimes(1);
  });

  it("si empujar lanza, no rompe nada y el valor queda guardado", () => {
    const almacen = almacenFalso();
    const { eventos, emitir } = emisorFalso();
    const empujar = () => { throw new Error("sin red"); };
    expect(() => fijarOrbeActivada(false, { almacen, emitir, empujar })).not.toThrow();
    expect(almacen.datos[PROTO_ORB_FAB_KEY]).toBe("false");
    expect(eventos).toHaveLength(1);
  });

  it("alternarOrbe invierte el estado (activada por defecto)", () => {
    const almacen = almacenFalso();
    const { eventos, emitir } = emisorFalso();
    const empujar = vi.fn();
    expect(alternarOrbe({ almacen, emitir, empujar })).toBe(false);
    expect(alternarOrbe({ almacen, emitir, empujar })).toBe(true);
    expect(eventos.map(detalle)).toEqual([{ activada: false }, { activada: true }]);
    expect(empujar).toHaveBeenCalledTimes(2);
  });
});
