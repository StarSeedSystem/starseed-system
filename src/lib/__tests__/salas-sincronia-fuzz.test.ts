/** Fuzzer con semilla y gemelos mutantes para la sincronía de salas (Ola 1025R · INF1025I).
 * Método de Co-op Anything: casos reproducibles + oráculos de invariantes y un mutante por
 * arreglo. PRNG propio: sin Math.random, Date.now ni new Date(); el reloj entra por los estados. */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

const CASOS = 300, SEMILLAS = [1, 7, 42, 1025, 20261027];
const DISPOSITIVOS = ["d-0", "d-1", "d-2"] as const;
const MI = "observador-externo"; // ajeno a los estados: la fusión queda simétrica
const SALA = "sala-fuzz";

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entero = (rnd: () => number, n: number): number => Math.floor(rnd() * n);

function elemento(id: string, porDispositivo: string, actualizadoEn: number, borrado: boolean): ElementoSala {
  const datos = { firma: `${id}|${porDispositivo}|${actualizadoEn}|${borrado ? 1 : 0}` };
  return { id, tipo: "nota", datos, actualizadoEn, porDispositivo, ...(borrado ? { borrado: true } : {}) };
}

function estadoAleatorio(rnd: () => number): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0, n = 1 + entero(rnd, 12); i < n; i += 1) {
    const id = `e${entero(rnd, 8)}`, dispositivo = DISPOSITIVOS[entero(rnd, 3)]!, marca = entero(rnd, 4);
    elementos[id] = elemento(id, dispositivo, marca, rnd() < 0.3);
  }
  return { salaId: SALA, elementos, reloj: entero(rnd, 10) };
}

type Resultado = { resultado: EstadoSala; conflictos: string[] };
type Fusion = (a: EstadoSala, b: EstadoSala, mi: string) => Resultado;
type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";

const firma = (m: Record<string, ElementoSala>): string => JSON.stringify(Object.keys(m).sort().map((k) => m[k]));
const mismosMapas = (x: Record<string, ElementoSala>, y: Record<string, ElementoSala>): boolean => firma(x) === firma(y);
const supera = (ed: ElementoSala, l: ElementoSala): boolean =>
  ed.actualizadoEn !== l.actualizadoEn ? ed.actualizadoEn > l.actualizadoEn : ed.porDispositivo < l.porDispositivo;

function lapidaPerdida(estados: EstadoSala[], resultado: EstadoSala): boolean {
  const ids = new Set(estados.flatMap((e) => Object.keys(e.elementos)));
  for (const id of ids) {
    const vs = estados.flatMap((e) => (e.elementos[id] ? [e.elementos[id]!] : []));
    const lapidas = vs.filter((v) => v.borrado), ediciones = vs.filter((v) => !v.borrado);
    if (lapidas.some((l) => ediciones.every((ed) => !supera(ed, l))) && !resultado.elementos[id]?.borrado) return true;
  }
  return false;
}

function revisar(fusionar: Fusion, a: EstadoSala, b: EstadoSala, c: EstadoSala): string[] {
  const fallos: string[] = [], ab = fusionar(a, b, MI), ba = fusionar(b, a, MI), aa = fusionar(a, a, MI);
  if (!mismosMapas(ab.resultado.elementos, ba.resultado.elementos)) fallos.push("conmutativa");
  if (!mismosMapas(aa.resultado.elementos, a.elementos)) fallos.push("idempotente");
  const izq = fusionar(fusionar(a, b, MI).resultado, c, MI).resultado, der = fusionar(a, fusionar(b, c, MI).resultado, MI).resultado;
  if (!mismosMapas(izq.elementos, der.elementos)) fallos.push("asociativa");
  if (ab.resultado.reloj !== Math.max(a.reloj, b.reloj)) fallos.push("reloj-maximo");
  if (lapidaPerdida([a, b], ab.resultado)) fallos.push("lapida-perdida");
  if (!fusionar(a, { ...a, salaId: `${a.salaId}-otra` }, MI).conflictos.includes("sala-distinta")) fallos.push("sala-distinta");
  return fallos;
}

function ganaMutante(a: ElementoSala, b: ElementoSala, m: Mutacion): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) return m === "gana-el-menor" ? a.actualizadoEn < b.actualizadoEn : a.actualizadoEn > b.actualizadoEn;
  if (m === "sin-desempate-por-dispositivo") return false;
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return m === "empate-sin-lapida" ? false : Boolean(a.borrado) && !b.borrado;
}

function mutante(local: EstadoSala, remoto: EstadoSala, mi: string, m: Mutacion): Resultado {
  if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
  const elementos: Record<string, ElementoSala> = { ...local.elementos };
  for (const [id, entrante] of Object.entries(remoto.elementos)) {
    if (entrante.porDispositivo === mi || (m === "ignora-lapidas" && entrante.borrado)) continue;
    if (!elementos[id] || ganaMutante(entrante, elementos[id]!, m)) elementos[id] = entrante;
  }
  return { resultado: { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) }, conflictos: [] };
}

describe("fuzz con semilla · sincronía de salas", () => {
  const grande = (vivos: number): EstadoSala => ({ salaId: SALA, reloj: 1, elementos: Object.fromEntries(
    Array.from({ length: vivos }, (_, i) => [`v${i}`, elemento(`v${i}`, DISPOSITIVOS[0]!, 1, false)])) });

  it("la regla real cumple los oráculos en 300 casos × 5 semillas", () => {
    for (const semilla of SEMILLAS) {
      const rnd = mulberry32(semilla);
      for (let caso = 0; caso < CASOS; caso += 1) {
        const fallos = revisar(fusionarEstados, estadoAleatorio(rnd), estadoAleatorio(rnd), estadoAleatorio(rnd));
        expect(fallos, `semilla ${semilla}, caso ${caso}: ${fallos.join(", ")}`).toEqual([]);
      }
    }
  });

  it("cada gemelo mutante hace fallar al menos un oráculo", () => {
    const mutaciones: Mutacion[] = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"];
    for (const m of mutaciones) {
      let rotos = 0;
      for (const semilla of SEMILLAS) {
        const rnd = mulberry32(semilla);
        for (let caso = 0; caso < CASOS; caso += 1) {
          if (revisar((x, y, d) => mutante(x, y, d, m), estadoAleatorio(rnd), estadoAleatorio(rnd), estadoAleatorio(rnd)).length) rotos += 1;
        }
      }
      expect(rotos, `el mutante «${m}» superó toda la batería: los oráculos no muerden`).toBeGreaterThan(0);
    }
  });

  it("«limite-excedido» aparece si y solo si hay más de LIMITE_ELEMENTOS vivos", () => {
    expect(fusionarEstados(grande(LIMITE_ELEMENTOS), grande(LIMITE_ELEMENTOS), MI).conflictos).not.toContain("limite-excedido");
    const pasado = fusionarEstados(grande(LIMITE_ELEMENTOS), grande(LIMITE_ELEMENTOS + 1), MI);
    expect(pasado.conflictos).toContain("limite-excedido");
    expect(Object.keys(pasado.resultado.elementos)).toHaveLength(LIMITE_ELEMENTOS + 1);
  });
});
