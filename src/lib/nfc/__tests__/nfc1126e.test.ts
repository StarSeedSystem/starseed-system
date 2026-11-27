import { describe, expect, it } from "vitest";
import {
  abrirSesion,
  contextoSesion,
  LIMITE_NFC_BYTES,
  planificarTraspaso,
  requiereToque,
  transportesComunes,
  type Carga,
  type EntradaPlan,
  type MotorCifrado,
} from "../traspaso";
import type { TarjetaNeurona, TipoTransporte } from "../tarjeta";

const tarjeta = (id: string, efimera: string, nonce: string, tipos: TipoTransporte[]): TarjetaNeurona => ({
  version: 1,
  neuronaId: id,
  clavePublica: "a".repeat(64),
  cuenta: { modo: "nada" },
  claveEfimera: efimera,
  nonce,
  emitidaEn: 1_700_000_000_000,
  ofertas: [],
  transportes: tipos.map((tipo) => ({ tipo, direccion: `${tipo}://${id}` })),
  firma: "d".repeat(128),
});

const TODOS: TipoTransporte[] = ["ble", "wifi-direct", "lan", "malla"];
const A = tarjeta("neurona-a", "1".repeat(64), "a".repeat(16), TODOS);
const B = tarjeta("neurona-b", "2".repeat(64), "b".repeat(16), TODOS);

/** Motor simulado: el secreto es simétrico (xor de las dos claves de 1 byte) y la derivación mezcla el contexto. */
const motor: MotorCifrado = {
  acordar: (priv, pub) => Uint8Array.of(Number.parseInt(priv.slice(0, 2), 16) ^ Number.parseInt(pub.slice(0, 2), 16)),
  derivar: (secreto, contexto) => {
    const salida = new Uint8Array(32);
    for (let i = 0; i < contexto.length; i++) salida[i % 32] = (salida[i % 32] * 31 + contexto.charCodeAt(i)) & 255;
    for (let i = 0; i < 32; i++) salida[i] ^= secreto[i % secreto.length];
    return salida;
  },
};

const entrada = (cambios: Partial<EntradaPlan> = {}): EntradaPlan => ({
  propia: A,
  ajena: B,
  relacion: "cuenta_nueva",
  toque: true,
  carga: { tipo: "archivo", bytes: 5_000_000 },
  vivos: TODOS,
  ...cambios,
});

describe("NFC → mejor transporte", () => {
  it("lo pequeño (< 32 KB) viaja por el propio NFC", () => {
    const p = planificarTraspaso(entrada({ carga: { tipo: "texto", bytes: LIMITE_NFC_BYTES - 1 } }));
    expect(p).toEqual({ ok: true, via: "nfc", transportes: [] });
  });

  it("un texto de 32 KB o más ya no cabe por NFC y pasa a la sesión", () => {
    const p = planificarTraspaso(entrada({ carga: { tipo: "texto", bytes: LIMITE_NFC_BYTES } }));
    expect(p.ok && p.via).toBe("sesion");
  });

  it("archivos, folders y cerebros van por sesión cifrada en todos los transportes comunes a la vez", () => {
    for (const tipo of ["archivo", "folder", "cerebro"] as const) {
      const p = planificarTraspaso(entrada({ carga: { tipo, bytes: 10 }, relacion: "misma_cuenta" }));
      expect(p).toEqual({ ok: true, via: "sesion", transportes: ["wifi-direct", "lan", "ble", "malla"], cifrada: true });
    }
  });

  it("solo usa los transportes que las dos tarjetas declaran y que están vivos", () => {
    const sinLan = tarjeta("x", "3".repeat(64), "c".repeat(16), ["ble", "malla", "lan"]);
    const vivos: TipoTransporte[] = ["ble", "lan"];
    expect(transportesComunes(A, sinLan, vivos)).toEqual(["lan", "ble"]);
    expect(transportesComunes(A, sinLan, [])).toEqual([]);
  });

  it("si solo queda la malla, la malla lleva todo", () => {
    const p = planificarTraspaso(entrada({ vivos: ["malla"] }));
    expect(p).toEqual({ ok: true, via: "sesion", transportes: ["malla"], cifrada: true });
  });

  it("sin transportes comunes vivos no viaja nada grande", () => {
    expect(planificarTraspaso(entrada({ vivos: [] }))).toEqual({ ok: false, motivo: "sin_transporte" });
    const soloBle = tarjeta("y", "4".repeat(64), "d".repeat(16), ["ble"]);
    expect(planificarTraspaso(entrada({ ajena: soloBle, vivos: ["malla", "lan"] }))).toEqual({ ok: false, motivo: "sin_transporte" });
  });
});

