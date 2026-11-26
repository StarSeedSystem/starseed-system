/**
 * Fuzzer determinista para `fusionarEstados` — invariantes de convergencia y anti-duplicado.
 * Patrón del skill `coop-sync-testing` (fuzzing-coop-sync.md): semilla fija, oráculos, shrink.
 * Módulo PURO: sin red, sin disco, sin reloj real.
 */
import { describe, it, expect } from "vitest";
import { mulberry32, entero, elegir, SEMILLA_ENJAMBRE } from "@/lib/test-utils/seeded-rng";
import {
  fusionarEstados,
  prioridadDeElemento,
  type EstadoSala,
  type ElementoSala,
  LIMITE_ELEMENTOS,
} from "../sincronia-sala";

const TIPOS = ["nota", "posicion", "trazo", "cursor", "widget", "historial", "modelo3d", "camara"] as const;
const DISPOSITIVOS = ["movil-ana", "portatil-bruno", "tablet-carla", "pc-dani", "watch-eva"] as const;
const SEMILLA = SEMILLA_ENJAMBRE;
const CASOS = 500;

function elementoAleatorio(rnd: () => number, tiempoBase: number): ElementoSala {
  const tipo = elegir(rnd, TIPOS);
  const dispositivo = elegir(rnd, DISPOSITIVOS);
  const id = `e-${entero(rnd, 1, 1000)}-${rnd().toString(36).slice(2, 6)}`;
  const actualizadoEn = tiempoBase + entero(rnd, 0, 10000);
  const borrado = rnd() < 0.1;
  return {
    id,
    tipo,
    datos: { v: rnd() },
    actualizadoEn,
    porDispositivo: dispositivo,
    ...(borrado ? { borrado: true } : {}),
  };
}

function estadoAleatorio(rnd: () => number, tiempoBase: number, salaId = "sala-fuzz"): EstadoSala {
  const n = entero(rnd, 0, 20);
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0; i < n; i += 1) {
    const e = elementoAleatorio(rnd, tiempoBase);
    elementos[e.id] = e;
  }
  return { salaId, elementos, reloj: entero(rnd, 1, 100) };
}

function canon(estado: EstadoSala): string {
  const claves = Object.keys(estado.elementos).sort();
  return claves.map((k) => {
    const e = estado.elementos[k];
    return `${k}:${e.tipo}:${e.actualizadoEn}:${e.porDispositivo}:${e.borrado ? 1 : 0}`;
  }).join("|");
}

