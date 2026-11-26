/**
 * Fuzzer con semilla y gemelos mutantes · propiedad de salas por épocas (Ola 1025R · INF1025J).
 * Co-op Anything (MIT): fuzzing, oráculos de invariantes y «gemelos mutantes» (cada
 * arreglo apagado una vez: su oráculo debe fallar). PURO: sin red, disco ni reloj.
 */
import { describe, it, expect } from "vitest";
import {
  reclamar,
  traspasar,
  aceptarEscritura,
  fusionarPropiedades,
  type Propiedades,
  type Propiedad,
} from "@/lib/salas/propiedad-sala";

const PERSONAS = ["ana", "bruno", "carla", "dani", "elena", "felipe"] as const;
const IDS = "abcdefghijklmnop".split("");
const SEMILLAS = [1, 7, 42, 2025, 1025];
const CASOS = 500;

type Mutacion =
  | "gana-menor-epoca"
  | "gana-mayor-dueno"
  | "ignora-epoca"
  | "sin-desempate-dueno";

type Regla = (a: Propiedades, b: Propiedades) => { resultado: Propiedades; conflictos: string[] };

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = Math.imul(t ^ (t >>> 7), t | 61) + t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entero = (rnd: () => number, min: number, max: number) =>
  min + Math.floor(rnd() * (max - min + 1));

/** Propiedades aleatorias: 1–16 elementos, épocas 1–8, dueños de la flota. */
function propiedadesAleatorias(rnd: () => number): Propiedades {
  const p: Propiedades = {};
  for (let n = entero(rnd, 1, IDS.length); n > 0; n -= 1) {
    const id = IDS[entero(rnd, 0, IDS.length - 1)];
    p[id] = { dueno: PERSONAS[entero(rnd, 0, PERSONAS.length - 1)], epoca: entero(rnd, 1, 8) };
  }
  return p;
}

/** Copia local de la regla real; `mutacion` apaga una parte concreta del arreglo. */
function ganaPropiedadConMutacion(mia: Propiedad, otra: Propiedad, m?: Mutacion): Propiedad {
  // Mutación: ignora la época por completo (solo desempate por dueño) — DEBE IR ANTES del check de época
  if (m === "ignora-epoca" && mia.dueno !== otra.dueno) {
    return mia.dueno < otra.dueno ? mia : otra;
  }
  // Mutación: gana la época MENOR (invierte la regla real)
  if (m === "gana-menor-epoca" && mia.epoca !== otra.epoca) {
    return mia.epoca < otra.epoca ? mia : otra;
  }
  // Regla real: gana la época MAYOR
  if (m !== "gana-menor-epoca" && mia.epoca !== otra.epoca) {
    return mia.epoca > otra.epoca ? mia : otra;
  }
  // Épocas iguales
  // Mutación: gana el dueño MAYOR alfabéticamente (invierte desempate)
  if (m === "gana-mayor-dueno" && mia.dueno !== otra.dueno) {
    return mia.dueno > otra.dueno ? mia : otra;
  }
  // Regla real: a igual época, gana el dueño MENOR alfabéticamente
  if (m !== "sin-desempate-dueno" && mia.dueno !== otra.dueno) {
    return mia.dueno < otra.dueno ? mia : otra;
  }
  // Mutación: sin desempate final (devuelve la primera)
  if (m === "sin-desempate-dueno") {
    return mia;
  }
  return mia;
}

function reglaConMutacion(m?: Mutacion): Regla {
  return (a, b) => {
    const resultado: Propiedades = { ...a };
    const conflictos: string[] = [];
    for (const [id, otra] of Object.entries(b)) {
      const mia = resultado[id];
      if (!mia) {
        resultado[id] = otra;
        continue;
      }
      if (mia.dueno !== otra.dueno) conflictos.push(id);
      resultado[id] = ganaPropiedadConMutacion(mia, otra, m);
    }
    return { resultado, conflictos: conflictos.sort() };
  };
}

const canon = (p: Propiedades) => JSON.stringify(Object.keys(p).sort().map((k) => p[k]));

