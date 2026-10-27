import { describe, it, expect } from "vitest";
import {
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_CERRAR_EVENT,
  fijarOrbeActivada,
  alternarOrbe,
  type AlmacenLocal,
} from "../orbe-bus";

function almacenFalso(inicial: Record<string, string> = {}): AlmacenLocal {
  const datos: Record<string, string> = { ...inicial };
  return {
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => { datos[k] = v; },
  };
}

interface Emitido {
  tipo: string;
  detalle: unknown;
}

function emisorFalso(emitidos: Emitido[]): (e: Event) => boolean {
  return (e: Event) => {
    const detalle = (e as CustomEvent).detail;
    emitidos.push({ tipo: e.type, detalle });
    return true;
  };
}

describe("PROTO_ORB_CERRAR_EVENT (PMO1020A)", () => {
  it("exporta el evento de cierre con su nombre exacto", () => {
    expect(PROTO_ORB_CERRAR_EVENT).toBe("starseed:protomolecula-cerrar");
  });
});

describe("fijarOrbeActivada", () => {
  it('guarda "true" y devuelve el valor guardado', () => {
    const almacen = almacenFalso();
    const deps = { almacen };
    expect(fijarOrbeActivada(true, deps)).toBe(true);
    expect(almacen.getItem(PROTO_ORB_FAB_KEY)).toBe("true");
  });

  it('guarda "false" y devuelve el valor guardado', () => {
    const almacen = almacenFalso();
    const deps = { almacen };
    expect(fijarOrbeActivada(false, deps)).toBe(false);
    expect(almacen.getItem(PROTO_ORB_FAB_KEY)).toBe("false");
  });

  it("emite PROTO_ORB_FAB_EVENT con detail: { activada }", () => {
    const emitidos: Emitido[] = [];
    fijarOrbeActivada(true, { almacen: almacenFalso(), emitir: emisorFalso(emitidos) });
    expect(emitidos).toHaveLength(1);
    expect(emitidos[0].tipo).toBe(PROTO_ORB_FAB_EVENT);
    expect(emitidos[0].detalle).toEqual({ activada: true });
  });

  it("empujar se llama UNA vez (y no dos), incluso con emisor propio", () => {
    let llamadas = 0;
    fijarOrbeActivada(false, {
      almacen: almacenFalso(),
      emitir: emisorFalso([]),
      empujar: () => { llamadas += 1; },
    });
    expect(llamadas).toBe(1);
  });

  it("si empujar lanza, no rompe: igualmente guarda y devuelve el valor", () => {
    const almacen = almacenFalso();
    expect(
      fijarOrbeActivada(true, {
        almacen,
        emitir: emisorFalso([]),
        empujar: () => { throw new Error("red caída"); },
      }),
    ).toBe(true);
    expect(almacen.getItem(PROTO_ORB_FAB_KEY)).toBe("true");
  });
});

describe("alternarOrbe", () => {
  it("sin nada guardado (por defecto activada) la DESACTIVA", () => {
    const almacen = almacenFalso();
    const deps = { almacen };
    expect(alternarOrbe(deps)).toBe(false);
    expect(almacen.getItem(PROTO_ORB_FAB_KEY)).toBe("false");
  });

  it("con algo guardado en false la ACTIVA", () => {
    const almacen = almacenFalso({ [PROTO_ORB_FAB_KEY]: "false" });
    const deps = { almacen };
    expect(alternarOrbe(deps)).toBe(true);
    expect(almacen.getItem(PROTO_ORB_FAB_KEY)).toBe("true");
  });

  it("alterna en cadena y avisa a la pestaña con cada estado", () => {
    const almacen = almacenFalso();
    const emitidos: Emitido[] = [];
    const deps = { almacen, emitir: emisorFalso(emitidos), empujar: () => undefined };
    expect(alternarOrbe(deps)).toBe(false);
    expect(alternarOrbe(deps)).toBe(true);
    expect(almacen.getItem(PROTO_ORB_FAB_KEY)).toBe("true");
    expect(emitidos.map((e) => e.detalle)).toEqual([{ activada: false }, { activada: true }]);
  });
});
