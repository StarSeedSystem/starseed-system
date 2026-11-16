/**
 * Tests del adaptador de estaciones del espectrómetro (MRI5 · MAP1116B).
 * Una estación es una señal DECLARADA (lo que su dueño publicó): la pública ajena sí
 * aparece, la privada propia es privada, la privada ajena se descarta y, sin
 * frecuencia declarada, no hay ningún número inventado.
 */

import { describe, it, expect } from "vitest";
import { enlaceDeSesion, type FichaSesion } from "@/lib/estaciones/transmision-parametrica";
import { esSenalValida } from "../../modelo";
import { adaptarEstaciones, capaDeEstacion, frecuenciaDeclaradaKhz, senalesDeEstaciones, type FilaEstacion } from "../estaciones";

const YO = "11111111-1111-1111-1111-111111111111";
const OTRO = "22222222-2222-2222-2222-222222222222";
/** Contexto de quien mira: con cuenta y sin entidades. */
const CTX = { usuarioId: YO, entidades: [] as string[] };

/** Una fila de `os_estaciones` tal y como la devuelve `listarEstaciones`. */
function fila(overrides: Partial<FilaEstacion> = {}): FilaEstacion {
  return {
    id: "estacion-1",
    owner_id: OTRO,
    entidad_ref: null,
    tipo: "audio",
    enlace: "https://ejemplo.org/directo",
    visibilidad: "publica",
    ...overrides,
  };
}

/** El enlace de una sesión en vivo de Omnifrecuencias (lo que publica su dueño). */
function enlaceOmni(hz = 432): string {
  const ficha: FichaSesion = {
    v: 1,
    id: "a".repeat(22),
    fuente: "omnifrecuencias",
    titulo: "Entonación de prueba",
    enlace: "https://omnifrecuencias.vercel.app/entonaciones/demo",
    pk: "b".repeat(64),
    privada: false,
    params: {
      tipo: "omnifrecuencias",
      entonacion: { osciladores: [{ id: "o1", f: hz, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }], volumen: 0.7 },
    },
    creada: 1_700_000_000_000,
  };
  return enlaceDeSesion(ficha);
}

describe("Adaptador de estaciones · capa", () => {
  it("la pública ajena sí aparece, y es pública", () => {
    const r = senalesDeEstaciones([fila()], CTX);
    expect(r.sinFuente).toBeNull();
    expect(r.senales).toHaveLength(1);
    const s = r.senales[0];
    expect(s.medio).toBe("estacion");
    expect(s.capa).toBe("publica");
    expect(s.origen).toBe("declarada");
    expect(s.fuente).toBe("estación publicada por su dueño");
    expect(s.vinculo).toEqual({ tipo: "estacion", id: "estacion-1" });
    expect(esSenalValida(s)).toBe(true);
  });
  it("la privada propia y la de una entidad tuya son privadas", () => {
    const propia = fila({ owner_id: YO, entidad_ref: "g1", visibilidad: "grupo" });
    expect(capaDeEstacion(propia, CTX)).toBe("privada");
    const deGrupo = fila({ entidad_ref: "g1", visibilidad: "grupo" });
    expect(capaDeEstacion(deGrupo, { usuarioId: YO, entidades: ["g1"] })).toBe("privada");
    expect(senalesDeEstaciones([propia], CTX).senales[0].capa).toBe("privada");
  });
  it("la privada de otra persona se descarta", () => {
    const f = fila({ entidad_ref: "g2", visibilidad: "grupo" });
    expect(capaDeEstacion(f, { usuarioId: YO, entidades: ["g1"] })).toBeNull();
    const r = senalesDeEstaciones([f], { usuarioId: YO, entidades: ["g1"] });
    expect(r.senales).toHaveLength(0);
    expect(r.sinFuente).toBeNull();
  });
});

describe("Adaptador de estaciones · lo que declara", () => {
  it("sin frecuencia declarada no hay ningún número inventado", () => {
    const s = senalesDeEstaciones([fila()], CTX).senales[0];
    expect(s.frecuenciaKhz).toBeNull();
    expect(s.anchoKhz).toBeNull();
    expect(s.fuerzaDbm).toBeNull();
    expect(s.calidad).toBeNull();
    expect(s.medidoEn).toBeNull();
    expect(s.zona).toBeNull();
  });
  it("una estación de Omnifrecuencias declara su frecuencia", () => {
    const f = fila({ enlace: enlaceOmni(432) });
    expect(frecuenciaDeclaradaKhz(f)).toBeCloseTo(0.432, 6);
    expect(senalesDeEstaciones([f], CTX).senales[0].frecuenciaKhz).toBeCloseTo(0.432, 6);
  });
});

describe("Adaptador de estaciones · sin fuente", () => {
  it("sin sesión no hay señales, no se lee y se dice por qué", async () => {
    let leidas = 0;
    const fuente = { usuarioId: async () => null, listar: async () => { leidas += 1; return []; } };
    const r = await adaptarEstaciones(fuente);
    expect(leidas).toBe(0);
    expect(r.senales).toHaveLength(0);
    expect(r.sinFuente?.medio).toBe("estacion");
    const pura = senalesDeEstaciones([fila()], { usuarioId: null, entidades: [] });
    expect(pura.sinFuente?.medio).toBe("estacion");
  });
  it("si la lectura falla, se dice que no hay fuente", async () => {
    const r = await adaptarEstaciones({
      usuarioId: async () => YO,
      listar: async () => { throw new Error("sin red"); },
    });
    expect(r.senales).toHaveLength(0);
    expect(r.sinFuente?.medio).toBe("estacion");
  });
  it("con sesión, las señales llegan", async () => {
    const r = await adaptarEstaciones({ usuarioId: async () => YO, listar: async () => [fila()] });
    expect(r.senales).toHaveLength(1);
    expect(r.sinFuente).toBeNull();
  });
});
