/**
 * INF1025I · Fuzzer con semilla y gemelos mutantes de la fusión de salas.
 * Co-op Anything (MIT): plan reproducible, oráculos y un gemelo por regla.
 */
import { describe, it, expect } from "vitest";
import { LIMITE_ELEMENTOS, fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

type Fusion = (a: EstadoSala, b: EstadoSala, mi: string) => { resultado: EstadoSala; conflictos: string[] };
type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo";
const SEMILLAS = [1025, 7, 42, 2026, 314159];
const CASOS = 300;
const DISPOSITIVOS = ["d-alfa", "d-beta", "d-gama"];
const AJENO = "d-observador"; // ajeno a los estados: la fusión debe ser simétrica
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Estado aleatorio: misma sala, ids compartidos, marcas pequeñas (empates) y lápidas. */
function generar(rnd: () => number, salaId = "sala-fuzz"): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (let i = 0, n = 1 + Math.floor(rnd() * 12); i < n; i += 1) {
    const id = `e${Math.floor(rnd() * 8)}`; // ids compartidos: choques a propósito
    const porDispositivo = DISPOSITIVOS[Math.floor(rnd() * 3)] as string;
    const actualizadoEn = Math.floor(rnd() * 5); // marcas pequeñas: empates
    const borrado = rnd() < 0.25;
    const sello = `${actualizadoEn}|${porDispositivo}|${borrado ? 1 : 0}`;
    elementos[id] = { id, tipo: "nota", datos: { sello }, actualizadoEn, porDispositivo, borrado };
  }
  return { salaId, elementos, reloj: Math.floor(rnd() * 10) };
}
const canonico = (s: EstadoSala): string => Object.keys(s.elementos).sort()
  .map((k) => `${k}:${s.elementos[k]!.actualizadoEn}|${s.elementos[k]!.porDispositivo}|${s.elementos[k]!.borrado ? 1 : 0}|${String(s.elementos[k]!.datos.sello)}`).join(";");

/** Mismo orden total que documenta el módulo real: tiempo, dispositivo y lápida. */
const gana = (a: ElementoSala, b: ElementoSala): boolean => a.actualizadoEn !== b.actualizadoEn ? a.actualizadoEn > b.actualizadoEn : a.porDispositivo !== b.porDispositivo ? a.porDispositivo < b.porDispositivo : Boolean(a.borrado) && !b.borrado;

type Caso = { a: EstadoSala; b: EstadoSala; c: EstadoSala; mi: string };
/** Devuelve lo que se rompió; lista vacía = todos los invariantes intactos. */
function fallos(f: Fusion, { a, b, c, mi }: Caso): string[] {
  const malos: string[] = [];
  const ab = f(a, b, mi).resultado;
  if (canonico(ab) !== canonico(f(b, a, mi).resultado)) malos.push("conmutativa");
  if (canonico(f(a, a, mi).resultado) !== canonico(a)) malos.push("idempotente");
  if (canonico(f(ab, c, mi).resultado) !== canonico(f(a, f(b, c, mi).resultado, mi).resultado)) malos.push("asociativa");
  if (ab.reloj !== Math.max(a.reloj, b.reloj)) malos.push("reloj-maximo");
  const otra = { ...a, salaId: "sala-otra" };
  const rara = f(a, otra, mi);
  if (!rara.conflictos.includes("sala-distinta") || canonico(rara.resultado) !== canonico(a)) malos.push("sala-distinta");
  for (const id of new Set([...Object.keys(a.elementos), ...Object.keys(b.elementos)])) {
    const va = a.elementos[id];
    const vb = b.elementos[id];
    const esperado = !va || !vb ? va ?? vb : gana(va, vb) ? va : vb;
    if (esperado?.borrado && !ab.elementos[id]?.borrado) malos.push(`lapida:${id}`);
  }
  return malos;
}

