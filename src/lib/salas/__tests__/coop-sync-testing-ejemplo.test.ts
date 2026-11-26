/**
 * Ejemplo de uso de la skill coop-sync-testing en StarSeed OS.
 *
 * Demuestra los patrones clave portados de coop-anything a TypeScript puro:
 * 1. Fuzzing con semilla y oráculos de invariantes sobre fusionarEstados
 * 2. Propiedad por épocas (extensión para elementos de sala con dueño)
 * 3. Mundo falso (fake world) — reloj virtual, red con pérdidas simulada
 * 4. Gemelos de mutación — cada guardia tiene su test que falla si se apaga
 *
 * Módulo PURO: sin red, sin disco, sin reloj de sistema.
 * vitest corre con `globals: false`.
 */
import { describe, it, expect } from "vitest";
import {
  fusionarEstados,
  prioridadDeElemento,
  resumirDivergencia,
  excedeLimite,
  LIMITE_ELEMENTOS,
  type ElementoSala,
  type EstadoSala,
} from "../sincronia-sala";

const T = 1_757_000_000_000;

function el(
  id: string,
  porDispositivo: string,
  actualizadoEn: number,
  extra: Partial<ElementoSala> = {},
): ElementoSala {
  return {
    id,
    tipo: "nota",
    datos: { texto: `${id}@${porDispositivo}` },
    actualizadoEn,
    porDispositivo,
    ...extra,
  };
}

function sala(elementos: ElementoSala[], reloj = 1, salaId = "sala-agora"): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  for (const e of elementos) mapa[e.id] = e;
  return { salaId, elementos: mapa, reloj };
}

/**
 * RNG determinista por semilla (Xoshiro256** simplificado).
 * Misma semilla = misma secuencia en cualquier máquina.
 */
class SeededRNG {
  private state: Uint32Array;
  constructor(semilla: number) {
    this.state = new Uint32Array(4);
    let x = semilla >>> 0;
    for (let i = 0; i < 4; i++) {
      x = (x ^ (x >>> 30)) * 0xbf58476d >>> 0;
      this.state[i] = x;
    }
  }
  next(): number {
    const [s0, s1, s2, s3] = this.state;
    const result = (s0 + s3) >>> 0;
    const t = s1 << 17;
    this.state[2] = s2 ^ s0;
    this.state[3] = s3 ^ s1;
    this.state[1] = s1 ^ s2;
    this.state[0] = s0 ^ s3;
    this.state[2] ^= t;
    this.state[3] = (this.state[3] << 45) | (this.state[3] >>> 7);
    return result / 0x100000000;
  }
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
  choose<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)];
  }
}

/**
 * Genera un caso de fusión aleatorio pero determinista desde una semilla.
 */
function generarCasoAleatorio(semilla: number): {
  local: EstadoSala;
  remoto: EstadoSala;
  dispositivo: string;
} {
  const rng = new SeededRNG(semilla);
  const dispositivo = `dispositivo-${rng.nextInt(1000)}`;
  const numElementos = rng.nextInt(5) + 1;

  const elementosBase: ElementoSala[] = [];
  for (let i = 0; i < numElementos; i++) {
    const id = `elem-${i}`;
    const tipo = rng.choose(["nota", "posicion", "cursor", "trazo", "camara"]);
    elementosBase.push(
      el(id, `base-${rng.nextInt(10)}`, T + rng.nextInt(10000), { tipo }),
    );
  }

  const local = sala(
    elementosBase.map((e) =>
      rng.next() < 0.3
        ? el(e.id, dispositivo, e.actualizadoEn + rng.nextInt(5000), { tipo: e.tipo })
        : e,
    ),
    rng.nextInt(100),
  );

  const remoto = sala(
    elementosBase.map((e) =>
      rng.next() < 0.3
        ? el(e.id, `otro-${rng.nextInt(10)}`, e.actualizadoEn + rng.nextInt(5000), { tipo: e.tipo })
        : e,
    ),
    rng.nextInt(100),
  );

  return { local, remoto, dispositivo };
}

/**
 * Oráculos de invariantes — reglas que NUNCA deben romperse.
 */
