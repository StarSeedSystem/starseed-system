/** Fuzzer con semilla (INF1025I): oráculos de sincronía y gemelos mutantes; sin reloj real. */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, excedeLimite, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

const DISPOSITIVOS = ["alfa", "bravo", "charlie"] as const;
const MI = "observador-ajeno"; // ajeno a los estados: así la fusión es simétrica
const SEMILLAS = [0x1025, 7, 42, 2026, 99991], CASOS = 300;
type Resultado = { resultado: EstadoSala; conflictos: string[] };
type Fusion = (a: EstadoSala, b: EstadoSala) => Resultado;

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function generarSala(rnd: () => number, salaId = "sala-fuzz"): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 1 + Math.floor(rnd() * 12); i > 0; i -= 1) {
    const id = `w${Math.floor(rnd() * 12)}`; // ids compartidos entre salas
    elementos[id] = { id, tipo: "nota", datos: {}, actualizadoEn: Math.floor(rnd() * 4),
      porDispositivo: DISPOSITIVOS[Math.floor(rnd() * 3)], ...(rnd() < 0.3 ? { borrado: true } : {}) };
  }
  return { salaId, elementos, reloj: Math.floor(rnd() * 5) };
}
function canon(m: Record<string, ElementoSala>): string {
  return Object.keys(m).sort().map((id) => {
    const e = m[id];
    return [e.id, e.actualizadoEn, e.porDispositivo, Boolean(e.borrado)].join("|");
  }).join(";");
}
function orden(a: ElementoSala, b: ElementoSala): number {
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo ? -1 : 1;
  return Boolean(a.borrado) === Boolean(b.borrado) ? 0 : a.borrado ? -1 : 1;
}
function oraculoLapida(a: EstadoSala, b: EstadoSala, res: EstadoSala): string | null {
  for (const id of new Set([...Object.keys(a.elementos), ...Object.keys(b.elementos)])) {
    const versiones = [a.elementos[id], b.elementos[id]].filter((e): e is ElementoSala => Boolean(e));
    const marca = Math.max(...versiones.filter((e) => e.borrado).map((e) => e.actualizadoEn), -Infinity);
    if (marca === -Infinity || versiones.some((e) => !e.borrado && e.actualizadoEn > marca)) continue;
    const ganadora = versiones.filter((e) => e.actualizadoEn === marca).sort(orden)[0];
    if (ganadora.borrado && !res.elementos[id]?.borrado) return id;
  }
  return null;
}
function oraculos(a: EstadoSala, b: EstadoSala, c: EstadoSala, f: Fusion): string[] {
  const ab = f(a, b), ba = f(b, a), fallos: string[] = [];
  if (canon(ab.resultado.elementos) !== canon(ba.resultado.elementos)) fallos.push("conmutativa");
  if (canon(f(a, a).resultado.elementos) !== canon(a.elementos)) fallos.push("idempotente");
  if (canon(f(f(a, b).resultado, c).resultado.elementos) !== canon(f(a, f(b, c).resultado).resultado.elementos)) fallos.push("asociativa");
  if (ab.resultado.reloj !== Math.max(a.reloj, b.reloj)) fallos.push("reloj-maximo");
  const lapida = oraculoLapida(a, b, ab.resultado);
  if (lapida) fallos.push(`lapida:${lapida}`);
  return fallos;
}
const ganaReal = (a: ElementoSala, b: ElementoSala): boolean => a.actualizadoEn !== b.actualizadoEn ? a.actualizadoEn > b.actualizadoEn : a.porDispositivo !== b.porDispositivo ? a.porDispositivo < b.porDispositivo : Boolean(a.borrado) && !b.borrado;
const ganaMenor = (a: ElementoSala, b: ElementoSala): boolean => a.actualizadoEn !== b.actualizadoEn ? a.actualizadoEn < b.actualizadoEn : a.porDispositivo !== b.porDispositivo ? a.porDispositivo < b.porDispositivo : Boolean(a.borrado) && !b.borrado;
const sinLapida = (a: ElementoSala, b: ElementoSala): boolean => a.actualizadoEn !== b.actualizadoEn ? a.actualizadoEn > b.actualizadoEn : a.porDispositivo !== b.porDispositivo ? a.porDispositivo < b.porDispositivo : false;
const sinDispositivo = (a: ElementoSala, b: ElementoSala): boolean => a.actualizadoEn !== b.actualizadoEn ? a.actualizadoEn > b.actualizadoEn : Boolean(a.borrado) && !b.borrado;
const ignoraLapidas = ganaReal; // su loop descarta toda lápida entrante
function fusionarCon(local: EstadoSala, remoto: EstadoSala, gana: (a: ElementoSala, b: ElementoSala) => boolean): Resultado {
  if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
  const elementos = { ...local.elementos }, conflictos: string[] = [];
  for (const [id, entrante] of Object.entries(remoto.elementos)) {
    if (entrante.porDispositivo === MI || (gana === ignoraLapidas && entrante.borrado)) continue;
    const actual = elementos[id];
    if (!actual) { elementos[id] = entrante; continue; }
    const distintas = actual.actualizadoEn !== entrante.actualizadoEn ||
      actual.porDispositivo !== entrante.porDispositivo || Boolean(actual.borrado) !== Boolean(entrante.borrado);
    if (distintas && actual.porDispositivo !== entrante.porDispositivo) conflictos.push(id);
    if (distintas && gana(entrante, actual)) elementos[id] = entrante;
  }
  const resultado: EstadoSala = { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) };
  if (excedeLimite(resultado)) conflictos.push("limite-excedido");
  return { resultado, conflictos: conflictos.sort() };
}
const MUTANTES = [["gana-el-menor", ganaMenor], ["empate-sin-lapida", sinLapida], ["ignora-lapidas", ignoraLapidas], ["sin-desempate-por-dispositivo", sinDispositivo]] as const;
function bateria(semilla: number, f: Fusion): string[] {
  const rnd = mulberry32(semilla);
  for (let caso = 0; caso < CASOS; caso += 1) {
    const fallos = oraculos(generarSala(rnd), generarSala(rnd), generarSala(rnd), f);
    if (fallos.length) return [`semilla=${semilla}`, `caso=${caso}`, ...fallos];
  }
  return [];
}
describe("fuzz con semilla", () => {
  it("5 semillas × 300 casos pasan los oráculos", () => {
    for (const semilla of SEMILLAS) {
      const fallos = bateria(semilla, (a, b) => fusionarEstados(a, b, MI));
      if (fallos.length) throw new Error(fallos.join(" · "));
    }
  });
});

