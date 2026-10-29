/** Fuzzer con semilla y gemelos mutantes para la fusión de salas (Ola 1025R · INF1025I), al estilo de Co-op Anything. */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, excedeLimite, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
const DISPOSITIVOS = ["d-alfa", "d-beta", "d-gamma"], MI = "observador-externo";
const SEMILLAS = [1, 7, 42, 1025, 2026], CASOS = 300;
type Fusion = (a: EstadoSala, b: EstadoSala) => { resultado: EstadoSala; conflictos: string[] };
function prng(semilla: number): () => number { let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function estado(r: () => number, ids: string[]): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (const id of ids) {
    elementos[id] = {
      id, tipo: Number(id.slice(1)) % 2 ? "cursor" : "nota", datos: { id },
      actualizadoEn: Math.floor(r() * 4), porDispositivo: DISPOSITIVOS[Math.floor(r() * DISPOSITIVOS.length)],
      borrado: r() < 0.3,
    };
  }
  return { salaId: "sala-fuzz", elementos, reloj: Math.floor(r() * 9) };
}
function caso(semilla: number, indice: number): [EstadoSala, EstadoSala, EstadoSala] {
  const r = prng(semilla * 100000 + indice);
  const ids = Array.from({ length: 1 + Math.floor(r() * 12) }, (_, i) => `e${i}`);
  const comparte = () => ids.filter(() => r() < 0.8);
  return [estado(r, ids), estado(r, comparte()), estado(r, comparte())];
}
function canon(m: Record<string, ElementoSala>): string {
  return Object.keys(m).sort().map((k) => {
    const e = m[k];
    return `${e.id}|${e.tipo}|${e.actualizadoEn}|${e.porDispositivo}|${e.borrado ? 1 : 0}`;
  }).join(";");
}
const real: Fusion = (a, b) => fusionarEstados(a, b, MI);
function lapidaConservada(res: EstadoSala, ...estados: EstadoSala[]): boolean {
  for (const ganador of Object.values(res.elementos)) {
    const copias = estados.flatMap((e) => (e.elementos[ganador.id] ? [e.elementos[ganador.id]] : []));
    const gana = copias.some((lapida) => lapida.borrado && copias.every(
      (x) => x.borrado || x.actualizadoEn < lapida.actualizadoEn ||
        (x.actualizadoEn === lapida.actualizadoEn && x.porDispositivo === lapida.porDispositivo),
    ));
    if (gana && !ganador.borrado) return false;
  }
  return true;
}
function chequeos(f: Fusion, a: EstadoSala, b: EstadoSala, c: EstadoSala) {
  const ab = f(a, b), ba = f(b, a), abc = f(ab.resultado, c), abc2 = f(a, f(b, c).resultado);
  return [
    { nombre: "conmutativa", ok: canon(ab.resultado.elementos) === canon(ba.resultado.elementos) },
    { nombre: "idempotente", ok: canon(f(a, a).resultado.elementos) === canon(a.elementos) },
    { nombre: "asociativa", ok: canon(abc.resultado.elementos) === canon(abc2.resultado.elementos) },
    { nombre: "reloj-maximo", ok: ab.resultado.reloj === Math.max(a.reloj, b.reloj) },
    { nombre: "lapida-conservada", ok: lapidaConservada(ab.resultado, a, b) },
  ];
}
type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";
function fusionMutante(mutacion: Mutacion): Fusion {
  return (local, remoto) => {
    if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
    const elementos = { ...(local.elementos ?? {}) };
    const conflictos: string[] = [];
    for (const [id, entrante] of Object.entries(remoto.elementos ?? {})) {
      if (mutacion === "ignora-lapidas" && entrante.borrado) continue;
      const actual = elementos[id];
      if (!actual) { elementos[id] = entrante; continue; }
      const gana = (() => {
        if (entrante.actualizadoEn !== actual.actualizadoEn) {
          return mutacion === "gana-el-menor" ? entrante.actualizadoEn < actual.actualizadoEn : entrante.actualizadoEn > actual.actualizadoEn;
        }
        if (mutacion === "sin-desempate-por-dispositivo") return false;
        if (entrante.porDispositivo !== actual.porDispositivo) return entrante.porDispositivo < actual.porDispositivo;
        if (mutacion === "empate-sin-lapida") return false;
        return Boolean(entrante.borrado) && !actual.borrado;
      })();
      if (gana) elementos[id] = entrante;
    }
    const resultado = { salaId: local.salaId, elementos, reloj: Math.max(local.reloj ?? 0, remoto.reloj ?? 0) };
    if (excedeLimite(resultado)) conflictos.push("limite-excedido");
    return { resultado, conflictos: conflictos.sort() };
  };
}
describe("fuzzer con semilla", () => {
  it("cumple los oráculos en 300 casos por cada una de 5 semillas", () => {
    for (const semilla of SEMILLAS) for (let i = 0; i < CASOS; i += 1) {
      const [a, b, c] = caso(semilla, i);
      const rotos = chequeos(real, a, b, c).filter((x) => !x.ok).map((x) => x.nombre);
      expect(rotos, `semilla ${semilla}, caso ${i}`).toEqual([]);
    }
  });
  it("una salaId distinta nunca se fusiona", () => {
    const [a, b] = caso(1, 0);
    expect(fusionarEstados(a, { ...b, salaId: "sala-ajena" }, MI).conflictos).toContain("sala-distinta");
  });
  it("limite-excedido aparece si y solo si hay más de LIMITE_ELEMENTOS vivos", () => {
    const vivos = (n: number, prefijo = "v"): EstadoSala => {
      const elementos: Record<string, ElementoSala> = {};
      for (let i = 0; i < n; i += 1) elementos[`${prefijo}${i}`] = { id: `${prefijo}${i}`, tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "d-alfa" };
      return { salaId: "sala-fuzz", elementos, reloj: 1 };
    };
    expect(excedeLimite(vivos(LIMITE_ELEMENTOS))).toBe(false);
    expect(excedeLimite(vivos(LIMITE_ELEMENTOS + 1))).toBe(true);
    expect(fusionarEstados(vivos(LIMITE_ELEMENTOS - 1), vivos(1, "extra"), MI).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(vivos(LIMITE_ELEMENTOS - 1), vivos(2, "extra"), MI).conflictos).toContain("limite-excedido");
  });
  it("cada gemelo mutante hace fallar al menos un oráculo", () => {
    const mutaciones: Mutacion[] = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"];
    for (const mutacion of mutaciones) {
      const fallos = new Set<string>();
      for (const semilla of SEMILLAS) for (let i = 0; i < CASOS; i += 1) {
        const [a, b, c] = caso(semilla, i);
        for (const ch of chequeos(fusionMutante(mutacion), a, b, c)) if (!ch.ok) fallos.add(ch.nombre);
      }
      expect([...fallos], `mutante ${mutacion}`).not.toHaveLength(0);
    }
  });
});
