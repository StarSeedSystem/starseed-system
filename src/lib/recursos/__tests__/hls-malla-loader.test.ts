import { describe, it, expect } from "vitest";
import { anuncio, fusionar, quienTiene, type RegistroDisponibilidad } from "../disponibilidad";
import {
  cargarSegmentoMalla,
  contextoPermiteMalla,
  anunciarSegmentoPropio,
  registroSesionMalla,
  reiniciarSesionMalla,
  type DepsSegmentoMalla,
  type SegmentoMalla,
} from "../hls-malla-loader";
const SEG: SegmentoMalla = {
  elemento: "https://origen.dev/directo/seg-1.ts",
  indice: 1,
  url: "https://origen.dev/directo/seg-1.ts",
  total: 4,
  sha256: "bueno",
};
function registroCon(...nodos: string[]): RegistroDisponibilidad {
  return fusionar(
    nodos.map((nodo) => {
      const [pieza] = anuncio(nodo, SEG.elemento, SEG.total ?? 4, [SEG.indice], 1_000);
      return { anuncio: pieza, recibidoEn: 1_000 };
    })
  );
}
const nunca = (): Promise<void> => new Promise<void>(() => undefined);
const nuncaCrudo = (): Promise<Uint8Array | null> => new Promise(() => undefined);
function deps(extra: Partial<DepsSegmentoMalla> = {}): DepsSegmentoMalla {
  return {
    ahora: () => 2_000,
    esperar: nunca,
    registro: () => registroCon("nodo-a"),
    pedirAPar: async () => new Uint8Array([1, 2, 3]),
    bajarDelOrigen: async () => { throw new Error("no debería bajar del origen"); },
    huella: async (b) => (new Uint8Array(b)[0] === 1 ? "bueno" : "malo"),
    ...extra,
  };
}
describe("cargarSegmentoMalla", () => {
  it("par rápido: usa al vecino, no toca el origen y se anuncia como transmisor", async () => {
    let anuncios = 0;
    const r = await cargarSegmentoMalla(SEG, deps({ anunciar: () => { anuncios += 1; } }));
    expect(r.fuente).toBe("par");
    expect(r.nodo).toBe("nodo-a");
    expect([...r.bytes]).toEqual([1, 2, 3]);
    expect(r.descartados).toEqual([]);
    expect(anuncios).toBe(1);
  });
  it("par lento: agota el tope y cae al origen", async () => {
    const r = await cargarSegmentoMalla(SEG, deps({
      pedirAPar: nuncaCrudo,
      esperar: () => Promise.resolve(),
      bajarDelOrigen: async () => new Uint8Array([1, 2, 3]),
    }));
    expect(r.fuente).toBe("origen");
    expect(r.descartados).toEqual([{ nodo: "nodo-a", motivo: "lento" }]);
  });
  it("par mentiroso (hash distinto): lo descarta y baja del origen", async () => {
    let anuncios = 0;
    const r = await cargarSegmentoMalla(SEG, deps({
      pedirAPar: async () => new Uint8Array([2, 2, 2]),
      bajarDelOrigen: async () => new Uint8Array([1, 2, 3]),
      anunciar: () => { anuncios += 1; },
    }));
    expect(r.fuente).toBe("origen");
    expect(r.descartados).toEqual([{ nodo: "nodo-a", motivo: "hash" }]);
    expect(anuncios).toBe(1);
  });
  it("salta al siguiente par si el primero miente", async () => {
    const r = await cargarSegmentoMalla(SEG, deps({
      registro: () => registroCon("mentiroso", "honesto"),
      pedirAPar: (nodo) => nodo === "mentiroso"
        ? Promise.resolve(new Uint8Array([2]))
        : new Promise((listo) => setTimeout(() => listo(new Uint8Array([1, 2, 3])), 0)),
    }));
    expect(r.fuente).toBe("par");
    expect(r.nodo).toBe("honesto");
    expect(r.descartados).toEqual([{ nodo: "mentiroso", motivo: "hash" }]);
  });
  it("respeta el tope de subida prestado: sin permiso no anuncia", async () => {
    let anuncios = 0;
    await cargarSegmentoMalla(SEG, deps({
      pedirAPar: async () => null,
      bajarDelOrigen: async () => new Uint8Array([1, 2, 3]),
      anunciar: () => { anuncios += 1; },
      puedeAnunciar: () => false,
    }));
    expect(anuncios).toBe(0);
  });
  it("usa medio segmento como tope si dura menos que 300 ms", async () => {
    let tope = 0;
    const r = await cargarSegmentoMalla({ ...SEG, sha256: undefined }, deps({
      pedirAPar: async (_nodo, _segmento, ms) => { tope = ms; return new Uint8Array([1]); },
    }), { duracionSegmentoMs: 400 });
    expect(r.fuente).toBe("par");
    expect(tope).toBe(200);
  });
  it("rechaza un origen con huella distinta", async () => {
    await expect(cargarSegmentoMalla(SEG, deps({
      pedirAPar: async () => null,
      bajarDelOrigen: async () => new Uint8Array([2]),
    }))).rejects.toThrow(/huella/);
  });
});
describe("sesión de disponibilidad y contexto", () => {
  it("el segmento propio queda anunciado y se encuentra por la malla", () => {
    reiniciarSesionMalla();
    anunciarSegmentoPropio("yo", SEG, 5_000);
    expect(quienTiene(registroSesionMalla(), SEG.elemento, SEG.indice, 5_000)).toEqual(["yo"]);
  });
  it("solo público o de la cuenta usan la malla", () => {
    expect(contextoPermiteMalla("publica")).toBe(true);
    expect(contextoPermiteMalla("grupo")).toBe(true);
    expect(contextoPermiteMalla(undefined)).toBe(false);
  });
});
