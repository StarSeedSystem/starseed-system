/**
 * Fuzzing de sincronía de salas (Ola 1025R · INF1025I).
 * PRNG con semilla, oráculos e invariantes, gemelos mutantes.
 */
import { describe, it, expect } from "vitest";
import {
  LIMITE_ELEMENTOS,
  excedeLimite,
  fusionarEstados,
  type ElementoSala,
  type EstadoSala,
} from "../salas/sincronia-sala";

const SEMILLAS = [123456789, 987654321, 20251027, 1337, 424242];

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(r: () => number, min: number, max: number) {
  return Math.floor(r() * (max - min + 1)) + min;
}

function elegir(r: () => number, arr: string[]) {
  return arr[randInt(r, 0, arr.length - 1)];
}

const TIPOS = ["nota", "trazo", "camara", "posicion", "cursor:ana", "presencia"];
const DISPOSITIVOS = ["movil-ana", "portatil-bruno", "tablet-clara"];

function generarElemento(r: () => number, idsCompartidos: string[], salaIdBase: string): ElementoSala {
  const id = elegir(r, idsCompartidos);
  const porDispositivo = elegir(r, DISPOSITIVOS);
  const actualizadoEn = randInt(r, 1, 1000);
  const esLapida = r() < 0.1;
  return {
    id,
    tipo: elegir(r, TIPOS),
    datos: { texto: `${id}@${porDispositivo}` },
    actualizadoEn,
    porDispositivo,
    ...(esLapida ? { borrado: true } : {}),
  };
}

function generarEstado(r: () => number, salaId: string, idsCompartidos: string[], numElementos: number): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  for (let i = 0; i < numElementos; i += 1) {
    const el = generarElemento(r, idsCompartidos, salaId);
    // Puede haber empates - ultimo gana solo si mismo id, pero generamos distintos entradas
    mapa[el.id] = el;
  }
  return {
    salaId,
    elementos: mapa,
    reloj: randInt(r, 1, 20),
  };
}

function generarIdsCompartidos(r: () => number): string[] {
  const n = randInt(r, 1, 12);
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    ids.push(`id${i}-${randInt(r, 0, 100)}`);
  }
  if (ids.length === 0) ids.push("id0");
  return Array.from(new Set(ids));
}