describe("fusionarEstados · fuzzer determinista (semilla 1025, 500 casos)", () => {
  it("conmutativa: fusionar A con B = fusionar B con A", () => {
    const rnd = mulberry32(SEMILLA);
    for (let i = 0; i < CASOS; i += 1) {
      const a = estadoAleatorio(rnd, 1_000_000_000_000 + i * 1000);
      const b = estadoAleatorio(rnd, 1_000_000_000_000 + i * 1000 + 500);
      const ab = fusionarEstados(a, b, "observador");
      const ba = fusionarEstados(b, a, "observador");
      expect(canon(ab.resultado), `caso ${i}: conmutativa`).toBe(canon(ba.resultado));
      expect(ab.conflictos.sort(), `caso ${i}: conflictos iguales`).toEqual(ba.conflictos.sort());
    }
  });

  it("idempotente: fusionar A con A = A", () => {
    const rnd = mulberry32(SEMILLA + 1);
    for (let i = 0; i < CASOS; i += 1) {
      const a = estadoAleatorio(rnd, 2_000_000_000_000 + i * 1000);
      const aa = fusionarEstados(a, a, "observador");
      expect(canon(aa.resultado), `caso ${i}: idempotente`).toBe(canon(a));
      expect(aa.conflictos, `caso ${i}: sin conflictos consigo misma`).toEqual([]);
    }
  });

  it("oráculo: gana actualizadoEn mayor sin importar orden", () => {
    const rnd = mulberry32(SEMILLA + 2);
    for (let i = 0; i < 100; i += 1) {
      const base = elementoAleatorio(rnd, 3_000_000_000_000);
      const viejo = { ...base, actualizadoEn: base.actualizadoEn };
      const nuevo = { ...base, actualizadoEn: base.actualizadoEn + 1000, porDispositivo: "otro-dispositivo" };
      const a: EstadoSala = { salaId: "s", elementos: { [base.id]: viejo }, reloj: 1 };
      const b: EstadoSala = { salaId: "s", elementos: { [base.id]: nuevo }, reloj: 1 };
      expect(fusionarEstados(a, b, "obs").resultado.elementos[base.id].actualizadoEn).toBe(nuevo.actualizadoEn);
      expect(fusionarEstados(b, a, "obs").resultado.elementos[base.id].actualizadoEn).toBe(nuevo.actualizadoEn);
    }
  });

  it("oráculo: desempate alfabético por porDispositivo a igual actualizadoEn", () => {
    const base: ElementoSala = { id: "x", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "aaa" };
    const otro: ElementoSala = { ...base, porDispositivo: "zzz" };
    const a: EstadoSala = { salaId: "s", elementos: { x: base }, reloj: 1 };
    const b: EstadoSala = { salaId: "s", elementos: { x: otro }, reloj: 1 };
    const ab = fusionarEstados(a, b, "obs");
    const ba = fusionarEstados(b, a, "obs");
    expect(ab.resultado.elementos.x.porDispositivo).toBe("aaa");
    expect(ba.resultado.elementos.x.porDispositivo).toBe("aaa");
    expect(ab.conflictos).toEqual(["x"]);
    expect(ba.conflictos).toEqual(["x"]);
  });

  it("oráculo: lápida gana a igual actualizadoEn y dispositivo", () => {
    const base: ElementoSala = { id: "x", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "dev" };
    const lapida: ElementoSala = { ...base, borrado: true };
    const a: EstadoSala = { salaId: "s", elementos: { x: base }, reloj: 1 };
    const b: EstadoSala = { salaId: "s", elementos: { x: lapida }, reloj: 1 };
    expect(fusionarEstados(a, b, "obs").resultado.elementos.x.borrado).toBe(true);
    expect(fusionarEstados(b, a, "obs").resultado.elementos.x.borrado).toBe(true);
  });

  it("oráculo: anti-eco — ignora lo que vuelve del propio dispositivo", () => {
    const rnd = mulberry32(SEMILLA + 3);
    for (let i = 0; i < 50; i += 1) {
      const dispositivo = elegir(rnd, DISPOSITIVOS);
      const local = estadoAleatorio(rnd, 4_000_000_000_000 + i * 1000);
      // Simula eco: el mismo dispositivo con timestamp posterior
      const eco: EstadoSala = {
        salaId: local.salaId,
        elementos: {},
        reloj: local.reloj + 1,
      };
      for (const [id, e] of Object.entries(local.elementos)) {
        if (e.porDispositivo === dispositivo) {
          eco.elementos[id] = { ...e, actualizadoEn: e.actualizadoEn + 5000, datos: { eco: true } };
        }
      }
      const { resultado, conflictos } = fusionarEstados(local, eco, dispositivo);
      for (const [id, e] of Object.entries(local.elementos)) {
        if (e.porDispositivo === dispositivo) {
          expect(resultado.elementos[id].actualizadoEn).toBe(e.actualizadoEn);
        }
      }
      expect(conflictos).toEqual([]);
    }
  });

  it("oráculo: no mezcla salas distintas", () => {
    const a: EstadoSala = { salaId: "sala-1", elementos: { x: { id: "x", tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "a" } }, reloj: 1 };
    const b: EstadoSala = { salaId: "sala-2", elementos: { y: { id: "y", tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "b" } }, reloj: 1 };
    const { resultado, conflictos } = fusionarEstados(a, b, "a");
    expect(conflictos).toContain("sala-distinta");
    expect(Object.keys(resultado.elementos)).toEqual(["x"]);
  });

  it("oráculo: límite de elementos se reporta, no trunca", () => {
    const elementos: Record<string, ElementoSala> = {};
    for (let i = 0; i <= LIMITE_ELEMENTOS; i += 1) {
      elementos[`e${i}`] = { id: `e${i}`, tipo: "nota", datos: {}, actualizadoEn: i, porDispositivo: "a" };
    }
    const a: EstadoSala = { salaId: "s", elementos, reloj: 1 };
    const b: EstadoSala = { salaId: "s", elementos: { extra: { id: "extra", tipo: "nota", datos: {}, actualizadoEn: 9999, porDispositivo: "b" } }, reloj: 1 };
    const { conflictos } = fusionarEstados(a, b, "a");
    expect(conflictos).toContain("limite-excedido");
  });
});

describe("prioridadDeElemento · fuzzer de cobertura de tipos", () => {
  it("cubre P0, P1, P2, P3 en 200 casos aleatorios", () => {
    const rnd = mulberry32(SEMILLA + 4);
    const conteo = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 200; i += 1) {
      const e = elementoAleatorio(rnd, 5_000_000_000_000);
      const p = prioridadDeElemento(e);
      conteo[p] += 1;
    }
    // Verifica que todos los niveles salen al menos una vez
    expect(conteo[0]).toBeGreaterThan(0);
    expect(conteo[1]).toBeGreaterThan(0);
    expect(conteo[2]).toBeGreaterThan(0);
    expect(conteo[3]).toBeGreaterThan(0);
  });
});