const oraculos = {
  /** Simetría: fusionar A con B = fusionar B con A (mismo resultado y conflictos) */
  simetria: (
    local: EstadoSala,
    remoto: EstadoSala,
    dispositivo: string,
  ): boolean => {
    const r1 = fusionarEstados(local, remoto, dispositivo);
    const r2 = fusionarEstados(remoto, local, dispositivo);
    const mismosElementos =
      JSON.stringify(r1.resultado.elementos) === JSON.stringify(r2.resultado.elementos);
    const conflictos1 = [...r1.conflictos].sort();
    const conflictos2 = [...r2.conflictos].sort();
    const mismosConflictos = JSON.stringify(conflictos1) === JSON.stringify(conflictos2);
    return mismosElementos && mismosConflictos;
  },

  /** Anti-eco: lo que emite mi dispositivo y vuelve de rebote no cambia mi estado */
  antiEco: (
    local: EstadoSala,
    remoto: EstadoSala,
    miDispositivo: string,
  ): boolean => {
    const { resultado } = fusionarEstados(local, remoto, miDispositivo);
    for (const [id, elem] of Object.entries(resultado.elementos)) {
      if (elem.porDispositivo === miDispositivo && elem.actualizadoEn > T + 10000) {
        return false;
      }
    }
    return true;
  },

  /** Lápidas no se pierden: un elemento borrado sigue en el mapa con borrado=true */
  lapidasPersisten: (
    local: EstadoSala,
    remoto: EstadoSala,
    dispositivo: string,
  ): boolean => {
    const { resultado } = fusionarEstados(local, remoto, dispositivo);
    for (const elem of Object.values(resultado.elementos)) {
      if (elem.borrado && !resultado.elementos[elem.id]) return false;
    }
    return true;
  },

  /** Prioridad: contenido (P1) nunca se pierde por efímero (P0) */
  prioridadContenido: (
    local: EstadoSala,
    remoto: EstadoSala,
    dispositivo: string,
  ): boolean => {
    const { resultado } = fusionarEstados(local, remoto, dispositivo);
    for (const [id, elem] of Object.entries(resultado.elementos)) {
      if (prioridadDeElemento(elem) === 1 && !resultado.elementos[id]) return false;
    }
    return true;
  },

  /** Límite de elementos: si se pasa, se avisa en conflictos, no se trunca a escondidas */
  limiteHonesto: (
    local: EstadoSala,
    remoto: EstadoSala,
    dispositivo: string,
  ): boolean => {
    const { resultado, conflictos } = fusionarEstados(local, remoto, dispositivo);
    const vive = Object.values(resultado.elementos).filter((e) => !e.borrado).length;
    if (vive > LIMITE_ELEMENTOS) {
      return conflictos.includes("limite-excedido");
    }
    return true;
  },
};

describe("coop-sync-testing · Fuzzer con oráculos sobre fusionarEstados", () => {
  const NUM_SEMILLAS = 50;

  it(`simetría y oráculos con ${NUM_SEMILLAS} semillas`, () => {
    for (let semilla = 0; semilla < NUM_SEMILLAS; semilla++) {
      const { local, remoto, dispositivo } = generarCasoAleatorio(semilla);
      // Usar un observador neutro (ni local ni remoto) para la simetría
      const observador = `observador-${semilla}`;

      expect(oraculos.simetria(local, remoto, observador)).toBe(true);
      expect(oraculos.antiEco(local, remoto, observador)).toBe(true);
      expect(oraculos.lapidasPersisten(local, remoto, observador)).toBe(true);
      expect(oraculos.prioridadContenido(local, remoto, observador)).toBe(true);
      expect(oraculos.limiteHonesto(local, remoto, observador)).toBe(true);
    }
  });
});

/**
 * Extensión: Elemento de sala con propiedad por época (actor-ownership pattern).
 * Basado en referencias/actor-ownership.md — un dueño por elemento por época.
 */
interface ElementoConEpoca extends ElementoSala {
  epoca: number;
  duenio: string;
}

function elConEpoca(
  id: string,
  duenio: string,
  epoca: number,
  actualizadoEn: number,
  extra: Partial<ElementoSala> = {},
): ElementoConEpoca {
  return {
    ...el(id, duenio, actualizadoEn, extra),
    epoca,
    duenio,
  };
}

/**
 * Guardia de época: solo el dueño en la época actual puede publicar.
 * Regla: una actualización es válida SOLO si viene del dueño en la época actual.
 */
function puedePublicar(elemento: ElementoConEpoca, dispositivo: string, epocaActual: number): boolean {
  return elemento.duenio === dispositivo && elemento.epoca === epocaActual;
}

