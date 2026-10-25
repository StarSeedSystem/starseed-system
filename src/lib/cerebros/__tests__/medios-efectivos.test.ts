import { describe, it, expect } from "vitest";
import type { LinkedServer } from "../../brains/servers";
import type { OfertaNeurona } from "../../recursos/oferta";
import { mediosEfectivos, type EntradaMedios } from "../medios-efectivos";

const T = new Date(2026, 9, 22, 12, 0, 0).getTime();

function neurona(id: string, cuentaId: string, extra: Partial<OfertaNeurona["presta"]> = {}, discoMb = 0): OfertaNeurona {
  return {
    nodoId: id, cuentaId, medio: "web",
    computo: { nucleos: 4, ramLibreMb: 4096, gpu: false, motores: [] },
    almacen: { prestaMb: discoMb, volumenes: [] },
    apps: [], enlaces: {},
    energia: { enUso: false, cargando: true },
    presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 50, ramMb: 2048, discoMb, soloCargando: false }, ...extra },
    t: T,
  };
}

function servidor(id: string, kind: string, role: string, shared = false): LinkedServer {
  return { id, name: id, kind, config: {}, shared, owner: "u1", link: { role, priority: 1, sync: {} } };
}

function entrada(p: Partial<EntradaMedios> = {}): EntradaMedios {
  return {
    cerebro: { id: "c1", cuentaId: "u1", grupos: [], almacenamiento: ["auto"] },
    servidoresEnlazados: [], ofertas: [], almacenes: [], vecinos: [], privado: false, ...p,
  };
}

describe("mediosEfectivos", () => {
  it("incluye neuronas propias y recorta al tope prestable", () => {
    const r = mediosEfectivos(entrada({ ofertas: [neurona("n1", "u1")] }));
    expect(r.computo).toHaveLength(1);
    expect(r.computo[0].computo.nucleos).toBe(2);
    expect(r.computo[0].computo.ramLibreMb).toBe(2048);
  });

  it("privado: sin vecinos públicos ni servidores compartidos", () => {
    const r = mediosEfectivos(entrada({
      privado: true,
      ofertas: [neurona("n1", "u1")],
      vecinos: [neurona("v1", "u2", { cuenta: false, publico: true })],
      servidoresEnlazados: [
        servidor("s1", "starseed", "compute", true),
        // Sin capacidad declarada no es elegible; s2 la declara para seguir probando la privacidad.
        { ...servidor("s2", "own", "compute"), config: { capacidad: { nucleos: 2, ramLibreMb: 2048 } } },
      ],
    }));
    expect(r.computo.map((c) => c.nodoId).sort()).toEqual(["n1", "s2"]);
    expect(r.motivoPorFuente.v1).toMatch(/privado/i);
    expect(r.motivoPorFuente.s1).toMatch(/privado/i);
  });

  it("no privado: un vecino público entra, uno que no presta no", () => {
    const r = mediosEfectivos(entrada({
      vecinos: [neurona("v1", "u2", { cuenta: false, publico: true }), neurona("v2", "u2", { cuenta: true })],
    }));
    expect(r.computo.map((c) => c.nodoId)).toEqual(["v1"]);
    expect(r.motivoPorFuente.v2).toMatch(/no presta/i);
  });

  it("marca real solo los drivers con escritura y declarado el resto", () => {
    const r = mediosEfectivos(entrada({
      almacenes: [{ id: "a1", tipo: "gdrive", libreMb: 500 }, { id: "a2", tipo: "ipfs" }],
      servidoresEnlazados: [servidor("s1", "starseed", "storage")],
    }));
    const por = Object.fromEntries(r.almacenamiento.map((a) => [a.id, a.real]));
    expect(por).toEqual({ s1: true, a1: true, a2: false });
    expect(r.motivoPorFuente.a2).toMatch(/solo declarado/i);
  });

  it("respeta los almacenes elegidos y evita duplicados", () => {
    const r = mediosEfectivos(entrada({
      cerebro: { id: "c1", cuentaId: "u1", grupos: [], almacenamiento: ["a1"] },
      almacenes: [{ id: "a1", tipo: "gcs" }, { id: "a1", tipo: "gcs" }, { id: "a2", tipo: "gdrive" }],
    }));
    expect(r.almacenamiento.map((a) => a.id)).toEqual(["a1"]);
    expect(r.motivoPorFuente.a2).toMatch(/elegidos/i);
  });

  it("la neurona que presta disco aparece como almacén declarado, no real", () => {
    const r = mediosEfectivos(entrada({ ofertas: [neurona("n1", "u1", {}, 1000)] }));
    expect(r.almacenamiento).toEqual([{ id: "neurona:n1", tipo: "neurona", libreMb: 1000, real: false }]);
  });

  it("descarta servidores con error y no filtra IPs ni claves", () => {
    const s = { ...servidor("s1", "own", "compute"), status: "error", endpoint: "http://10.0.0.5:9000", keyRef: "CLAVE_X" };
    const r = mediosEfectivos(entrada({ servidoresEnlazados: [s] }));
    expect(r.computo).toHaveLength(0);
    expect(JSON.stringify(r.motivoPorFuente)).not.toMatch(/10\.0\.0\.5|CLAVE_X/);
  });

  it("no privado: una oferta ajena que presta al público entra", () => {
    const r = mediosEfectivos(entrada({
      ofertas: [neurona("n1", "u1"), neurona("n9", "u9", { cuenta: false, publico: true })],
    }));
    expect(r.computo.map((c) => c.nodoId)).toEqual(["n1", "n9"]);
    expect(r.motivoPorFuente.n9).toMatch(/prestable/i);
  });

  it("privado: entre las ofertas solo entran las de la cuenta propia, públicas o no", () => {
    const r = mediosEfectivos(entrada({
      privado: true,
      ofertas: [
        neurona("n1", "u1"),
        neurona("n2", "u2"),
        neurona("n3", "u3", { cuenta: false, publico: true }),
      ],
    }));
    expect(r.computo.map((c) => c.nodoId)).toEqual(["n1"]);
    expect(r.motivoPorFuente.n2).toMatch(/privado/i);
    expect(r.motivoPorFuente.n3).toMatch(/privado/i);
  });

  it("reenvía el libreMb del almacén declarado y lo marca por driver", () => {
    const r = mediosEfectivos(entrada({ almacenes: [{ id: "bk-1", tipo: "gcs", libreMb: 7168 }] }));
    expect(r.almacenamiento).toEqual([{ id: "bk-1", tipo: "gcs", libreMb: 7168, real: true }]);
  });

  it("maneja entradas vacías", () => {
    const r = mediosEfectivos(entrada());
    expect(r.computo).toEqual([]);
    expect(r.almacenamiento).toEqual([]);
    expect(r.motivoPorFuente).toEqual({});
  });

  it("no muta las entradas", () => {
    const e = entrada({
      ofertas: [neurona("n1", "u1")],
      vecinos: [neurona("v1", "u2", { publico: true })],
      almacenes: [{ id: "a1", tipo: "ipfs" }],
      servidoresEnlazados: [servidor("s1", "starseed", "storage")],
    });
    const antes = JSON.stringify(e);
    mediosEfectivos(e);
    expect(JSON.stringify(e)).toBe(antes);
  });
});
