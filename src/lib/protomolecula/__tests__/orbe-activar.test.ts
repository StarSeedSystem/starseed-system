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

function crearAlmacen() {
  const datos = new Map<string, string>();
  const almacen: AlmacenLocal = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      datos.set(k, v);
    },
  };
  return { almacen, datos };
}

function crearEmisor() {
  const recibidos: CustomEvent<{ activada: boolean }>[] = [];
  const emitir = (e: Event): boolean => {
    recibidos.push(e as CustomEvent<{ activada: boolean }>);
    return true;
  };
  return { emitir, recibidos };
}

describe("constantes de la puerta de la orbe", () => {
  it("exporta el evento de cierre y conserva el del FAB", () => {
    expect(PROTO_ORB_CERRAR_EVENT).toBe("starseed:protomolecula-cerrar");
    expect(PROTO_ORB_FAB_EVENT).toBe("starseed:protomolecula-orb-fab");
  });
});

describe("fijarOrbeActivada", () => {
  it("guarda \"true\" y devuelve el valor guardado", () => {
    const { almacen, datos } = crearAlmacen();
    const { emitir, recibidos } = crearEmisor();
    let empujado = 0;
    const r = fijarOrbeActivada(true, { almacen, emitir, empujar: () => { empujado += 1; } });
    expect(r).toBe(true);
    expect(datos.get(PROTO_ORB_FAB_KEY)).toBe("true");
    expect(leerActivada(almacen)).toBe(true);
    expect(empujado).toBe(1);
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].type).toBe(PROTO_ORB_FAB_EVENT);
    expect(recibidos[0].detail).toEqual({ activada: true });
  });

  it("guarda \"false\" y emite detail.activada falsa", () => {
    const { almacen, datos } = crearAlmacen();
    const { emitir, recibidos } = crearEmisor();
    const r = fijarOrbeActivada(false, { almacen, emitir, empujar: () => undefined });
    expect(r).toBe(false);
    expect(datos.get(PROTO_ORB_FAB_KEY)).toBe("false");
    expect(recibidos[0].detail).toEqual({ activada: false });
  });

  it("un empujar que lanza no rompe nada y el valor queda guardado", () => {
    const { almacen, datos } = crearAlmacen();
    const { emitir, recibidos } = crearEmisor();
    const r = fijarOrbeActivada(true, {
      almacen,
      emitir,
      empujar: () => {
        throw new Error("nube caída");
      },
    });
    expect(r).toBe(true);
    expect(datos.get(PROTO_ORB_FAB_KEY)).toBe("true");
    expect(recibidos).toHaveLength(1);
  });

  it("un emitir que lanza tampoco rompe: devuelve el valor guardado", () => {
    const { almacen } = crearAlmacen();
    const r = fijarOrbeActivada(false, {
      almacen,
      emitir: () => {
        throw new Error("oyente roto");
      },
      empujar: () => undefined,
    });
    expect(r).toBe(false);
  });
});

describe("alternarOrbe", () => {
  it("de activada (defecto) pasa a desactivada", () => {
    const { almacen, datos } = crearAlmacen();
    const { emitir, recibidos } = crearEmisor();
    const r = alternarOrbe({ almacen, emitir, empujar: () => undefined });
    expect(r).toBe(false);
    expect(datos.get(PROTO_ORB_FAB_KEY)).toBe("false");
    expect(recibidos[0].detail).toEqual({ activada: false });
  });

  it("de desactivada pasa a activada", () => {
    const { almacen, datos } = crearAlmacen();
    const { emitir } = crearEmisor();
    fijarOrbeActivada(false, { almacen, emitir, empujar: () => undefined });
    const r = alternarOrbe({ almacen, emitir, empujar: () => undefined });
    expect(r).toBe(true);
    expect(datos.get(PROTO_ORB_FAB_KEY)).toBe("true");
  });
});
