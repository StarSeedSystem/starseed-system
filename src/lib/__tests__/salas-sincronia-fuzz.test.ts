/** Fuzzer con semilla de la sincronía de salas (INF1025I · Ola 1025R): invariantes y gemelos mutantes. */
import { describe, expect, it } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
type Fusion = (a: EstadoSala, b: EstadoSala) => { resultado: EstadoSala; conflictos: string[] };
type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";
const OBS = "observador-x";
const DISPOSITIVOS = ["alfa", "beta", "gamma"];
const IDS = ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"];
const SEMILLAS = [1, 7, 42, 1025, 20261029];
const CASOS = 300;
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function estadoAleatorio(r: () => number, salaId = "sala-fuzz"): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  const cuantos = 1 + Math.floor(r() * 12);
  for (let i = 0; i < cuantos; i += 1) {
    const id = IDS[Math.floor(r() * IDS.length)];
    const d = Math.floor(r() * 3), t = Math.floor(r() * 7);
    elementos[id] = { id, tipo: "nota", datos: { v: t * 10 + d }, actualizadoEn: t, porDispositivo: DISPOSITIVOS[d], borrado: r() < 0.25 };
  }
  return { salaId, elementos, reloj: Math.floor(r() * 50) };
}
const canon = (e: Record<string, ElementoSala> = {}): string =>
  Object.keys(e).sort().map((id) => JSON.stringify([id, e[id]])).join("|");
const real: Fusion = (a, b) => fusionarEstados(a, b, OBS);
/** Una lápida que domina a todas las copias del mismo id debe sobrevivir. */
function conservaLapidas(a: EstadoSala, b: EstadoSala, res: EstadoSala): boolean {
  const copias = [...Object.values(a.elementos), ...Object.values(b.elementos)];
  return copias.every((lapida) => {
    if (!lapida.borrado) return true;
    const domina = copias.every((otra) => otra.id !== lapida.id || otra === lapida ||
      lapida.actualizadoEn > otra.actualizadoEn ||
      (lapida.actualizadoEn === otra.actualizadoEn && lapida.porDispositivo <= otra.porDispositivo));
    return !domina || Boolean(res.elementos[lapida.id]?.borrado);
  });
}
function oraculos(fusion: Fusion, a: EstadoSala, b: EstadoSala, c: EstadoSala): string[] {
  const fallos: string[] = [];
  const ab = fusion(a, b);
  if (canon(ab.resultado.elementos) !== canon(fusion(b, a).resultado.elementos)) fallos.push("conmutativa");
  if (canon(fusion(a, a).resultado.elementos) !== canon(a.elementos)) fallos.push("idempotente");
  if (canon(fusion(ab.resultado, c).resultado.elementos) !== canon(fusion(a, fusion(b, c).resultado).resultado.elementos)) fallos.push("asociativa");
  if (ab.resultado.reloj !== Math.max(a.reloj, b.reloj)) fallos.push("reloj-maximo");
  for (const id of new Set([...Object.keys(a.elementos), ...Object.keys(b.elementos)])) {
    const mayor = Math.max(a.elementos[id]?.actualizadoEn ?? -Infinity, b.elementos[id]?.actualizadoEn ?? -Infinity);
    if ((ab.resultado.elementos[id]?.actualizadoEn ?? -Infinity) !== mayor) { fallos.push("gana-marca-mayor"); break; }
  }
  if (!conservaLapidas(a, b, ab.resultado)) fallos.push("lapida-dominante");
  return fallos;
}
/** Copia local de la regla con un solo arreglo apagado (gemelo mutante). */
function fusionarMutante(mutacion: Mutacion): Fusion {
  const gana = (a: ElementoSala, b: ElementoSala): boolean => {
    if (a.actualizadoEn !== b.actualizadoEn) return mutacion === "gana-el-menor" ? a.actualizadoEn < b.actualizadoEn : a.actualizadoEn > b.actualizadoEn;
    if (mutacion !== "sin-desempate-por-dispositivo" && a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
    return mutacion === "empate-sin-lapida" ? false : Boolean(a.borrado) && !b.borrado;
  };
  return (local, remoto) => {
    if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
    const elementos: Record<string, ElementoSala> = { ...local.elementos };
    const conflictos: string[] = [];
    for (const [id, entrante] of Object.entries(remoto.elementos ?? {})) {
      if (mutacion === "ignora-lapidas" && entrante.borrado) continue;
      const actual = elementos[id];
      if (!actual) { elementos[id] = entrante; continue; }
      const distintas = actual.actualizadoEn !== entrante.actualizadoEn || actual.porDispositivo !== entrante.porDispositivo || Boolean(actual.borrado) !== Boolean(entrante.borrado);
      if (!distintas) continue;
      if (actual.porDispositivo !== entrante.porDispositivo) conflictos.push(id);
      if (gana(entrante, actual)) elementos[id] = entrante;
    }
    return { resultado: { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) }, conflictos: conflictos.sort() };
  };
}
function salaConVivos(vivos: number, prefijo = "v"): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0; i < vivos; i += 1) elementos[`${prefijo}${i}`] = { id: `${prefijo}${i}`, tipo: "nota", datos: {}, actualizadoEn: i, porDispositivo: "alfa", borrado: false };
  return { salaId: "sala-fuzz", elementos, reloj: vivos };
}
function recorre(fusion: Fusion, alFallar: (fallos: string[], semilla: number, caso: number) => void): void {
  for (const semilla of SEMILLAS) {
    const r = mulberry32(semilla);
    for (let i = 0; i < CASOS; i += 1) alFallar(oraculos(fusion, estadoAleatorio(r), estadoAleatorio(r), estadoAleatorio(r)), semilla, i);
  }
}
describe("sincronía de salas · fuzzer con semilla", () => {
  it("300 casos × 5 semillas cumplen todos los oráculos", () => {
    recorre(real, (fallos, semilla, caso) => expect(fallos, `semilla=${semilla} caso=${caso}`).toEqual([]));
  });
  it("cada gemelo mutante rompe al menos un oráculo", () => {
    const mutaciones: Mutacion[] = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"];
    for (const mutacion of mutaciones) {
      const rotos = new Set<string>();
      recorre(fusionarMutante(mutacion), (fallos) => fallos.forEach((fallo) => rotos.add(fallo)));
      expect([...rotos].sort(), `mutante=${mutacion}`).not.toEqual([]);
    }
  });
  it("una salaId distinta nunca fusiona", () => {
    const r = mulberry32(99);
    const a = estadoAleatorio(r, "sala-agora");
    const b = estadoAleatorio(r, "sala-taller");
    const { resultado, conflictos } = fusionarEstados(a, b, OBS);
    expect(conflictos).toContain("sala-distinta");
    expect(canon(resultado.elementos)).toBe(canon(a.elementos));
  });
  it("limite-excedido solo si hay más de LIMITE_ELEMENTOS vivos", () => {
    const lleno = salaConVivos(LIMITE_ELEMENTOS);
    expect(fusionarEstados(lleno, salaConVivos(0), OBS).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(lleno, salaConVivos(1, "extra"), OBS).conflictos).toContain("limite-excedido");
  });
});