describe("gemelos mutantes: los oráculos muerden", () => {
  for (const [nombre, gana] of MUTANTES) {
    it(`${nombre} rompe al menos un oráculo`, () => {
      const mordido = SEMILLAS.some((semilla) => bateria(semilla, (a, b) => fusionarCon(a, b, gana)).length > 0);
      expect(mordido, `la mutación ${nombre} no fue detectada`).toBe(true);
    });
  }
});

describe("casos que no se repiten en la batería", () => {
  it("una salaId distinta nunca fusiona", () => {
    const { conflictos } = fusionarEstados(generarSala(mulberry32(1), "sala-a"), generarSala(mulberry32(2), "sala-b"), MI);
    expect(conflictos).toContain("sala-distinta");
  });
  it("limite-excedido si y sólo si hay más de LIMITE_ELEMENTOS vivos", () => {
    const vivos = (n: number, p = "v"): EstadoSala => ({ salaId: "sala-limite", reloj: 0,
      elementos: Object.fromEntries(Array.from({ length: n }, (_, i) => [`${p}${i}`, { id: `${p}${i}`, tipo: "nota", datos: {}, actualizadoEn: 0, porDispositivo: "alfa" }])) });
    expect(fusionarEstados(vivos(LIMITE_ELEMENTOS), vivos(0, "x"), MI).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(vivos(LIMITE_ELEMENTOS), vivos(1, "extra"), MI).conflictos).toContain("limite-excedido");
    expect(excedeLimite(vivos(LIMITE_ELEMENTOS + 1))).toBe(true);
  });
});
