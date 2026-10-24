import { describe, it, expect } from "vitest";
import { anuncio, fusionar, type RegistroDisponibilidad } from "../disponibilidad";
import {
  cargarSegmento,
  contextoAptoMalla,
  topeEsperaMs,
  type PeticionSegmento,
} from "../hls-malla-loader";

const AHORA = 1_000_000;
const ELEMENTO = "estacion-1";

function registro(nodos: Array<[string, number[]]>, total = 10): RegistroDisponibilidad {
  return fusionar(
    nodos.flatMap(([nodo, indices]) =>
      anuncio(nodo, ELEMENTO, total, indices, AHORA - 50).map((a) => ({ anuncio: a, recibidoEn: AHORA }))
    )
  );
}

function crear(reg: RegistroDisponibilidad, over: Partial<PeticionSegmento> = {}) {
  const estado = { anuncios: [] as number[], origen: 0, peticiones: [] as string[] };
  const p: PeticionSegmento = {
    elemento: ELEMENTO,
    indice: 4,
    duracionMs: 6000,
    registro: reg,
    ahora: AHORA,
    pedirANodo: async (nodo) => {
      estado.peticiones.push(nodo);
      return new Uint8Array([7, 1]);
    },
    sha256: async (datos) => `h-${datos[0]}`,
    hashEsperado: () => "h-7",
    esperar: () => new Promise<void>(() => undefined),
    anunciar: (indice) => estado.anuncios.push(indice),
    puedeSubir: () => true,
    bajarOrigen: async () => {
      estado.origen += 1;
      return new Uint8Array([7, 2]);
    },
    ...over,
  };
  return { p, estado };
}

describe("hls-malla-loader.ts", () => {
  it("par rápido: gana el vecino que llega a tiempo y no se toca el origen", async () => {
    const { p, estado } = crear(registro([["rápido", [4]], ["lento", [4]]]), {
      pedirANodo: async (nodo) =>
        nodo === "rápido" ? new Uint8Array([7, 9]) : new Promise<Uint8Array>(() => undefined),
    });
    const r = await cargarSegmento(p);
    expect(r.fuente).toBe("malla");
    expect(r.nodo).toBe("rápido");
    expect(r.intentos).toBe(2);
    expect(estado.origen).toBe(0);
    expect(estado.anuncios).toEqual([4]);
  });

  it("par lento: se agota el tope de espera y se baja del origen", async () => {
    const { p, estado } = crear(registro([["lento", [4]]]), {
      pedirANodo: () => new Promise<Uint8Array>(() => undefined),
      esperar: async () => undefined,
    });
    const r = await cargarSegmento(p);
    expect(r.fuente).toBe("origen");
    expect(r.nodo).toBeUndefined();
    expect(estado.origen).toBe(1);
    expect(estado.anuncios).toEqual([4]);
  });

  it("par mentiroso: si el hash no coincide, se descarta y se usa el origen", async () => {
    const { p, estado } = crear(registro([["mentiroso", [4]]]), {
      pedirANodo: async () => new Uint8Array([9, 9]),
    });
    const r = await cargarSegmento(p);
    expect(r.fuente).toBe("origen");
    expect(estado.origen).toBe(1);
    expect(estado.anuncios).toEqual([4]);
  });

  it("con un mentiroso rápido y un honesto, gana el honesto", async () => {
    const { p, estado } = crear(registro([["mentiroso", [4]], ["honesto", [4]]]), {
      pedirANodo: async (nodo) =>
        nodo === "mentiroso" ? new Uint8Array([9]) : new Uint8Array([7]),
    });
    const r = await cargarSegmento(p);
    expect(r.fuente).toBe("malla");
    expect(r.nodo).toBe("honesto");
    expect(estado.origen).toBe(0);
  });

  it("sin pares va directo al origen", async () => {
    const { p, estado } = crear(registro([]));
    const r = await cargarSegmento(p);
    expect(r.fuente).toBe("origen");
    expect(r.intentos).toBe(0);
    expect(estado.origen).toBe(1);
  });

  it("respeta el tope de subida prestado: sin margen no anuncia", async () => {
    const { p, estado } = crear(registro([["rápido", [4]]]), { puedeSubir: () => false });
    const r = await cargarSegmento(p);
    expect(r.fuente).toBe("malla");
    expect(estado.anuncios).toEqual([]);
  });

  it("tope de espera: 300 ms o medio segmento", () => {
    expect(topeEsperaMs(8000)).toBe(300);
    expect(topeEsperaMs(400)).toBe(200);
    expect(topeEsperaMs(0)).toBe(0);
  });

  it("contexto apto solo con malla viva y contexto público o de la cuenta", () => {
    expect(contextoAptoMalla({ en_malla: true, visibilidad: "publica" }, true)).toBe(true);
    expect(contextoAptoMalla({ en_malla: true, visibilidad: "grupo" }, true)).toBe(false);
    expect(contextoAptoMalla({ en_malla: true, visibilidad: "grupo" }, true, true)).toBe(true);
    expect(contextoAptoMalla({ en_malla: false, visibilidad: "publica" }, true)).toBe(false);
    expect(contextoAptoMalla({ en_malla: true, visibilidad: "publica" }, false)).toBe(false);
  });
});