function fallos(regla: Regla, a: Propiedades, b: Propiedades, c: Propiedades): string[] {
  const f: string[] = [];
  const ab = regla(a, b).resultado;

  // 1. Conmutativa: A ∪ B = B ∪ A
  if (canon(ab) !== canon(regla(b, a).resultado)) f.push("conmutativa");

  // 2. Idempotente: A ∪ A = A
  if (canon(regla(a, a).resultado) !== canon(a)) f.push("idempotente");

  // 3. Asociativa: (A ∪ B) ∪ C = A ∪ (B ∪ C)
  const izq = regla(regla(a, b).resultado, c).resultado;
  const der = regla(a, regla(b, c).resultado).resultado;
  if (canon(izq) !== canon(der)) f.push("asociativa");

  // 4. Época nunca baja en fusión: la época resultante >= max(épocas entrada) para cada id
  for (const [id, final] of Object.entries(ab)) {
    const epocaA = a[id]?.epoca ?? 0;
    const epocaB = b[id]?.epoca ?? 0;
    if (final.epoca < Math.max(epocaA, epocaB)) f.push(`epoca-baja-${id}`);
  }

  // 5. Conflicto detectado cuando dos dueños distintos para mismo id
  const cruzada = regla(a, b);
  const idsEnAmbos = Object.keys(a).filter((k) => k in b);
  for (const id of idsEnAmbos) {
    if (a[id].dueno !== b[id].dueno && !cruzada.conflictos.includes(id)) {
      f.push(`conflicto-falta-${id}`);
    }
    if (a[id].dueno === b[id].dueno && cruzada.conflictos.includes(id)) {
      f.push(`conflicto-extra-${id}`);
    }
  }

  // 6. Dueño resultante es uno de los dos (no inventado)
  for (const [id, final] of Object.entries(ab)) {
    const da = a[id]?.dueno;
    const db = b[id]?.dueno;
    const validos = [da, db].filter(Boolean);
    if (validos.length > 0 && !validos.includes(final.dueno)) {
      f.push(`dueno-inventado-${id}`);
    }
  }

  // 7. A igual época y distinto dueño, gana el menor alfabéticamente (desempate determinista)
  for (const [id, final] of Object.entries(ab)) {
    const ea = a[id];
    const eb = b[id];
    if (ea && eb && ea.epoca === eb.epoca && ea.dueno !== eb.dueno) {
      const esperado = ea.dueno < eb.dueno ? ea.dueno : eb.dueno;
      if (final.dueno !== esperado) f.push(`desempate-dueno-${id}`);
    }
  }

  // 8. Época mayor SIEMPRE gana, sin importar orden alfabético del dueño
  for (const [id, final] of Object.entries(ab)) {
    const ea = a[id];
    const eb = b[id];
    if (ea && eb && ea.epoca !== eb.epoca) {
      const esperado = ea.epoca > eb.epoca ? ea.dueno : eb.dueno;
      if (final.dueno !== esperado) f.push(`epoca-ignorado-${id}`);
    }
  }

  return f;
}

function bateria(regla: Regla): { semilla: number; caso: number; fallos: string[] } | null {
  for (const semilla of SEMILLAS) {
    const rnd = mulberry32(semilla);
    for (let caso = 0; caso < CASOS; caso += 1) {
      const f = fallos(regla, propiedadesAleatorias(rnd), propiedadesAleatorias(rnd), propiedadesAleatorias(rnd));
      if (f.length > 0) return { semilla, caso, fallos: f };
    }
  }
  return null;
}

describe("salas · propiedad · fuzzing con semilla y gemelos mutantes", () => {
  it("300 casos × 5 semillas pasan todos los oráculos", () => {
    const fallo = bateria(fusionarPropiedades);
    expect(fallo, fallo ? `semilla ${fallo.semilla}, caso ${fallo.caso}: ${fallo.fallos.join(", ")}` : "").toBeNull();
  });

  it("cada gemelo mutante es cazado por al menos un oráculo", () => {
    const mutantes: Mutacion[] = ["gana-menor-epoca", "gana-mayor-dueno", "ignora-epoca", "sin-desempate-dueno"];
    for (const m of mutantes) {
      expect(
        bateria(reglaConMutacion(m)),
        `el mutante «${m}» sobrevivió a todos los oráculos`
      ).not.toBeNull();
    }
  });

  it("reclamar es idempotente y no roba dueño existente", () => {
    const rnd = mulberry32(1025);
    for (let i = 0; i < 100; i += 1) {
      const p = propiedadesAleatorias(rnd);
      const id = IDS[entero(rnd, 0, IDS.length - 1)];
      const quien = PERSONAS[entero(rnd, 0, PERSONAS.length - 1)];
      const r1 = reclamar(p, id, quien);
      const r2 = reclamar(r1, id, quien);
      expect(canon(r1)).toBe(canon(r2));
      if (p[id]) expect(r1[id]).toEqual(p[id]);
    }
  });

  it("mutante 'ignora-epoca' es cazado por oráculo de época mayor (caso dirigido)", () => {
    // Caso donde dueño menor alfabético tiene época MENOR: el mutante elige mal
    const a: Propiedades = { "x": { dueno: "ana", epoca: 2 } };
    const b: Propiedades = { "x": { dueno: "zoe", epoca: 5 } };
    const c: Propiedades = {};
    const reglaMutant = reglaConMutacion("ignora-epoca");
    const fallo = fallos(reglaMutant, a, b, c);
    expect(fallo.some((f) => f.startsWith("epoca-ignorado") || f.startsWith("epoca-baja"))).toBe(true);
  });

  it("traspasar sube época y solo dueño actual puede; siempre devuelve copia nueva", () => {
    const rnd = mulberry32(1025);
    for (let i = 0; i < 100; i += 1) {
      const p = propiedadesAleatorias(rnd);
      const id = IDS[entero(rnd, 0, IDS.length - 1)];
      const de = PERSONAS[entero(rnd, 0, PERSONAS.length - 1)];
      const a = PERSONAS[entero(rnd, 0, PERSONAS.length - 1)];
      const r = traspasar(p, id, de, a);
      // Siempre devuelve un objeto nuevo (inmutabilidad)
      expect(r).not.toBe(p);
      if (p[id] && p[id].dueno === de) {
        expect(r[id].epoca).toBe(p[id].epoca + 1);
        expect(r[id].dueno).toBe(a);
        expect(canon(r)).not.toBe(canon(p));
      } else {
        // Sin cambios visibles, pero objeto nuevo
        expect(canon(r)).toBe(canon(p));
      }
    }
  });
});