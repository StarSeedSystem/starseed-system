import { describe, it, expect } from "vitest";
import type { AlmacenLocal } from "../orbe-bus";
import {
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_FAB_EVENT,
  fijarOrbeActivada,
  alternarOrbe,
} from "../orbe-bus";

/** Almacén falso sobre un Map (sin disco, sin red). */
function almacenFalso(entries?: Array<[string, string]>): AlmacenLocal & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>(entries ?? []);
  return {
    mapa,
    getItem: (k: string) => (mapa.has(k) ? mapa.get(k)! : null),
    setItem: (k: string, v: string) => {
      mapa.set(k, v);
    },
  };
}

interface EventoRegistrado {
  type: string;
  detail: { activada: boolean } | null;
}

/** Deps falsas: almacén + emisor que registra + empujador contable. */
function crearDeps(
  almacen: AlmacenLocal & { mapa: Map<string, string> },
  empujar?: () => void,
): { deps: { almacen: AlmacenLocal; emitir: (e: Event) => boolean; empujar?: () => void }; eventos: EventoRegistrado[] } {
  const eventos: EventoRegistrado[] = [];
  const emitir = (e: Event): boolean => {
    const detalle = (e as CustomEvent<{ activada: boolean }>).detail ?? null;
    eventos.push({ type: e.type, detail: detalle });
    return true;
  };
  return { deps: { almacen, emitir, empujar }, eventos };
}

describe("fijarOrbeActivada", () => {
  it("guarda «true» y «false» en el almacén y devuelve el valor guardado", () => {
    const almacen = almacenFalso();
    const { deps } = crearDeps(almacen);
    expect(fijarOrbeActivada(true, deps)).toBe(true);
    expect(almacen.mapa.get(PROTO_ORB_FAB_KEY)).toBe("true");
    expect(fijarOrbeActivada(false, deps)).toBe(false);
    expect(almacen.mapa.get(PROTO_ORB_FAB_KEY)).toBe("false");
  });

  it("emite PROTO_ORB_FAB_EVENT con detail.activada", () => {
    const almacen = almacenFalso();
    const { deps, eventos } = crearDeps(almacen);
    fijarOrbeActivada(false, deps);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].type).toBe(PROTO_ORB_FAB_EVENT);
    expect(eventos[0].detail).toEqual({ activada: false });
    fijarOrbeActivada(true, deps);
    expect(eventos[1].detail).toEqual({ activada: true });
  });

  it("llama a empujar una sola vez", () => {
    const almacen = almacenFalso();
    let llamadas = 0;
    const { deps } = crearDeps(almacen, () => {
      llamadas += 1;
    });
    fijarOrbeActivada(true, deps);
    expect(llamadas).toBe(1);
  });

  it("si empujar lanza, la activación local no se rompe", () => {
    const almacen = almacenFalso();
    const { deps } = crearDeps(almacen, () => {
      throw new Error("fallo del push");
    });
    expect(fijarOrbeActivada(true, deps)).toBe(true);
    expect(almacen.mapa.get(PROTO_ORB_FAB_KEY)).toBe("true");
  });
});

describe("alternarOrbe", () => {
  it("invierte el estado guardado", () => {
    const almacen = almacenFalso([["starseed.protomolecula.orbe.enabled.v1", "false"]]);
    const { deps } = crearDeps(almacen);
    expect(alternarOrbe(deps)).toBe(true);
    expect(almacen.mapa.get(PROTO_ORB_FAB_KEY)).toBe("true");
    expect(alternarOrbe(deps)).toBe(false);
    expect(almacen.mapa.get(PROTO_ORB_FAB_KEY)).toBe("false");
  });

  it("con valor ausente (default true) alterna a false", () => {
    const almacen = almacenFalso();
    const { deps } = crearDeps(almacen);
    expect(alternarOrbe(deps)).toBe(false);
    expect(almacen.mapa.get(PROTO_ORB_FAB_KEY)).toBe("false");
  });
});