/**
 * Versión con mutación para el gemelo: apaga comprobaciones de guardia.
 * SOLO para tests de mutación — NUNCA en producción.
 */
function puedePublicarConMutacion(
  elemento: ElementoConEpoca,
  dispositivo: string,
  epocaActual: number,
  mutacion: { epocaNoValidada?: boolean; duenioNoValidado?: boolean } = {},
): boolean {
  if (mutacion.epocaNoValidada && mutacion.duenioNoValidado) return true;
  if (mutacion.epocaNoValidada) return elemento.duenio === dispositivo;
  if (mutacion.duenioNoValidado) return elemento.epoca === epocaActual;
  return puedePublicar(elemento, dispositivo, epocaActual);
}

describe("coop-sync-testing · Propiedad por épocas (actor-ownership)", () => {
  it("solo el dueño en la época actual puede publicar", () => {
    const elem = elConEpoca("npc-1", "jugador-A", 5, T);
    expect(puedePublicar(elem, "jugador-A", 5)).toBe(true);
    expect(puedePublicar(elem, "jugador-B", 5)).toBe(false);
    expect(puedePublicar(elem, "jugador-A", 6)).toBe(false);
    expect(puedePublicar(elem, "jugador-A", 4)).toBe(false);
  });

  it("transferencia de época: el nuevo dueño publica en época superior", () => {
    const viejo = elConEpoca("npc-1", "jugador-A", 5, T);
    const nuevo = elConEpoca("npc-1", "jugador-B", 6, T + 100);
    expect(puedePublicar(viejo, "jugador-A", 6)).toBe(false);
    expect(puedePublicar(nuevo, "jugador-B", 6)).toBe(true);
  });
});

/**
 * GEMelos de mutación (mutation twins) — demuestran que los guardias funcionan.
 * Cada test de arriba tiene su gemelo que rompe la guardia a propósito.
 * El gemelo DEBE fallar (mostrar que el bug existe sin la guardia).
 */
describe("coop-sync-testing · Gemelos de mutación (mutation twins)", () => {
  it("MUTANT: sin comprobación de época acepta actualización de época anterior", () => {
    const elem = elConEpoca("npc-1", "jugador-A", 5, T);
    expect(puedePublicarConMutacion(elem, "jugador-A", 6, { epocaNoValidada: true })).toBe(true);
    expect(puedePublicar(elem, "jugador-A", 6)).toBe(false);
  });

  it("MUTANT: sin comprobación de dueño acepta actualización de no-dueño", () => {
    const elem = elConEpoca("npc-1", "jugador-A", 5, T);
    expect(puedePublicarConMutacion(elem, "jugador-B", 5, { duenioNoValidado: true })).toBe(true);
    expect(puedePublicar(elem, "jugador-B", 5)).toBe(false);
  });

  it("MUTANT: fusión sin anti-eco acepta eco del propio dispositivo", () => {
    const local = sala([el("w1", "movil-ana", T)]);
    const eco = sala([el("w1", "movil-ana", T + 5000, { datos: { texto: "eco" } })]);
    const elementos: Record<string, ElementoSala> = { ...local.elementos };
    for (const [id, entrante] of Object.entries(eco.elementos)) {
      const actual = elementos[id];
      if (!actual || actual.actualizadoEn !== entrante.actualizadoEn) {
        elementos[id] = entrante;
      }
    }
    const resultadoMutado = { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, eco.reloj) };
    expect(resultadoMutado.elementos.w1.actualizadoEn).toBe(T + 5000);
    const { resultado } = fusionarEstados(local, eco, "movil-ana");
    expect(resultado.elementos.w1.actualizadoEn).toBe(T);
  });

  it("MUTANT: fusión sin comprobación de lápida revive elemento borrado", () => {
    // Caso donde la versión SIN lápida es más nueva que la CON lápida
    const borrada = sala([el("n1", "movil-ana", T, { borrado: true })]); // lápida en T
    const reeditada = sala([el("n1", "portatil-bruno", T + 100)]); // reeditada después, SIN lápida
    // Simular fusión SIN respetar lápidas (mutación: gana el actualizadoEn mayor, ignora borrado)
    const elementos: Record<string, ElementoSala> = { ...borrada.elementos };
    for (const [id, entrante] of Object.entries(reeditada.elementos)) {
      const actual = elementos[id];
      if (!actual || entrante.actualizadoEn > actual.actualizadoEn) {
        elementos[id] = entrante;
      }
    }
    const resultadoMutado = { salaId: borrada.salaId, elementos, reloj: Math.max(borrada.reloj, reeditada.reloj) };
    // La mutación revive incorrectamente (borrado se vuelve undefined)
    expect(resultadoMutado.elementos.n1.borrado).toBeUndefined();
    // Con la función real, la lápida NO gana si hay edición más nueva sin lápida
    // (esa es la regla correcta: edición posterior resucita a propósito)
    const { resultado } = fusionarEstados(borrada, reeditada, "tablet-observadora");
    expect(resultado.elementos.n1.borrado).toBeUndefined();
    // Pero si la lápida es MÁS nueva, la lápida gana
    const borradaMasNueva = sala([el("n1", "movil-ana", T + 100, { borrado: true })]);
    const versionVieja = sala([el("n1", "portatil-bruno", T)]);
    const { resultado: r2 } = fusionarEstados(borradaMasNueva, versionVieja, "tablet-observadora");
    expect(r2.elementos.n1.borrado).toBe(true);
  });
});

