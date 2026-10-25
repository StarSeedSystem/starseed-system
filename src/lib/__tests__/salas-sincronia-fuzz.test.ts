/** Fuzzing con semilla y gemelos mutantes de la fusión de salas (INF1025I); PRNG propio, sin reloj. */
import { describe, expect, it } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
const SEMILLAS = [11, 29, 73, 101, 997], CASOS = 300, MI = "tablet-observadora";
const DISPOSITIVOS = ["alfa-movil", "beta-portatil", "gamma-tablet"];
const MUTACIONES = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"] as const;
type Mutacion = (typeof MUTACIONES)[number]; type Fusion = (a: EstadoSala, b: EstadoSala, mi: string) => { resultado: EstadoSala; conflictos: string[] };
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function generarCaso(rng: () => number): [EstadoSala, EstadoSala, EstadoSala] {
  const ids = Array.from({ length: 1 + Math.floor(rng() * 12) }, (_, i) => `e${i}`);
  const crear = (): EstadoSala => {
    const elementos: Record<string, ElementoSala> = {};
    ids.forEach((id, i) => {
      if (i > 0 && rng() < 0.35) return;
      const actualizadoEn = Math.floor(rng() * 3), porDispositivo = DISPOSITIVOS[Math.floor(rng() * 3)];
      const borrado = rng() < 0.3 ? true : undefined;
      elementos[id] = { id, tipo: "nota", datos: { marca: `${actualizadoEn}|${porDispositivo}|${borrado ? 1 : 0}` }, actualizadoEn, porDispositivo, borrado };
    });
    return { salaId: "sala-fuzz", elementos, reloj: Math.floor(rng() * 5) };
  };
  return [crear(), crear(), crear()];
}
function gana(a: ElementoSala, b: ElementoSala): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return Boolean(a.borrado) && !b.borrado;
}
function mismoMapa(a: Record<string, ElementoSala>, b: Record<string, ElementoSala>): boolean {
  const orden = (m: Record<string, ElementoSala>) =>
    JSON.stringify(Object.entries(m).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  return orden(a) === orden(b);
}
function lapidaPerdida(a: EstadoSala, b: EstadoSala, fusion: EstadoSala): boolean {
  for (const id of new Set([...Object.keys(a.elementos), ...Object.keys(b.elementos)])) {
    const versiones = [a.elementos[id], b.elementos[id]].filter((e): e is ElementoSala => Boolean(e));
    const ediciones = versiones.filter((e) => !e.borrado);
    if (!ediciones.length) continue;
    for (const lapida of versiones.filter((e) => e.borrado)) {
      if (ediciones.every((e) => gana(lapida, e)) && !fusion.elementos[id]?.borrado) return true;
    }
  }
  return false;
}
function revisar(fusion: Fusion, a: EstadoSala, b: EstadoSala, c: EstadoSala): string[] {
  const fallos: string[] = [];
  const ab = fusion(a, b, MI).resultado;
  if (!mismoMapa(ab.elementos, fusion(b, a, MI).resultado.elementos)) fallos.push("conmutativa");
  if (!mismoMapa(fusion(a, a, MI).resultado.elementos, a.elementos)) fallos.push("idempotente");
  const izq = fusion(fusion(a, b, MI).resultado, c, MI).resultado, der = fusion(a, fusion(b, c, MI).resultado, MI).resultado;
  if (!mismoMapa(izq.elementos, der.elementos)) fallos.push("asociativa");
  if (ab.reloj !== Math.max(a.reloj, b.reloj)) fallos.push("reloj-maximo");
  if (lapidaPerdida(a, b, ab)) fallos.push("lapida");
  return fallos;
}
function bateria(semilla: number, fusion: Fusion): string[] {
  const rng = mulberry32(semilla), fallos: string[] = [];
  for (let i = 0; i < CASOS; i += 1) {
    const [a, b, c] = generarCaso(rng);
    const problemas = revisar(fusion, a, b, c);
    if (problemas.length) fallos.push(`semilla ${semilla} · caso ${i}: ${problemas.join(", ")}`);
  }
  return fallos;
}
function ganaMutante(a: ElementoSala, b: ElementoSala, mutacion: Mutacion): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) return mutacion === "gana-el-menor" ? a.actualizadoEn < b.actualizadoEn : a.actualizadoEn > b.actualizadoEn;
  if (mutacion !== "sin-desempate-por-dispositivo" && a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return mutacion === "empate-sin-lapida" ? false : Boolean(a.borrado) && !b.borrado;
}
function fusionarMutante(a: EstadoSala, b: EstadoSala, mi: string, mutacion: Mutacion): { resultado: EstadoSala; conflictos: string[] } {
  if (a.salaId !== b.salaId) return { resultado: a, conflictos: ["sala-distinta"] };
  const elementos = { ...a.elementos };
  for (const [id, entrante] of Object.entries(b.elementos)) {
    if (entrante.porDispositivo === mi || (mutacion === "ignora-lapidas" && entrante.borrado)) continue;
    const actual = elementos[id];
    if (!actual || (mutacion === "ignora-lapidas" && actual.borrado)) { elementos[id] = entrante; continue; }
    if (ganaMutante(entrante, actual, mutacion)) elementos[id] = entrante;
  }
  const resultado = { salaId: a.salaId, elementos, reloj: Math.max(a.reloj, b.reloj) };
  const vivos = Object.values(elementos).filter((e) => !e.borrado).length;
  return { resultado, conflictos: vivos > LIMITE_ELEMENTOS ? ["limite-excedido"] : [] };
}
function salaGrande(vivos: number, prefijo: string, lapidas = false): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0; i < vivos; i += 1) {
    const id = `${prefijo}${i}`;
    elementos[id] = { id, tipo: "nota", datos: {}, actualizadoEn: 1, porDispositivo: "alfa-movil", borrado: lapidas ? true : undefined };
  }
  return { salaId: "sala-limite", elementos, reloj: 1 };
}
describe("fusión de salas · fuzzing con semilla", () => {
  it("cumple los oráculos en 5 semillas × 300 casos", () => {
    const fallos = SEMILLAS.flatMap((semilla) => bateria(semilla, fusionarEstados)); expect(fallos, `falló: ${fallos[0] ?? ""}`).toEqual([]);
  });
  it("avisa de limite-excedido si y solo si hay más de LIMITE_ELEMENTOS vivos", () => {
    const llena = salaGrande(LIMITE_ELEMENTOS, "v");
    expect(fusionarEstados(llena, salaGrande(0, "z"), MI).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(llena, salaGrande(1, "z"), MI).conflictos).toContain("limite-excedido");
    expect(fusionarEstados(llena, salaGrande(3, "z", true), MI).conflictos).not.toContain("limite-excedido");
  });
  it("una salaId distinta nunca se fusiona", () => {
    const a = salaGrande(2, "a");
    const { resultado, conflictos } = fusionarEstados(a, { ...salaGrande(1, "b"), salaId: "sala-otra" }, MI);
    expect(conflictos).toContain("sala-distinta");
    expect(resultado.elementos).toEqual(a.elementos);
  });
  it("los gemelos mutantes son mordidos por algún oráculo", () => {
    for (const mutacion of MUTACIONES) {
      const fallos = SEMILLAS.flatMap((semilla) => bateria(semilla, (a, b, mi) => fusionarMutante(a, b, mi, mutacion)));
      expect(fallos.length, `el mutante «${mutacion}» sobrevivió a todos los oráculos`).toBeGreaterThan(0);
    }
  });
});
