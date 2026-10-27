import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, excedeLimite, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(rng, salaId, baseT) {
  const devs = ["a", "b", "c"];
  const n = 1 + Math.floor(rng() * 12);
  const els = {};
  for (let i = 0; i < n; i += 1) {
    const id = `e${i}`, d = devs[Math.floor(rng() * 3)];
    els[id] = { id, tipo: "nota", datos: {}, actualizadoEn: baseT + Math.floor(rng() * 5), porDispositivo: d, ...(rng() < 0.15 ? { borrado: true } : {}) };
  }
  return { salaId, elementos: els, reloj: baseT + Math.floor(rng() * 3) };
}

function eq(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return false;
  return ka.every(k => a[k].actualizadoEn === b[k].actualizadoEn && a[k].porDispositivo === b[k].porDispositivo && a[k].borrado === b[k].borrado);
}

const SEMILLAS = [0x9e3779b9, 0x12345678, 0xabcdef00, 0xdeadbeef, 0xcafebabe];
const MI = "observer";

function run(seed) {
  const rng = mulberry32(seed), baseT = 1_000_000;
  for (let c = 0; c < 300; c += 1) {
    const a = gen(rng, "s", baseT), b = gen(rng, "s", baseT), c3 = gen(rng, "s", baseT);
    const ab = fusionarEstados(a, b, MI), ba = fusionarEstados(b, a, MI);
    if (!eq(ab.resultado.elementos, ba.resultado.elementos)) throw new Error(`s:${seed} c:${c} no conmutativa`);
    const aa = fusionarEstados(a, a, MI);
    if (!eq(aa.resultado.elementos, a.elementos)) throw new Error(`s:${seed} c:${c} no idempotente`);
    const abc = fusionarEstados(fusionarEstados(a, b, MI).resultado, c3, MI).resultado;
    const acb = fusionarEstados(fusionarEstados(a, c3, MI).resultado, b, MI).resultado;
    if (!eq(abc.elementos, acb.elementos)) throw new Error(`s:${seed} c:${c} no asociativa`);
    if (ab.resultado.reloj !== Math.max(a.reloj, b.reloj)) throw new Error(`s:${seed} c:${c} reloj`);
    const { conflictos } = fusionarEstados(a, gen(rng, "otro", baseT), MI);
    if (!conflictos.includes("sala-distinta")) throw new Error(`s:${seed} c:${c} sala-distinta`);
    const local = { salaId: "s", elementos: { x: { id: "x", tipo: "nota", datos: {}, actualizadoEn: baseT, porDispositivo: "a", borrado: true } }, reloj: baseT };
    const remoto = { salaId: "s", elementos: { x: { id: "x", tipo: "nota", datos: {}, actualizadoEn: baseT - 1, porDispositivo: "b" } }, reloj: baseT };
    if (!fusionarEstados(local, remoto, MI).resultado.elementos.x.borrado) throw new Error(`s:${seed} c:${c} lápida`);
  }
}

function mutant(l, r, mio, mut) {
  if (l.salaId !== r.salaId) return { resultado: l, conflictos: ["sala-distinta"] };
  const els = { ...l.elementos ?? {} }, conf = [];
  for (const [id, e] of Object.entries(r.elementos ?? {})) {
    if (e.porDispositivo === mio) continue;
    const a = els[id];
    if (!a) { els[id] = e; continue; }
    if (a.actualizadoEn === e.actualizadoEn && a.porDispositivo === e.porDispositivo && a.borrado === e.borrado) continue;
    if (a.porDispositivo !== e.porDispositivo) conf.push(id);
    let gana = false;
    if (mut === "gana-el-menor") gana = e.actualizadoEn < a.actualizadoEn || (e.actualizadoEn === a.actualizadoEn && e.porDispositivo > a.porDispositivo);
    else if (mut === "empate-sin-lapida") gana = e.actualizadoEn > a.actualizadoEn || (e.actualizadoEn === a.actualizadoEn && e.porDispositivo < a.porDispositivo);
    else if (mut === "ignora-lapidas") { gana = e.actualizadoEn > a.actualizadoEn || (e.actualizadoEn === a.actualizadoEn && e.porDispositivo < a.porDispositivo); if (gana && e.borrado) gana = false; }
    else gana = e.actualizadoEn > a.actualizadoEn || (e.actualizadoEn === a.actualizadoEn && e.borrado && !a.borrado);
    if (gana) els[id] = e;
  }
  const res = { salaId: l.salaId, elementos: els, reloj: Math.max(l.reloj ?? 0, r.reloj ?? 0) };
  if (excedeLimite(res)) conf.push("limite-excedido");
  return { resultado: res, conflictos: conf.sort() };
}

describe("fuzz semilla", () => {
  for (const s of SEMILLAS) it(`semilla ${s}`, () => run(s));
  it("limite", () => {
    const base = 2_000_000, vivos = LIMITE_ELEMENTOS + 1, els = {};
    for (let i = 0; i < vivos; i += 1) els[`v${i}`] = { id: `v${i}`, tipo: "nota", datos: {}, actualizadoEn: base + i, porDispositivo: "x" };
    const g = { salaId: "s", elementos: els, reloj: base };
    expect(excedeLimite(g)).toBe(true);
    const { conflictos } = fusionarEstados({ salaId: "s", elementos: {}, reloj: base }, g, MI);
    expect(conflictos).toContain("limite-excedido");
  });
});

describe("gemelos mutantes", () => {
  for (const m of ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"]) {
    it(`mut ${m} rompe`, () => {
      const rng = mulberry32(SEMILLAS[0]), baseT = 1_000_000;
      let roto = false;
      for (let c = 0; c < 300 && !roto; c += 1) {
        const a = gen(rng, "s", baseT), b = gen(rng, "s", baseT);
        const ab = mutant(a, b, MI, m), ba = mutant(b, a, MI, m);
        if (!eq(ab.resultado.elementos, ba.resultado.elementos)) { roto = true; break; }
        const aa = mutant(a, a, MI, m);
        if (!eq(aa.resultado.elementos, a.elementos)) { roto = true; break; }
        const c3 = gen(rng, "s", baseT);
        const abc = mutant(mutant(a, b, MI, m).resultado, c3, MI, m).resultado;
        const acb = mutant(mutant(a, c3, MI, m).resultado, b, MI, m).resultado;
        if (!eq(abc.elementos, acb.elementos)) { roto = true; break; }
        if (ab.resultado.reloj !== Math.max(a.reloj, b.reloj)) { roto = true; break; }
        const { conflictos } = mutant(a, gen(rng, "otro", baseT), MI, m);
        if (!conflictos.includes("sala-distinta")) { roto = true; break; }
      }
      expect(roto).toBe(true);
    });
  }
});