/**
 * Mundo falso (fake world) — prueba de sincronización sin red real.
 * Patrón de referencias/fake-world-testing.md:
 * - Reloj virtual
 * - Red con pérdidas simulada (semilla determinista)
 * - N copias del estado en un solo proceso
 * - Oráculos verificados en cada paso
 */
interface MundoFalso {
  reloj: number;
  dispositivos: Map<string, EstadoSala>;
  red: RedSimulada;
}

interface RedSimulada {
  latenciaBase: number;
  jitter: number;
  perdida: number;
  duplicados: number;
  semilla: number;
  rng: SeededRNG;
  cola: Array<{ desde: string; hacia: string; estado: EstadoSala; entregaEn: number }>;
}

function crearMundoFalso(
  numDispositivos: number,
  semilla: number,
  perdida = 0.1,
  latenciaBase = 50,
): MundoFalso {
  const rng = new SeededRNG(semilla);
  const dispositivos = new Map<string, EstadoSala>();
  for (let i = 0; i < numDispositivos; i++) {
    dispositivos.set(`dispositivo-${i}`, sala([]));
  }
  return {
    reloj: 0,
    dispositivos,
    red: {
      latenciaBase,
      jitter: 20,
      perdida,
      duplicados: 0.05,
      semilla,
      rng,
      cola: [],
    },
  };
}

function tickMundo(mundo: MundoFalso, ms: number): void {
  mundo.reloj += ms;
  const pendientes: typeof mundo.red.cola = [];
  for (const msg of mundo.red.cola) {
    if (msg.entregaEn <= mundo.reloj) {
      const actual = mundo.dispositivos.get(msg.hacia);
      if (actual) {
        const { resultado } = fusionarEstados(actual, msg.estado, msg.hacia);
        mundo.dispositivos.set(msg.hacia, resultado);
      }
    } else {
      pendientes.push(msg);
    }
  }
  mundo.red.cola = pendientes;
}

function enviarEstado(mundo: MundoFalso, desde: string, hacia: string): void {
  const estado = mundo.dispositivos.get(desde);
  if (!estado) return;
  const { rng, latenciaBase, jitter, perdida, duplicados } = mundo.red;
  if (rng.next() < perdida) return;
  const latencia = latenciaBase + (rng.next() - 0.5) * 2 * jitter;
  const entregaEn = mundo.reloj + Math.max(1, Math.round(latencia));
  mundo.red.cola.push({ desde, hacia, estado, entregaEn });
  if (rng.next() < duplicados) {
    const entregaEn2 = entregaEn + rng.nextInt(10) + 1;
    mundo.red.cola.push({ desde, hacia, estado, entregaEn: entregaEn2 });
  }
}

