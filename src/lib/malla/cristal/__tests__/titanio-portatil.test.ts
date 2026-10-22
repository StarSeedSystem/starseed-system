import { describe, it, expect } from "vitest";

import { coordinacionTitanio } from "../titanio";
import { cristalizar } from "../cristalizacion";
import type { NeuronaReticula, Reticula, SenalMedida, Tesela } from "../tipos";

/** Titanio con la batería al 30 %: sin corriente coordina 4, enchufado coordina 6. */
const titanio = (cargando: boolean): NeuronaReticula => ({
  id: "r",
  cuenta: "c1",
  esRouter: true,
  capacidad: { ramGb: 4, bateriaPct: 30, cargando },
  medios: [],
});

/** Móvil de la malla: coordina 4 como cualquier neurona. */
const movil = (id: string): NeuronaReticula => ({
  id,
  cuenta: "c1",
  esRouter: false,
  capacidad: { ramGb: 4, bateriaPct: 50, cargando: false },
  medios: [],
});

describe("coordinacionTitanio", () => {
  it("da 6 con corriente, con la batería desconocida o con ≥ 50 %", () => {
    expect(coordinacionTitanio(titanio(true))).toBe(6);
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: null, cargando: false },
    })).toBe(6);
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: 50, cargando: false },
    })).toBe(6);
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: 90, cargando: false },
    })).toBe(6);
  });

  it("da 4 entre 20 y 50 %, y 3 por debajo del 20 %", () => {
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: 49, cargando: false },
    })).toBe(4);
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: 20, cargando: false },
    })).toBe(4);
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: 19, cargando: false },
    })).toBe(3);
    expect(coordinacionTitanio({
      ...titanio(false),
      capacidad: { ramGb: 4, bateriaPct: 0, cargando: false },
    })).toBe(3);
  });
});

/**
 * Retícula de siete nodos: el titanio `r` cuelga de `m1` y los seis móviles van
 * en cadena (m1–m2–…–m6). Las señales de la cadena son fuertes (coste 0,2) y las
 * del titanio hacia los demás móviles, débiles (coste 0,6): así el árbol mínimo
 * deja al titanio con un solo puente y sus demás enlaces solo pueden entrar por
 * la fase de triángulos, que es la que respeta su coordinación.
 */
const reticula = (t: NeuronaReticula): Reticula => {
  const moviles = ["m1", "m2", "m3", "m4", "m5", "m6"].map(movil);
  const aristas: Array<[string, string, number]> = [
    ["r", "m1", -20],
    ["m1", "m2", -20], ["m2", "m3", -20], ["m3", "m4", -20],
    ["m4", "m5", -20], ["m5", "m6", -20],
    ["r", "m2", -60], ["r", "m3", -60], ["r", "m4", -60],
    ["r", "m5", -60], ["r", "m6", -60],
  ];
  const teselas: Tesela[] = [t, ...moviles].map((n) => ({
    origen: n.id,
    reloj: 1,
    neurona: n,
    senales: aristas
      .filter(([de]) => de === n.id)
      .map(([de, a, rssiDbm]): SenalMedida => ({
        de, a, medio: "wifi-lan", rssiDbm, vistaEn: 1,
      })),
  }));
  return { teselas: Object.fromEntries(teselas.map((x) => [x.origen, x])) };
};

describe("titanio con batería en la retícula", () => {
  it("al 30 % sin cargar no pasa de 4 puentes; enchufado vuelve a 6", () => {
    const descargado = cristalizar(reticula(titanio(false)));
    const enchufado = cristalizar(reticula(titanio(true)));
    expect(descargado.coordinacion.r).toBeLessThanOrEqual(4);
    expect([descargado.coordinacion.r, enchufado.coordinacion.r]).toEqual([4, 6]);
  });
});