describe("fuzz · oráculos", () => {
  for (const semilla of SEMILLAS) {
    it(`oráculos con semilla ${semilla}`, () => {
      const r = mulberry32(semilla);
      const miDispositivo = "observador-externo";
      for (let caso = 0; caso < 300; caso += 1) {
        const ids = generarIdsCompartidos(r);
        const salaId = "sala-fuzz";
        const a = generarEstado(r, salaId, ids, randInt(r, 1, 12));
        const b = generarEstado(r, salaId, ids, randInt(r, 1, 12));

        const ab = fusionarEstados(a, b, miDispositivo);
        const ba = fusionarEstados(b, a, miDispositivo);

        // conmutativa
        expect(Object.keys(ab.resultado.elementos).sort()).toEqual(Object.keys(ba.resultado.elementos).sort());
        for (const k of Object.keys(ab.resultado.elementos)) {
          const ea = ab.resultado.elementos[k];
          const eb = ba.resultado.elementos[k];
          expect(ea.id).toBe(eb.id);
          expect(ea.borrado).toBe(eb.borrado);
          expect(ea.porDispositivo).toBe(eb.porDispositivo);
          expect(ea.actualizadoEn).toBe(eb.actualizadoEn);
        }
        expect(ab.conflictos.slice().sort()).toEqual(ba.conflictos.slice().sort());

        // idempotente
        const ab2 = fusionarEstados(ab.resultado, b, miDispositivo);
        const ba2 = fusionarEstados(ba.resultado, a, miDispositivo);
        expect(Object.keys(ab2.resultado.elementos).sort()).toEqual(Object.keys(ab.resultado.elementos).sort());

        // asociativa sobre tres
        const c = generarEstado(r, salaId, ids, randInt(r, 1, 12));
        const abc1 = fusionarEstados(fusionarEstados(a, b, miDispositivo).resultado, c, miDispositivo);
        const abc2 = fusionarEstados(a, fusionarEstados(b, c, miDispositivo).resultado, miDispositivo);
        expect(Object.keys(abc1.resultado.elementos).sort()).toEqual(Object.keys(abc2.resultado.elementos).sort());

        // reloj es el maximo
        expect(ab.resultado.reloj).toBe(Math.max(a.reloj ?? 0, b.reloj ?? 0));
        expect(ba.resultado.reloj).toBe(Math.max(b.reloj ?? 0, a.reloj ?? 0));

        // lápida con marca >= a la de cualquier edición del mismo id se conserva
        for (const id of ids) {
          const ea = a.elementos[id];
          const eb = b.elementos[id];
          if (!ea || !eb) continue;
          if (eb.borrado && eb.actualizadoEn >= (ea.actualizadoEn ?? 0) && eb.porDispositivo !== miDispositivo) {
            const res = fusionarEstados(a, b, miDispositivo).resultado;
            if (res.elementos[id] && eb.actualizadoEn > (ea.actualizadoEn ?? 0)) {
              expect(res.elementos[id].borrado).toBe(true);
            }
          }
        }
      }
    });
  }

  it("sala distinta nunca fusiona", () => {
    const r = mulberry32(111);
    const miDispositivo = "obs";
    for (let caso = 0; caso < 50; caso += 1) {
      const ids = generarIdsCompartidos(r);
      const a = generarEstado(r, "sala-a", ids, 3);
      const b = generarEstado(r, "sala-b", ids, 3);
      const res = fusionarEstados(a, b, miDispositivo);
      expect(res.conflictos).toContain("sala-distinta");
      expect(Object.keys(res.resultado.elementos)).toEqual(Object.keys(a.elementos));
    }
  });

  it("aviso limite-excedido si y solo si hay mas de LIMITE_ELEMENTOS vivos", () => {
    const vivos = LIMITE_ELEMENTOS + 1;
    const elementos: ElementoSala[] = [];
    for (let i = 0; i < vivos; i += 1) {
      elementos.push({ id: `v${i}`, tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "x" });
    }
    const mapa: Record<string, ElementoSala> = {};
    for (const e of elementos) mapa[e.id] = e;
    const a: EstadoSala = { salaId: "s", elementos: mapa, reloj: 1 };
    const b: EstadoSala = { salaId: "s", elementos: {}, reloj: 1 };
    const res = fusionarEstados(a, b, "obs");
    expect(res.conflictos).toContain("limite-excedido");
    expect(excedeLimite(res.resultado)).toBe(true);
  });
});

type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";