describe("nada de una neurona desconocida sin un toque", () => {
  it("lo ajeno exige toque aunque sea pequeño", () => {
    const pequena: Carga = { tipo: "oferta", bytes: 100 };
    for (const relacion of ["cuenta_reconocida", "cuenta_nueva", "nodo_publico", "etiqueta"] as const) {
      expect(requiereToque(relacion, pequena)).toBe(true);
      expect(planificarTraspaso(entrada({ relacion, carga: pequena, toque: false }))).toEqual({ ok: false, motivo: "sin_toque" });
    }
  });

  it("lo propio solo pide toque para cerebros y permisos", () => {
    for (const relacion of ["misma_cuenta", "nodo_propio"] as const) {
      expect(requiereToque(relacion, { tipo: "archivo", bytes: 9 })).toBe(false);
      expect(requiereToque(relacion, { tipo: "cerebro", bytes: 9 })).toBe(true);
      expect(requiereToque(relacion, { tipo: "permiso", bytes: 9, permiso: "senales" })).toBe(true);
    }
    const cerebro = entrada({ relacion: "misma_cuenta", carga: { tipo: "cerebro", bytes: 9 }, toque: false });
    expect(planificarTraspaso(cerebro)).toEqual({ ok: false, motivo: "sin_toque" });
  });

  it("con el toque, el archivo ajeno sigue su camino", () => {
    expect(planificarTraspaso(entrada({ toque: true })).ok).toBe(true);
  });
});

describe("permisos y cargas inválidas", () => {
  it("un permiso sin nombre se rechaza", () => {
    const p = planificarTraspaso(entrada({ carga: { tipo: "permiso", bytes: 8 } }));
    expect(p).toEqual({ ok: false, motivo: "permiso_sin_nombre" });
  });

  it("cada permiso con nombre viaja cifrado por la sesión", () => {
    for (const permiso of ["capacidades", "capas", "almacenamiento", "senales", "internet_banco", "internet_mesh"] as const) {
      const p = planificarTraspaso(entrada({ carga: { tipo: "permiso", bytes: 8, permiso } }));
      expect(p.ok && p.via).toBe("sesion");
    }
  });

  it("los bytes negativos o no finitos son inválidos", () => {
    for (const bytes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(planificarTraspaso(entrada({ carga: { tipo: "archivo", bytes } }))).toEqual({ ok: false, motivo: "carga_invalida" });
    }
  });
});

describe("sesión cifrada con clave efímera de las dos tarjetas", () => {
  it("las dos neuronas derivan el mismo contexto, clave e id", () => {
    expect(contextoSesion(A, B)).toBe(contextoSesion(B, A));
    const sa = abrirSesion(A, B, "11" + "0".repeat(62), ["lan", "ble"], motor);
    const sb = abrirSesion(B, A, "22" + "0".repeat(62), ["lan", "ble"], motor);
    expect(sa.clave.length).toBe(32);
    expect(sa.id).toHaveLength(32);
    expect(Array.from(sa.clave)).toEqual(Array.from(sb.clave));
    expect(sa.id).toBe(sb.id);
    expect(sa.transportes).toEqual(["lan", "ble"]);
  });

  it("otra tarjeta efímera da otra sesión", () => {
    const otra = tarjeta("neurona-b", "9".repeat(64), "e".repeat(16), TODOS);
    const s1 = abrirSesion(A, B, "11" + "0".repeat(62), ["lan"], motor);
    const s2 = abrirSesion(A, otra, "11" + "0".repeat(62), ["lan"], motor);
    expect(s2.id).not.toBe(s1.id);
  });
});
