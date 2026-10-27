import { describe, it, expect } from "vitest";
import {
  PROTO_ORB_CERRAR_EVENT,
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_FAB_KEY,
  alternarOrbe,
  fijarOrbeActivada,
  type AlmacenLocal,
} from "../orbe-bus";

function almacenFalso(inicial: Record<string, string> = {}, falla = false): AlmacenLocal {
  return {
    getItem: (k) => {
      if (falla) throw new Error("denegado");
      return inicial[k] ?? null;
    },
    setItem: (k, v) => {
      if (falla) throw new Error("denegado");
      inicial[k] = v;
    },
  };
}

describe("puerta única de la orbe de la Protomolécula", () => {
  it("exporta el evento de cierre de la orbe", () => {
    expect(PROTO_ORB_CERRAR_EVENT).toBe("starseed:protomolecula-cerrar");
  });

  it("al desactivarla guarda \"false\", avisa con detalle y empuja una sola vez", () => {
    const datos: Record<string, string> = {};
    const almacen = almacenFalso(datos);
    let empujes = 0;
    const emitidos: Event[] = [];

    const resultado = fijarOrbeActivada(false, {
      almacen,
      emitir: (e) => {
        emitidos.push(e);
        return true;
      },
      empujar: () => {
        empujes += 1;
      },
    });

    expect(resultado).toBe(false);
    expect(datos[PROTO_ORB_FAB_KEY]).toBe("false");
    expect(empujes).toBe(1);
    expect(emitidos).toHaveLength(1);
    const evento = emitidos[0] as CustomEvent<{ activada: boolean }>;
    expect(evento.type).toBe(PROTO_ORB_FAB_EVENT);
    expect(evento.detail).toEqual({ activada: false });
  });

  it("al activarla guarda \"true\" y avisa con detail.activada = true", () => {
    const datos: Record<string, string> = { [PROTO_ORB_FAB_KEY]: "false" };
    const emitidos: Event[] = [];

    expect(
      fijarOrbeActivada(true, {
        almacen: almacenFalso(datos),
        emitir: (e) => {
          emitidos.push(e);
          return true;
        },
        empujar: () => undefined,
      }),
    ).toBe(true);

    expect(datos[PROTO_ORB_FAB_KEY]).toBe("true");
    const evento = emitidos[0] as CustomEvent<{ activada: boolean }>;
    expect(evento.detail.activada).toBe(true);
  });

  it("alternarOrbe invierte el estado: de activada a apagada y de vuelta", () => {
    const datos: Record<string, string> = {};
    const almacen = almacenFalso(datos);
    const avisos: boolean[] = [];
    const emitir = (e: Event) => {
      avisos.push((e as CustomEvent<{ activada: boolean }>).detail.activada);
      return true;
    };

    expect(alternarOrbe({ almacen, emitir, empujar: () => undefined })).toBe(false);
    expect(datos[PROTO_ORB_FAB_KEY]).toBe("false");
    expect(alternarOrbe({ almacen, emitir, empujar: () => undefined })).toBe(true);
    expect(datos[PROTO_ORB_FAB_KEY]).toBe("true");
    expect(avisos).toEqual([false, true]);
  });

  it("si empujar lanza, la orbe queda guardada, avisada y la llamada no rompe", () => {
    const datos: Record<string, string> = {};
    const emitidos: Event[] = [];

    expect(() =>
      fijarOrbeActivada(false, {
        almacen: almacenFalso(datos),
        emitir: (e) => {
          emitidos.push(e);
          return true;
        },
        empujar: () => {
          throw new Error("sin red");
        },
      }),
    ).not.toThrow();

    expect(datos[PROTO_ORB_FAB_KEY]).toBe("false");
    expect(emitidos).toHaveLength(1);
  });

  it("un almacén y un emisor que lanzan no impiden devolver el valor fijado", () => {
    expect(
      fijarOrbeActivada(false, {
        almacen: almacenFalso({}, true),
        emitir: () => {
          throw new Error("sin ventana");
        },
        empujar: () => undefined,
      }),
    ).toBe(false);
  });
});
