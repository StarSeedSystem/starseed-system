/** Fuzzer con semilla y gemelos mutantes de la fusión de salas (Ola 1025R). */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, excedeLimite, fusionarEstados,
  type ElementoSala as V, type EstadoSala } from "../salas/sincronia-sala";

const SEMILLAS = [11, 47, 1025, 2026, 7] as const, CASOS = 300, SALA = "sala-fuzz";
const MI = "observador-externo", DISPOSITIVOS = ["disp-a", "disp-b", "disp-c"] as const;
function mulberry32(s: number): () => number {
  let a = s >>> 0, t = 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function elemento(id: string, t: number, d: string, borrado: boolean): V {
  return { id, tipo: "nota", datos: { texto: `${id}:${t}:${d}:${borrado}` }, actualizadoEn: t, porDispositivo: d,
    ...(borrado ? { borrado: true } : {}) };
}

function familia(id: string, rnd: () => number): V[] {
  const maxT = Math.floor(rnd() * 4), dev = DISPOSITIVOS[Math.floor(rnd() * 3)];
  const otro = DISPOSITIVOS[(DISPOSITIVOS.indexOf(dev) + 1 + Math.floor(rnd() * 2)) % 3];
  const clase = Math.floor(rnd() * 3);
  if (clase === 0) return [elemento(id, maxT, dev, true), elemento(id, maxT, dev, false)];
  if (clase === 2) return [elemento(id, maxT, dev, false), elemento(id, maxT, otro, false)];
  const v = [elemento(id, maxT, dev, true)];
  if (maxT > 0) v.push(elemento(id, Math.floor(rnd() * maxT), otro, rnd() < 0.5));
  return v;
}

function generarTrio(rnd: () => number): [EstadoSala, EstadoSala, EstadoSala] {
  const familias = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => familia(`e${i}`, rnd));
  const elegir = (): EstadoSala => ({ salaId: SALA, reloj: Math.floor(rnd() * 10),
    elementos: Object.fromEntries(familias.map((v, i) => [`e${i}`, v[Math.floor(rnd() * v.length)]] as [string, V])) });
  return [elegir(), elegir(), elegir()];
}

type Motor = (a: EstadoSala, b: EstadoSala) => { resultado: EstadoSala; conflictos: string[] };
const fusionar: Motor = (a, b) => fusionarEstados(a, b, MI);

function mismosElementos(x: EstadoSala, y: EstadoSala): boolean {
  const kx = Object.keys(x.elementos).sort(), ky = Object.keys(y.elementos).sort();
  return kx.length === ky.length && kx.every((k, i) =>
    k === ky[i] && JSON.stringify(x.elementos[k]) === JSON.stringify(y.elementos[k]));
}

function fusionMutante(mut: string): Motor {
  const gana = (x: V, y: V): boolean => {
    if (x.actualizadoEn !== y.actualizadoEn) return mut === "gana-el-menor"
      ? x.actualizadoEn < y.actualizadoEn : x.actualizadoEn > y.actualizadoEn;
    if (mut !== "sin-desempate-por-dispositivo" && x.porDispositivo !== y.porDispositivo) return x.porDispositivo < y.porDispositivo;
    return mut === "empate-sin-lapida" ? false : Boolean(x.borrado) && !y.borrado;
  };
  return (a, b) => {
    const elementos: Record<string, V> = { ...a.elementos };
    for (const [id, e] of Object.entries(b.elementos)) {
      if (mut === "ignora-lapidas" && e.borrado) continue;
      if (!elementos[id] || gana(e, elementos[id])) elementos[id] = e;
    }
    return { resultado: { salaId: a.salaId, elementos, reloj: Math.max(a.reloj, b.reloj) }, conflictos: [] };
  };
}

function oraculos(motor: Motor, a: EstadoSala, b: EstadoSala, c: EstadoSala): string[] {
  const fallos: string[] = [], ab = motor(a, b).resultado, ba = motor(b, a).resultado;
  if (!mismosElementos(ab, ba)) fallos.push("conmutativa");
  if (!mismosElementos(motor(a, a).resultado, a)) fallos.push("idempotente");
  if (!mismosElementos(motor(ab, c).resultado, motor(a, motor(b, c).resultado).resultado)) fallos.push("asociativa");
  if (ab.reloj !== Math.max(a.reloj, b.reloj)) fallos.push("reloj-maximo");
  const todos = [...Object.values(a.elementos), ...Object.values(b.elementos)];
  for (const id of new Set(todos.map((e) => e.id))) {
    const vs = todos.filter((e) => e.id === id), ed = vs.filter((e) => !e.borrado).map((e) => e.actualizadoEn);
    if (vs.some((e) => e.borrado && e.actualizadoEn >= (ed.length ? Math.max(...ed) : -1)) &&
      !ab.elementos[id]?.borrado) { fallos.push(`lapida-${id}`); break; }
  }
  return fallos;
}

function bateria(motor: Motor, semilla: number): string[] {
  const rnd = mulberry32(semilla);
  for (let i = 0; i < CASOS; i += 1) {
    const [a, b, c] = generarTrio(rnd), fallos = oraculos(motor, a, b, c);
    if (fallos.length) return [`semilla ${semilla}, caso ${i}: ${fallos.join(", ")}`];
  }
  return [];
}

describe("fuzzer con semilla", () => {
  for (const s of SEMILLAS) it(`semilla ${s}: ${CASOS} casos`, () => expect(bateria(fusionar, s)).toEqual([]));
});

describe("gemelos mutantes", () => {
  for (const mut of ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"]) {
    it(`algún oráculo muerde ${mut}`, () => {
      const fallos = SEMILLAS.flatMap((s) => bateria(fusionMutante(mut), s));
      expect(fallos.length, `ningún oráculo detectó ${mut}`).toBeGreaterThan(0);
    });
  }
});

it("una salaId distinta nunca se fusiona", () => {
  const [a] = generarTrio(mulberry32(99)), b = { ...a, salaId: "sala-otra" };
  expect(fusionarEstados(a, b, MI).conflictos).toContain("sala-distinta");
  expect(fusionarEstados(a, b, MI).resultado.elementos).toEqual(a.elementos);
});

it("limite-excedido aparece solo al pasar el techo", () => {
  const salaDe = (n: number): EstadoSala => {
    const elementos: Record<string, V> = {};
    for (let i = 0; i < n; i += 1) elementos[`v${i}`] = elemento(`v${i}`, 0, "disp-a", false);
    return { salaId: SALA, elementos, reloj: 0 };
  };
  const llena = salaDe(LIMITE_ELEMENTOS), unaMas = salaDe(LIMITE_ELEMENTOS + 1);
  expect([excedeLimite(llena), excedeLimite(unaMas)]).toEqual([false, true]);
  expect(fusionarEstados(llena, llena, MI).conflictos).not.toContain("limite-excedido");
  expect(fusionarEstados(llena, unaMas, MI).conflictos).toContain("limite-excedido");
});
