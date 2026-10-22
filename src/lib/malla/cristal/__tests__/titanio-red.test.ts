import { describe, it, expect } from "vitest";
import { cristalizar } from "../cristalizacion";
import { relajarLocal } from "../recocido";
import type { Cristal, Medio, NeuronaReticula, Reticula, SenalMedida, Tesela } from "../tipos";

type Arista = [string, string, number?, Medio?];

const neurona = (id: string, esRouter: boolean): NeuronaReticula => ({
  id,
  cuenta: "c1",
  esRouter,
  capacidad: { ramGb: 4, bateriaPct: null, cargando: true },
  medios: [],
});

const senal = ([de, a, rssiDbm, medio]: Arista): SenalMedida => ({
  de,
  a,
  medio: medio ?? "wifi-lan",
  rssiDbm: rssiDbm ?? -50,
  vistaEn: 1,
});

const reticula = (ids: string[], routers: string[], aristas: Arista[]): Reticula => ({
  teselas: Object.fromEntries(ids.map(id => [id, {
    origen: id,
    reloj: 1,
    neurona: neurona(id, routers.includes(id)),
    senales: aristas.filter(([de]) => de === id).map(senal),
  } as Tesela])),
});

const entreRouters = (c: Cristal, routers: string[]): string[] => c.puentes
  .filter(p => routers.includes(p.a) && routers.includes(p.b))
  .map(p => [p.a, p.b].sort().join("-"))
  .sort();

describe("titanio en la red", () => {
  it("con 2 routers y 8 móviles, subir la volatilidad de los móviles no cambia los puentes entre routers", () => {
    const routers = ["r1", "r2"];
    const moviles = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];
    const ids = [...routers, ...moviles];
    const aristas: Arista[] = [
      ["r1", "r2", -50, "wifi-mesh"],
      ["r1", "m1"], ["r1", "m2"], ["r1", "m3"],
      ["r2", "m4"], ["r2", "m5"], ["r2", "m6"],
      ["m1", "m7"], ["m4", "m8"],
    ];
    const previo = cristalizar(reticula(ids, routers, aristas), {
      temperatura: Object.fromEntries(moviles.map(id => [id, 0.1])),
    });
    const volatiles = Object.fromEntries(moviles.map(id => [id, 0.95]));
    const ahora = relajarLocal(previo, reticula(ids, routers, aristas), moviles, { temperatura: volatiles });
    expect(entreRouters(previo, routers)).toEqual(["r1-r2"]);
    expect(entreRouters(ahora, routers)).toEqual(entreRouters(previo, routers));
  });

  it("un router llega a 6 puentes", () => {
    const moviles = ["m1", "m2", "m3", "m4", "m5", "m6"];
    const ids = ["r", ...moviles];
    const aristas: Arista[] = moviles.map(m => ["r", m, -45] as Arista);
    const c = cristalizar(reticula(ids, ["r"], aristas));
    expect(c.coordinacion.r).toBe(6);
  });

  it("la zona alrededor de un router queda más fría que sin él", () => {
    const moviles = ["a", "b", "c", "d"];
    const ids = ["r", ...moviles];
    const aristas: Arista[] = moviles.map(m => ["r", m, -50] as Arista);
    const calientes = Object.fromEntries(ids.map(id => [id, 0.9]));
    const conRouter = cristalizar(reticula(ids, ["r"], aristas), { temperatura: calientes });
    const sinRouter = cristalizar(reticula(ids, [], aristas), { temperatura: calientes });
    for (const id of moviles) {
      expect(conRouter.temperatura[id]).toBeLessThan(sinRouter.temperatura[id]);
      expect(conRouter.temperatura[id]).toBeLessThanOrEqual(0.2);
    }
    expect(conRouter.temperatura.r).toBeLessThan(sinRouter.temperatura.r);
  });
});
