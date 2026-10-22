import { describe, it, expect } from "vitest";
import { mediosEfectivos, type EntradaMedios, type Oferta } from "../medios-efectivos";

const oferta = (nodoId: string, cuentaId: string, presta: Partial<Oferta["presta"]> = {}): Oferta => ({
  nodoId, cuentaId, medio: "mac",
  computo: { nucleos: 8, ramLibreMb: 4000, gpu: false, motores: ["palabra"] },
  almacen: { prestaMb: 1000, volumenes: [] },
  apps: [], enlaces: {}, energia: { enUso: false, cargando: true },
  presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 2000, discoMb: 500, soloCargando: false }, ...presta },
  t: Date.UTC(2026, 9, 22, 12),
});

const base = (o: Partial<EntradaMedios> = {}): EntradaMedios => ({
  cerebro: { id: "c1", cuentaId: "yo" },
  servidoresEnlazados: [], ofertas: [], almacenes: [], vecinos: [], privado: false, ...o,
});

describe("mediosEfectivos", () => {
  it("usa neuronas propias aplicando los topes de préstamo", () => {
    const r = mediosEfectivos(base({ ofertas: [oferta("n1", "yo")] }));
    expect(r.computo).toHaveLength(1);
    expect(r.computo[0].computo.ramLibreMb).toBe(2000);
    expect(r.motivoPorFuente.n1).toMatch(/propio/);
  });

  it("privado: sin vecinos públicos ni ofertas de otras cuentas", () => {
    const r = mediosEfectivos(base({
      privado: true,
      ofertas: [oferta("n2", "otro", { publico: true })],
      vecinos: [oferta("v1", "otro", { publico: true })],
    }));
    expect(r.computo).toHaveLength(0);
    expect(r.motivoPorFuente.v1).toMatch(/privado/);
    expect(r.motivoPorFuente.n2).toMatch(/privado/);
  });

  it("no privado: acepta vecino público pero no al que no presta", () => {
    const r = mediosEfectivos(base({
      vecinos: [oferta("v1", "otro", { publico: true, cuenta: false }), oferta("v2", "otro")],
    }));
    expect(r.computo.map((o) => o.nodoId)).toEqual(["v1"]);
    expect(r.motivoPorFuente.v2).toMatch(/No presta/);
  });

  it("un servidor enlazado de otra cuenta cuenta como propio incluso en privado", () => {
    const r = mediosEfectivos(base({
      privado: true,
      servidoresEnlazados: [{ id: "a1", kind: "own", rol: "compute" }],
      ofertas: [oferta("a1", "servicio")],
    }));
    expect(r.computo.map((o) => o.nodoId)).toEqual(["a1"]);
  });

  it("descarta lo que no tiene nada prestable", () => {
    const r = mediosEfectivos(base({ ofertas: [oferta("n1", "yo", { topes: { cpuPct: 50, ramMb: 2000, discoMb: 500, soloCargando: true } })].map((o) => ({ ...o, energia: { enUso: false, cargando: false } })) }));
    expect(r.computo).toHaveLength(0);
    expect(r.motivoPorFuente.n1).toMatch(/nada prestable/);
  });

  it("almacenamiento: marca real solo con driver de escritura", () => {
    const r = mediosEfectivos(base({
      almacenes: [{ id: "d1", tipo: "gdrive", libreMb: 500 }, { id: "x1", tipo: "ftp" }],
      servidoresEnlazados: [{ id: "s1", kind: "gcs", rol: "storage" }, { id: "s2", kind: "own", rol: "compute" }],
    }));
    const por = Object.fromEntries(r.almacenamiento.map((a) => [a.id, a.real]));
    expect(por).toEqual({ s1: true, d1: true, x1: false });
    expect(r.almacenamiento.find((a) => a.id === "x1")).not.toHaveProperty("libreMb");
    expect(r.motivoPorFuente.x1).toMatch(/Solo declarado/);
    expect(r.motivoPorFuente.s2).toMatch(/sin papel/);
  });

  it("privado: la nube compartida no entra en almacenamiento", () => {
    const r = mediosEfectivos(base({
      privado: true,
      almacenes: [{ id: "n", tipo: "starseed", compartido: true }, { id: "p", tipo: "gdrive" }],
    }));
    expect(r.almacenamiento.map((a) => a.id)).toEqual(["p"]);
    expect(r.motivoPorFuente.n).toMatch(/nube compartida/);
  });

  it("el disco que presta una neurona cuenta como almacén declarado, no real", () => {
    const r = mediosEfectivos(base({ ofertas: [oferta("n1", "yo")] }));
    expect(r.almacenamiento).toEqual([{ id: "n1:disco", tipo: "neurona", libreMb: 500, real: false }]);
  });
});