/** Plan reproducible; al fallar conserva semilla e índice del caso. */
function bateria(f: Fusion): { semilla: number; caso: number; fallos: string[] } | null {
  for (const semilla of SEMILLAS) {
    const rnd = mulberry32(semilla);
    for (let i = 0; i < CASOS; i += 1) {
      const rotos = fallos(f, { a: generar(rnd), b: generar(rnd), c: generar(rnd), mi: AJENO });
      if (rotos.length > 0) return { semilla, caso: i, fallos: rotos };
    }
  }
  return null;
}

/** Copia local de la regla con un defecto encendido: el gemelo mutante. */
function fusionarMutante(local: EstadoSala, remoto: EstadoSala, mi: string, mutacion: Mutacion): { resultado: EstadoSala; conflictos: string[] } {
  if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
  const elementos = { ...local.elementos };
  const ganaM = (a: ElementoSala, b: ElementoSala): boolean =>
    mutacion === "gana-el-menor" ? a.actualizadoEn < b.actualizadoEn
      : a.actualizadoEn !== b.actualizadoEn ? a.actualizadoEn > b.actualizadoEn
      : mutacion === "sin-desempate-por-dispositivo" ? false
      : a.porDispositivo !== b.porDispositivo ? a.porDispositivo < b.porDispositivo
      : mutacion === "empate-sin-lapida" ? false
      : Boolean(a.borrado) && !b.borrado;
  for (const [id, entrante] of Object.entries(remoto.elementos)) {
    if (entrante.porDispositivo === mi) continue;
    if (mutacion === "ignora-lapidas" && entrante.borrado) continue;
    const actual = elementos[id];
    const distintas = actual && (actual.actualizadoEn !== entrante.actualizadoEn ||
      actual.porDispositivo !== entrante.porDispositivo || Boolean(actual.borrado) !== Boolean(entrante.borrado));
    if (!actual || (distintas && ganaM(entrante, actual))) elementos[id] = entrante;
  }
  return { resultado: { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) }, conflictos: [] };
}
describe("fuzzing de salas · INF1025I", () => {
  it("300 casos × 5 semillas pasan todos los oráculos", () => {
    const fallo = bateria(fusionarEstados);
    if (fallo) throw new Error(`semilla=${fallo.semilla} caso=${fallo.caso}: ${fallo.fallos.join(", ")}`);
  });

  it("el límite avisa si y solo si hay más de LIMITE_ELEMENTOS vivos (caso grande aparte)", () => {
    const grande = (vivos: number, lapidas = 0, marca = "v"): EstadoSala => ({
      salaId: "sala-limite", reloj: 1,
      elementos: Object.fromEntries(Array.from({ length: vivos + lapidas }, (_, i) => {
        const id = `${i < vivos ? marca : `l${marca}`}${i}`;
        return [id, { id, tipo: "nota", datos: {}, actualizadoEn: i, porDispositivo: "d-alfa", borrado: i >= vivos } as ElementoSala];
      })),
    });
    expect(fusionarEstados(grande(LIMITE_ELEMENTOS - 1, 0, "a"), grande(1, 0, "b"), AJENO).conflictos).not.toContain("limite-excedido");
    expect(fusionarEstados(grande(LIMITE_ELEMENTOS, 0, "a"), grande(1, 0, "b"), AJENO).conflictos).toContain("limite-excedido");
    expect(fusionarEstados(grande(LIMITE_ELEMENTOS, 50, "a"), grande(0, 0, "b"), AJENO).conflictos).not.toContain("limite-excedido");
  });

  for (const mutacion of ["gana-el-menor", "empate-sin-lapida", "ignora-lapidas", "sin-desempate-por-dispositivo"] as Mutacion[]) {
    it(`el gemelo «${mutacion}» lo caza algún oráculo`, () => {
      expect(bateria((a, b, mi) => fusionarMutante(a, b, mi, mutacion))?.fallos.length ?? 0).toBeGreaterThan(0);
    });
  }
});
