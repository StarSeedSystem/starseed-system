/** Fuzzer con semilla y gemelos mutantes de la sincronía de salas (Ola 1025R · INF1025I); PRNG propio, sin reloj. */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
type Mutacion = "ninguna" | "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";
const SEMILLAS = [11, 1025, 7, 4242, 90210] as const;
const CASOS = 300;
const DISPOSITIVOS = ["movil-ana", "portatil-bruno", "tablet-carla"];
const AJENO = "observadora"; // ajeno a todos: sin anti-eco, la fusión debe ser simétrica
const IDS = Array.from({ length: 12 }, (_, i) => `e${i}`);
/** mulberry32: determinista y propio; ni Math.random, ni Date.now, ni new Date(). */
function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Misma sala, 1..12 elementos con ids compartidos, marcas 0..3 (empates) y lápidas al azar. */
function estadoAleatorio(rnd: () => number): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0, cuantos = 1 + Math.floor(rnd() * 12); i < cuantos; i += 1) {
    const id = i === 0 ? "e0" : IDS[Math.floor(rnd() * IDS.length)];
    const porDispositivo = DISPOSITIVOS[Math.floor(rnd() * DISPOSITIVOS.length)];
    const actualizadoEn = Math.floor(rnd() * 4);
    const lapida = rnd() < 0.3 ? { borrado: true } : {};
    elementos[id] = { id, tipo: "nota", datos: { texto: id }, actualizadoEn, porDispositivo, ...lapida };
  }
  return { salaId: "sala-fuzz", elementos, reloj: Math.floor(rnd() * 5) };
}
/** Copia local de la regla con un arreglo apagado cada vez; el módulo real no se toca. */
function ganaMutante(a: ElementoSala, b: ElementoSala, mut: Mutacion): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) {
    return mut === "gana-el-menor" ? a.actualizadoEn < b.actualizadoEn : a.actualizadoEn > b.actualizadoEn;
  }
  if (mut === "sin-desempate-por-dispositivo") return false;
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return mut !== "empate-sin-lapida" && Boolean(a.borrado) && !b.borrado;
}
function fusionarMutante(local: EstadoSala, remoto: EstadoSala, mut: Mutacion): { resultado: EstadoSala; conflictos: string[] } {
  if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
  const elementos: Record<string, ElementoSala> = { ...local.elementos };
  for (const [id, entrante] of Object.entries(remoto.elementos)) {
    if (mut === "ignora-lapidas" && entrante.borrado) continue;
    const actual = elementos[id];
    if (!actual || ganaMutante(entrante, actual, mut)) elementos[id] = entrante;
  }
  return { resultado: { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) }, conflictos: [] };
}
function fusionar(a: EstadoSala, b: EstadoSala, mut: Mutacion) {
  return mut === "ninguna" ? fusionarEstados(a, b, AJENO) : fusionarMutante(a, b, mut);
}
/** Igualdad por valor e independiente del orden: dos versiones empatadas pueden ser objetos distintos. */
function mismos(a: Record<string, ElementoSala>, b: Record<string, ElementoSala>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
/** «Una lápida con marca ≥ a la de cualquier edición del mismo id se conserva». */
function oraculoLapidas(a: EstadoSala, b: EstadoSala, r: EstadoSala): string[] {
  const fallos: string[] = [];
  for (const id of new Set([...Object.keys(a.elementos), ...Object.keys(b.elementos)])) {
    const versiones = [a.elementos[id], b.elementos[id]].filter((v): v is ElementoSala => Boolean(v));
    const ediciones = versiones.filter((v) => !v.borrado);
    const tope = ediciones.reduce((m, e) => Math.max(m, e.actualizadoEn), Number.NEGATIVE_INFINITY);
    const ganaLapida = versiones.some((t) => Boolean(t.borrado) && t.actualizadoEn >= tope &&
      ediciones.every((e) => t.actualizadoEn > e.actualizadoEn || t.porDispositivo <= e.porDispositivo));
    if (ganaLapida && !r.elementos[id]?.borrado) fallos.push(`la lápida de ${id} no se conservó`);
  }
  return fallos;
}
/** Una batería entera; los fallos llevan semilla y caso, no un simple booleano. */
function bateria(mut: Mutacion): string[] {
  const fallos: string[] = [];
  for (const semilla of SEMILLAS) {
    const rnd = prng(semilla);
    for (let i = 0; i < CASOS; i += 1) {
      const a = estadoAleatorio(rnd);
      const b = estadoAleatorio(rnd);
      const c = estadoAleatorio(rnd);
      const donde = `semilla ${semilla}, caso ${i}`;
      const ab = fusionar(a, b, mut).resultado;
      const ba = fusionar(b, a, mut).resultado;
      if (!mismos(ab.elementos, ba.elementos)) fallos.push(`${donde}: no es conmutativa`);
      if (!mismos(fusionar(a, a, mut).resultado.elementos, a.elementos)) fallos.push(`${donde}: no es idempotente`);
      const izq = fusionar(ab, c, mut).resultado;
      const der = fusionar(a, fusionar(b, c, mut).resultado, mut).resultado;
      if (!mismos(izq.elementos, der.elementos)) fallos.push(`${donde}: no es asociativa`);
      if (ab.reloj !== Math.max(a.reloj, b.reloj)) fallos.push(`${donde}: el reloj no es el máximo`);
      fallos.push(...oraculoLapidas(a, b, ab).map((f) => `${donde}: ${f}`));
      const otra = fusionar(a, { ...b, salaId: "sala-otra" }, mut);
      if (!otra.conflictos.includes("sala-distinta") || !mismos(otra.resultado.elementos, a.elementos)) {
        fallos.push(`${donde}: fusionó dos salas distintas`);
      }
    }
  }
  return fallos;
}
const MUTACIONES: Mutacion[] = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"];
describe("salas-sincronia · fuzzer con semilla", () => {
  it("el código real pasa los oráculos en 5 semillas × 300 casos", () => {
    const fallos = bateria("ninguna");
    expect(fallos, fallos.slice(0, 5).join("\n")).toEqual([]);
  });
  it.each(MUTACIONES)("el gemelo mutante «%s» rompe al menos un oráculo", (mut: Mutacion) => {
    expect(bateria(mut).length).toBeGreaterThan(0);
  });
  it("avisa de 'limite-excedido' si y solo si pasa de LIMITE_ELEMENTOS vivos", () => {
    const llenar = (vivos: number): EstadoSala => {
      const elementos: Record<string, ElementoSala> = {};
      for (let i = 0; i < vivos; i += 1) elementos[`v${i}`] = { id: `v${i}`, tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "movil-ana" };
      return { salaId: "sala-limite", elementos, reloj: 1 };
    };
    const extra: EstadoSala = { salaId: "sala-limite", reloj: 1, elementos: { extra: { id: "extra", tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "portatil-bruno" } } };
    expect(fusionarEstados(llenar(LIMITE_ELEMENTOS - 1), extra, AJENO).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(llenar(LIMITE_ELEMENTOS), extra, AJENO).conflictos).toContain("limite-excedido");
  });
});
