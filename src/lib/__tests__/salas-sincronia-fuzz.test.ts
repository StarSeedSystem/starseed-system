/**
 * Fuzzer con semilla y gemelos mutantes · sincronía de salas (Ola 1025R · INF1025I).
 * Co-op Anything (MIT): fuzzing, oráculos de invariantes y «gemelos mutantes» (cada
 * arreglo apagado una vez: su oráculo debe fallar). PURO: sin red, disco ni reloj.
 */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
const DISPOSITIVOS = ["movil-ana", "portatil-bruno", "tablet-carla"] as const;
const SEMILLAS = [1, 7, 42, 2025, 1025]; const CASOS = 300; const MI = "observadora-externa"; const IDS = "abcdefghijkl".split("");
type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";
type Regla = (local: EstadoSala, remoto: EstadoSala, mi: string) => { resultado: EstadoSala; conflictos: string[] };

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = Math.imul(t ^ (t >>> 7), t | 61) + t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entero = (rnd: () => number, min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

/** EstadoSala aleatorio: misma sala, 1–12 elementos, ids compartidos, marcas 0–3 (empates). */
function estadoAleatorio(rnd: () => number): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let n = entero(rnd, 1, 12); n > 0; n -= 1) {
    const id = IDS[entero(rnd, 0, IDS.length - 1)];
    elementos[id] = { id, tipo: "nota", datos: { nota: id }, actualizadoEn: entero(rnd, 0, 3), porDispositivo: DISPOSITIVOS[entero(rnd, 0, 2)], borrado: rnd() < 0.3 || undefined };
  }
  return { salaId: "sala-fuzz", elementos, reloj: entero(rnd, 0, 5) };
}

/** Copia local de la regla real; `mutacion` apaga una parte concreta del arreglo. */
function gana(a: ElementoSala, b: ElementoSala, m?: Mutacion): boolean {
  if (m === "gana-el-menor" && a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn < b.actualizadoEn;
  if (m !== "gana-el-menor" && a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
  if (m !== "sin-desempate-por-dispositivo" && a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return m === "empate-sin-lapida" ? false : Boolean(a.borrado) && !b.borrado;
}

function reglaConMutacion(m?: Mutacion): Regla {
  return (local, remoto, mi) => {
    if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
    const elementos: Record<string, ElementoSala> = { ...local.elementos };
    const conflictos: string[] = [];
    for (const [id, e] of Object.entries(remoto.elementos)) {
      if ((m === "ignora-lapidas" && e.borrado) || e.porDispositivo === mi) continue;
      const actual = elementos[id];
      if (!actual) { elementos[id] = e; continue; }
      if (actual.actualizadoEn === e.actualizadoEn && actual.porDispositivo === e.porDispositivo &&
        Boolean(actual.borrado) === Boolean(e.borrado)) continue;
      if (actual.porDispositivo !== e.porDispositivo) conflictos.push(id);
      if (gana(e, actual, m)) elementos[id] = e;
    }
    const resultado: EstadoSala = { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) };
    if (Object.values(elementos).filter((x) => !x.borrado).length > LIMITE_ELEMENTOS) conflictos.push("limite-excedido");
    return { resultado, conflictos: conflictos.sort() };
  };
}

const canon = (x: Record<string, ElementoSala>) => JSON.stringify(Object.keys(x).sort().map((k) => x[k]));
function fallos(regla: Regla, a: EstadoSala, b: EstadoSala, c: EstadoSala): string[] {
  const f: string[] = [], ab = regla(a, b, MI).resultado;
  if (canon(ab.elementos) !== canon(regla(b, a, MI).resultado.elementos)) f.push("conmutativa");
  if (canon(regla(a, a, MI).resultado.elementos) !== canon(a.elementos)) f.push("idempotente");
  const izq = regla(regla(a, b, MI).resultado, c, MI).resultado;
  const der = regla(a, regla(b, c, MI).resultado, MI).resultado;
  if (canon(izq.elementos) !== canon(der.elementos)) f.push("asociativa");
  if (ab.reloj !== Math.max(a.reloj, b.reloj)) f.push("reloj-maximo");
  const lapidas = new Map<string, ElementoSala>(), ediciones = new Map<string, ElementoSala[]>();
  for (const e of [a, b]) for (const el of Object.values(e.elementos)) {
    if (!el.borrado) ediciones.set(el.id, [...(ediciones.get(el.id) ?? []), el]);
    else if (!lapidas.has(el.id)) lapidas.set(el.id, el);
  }
  for (const [id, l] of lapidas) {
    const ganaLapida = (ediciones.get(id) ?? []).every((e) => l.actualizadoEn > e.actualizadoEn ||
      (l.actualizadoEn === e.actualizadoEn && l.porDispositivo <= e.porDispositivo));
    if (ganaLapida && !ab.elementos[id]?.borrado) f.push(`lapida-${id}`);
  }
  const cruzada = regla(a, { ...b, salaId: "sala-otra" }, MI);
  if (!cruzada.conflictos.includes("sala-distinta")) f.push("sala-distinta-conflicto");
  if (canon(cruzada.resultado.elementos) !== canon(a.elementos)) f.push("sala-distinta-no-fusiona");
  return f;
}

function bateria(regla: Regla): { semilla: number; caso: number; fallos: string[] } | null {
  for (const semilla of SEMILLAS) {
    const rnd = mulberry32(semilla);
    for (let caso = 0; caso < CASOS; caso += 1) {
      const f = fallos(regla, estadoAleatorio(rnd), estadoAleatorio(rnd), estadoAleatorio(rnd));
      if (f.length > 0) return { semilla, caso, fallos: f };
    }
  }
  return null;
}

describe("salas · fuzzing con semilla y gemelos mutantes", () => {
  it("300 casos × 5 semillas pasan todos los oráculos", () => {
    const fallo = bateria(fusionarEstados);
    expect(fallo, fallo ? `semilla ${fallo.semilla}, caso ${fallo.caso}: ${fallo.fallos.join(", ")}` : "").toBeNull();
  });

  it("cada gemelo mutante es cazado por al menos un oráculo", () => {
    const mutantes: Mutacion[] = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"];
    for (const m of mutantes) {
      expect(bateria(reglaConMutacion(m)), `el mutante «${m}» sobrevivió a todos los oráculos`).not.toBeNull();
    }
  });

  it("el aviso de límite aparece si y solo si hay más de LIMITE_ELEMENTOS vivos", () => {
    const llenar = (total: number, desde = 0): EstadoSala => {
      const elementos: Record<string, ElementoSala> = {};
      for (let i = desde; i < total; i += 1) elementos[`v${i}`] = { id: `v${i}`, tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: DISPOSITIVOS[0] };
      return { salaId: "sala-fuzz", elementos, reloj: 1 };
    };
    expect(fusionarEstados(llenar(LIMITE_ELEMENTOS), llenar(0), MI).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(llenar(LIMITE_ELEMENTOS), llenar(LIMITE_ELEMENTOS + 1, LIMITE_ELEMENTOS), MI).conflictos).toContain("limite-excedido");
  });
});
