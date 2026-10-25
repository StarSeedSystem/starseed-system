import { describe, it, expect } from "vitest";
import {
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_CERRAR_EVENT,
  fijarOrbeActivada,
  alternarOrbe,
  leerActivada,
  type AlmacenLocal,
} from "../orbe-bus";

function almacenFalso(datos: Record<string, string> = {}): AlmacenLocal {
  return {
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => {
      datos[k] = v;
    },
  };
}

/** Emisor falso: guarda los eventos que le llegan. */
function emisorFalso() {
  const eventos: Event[] = [];
  const emitir = (e: Event): boolean => {
    eventos.push(e);
    return true;
  };
  return { eventos, emitir };
}

describe("fijarOrbeActivada", () => {
  it("guarda \"true\" al activar y \"false\" al desactivar", () => {
    const datos: Record<string, string> = {};
    fijarOrbeActivada(true, { almacen: almacenFalso(datos), emitir: () => true, empujar: () => undefined });
    expect(datos[PROTO_ORB_FAB_KEY]).toBe("true");
    fijarOrbeActivada(false, { almacen: almacenFalso(datos), emitir: () => true, empujar: () => undefined });
    expect(datos[PROTO_ORB_FAB_KEY]).toBe("false");
  });

  it("emite el evento con detail.activada", () => {
    const { eventos, emitir } = emisorFalso();
    fijarOrbeActivada(false, { almacen: almacenFalso(), emitir, empujar: () => undefined });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.type).toBe(PROTO_ORB_FAB_EVENT);
    expect((eventos[0] as CustomEvent).detail).toEqual({ activada: false });
    fijarOrbeActivada(true, { almacen: almacenFalso(), emitir, empujar: () => undefined });
    expect((eventos[1] as CustomEvent).detail).toEqual({ activada: true });
  });

  it("devuelve el valor guardado", () => {
    expect(fijarOrbeActivada(true, { almacen: almacenFalso(), emitir: () => true, empujar: () => undefined })).toBe(true);
    expect(fijarOrbeActivada(false, { almacen: almacenFalso(), emitir: () => true, empujar: () => undefined })).toBe(false);
  });

  it("llama a empujar UNA vez por fijación", () => {
    let llamadas = 0;
    fijarOrbeActivada(true, { almacen: almacenFalso(), emitir: () => true, empujar: () => { llamadas += 1; } });
    expect(llamadas).toBe(1);
  });

  it("si empujar lanza no rompe nada", () => {
    expect(() =>
      fijarOrbeActivada(true, { almacen: almacenFalso(), emitir: () => true, empujar: () => { throw new Error("sin red"); } }),
    ).not.toThrow();
  });
});

describe("alternarOrbe", () => {
  it("invierte el estado guardado", () => {
    const datos: Record<string, string> = {};
    const deps = () => ({ almacen: almacenFalso(datos), emitir: () => true, empujar: () => undefined });
    expect(alternarOrbe(deps())).toBe(false);
    expect(leerActivada(almacenFalso(datos))).toBe(false);
    expect(alternarOrbe(deps())).toBe(true);
    expect(leerActivada(almacenFalso(datos))).toBe(true);
  });

  it("sin estado previo arranca activada y la alterna a false", () => {
    const { eventos, emitir } = emisorFalso();
    const valor = alternarOrbe({ almacen: almacenFalso(), emitir, empujar: () => undefined });
    expect(valor).toBe(false);
    expect((eventos[0] as CustomEvent).detail).toEqual({ activada: false });
  });

  it("empujar se llama una vez y si lanza no rompe nada", () => {
    let llamadas = 0;
    alternarOrbe({ almacen: almacenFalso(), emitir: () => true, empujar: () => { llamadas += 1; } });
    expect(llamadas).toBe(1);
    expect(() => alternarOrbe({ almacen: almacenFalso(), emitir: () => true, empujar: () => { throw new Error("sin red"); } })).not.toThrow();
  });
});

describe("PROTO_ORB_CERRAR_EVENT", () => {
  it("es la cadena pactada del cierre de la orbe", () => {
    expect(PROTO_ORB_CERRAR_EVENT).toBe("starseed:protomolecula-cerrar");
  });
});