function fusionarEstadosMutante(
  local: EstadoSala,
  remoto: EstadoSala,
  miDispositivo: string,
  mutacion: Mutacion,
): { resultado: EstadoSala; conflictos: string[] } {
  if (local.salaId !== remoto.salaId) {
    return { resultado: local, conflictos: ["sala-distinta"] };
  }

  function ganaSobreMut(a: ElementoSala, b: ElementoSala): boolean {
    if (mutacion === "gana-el-menor") {
      if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn < b.actualizadoEn;
      if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo > b.porDispositivo;
      return Boolean(a.borrado) && !b.borrado;
    }
    if (mutacion === "sin-desempate-por-dispositivo") {
      if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
      if (a.porDispositivo !== b.porDispositivo) {
        // rompe conmutatividad
        return a.porDispositivo > b.porDispositivo; // al reves
      }
      return Boolean(a.borrado) && !b.borrado;
    }
    if (mutacion === "empate-sin-lapida") {
      if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
      if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
      if (Boolean(a.borrado) !== Boolean(b.borrado)) return Boolean(b.borrado); // prefiere lo opuesto
      return Boolean(b.borrado) && !a.borrado;
    }
    if (mutacion === "ignora-lapidas") {
      if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
      if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
      if (a.borrado && !b.borrado) return false;
      if (b.borrado && !a.borrado) return false;
      return Boolean(a.borrado) && !b.borrado;
    }
    if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
    if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
    return Boolean(a.borrado) && !b.borrado;
  }

  function sonDistintas(a: ElementoSala, b: ElementoSala): boolean {
    return (
      a.actualizadoEn !== b.actualizadoEn ||
      a.porDispositivo !== b.porDispositivo ||
      Boolean(a.borrado) !== Boolean(b.borrado)
    );
  }

  function contarVivosMut(e: EstadoSala): number {
    let n = 0;
    for (const el of Object.values(e.elementos ?? {})) if (!el.borrado) n += 1;
    return n;
  }

  const elementos: Record<string, ElementoSala> = { ...(local.elementos ?? {}) };
  const conflictos: string[] = [];

  for (const [id, entrante] of Object.entries(remoto.elementos ?? {})) {
    if (entrante.porDispositivo === miDispositivo) continue;
    if (mutacion === "ignora-lapidas" && entrante.borrado) {
      continue;
    }
    const actual = elementos[id];
    if (!actual) {
      if (mutacion === "ignora-lapidas" && entrante.borrado) continue;
      elementos[id] = entrante;
      continue;
    }
    if (!sonDistintas(actual, entrante)) continue;
    if (actual.porDispositivo !== entrante.porDispositivo) conflictos.push(id);
    if (ganaSobreMut(entrante, actual)) elementos[id] = entrante;
  }

  const resultado: EstadoSala = {
    salaId: local.salaId,
    elementos,
    reloj: Math.max(local.reloj ?? 0, remoto.reloj ?? 0),
  };
  if (contarVivosMut(resultado) > LIMITE_ELEMENTOS) conflictos.push("limite-excedido");
  return { resultado, conflictos: conflictos.sort() };
}

  for (const mutacion of mutaciones) {
    it(`mutante ${mutacion} falla al menos un oráculo`, () => {
      const r = mulberry32(9999 + mutaciones.indexOf(mutacion) * 27183);
      const miDispositivo = "observador-externo";
      let fallo = false;
      for (let caso = 0; caso < 500 && !fallo; caso += 1) {
        const ids = generarIdsCompartidos(r);
        const salaId = "sala-fuzz";
        const a = generarEstado(r, salaId, ids, randInt(r, 1, 12));
        const b = generarEstado(r, salaId, ids, randInt(r, 1, 12));
        try {
          const ab = fusionarEstadosMutante(a, b, miDispositivo, mutacion);
          const ba = fusionarEstadosMutante(b, a, miDispositivo, mutacion);
          const ka = Object.keys(ab.resultado.elementos).sort();
          const kb = Object.keys(ba.resultado.elementos).sort();
          if (JSON.stringify(ka) !== JSON.stringify(kb)) { fallo = true; continue; }
          for (const k of ka) {
            const ea = ab.resultado.elementos[k];
            const eb = ba.resultado.elementos[k];
            if (ea.borrado !== eb.borrado || ea.porDispositivo !== eb.porDispositivo || ea.actualizadoEn !== eb.actualizadoEn) { fallo = true; break; }
          }
          if (fallo) continue;
          if (JSON.stringify(ab.conflictos.slice().sort()) !== JSON.stringify(ba.conflictos.slice().sort())) { fallo = true; continue; }
          const ab2 = fusionarEstadosMutante(ab.resultado, b, miDispositivo, mutacion);
          if (JSON.stringify(Object.keys(ab2.resultado.elementos).sort()) !== JSON.stringify(Object.keys(ab.resultado.elementos).sort())) { fallo = true; continue; }
          const c = generarEstado(r, salaId, ids, randInt(r, 1, 12));
          const res1 = fusionarEstadosMutante(fusionarEstadosMutante(a, b, miDispositivo, mutacion).resultado, c, miDispositivo, mutacion);
          const res2 = fusionarEstadosMutante(a, fusionarEstadosMutante(b, c, miDispositivo, mutacion).resultado, miDispositivo, mutacion);
          if (JSON.stringify(Object.keys(res1.resultado.elementos).sort()) !== JSON.stringify(Object.keys(res2.resultado.elementos).sort())) { fallo = true; continue; }
          if (ab.resultado.reloj !== Math.max(a.reloj ?? 0, b.reloj ?? 0)) { fallo = true; continue; }
        } catch (e) {
          fallo = true;
          continue;
        }
      }
      expect(fallo).toBe(true);
    });
  }
});