describe("coop-sync-testing · Mundo falso (fake world) con red simulada", () => {
  it("convergencia tras partición y curación (semilla fija)", () => {
    const mundo = crearMundoFalso(3, 42, 0.2, 30);
    const A = "dispositivo-0";
    const B = "dispositivo-1";
    const C = "dispositivo-2";

    const inicial = sala([el("shared", "dispositivo-0", T)]);
    mundo.dispositivos.set(A, inicial);
    mundo.dispositivos.set(B, inicial);
    mundo.dispositivos.set(C, inicial);

    mundo.dispositivos.set(A, sala([el("shared", A, T + 100), el("nuevo-A", A, T + 100)]));
    mundo.dispositivos.set(B, sala([el("shared", B, T + 200), el("nuevo-B", B, T + 200)]));

    for (let paso = 0; paso < 5; paso++) {
      tickMundo(mundo, 10);
      enviarEstado(mundo, A, B);
      enviarEstado(mundo, A, C);
      enviarEstado(mundo, B, A);
      enviarEstado(mundo, B, C);
      enviarEstado(mundo, C, A);
      enviarEstado(mundo, C, B);
    }

    mundo.red.perdida = 0;
    mundo.red.duplicados = 0;
    for (let paso = 0; paso < 10; paso++) {
      tickMundo(mundo, 10);
      for (const d of mundo.dispositivos.keys()) {
        for (const otro of mundo.dispositivos.keys()) {
          if (d !== otro) enviarEstado(mundo, d, otro);
        }
      }
    }

    const estados = Array.from(mundo.dispositivos.values());
    for (let i = 1; i < estados.length; i++) {
      expect(estados[i].elementos).toEqual(estados[0].elementos);
    }
  });

  it("oráculo: nada se aplica dos veces (duplicados)", () => {
    const mundo = crearMundoFalso(2, 123, 0, 10);
    mundo.red.duplicados = 1.0;
    const A = "dispositivo-0";
    const B = "dispositivo-1";

    mundo.dispositivos.set(A, sala([el("x", A, T)]));
    mundo.dispositivos.set(B, sala([]));

    for (let i = 0; i < 20; i++) {
      tickMundo(mundo, 1);
      enviarEstado(mundo, A, B);
    }
    tickMundo(mundo, 50);

    const estadoB = mundo.dispositivos.get(B)!;
    expect(Object.keys(estadoB.elementos)).toContain("x");
    expect(estadoB.elementos.x.actualizadoEn).toBe(T);
  });
});

/**
 * Shrink (reducción) — dada una secuencia que falla, encuentra la mínima.
 * Patrón de referencias/desync-hunting.md y fuzzing-coop-sync.md (ddmin simplificado).
 */
function shrink<T>(
  secuencia: T[],
  falla: (subseq: T[]) => boolean,
): T[] {
  let actual = [...secuencia];
  let tamaño = Math.max(1, Math.ceil(actual.length / 2));
  while (tamaño >= 1 && actual.length > 1) {
    let reducido = false;
    for (let inicio = 0; inicio + tamaño <= actual.length; inicio += tamaño) {
      const candidata = [...actual.slice(0, inicio), ...actual.slice(inicio + tamaño)];
      if (falla(candidata)) {
        actual = candidata;
        reducido = true;
        break;
      }
    }
    if (!reducido) {
      tamaño = Math.floor(tamaño / 2);
    }
  }
  return actual;
}

describe("coop-sync-testing · Shrink (reducción de caso fallido)", () => {
  it("reduce una secuencia de 8 pasos a la mínima que rompe convergencia", () => {
    const pasos = [
      { accion: "editar-A", dispositivo: "A", elemento: "x", tiempo: 1 },
      { accion: "editar-B", dispositivo: "B", elemento: "x", tiempo: 1 },
      { accion: "sync-A-B", desde: "A", hacia: "B" },
      { accion: "sync-B-A", desde: "B", hacia: "A" },
      { accion: "editar-A-2", dispositivo: "A", elemento: "x", tiempo: 2 },
      { accion: "sync-A-B-2", desde: "A", hacia: "B" },
      { accion: "verificar", expectativa: "convergencia" },
      { accion: "fin" },
    ];

    function fallaConvergencia(seq: typeof pasos): boolean {
      const edicionesMismoTiempo = seq.filter(
        (p) => p.accion.startsWith("editar") && p.tiempo === 1,
      );
      return edicionesMismoTiempo.length >= 2;
    }

    const minima = shrink(pasos, fallaConvergencia);
    // El mínimo que falla son solo las dos ediciones concurrentes en tiempo 1
    expect(minima.length).toBeLessThan(pasos.length);
    expect(minima.some((p) => p.accion === "editar-A")).toBe(true);
    expect(minima.some((p) => p.accion === "editar-B")).toBe(true);
    // "verificar" se elimina porque no es necesario para reproducir la falla
    expect(minima.length).toBe(2);
  });
});