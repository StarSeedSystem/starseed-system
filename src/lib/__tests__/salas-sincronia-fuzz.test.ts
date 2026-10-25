/** Fuzzer con semilla y gemelos mutantes de la sincronía de salas (INF1025I).
 * Co-op Anything (MIT): azar reproducible, oráculos de invariantes y mutantes que
 * deben morir. Sin red, disco ni relojes: azar y reloj entran por parámetro. */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
const SEMILLAS = [7, 42, 1025, 9001, 20261025] as const;
const CASOS = 300;
const MI = "neurona-observadora"; // ajeno a los estados: la fusión es simétrica
const DISPOSITIVOS = ["disp-alfa", "disp-beta", "disp-gamma"] as const;
const T = 1_757_000_000_000;
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entero = (r: () => number, max: number) => Math.floor(r() * max);
const elemento = (id: string, ts: number, disp: string, borrado: boolean): ElementoSala => ({ id, tipo: "nota", datos: { texto: id }, actualizadoEn: ts, porDispositivo: disp, borrado });
function par(rng: () => number): { a: EstadoSala; b: EstadoSala; c: EstadoSala } {
  const mapas = [{}, {}, {}] as Record<string, ElementoSala>[];
  for (let i = 0, n = 1 + entero(rng, 12); i < n; i += 1) {
    const id = `e${entero(rng, 6)}`;
    for (const mapa of mapas) mapa[id] = elemento(id, T + entero(rng, 3), DISPOSITIVOS[entero(rng, 3)], rng() < 0.25);
  }
  // Empates garantizados: ningún mutante se salva por suerte del generador.
  mapas[0]["e-tie"] = elemento("e-tie", T + 2, "disp-alfa", false);
  mapas[1]["e-tie"] = elemento("e-tie", T + 2, "disp-alfa", true);
  mapas[0]["e-tie-lapida"] = elemento("e-tie-lapida", T + 2, "disp-alfa", true);
  mapas[1]["e-tie-lapida"] = elemento("e-tie-lapida", T, "disp-beta", false);
  mapas[0]["e-tie-dispositivo"] = elemento("e-tie-dispositivo", T, "disp-alfa", false);
  mapas[1]["e-tie-dispositivo"] = elemento("e-tie-dispositivo", T, "disp-beta", false);
  const estado = (m: Record<string, ElementoSala>): EstadoSala => ({ salaId: "sala-fuzz", elementos: m, reloj: 1 + entero(rng, 9) });
  return { a: estado(mapas[0]), b: estado(mapas[1]), c: estado(mapas[2]) };
}
const canonico = (m: Record<string, ElementoSala>) => Object.keys(m).sort()
  .map((k) => `${m[k].id}|${m[k].tipo}|${m[k].actualizadoEn}|${m[k].porDispositivo}|${Boolean(m[k].borrado)}|${JSON.stringify(m[k].datos)}`).join(";");
const mismosElementos = (x: Record<string, ElementoSala>, y: Record<string, ElementoSala>) => canonico(x) === canonico(y);
/** Orden total real, solo para juzgar si una lápida es maximal. */
function gana(a: ElementoSala, b: ElementoSala): boolean {
  if (a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
  if (a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return Boolean(a.borrado) && !b.borrado;
}
function lapidasConservadas(a: EstadoSala, b: EstadoSala, r: EstadoSala): boolean {
  const ids = new Set([...Object.keys(a.elementos), ...Object.keys(b.elementos)]);
  for (const id of ids) {
    const versiones = [a.elementos[id], b.elementos[id]].filter((v): v is ElementoSala => Boolean(v));
    if (versiones.filter((v) => v.borrado).some((l) => versiones.every((v) => !gana(v, l))) && !r.elementos[id]?.borrado) return false;
  }
  return true;
}
type Fusion = (a: EstadoSala, b: EstadoSala, mi: string) => { resultado: EstadoSala; conflictos: string[] };
function violaciones(fusion: Fusion, a: EstadoSala, b: EstadoSala, c: EstadoSala): string[] {
  const fallos: string[] = [];
  const ab = fusion(a, b, MI).resultado, ba = fusion(b, a, MI).resultado;
  if (!mismosElementos(ab.elementos, ba.elementos)) fallos.push("conmutativa");
  if (!mismosElementos(fusion(a, a, MI).resultado.elementos, a.elementos)) fallos.push("idempotente");
  const izq = fusion(fusion(a, b, MI).resultado, c, MI).resultado, der = fusion(a, fusion(b, c, MI).resultado, MI).resultado;
  if (!mismosElementos(izq.elementos, der.elementos)) fallos.push("asociativa");
  if (ab.reloj !== Math.max(a.reloj, b.reloj)) fallos.push("reloj-maximo");
  if (!lapidasConservadas(a, b, ab)) fallos.push("lapida-conservada");
  return fallos;
}
type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";
function ganaMutante(a: ElementoSala, b: ElementoSala, mut: Mutacion): boolean {
  const ta = mut === "gana-el-menor" ? -a.actualizadoEn : a.actualizadoEn, tb = mut === "gana-el-menor" ? -b.actualizadoEn : b.actualizadoEn;
  if (ta !== tb) return ta > tb;
  if (mut !== "sin-desempate-por-dispositivo" && a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
  return mut === "empate-sin-lapida" ? false : Boolean(a.borrado) && !b.borrado;
}
/** Copia local con un solo arreglo apagado; nunca toca el módulo real. */
function fusionarMutante(local: EstadoSala, remoto: EstadoSala, mi: string, mut: Mutacion): { resultado: EstadoSala; conflictos: string[] } {
  if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
  const limpia = (e: ElementoSala): ElementoSala => (mut === "ignora-lapidas" ? { ...e, borrado: false } : e);
  const elementos: Record<string, ElementoSala> = { ...local.elementos };
  for (const [id, remotoEl] of Object.entries(remoto.elementos)) {
    if (remotoEl.porDispositivo === mi) continue;
    const entrante = limpia(remotoEl), actual = elementos[id] ? limpia(elementos[id]) : undefined;
    if (!actual) { elementos[id] = entrante; continue; }
    const iguales = actual.actualizadoEn === entrante.actualizadoEn && actual.porDispositivo === entrante.porDispositivo && Boolean(actual.borrado) === Boolean(entrante.borrado);
    if (!iguales && ganaMutante(entrante, actual, mut)) elementos[id] = entrante;
  }
  return { resultado: { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) }, conflictos: [] };
}
function salaConVivos(vivos: number, lapidas = 0): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0; i < vivos + lapidas; i += 1) elementos[`e${i}`] = elemento(`e${i}`, T, "disp-alfa", i >= vivos);
  return { salaId: "sala-fuzz", elementos, reloj: 1 };
}
describe("sincronia-sala · fuzz con semilla", () => {
  it("1500 casos (300 × 5 semillas) cumplen los oráculos", () => {
    for (const semilla of SEMILLAS) { const rng = mulberry32(semilla);
      for (let i = 0; i < CASOS; i += 1) { const { a, b, c } = par(rng);
        expect(violaciones(fusionarEstados, a, b, c), `semilla ${semilla}, caso ${i}`).toEqual([]); } }
  });
  it("bordes: sala-distinta y limite-excedido solo por encima del techo", () => {
    const a = { ...salaConVivos(2), salaId: "sala-una" }, b = { ...salaConVivos(2), salaId: "sala-otra" };
    const { resultado, conflictos } = fusionarEstados(a, b, MI);
    expect(conflictos).toContain("sala-distinta"); expect(Object.keys(resultado.elementos)).toEqual(["e0", "e1"]);
    expect(fusionarEstados(salaConVivos(LIMITE_ELEMENTOS, 5), salaConVivos(0), MI).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(salaConVivos(LIMITE_ELEMENTOS + 1), salaConVivos(0), MI).conflictos).toContain("limite-excedido");
  });
  it("cada gemelo mutante muere por al menos un oráculo en la misma batería", () => {
    const mutaciones: Mutacion[] = ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"];
    for (const mut of mutaciones) {
      let cazado = "";
      for (const semilla of SEMILLAS) { const rng = mulberry32(semilla);
        for (let i = 0; i < CASOS && !cazado; i += 1) { const { a, b, c } = par(rng);
          const fallos = violaciones((x, y, mi) => fusionarMutante(x, y, mi, mut), a, b, c);
          if (fallos.length > 0) cazado = `semilla ${semilla}, caso ${i}: ${fallos.join(", ")}`; }
        if (cazado) break; }
      expect(cazado, `la mutación ${mut} pasó desapercibida`).not.toBe("");
    }
  });
});
