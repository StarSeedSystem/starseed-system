/**
 * Simulación del mundo de los avatares (Ola 234 · reparada en la Ola 1025U · U1).
 *
 * Es una SIMULACIÓN de juego: los paseos, encuentros y obras que salen de aquí no son conversaciones
 * ni trabajos reales de los agentes, y la interfaz lo dice. Lo que SÍ es real es quién vive en el
 * mundo (ver `habitantes.ts`). Módulo puro: sin React ni red; el reloj entra siempre como argumento.
 *
 * Reglas que arregla esta versión:
 *  · `avanzar` no muta el estado anterior (antes compartía y mutaba `vinculos`).
 *  · `creaciones` y `encuentros` tienen tope (antes crecían sin límite y llenaban memoria y disco).
 *  · El paseo se queda en el suelo: la altura va de 0 a `ALTURA_MAX` y el radio no pasa de `RADIO_MUNDO`.
 *  · Las zonas del escenario atraen a quien hace lo que ellas piden (ver `OpcionesAvance`).
 */
import {
  posicionEnPatron,
} from "@/components/astraura/genesis/oficina/oficina-ocupantes";
import { FRACCION_RADIO_OCUPABLE } from "@/components/astraura/genesis/oficina/oficina-constantes";

export type OcupacionMundo = "explorar" | "conversar" | "crear" | "descansar";

export const OCUPACIONES_MUNDO: readonly OcupacionMundo[] = ["explorar", "conversar", "crear", "descansar"];

export interface HabitanteMundo {
  /** Id estable del habitante. Con agentes reales es el `id` de su `AgenteMundoRef`. */
  id: string;
  /** Id en su almacén de origen (nombre histórico: puede ser una personalidad, un bot o un agente). */
  personalidadId: string;
  nombre: string;
  /** [x, altura sobre el suelo, z]. La altura va de 0 a `ALTURA_MAX`. */
  posicion: [number, number, number];
  energia: number;
  humor: string;
  ocupacion: OcupacionMundo;
  obras: number;
  vinculos: Record<string, number>;
  /** Zona del escenario donde está ahora (según lo que hace), si el escenario tiene zonas. */
  zonaId?: string | null;
}

export interface CreacionMundo {
  id: string;
  autor: string;
  tipo: string;
  titulo: string;
  tick: number;
}

export interface EncuentroMundo {
  a: string;
  b: string;
  tick: number;
  tema: string;
}

export interface EstadoMundo {
  tick: number;
  habitantes: HabitanteMundo[];
  creaciones: CreacionMundo[];
  encuentros: EncuentroMundo[];
}

/** Lo mínimo para dar de alta a alguien en el mundo. `agenteId` pasa a ser el id estable del habitante. */
export interface EntradaHabitante {
  id: string;
  nombre: string;
  agenteId?: string;
}

/** Una zona del escenario ya colocada en el plano (sale de `disponerSalas`). */
export interface ZonaSim {
  id: string;
  centro: { x: number; z: number };
  radio: number;
  /** Qué ocupación la atrae. Sin afinidad, ninguna ocupación va a ella. */
  afinidad: OcupacionMundo | null;
}

export interface OpcionesAvance {
  zonas?: readonly ZonaSim[];
  /** Radio del suelo habitable. Por defecto `RADIO_MUNDO`. */
  radioMundo?: number;
}

/* ───────────────────────────── Constantes ───────────────────────────── */

/** Radio del suelo por defecto: nadie se aleja más de esto del centro. */
export const RADIO_MUNDO = 24;
/** Altura máxima sobre el suelo (el avatar «flota» como mucho esto). */
export const ALTURA_MAX = 0.5;
/** Cuántas obras y encuentros recientes conserva el estado en memoria. */
export const TOPE_CREACIONES = 200;
export const TOPE_ENCUENTROS = 200;
/** Lo que se guarda en disco es menos, para que muchos escenarios quepan en el almacenamiento local. */
export const TOPE_GUARDADO = 80;
/** Ticks mínimos entre dos encuentros de la misma pareja (evita el relato repetido de quien se queda junto). */
export const ENFRIAMIENTO_ENCUENTRO = 12;
/** Máximo de ticks que se recuperan al abrir un mundo guardado tras una ausencia. */
export const TOPE_TICKS_AUSENCIA = 500;
/** Vínculos por habitante que se conservan (los más fuertes), para que el estado no crezca con n². */
const TOPE_VINCULOS = 64;

const TEMAS = [
  "vida", "arte", "tecnologia", "filosofia", "ciencia", "cultura", "futuro",
  "naturaleza", "sociedad", "conocimiento", "espiritualidad", "creatividad",
];
const TIPOS_OBRA = ["arte", "musica", "literatura", "tecnologia", "ciencia"];
const HUMORES = ["feliz", "neutral", "curioso"];

/* ───────────────────────────── Azar con semilla ───────────────────────────── */

function generarAleatorio(semilla: number): number {
  const s = (semilla * 9301 + 49297) % 233280;
  return s / 233280;
}

function aleatorioConSemilla(semilla: number, min: number, max: number): number {
  return min + generarAleatorio(semilla) * (max - min);
}

function acotar(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function distanciaXZ(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

/** Id con forma de UUID derivado de una semilla (para estados sin `agenteId`). */
function generarIdPredecible(semilla: number): string {
  let id = semilla.toString(16);
  while (id.length < 32) id += semilla.toString(16);
  return `${id.substring(0, 8)}-${id.substring(8, 12)}-${id.substring(12, 16)}-${id.substring(16, 20)}-${id.substring(20, 32)}`;
}

/* ───────────────────────────── Estado inicial ───────────────────────────── */

function nuevoHabitante(entrada: EntradaHabitante, indice: number): HabitanteMundo {
  return {
    id: entrada.agenteId ?? generarIdPredecible(indice + 1),
    personalidadId: entrada.id,
    nombre: entrada.nombre,
    posicion: [
      aleatorioConSemilla(indice + 1, -10, 10),
      aleatorioConSemilla(indice + 2, 0, ALTURA_MAX),
      aleatorioConSemilla(indice + 3, -10, 10),
    ],
    energia: aleatorioConSemilla(indice + 4, 0.5, 1.0),
    humor: HUMORES[Math.floor(aleatorioConSemilla(indice + 5, 0, HUMORES.length))] as string,
    ocupacion: "explorar",
    obras: 0,
    vinculos: {},
    zonaId: null,
  };
}

export function mundoInicial(personalidades: ReadonlyArray<EntradaHabitante>): EstadoMundo {
  return {
    tick: 0,
    habitantes: personalidades.map((p, i) => nuevoHabitante(p, i)),
    creaciones: [],
    encuentros: [],
  };
}

/**
 * Pone al día un mundo con los habitantes de HOY: conserva a quien sigue, da de alta a quien llega y
 * quita a quien ya no está (con sus vínculos, obras y encuentros, para no dejar «alguien desconocido»).
 * No muta el estado de entrada.
 */
export function reconciliarHabitantes(estado: EstadoMundo, entradas: ReadonlyArray<EntradaHabitante>): EstadoMundo {
  const habitantes: HabitanteMundo[] = [];
  entradas.forEach((entrada, indice) => {
    const clave = entrada.agenteId;
    const previo = estado.habitantes.find((h) =>
      clave !== undefined ? h.id === clave : h.personalidadId === entrada.id,
    );
    habitantes.push(previo ? { ...previo, nombre: entrada.nombre, vinculos: { ...previo.vinculos } } : nuevoHabitante(entrada, indice));
  });
  const vivos = new Set(habitantes.map((h) => h.id));
  for (const h of habitantes) {
    h.vinculos = Object.fromEntries(Object.entries(h.vinculos).filter(([id]) => vivos.has(id)));
  }
  return {
    tick: estado.tick,
    habitantes,
    creaciones: estado.creaciones.filter((c) => vivos.has(c.autor)),
    encuentros: estado.encuentros.filter((e) => vivos.has(e.a) && vivos.has(e.b)),
  };
}

/* ───────────────────────────── Un paso ───────────────────────────── */

function zonaDe(ocupacion: OcupacionMundo, zonas: readonly ZonaSim[]): ZonaSim | null {
  return zonas.find((z) => z.afinidad === ocupacion) ?? null;
}

function limitarVinculos(v: Record<string, number>): Record<string, number> {
  const entradas = Object.entries(v);
  if (entradas.length <= TOPE_VINCULOS) return v;
  return Object.fromEntries(entradas.sort((a, b) => b[1] - a[1]).slice(0, TOPE_VINCULOS));
}

function ultimoEncuentro(encuentros: readonly EncuentroMundo[], a: string, b: string): number {
  for (let i = encuentros.length - 1; i >= 0; i--) {
    const e = encuentros[i];
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e.tick;
  }
  return -Infinity;
}

function pasoUnico(estado: EstadoMundo, opciones: OpcionesAvance): EstadoMundo {
  const tick = estado.tick + 1;
  const zonas = opciones.zonas ?? [];
  const radioMundo = opciones.radioMundo ?? RADIO_MUNDO;
  const n = estado.habitantes.length;
  const nuevasCreaciones = [...estado.creaciones];

  /* 1 · Energía, ocupación y obras (cada habitante es una copia: el estado anterior no se toca). */
  const habitantes: HabitanteMundo[] = estado.habitantes.map((previo, j) => {
    const h: HabitanteMundo = { ...previo, posicion: [...previo.posicion], vinculos: { ...previo.vinculos } };
    const semilla = (tick + j + n) * 1000;

    switch (h.ocupacion) {
      case "descansar":
        h.energia = Math.min(1, h.energia + 0.1);
        break;
      case "crear":
        h.energia = Math.max(0, h.energia - 0.2);
        break;
      default:
        h.energia = Math.max(0, h.energia - 0.05);
    }
    h.energia = acotar(h.energia, 0, 1);

    if (h.energia < 0.2 && h.ocupacion !== "descansar") {
      h.ocupacion = "descansar";
    } else if (h.energia > 0.8 && aleatorioConSemilla(semilla, 0, 1) > 0.7) {
      h.ocupacion = aleatorioConSemilla(semilla + 1, 0, 1) > 0.5 ? "crear" : "explorar";
    } else if (aleatorioConSemilla(semilla + 2, 0, 1) > 0.9 && h.ocupacion !== "descansar") {
      h.ocupacion = "conversar";
    }

    if (h.ocupacion === "crear" && h.energia > 0.3 && aleatorioConSemilla(semilla + 6, 0, 1) > 0.8) {
      const tipo = TIPOS_OBRA[Math.floor(aleatorioConSemilla(semilla + 7, 0, TIPOS_OBRA.length))];
      nuevasCreaciones.push({ id: `obra:${tick}:${h.id}`, autor: h.id, tipo, titulo: `${tipo} de ${h.nombre}`, tick });
      h.obras += 1;
    }
    return h;
  });

  /* 2 · Zonas: cada habitante va a la zona que atrae a lo que hace; su sitio dentro de ella es estable. */
  const porZona = new Map<string, HabitanteMundo[]>();
  for (const h of habitantes) {
    const z = zonas.length > 0 ? zonaDe(h.ocupacion, zonas) : null;
    h.zonaId = z ? z.id : null;
    if (z) porZona.set(z.id, [...(porZona.get(z.id) ?? []), h]);
  }
  for (const grupo of porZona.values()) grupo.sort((a, b) => a.id.localeCompare(b.id));

  /* 3 · Movimiento: al sitio de su zona (si la hay) más un paseo suave; siempre dentro del suelo. */
  habitantes.forEach((h, j) => {
    const semilla = (tick + j + n) * 1000;
    const camina = h.ocupacion === "explorar" || h.ocupacion === "conversar";
    let [x, y, z] = h.posicion;

    const zona = h.zonaId ? zonas.find((q) => q.id === h.zonaId) : undefined;
    if (zona) {
      const grupo = porZona.get(zona.id) ?? [h];
      const destino = posicionEnPatron(
        { x: zona.centro.x, y: 0, z: zona.centro.z },
        zona.radio * FRACCION_RADIO_OCUPABLE,
        grupo.indexOf(h),
        grupo.length,
      );
      x += (destino.x - x) * 0.35;
      z += (destino.z - z) * 0.35;
    }
    if (camina) {
      x += aleatorioConSemilla(semilla + 3, -0.5, 0.5) * (zona ? 0.5 : 1);
      z += aleatorioConSemilla(semilla + 5, -0.5, 0.5) * (zona ? 0.5 : 1);
      y += aleatorioConSemilla(semilla + 4, -0.5, 0.5) * 0.4;
    } else {
      y *= 0.6; // quien crea o descansa se posa
    }

    const r = Math.sqrt(x * x + z * z);
    if (r > radioMundo) {
      x = (x / r) * radioMundo;
      z = (z / r) * radioMundo;
    }
    h.posicion = [x, acotar(y, 0, ALTURA_MAX), z];
  });

  /* 4 · Encuentros: entre quienes están cerca (en el suelo) y pueden hablar; cada pareja con su pausa. */
  const nuevosEncuentros = [...estado.encuentros];
  for (let j = 0; j < habitantes.length; j++) {
    for (let k = j + 1; k < habitantes.length; k++) {
      const a = habitantes[j];
      const b = habitantes[k];
      const hablan = (o: OcupacionMundo) => o === "conversar" || o === "explorar";
      if (!hablan(a.ocupacion) || !hablan(b.ocupacion)) continue;
      if (distanciaXZ(a.posicion, b.posicion) >= 1.0) continue;
      if (tick - ultimoEncuentro(nuevosEncuentros, a.id, b.id) < ENFRIAMIENTO_ENCUENTRO) continue;

      const semilla = (tick + j + n) * 1000;
      const tema = TEMAS[Math.floor(aleatorioConSemilla(semilla + 8 + k, 0, TEMAS.length))];
      nuevosEncuentros.push({ a: a.id, b: b.id, tick, tema });
      const fuerza = Math.min(1, (a.vinculos[b.id] ?? 0) + 0.1);
      a.vinculos[b.id] = fuerza;
      b.vinculos[a.id] = fuerza;
    }
  }
  for (const h of habitantes) h.vinculos = limitarVinculos(h.vinculos);

  return {
    tick,
    habitantes,
    creaciones: nuevasCreaciones.slice(-TOPE_CREACIONES),
    encuentros: nuevosEncuentros.slice(-TOPE_ENCUENTROS),
  };
}

export function avanzar(estado: EstadoMundo, pasos: number = 1, opciones: OpcionesAvance = {}): EstadoMundo {
  const total = Number.isFinite(pasos) ? Math.max(0, Math.floor(pasos)) : 0;
  let actual = estado;
  for (let i = 0; i < total; i++) actual = pasoUnico(actual, opciones);
  return actual;
}

/* ───────────────────────────── Decisión del temporizador ─────────────────────────────
 * Decisión de avance de un tick del temporizador, en forma pura para poder probarla: la pausa
 * detiene el tick (0 pasos y nada que acumular); con la pestaña oculta no se avanza pero se
 * acumula con tope, y al volver se descuenta el bloque acumulado avanzando 1 solo paso por tick. */
export const TOPE_PASOS_PENDIENTES = 4;

export interface EntradaTick {
  pausado: boolean;
  pestañaOculta: boolean;
  pasosPendientes: number;
}

export function pasosParaTick(entrada: EntradaTick): { pasos: number; pasosPendientes: number } {
  if (entrada.pausado) return { pasos: 0, pasosPendientes: 0 };
  if (entrada.pestañaOculta) {
    return { pasos: 0, pasosPendientes: Math.min(entrada.pasosPendientes + 1, TOPE_PASOS_PENDIENTES) };
  }
  // Al volver con pasos pendientes se avanza 1 solo paso y se descarta el resto del bloque para no
  // congelar el navegador con una ráfaga.
  return { pasos: 1, pasosPendientes: 0 };
}

/** Azúcar mínima sobre `pasosParaTick`: ¿este pulso del temporizador debe avanzar la simulación? */
export function debeAvanzar(entrada: { pausado: boolean; oculta: boolean }): boolean {
  return !entrada.pausado && !entrada.oculta;
}

/* ───────────────────────────── Guardado y carga ───────────────────────────── */

const MUNDO_STORAGE_KEY = "starseed.mundo.avatares.v1";

/** Clave de un mundo guardado. Sin escenario es la clave histórica (un único mundo). */
export function claveMundo(escenarioId?: string): string {
  return escenarioId ? `${MUNDO_STORAGE_KEY}.${escenarioId}` : MUNDO_STORAGE_KEY;
}

function almacenLocal(): Storage | null {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null ? localStorage : null;
  } catch {
    return null;
  }
}

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const esRegistro = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function sanearHabitante(v: unknown): HabitanteMundo | null {
  if (!esRegistro(v) || !esTexto(v.id) || !esTexto(v.nombre)) return null;
  const pos = Array.isArray(v.posicion) ? v.posicion : [];
  const ocupacion = OCUPACIONES_MUNDO.find((o) => o === v.ocupacion) ?? "explorar";
  const vinculos: Record<string, number> = {};
  if (esRegistro(v.vinculos)) {
    for (const [id, fuerza] of Object.entries(v.vinculos).slice(0, TOPE_VINCULOS)) {
      if (esNumero(fuerza)) vinculos[id] = acotar(fuerza, 0, 1);
    }
  }
  return {
    id: v.id,
    personalidadId: esTexto(v.personalidadId) ? v.personalidadId : v.id,
    nombre: v.nombre.slice(0, 120),
    posicion: [
      acotar(esNumero(pos[0]) ? pos[0] : 0, -RADIO_MUNDO * 4, RADIO_MUNDO * 4),
      acotar(esNumero(pos[1]) ? pos[1] : 0, 0, ALTURA_MAX),
      acotar(esNumero(pos[2]) ? pos[2] : 0, -RADIO_MUNDO * 4, RADIO_MUNDO * 4),
    ],
    energia: acotar(esNumero(v.energia) ? v.energia : 0.7, 0, 1),
    humor: esTexto(v.humor) ? v.humor.slice(0, 40) : "neutral",
    ocupacion,
    obras: esNumero(v.obras) ? Math.max(0, Math.floor(v.obras)) : 0,
    vinculos,
    zonaId: esTexto(v.zonaId) ? v.zonaId : null,
  };
}

/** Estado de fuera (disco, otro dispositivo) → estado válido, o `null` si no hay nada aprovechable. */
export function sanearEstado(v: unknown): EstadoMundo | null {
  if (!esRegistro(v) || !esNumero(v.tick) || !Array.isArray(v.habitantes)) return null;
  const habitantes: HabitanteMundo[] = [];
  const vistos = new Set<string>();
  for (const crudo of v.habitantes) {
    const h = sanearHabitante(crudo);
    if (h && !vistos.has(h.id)) {
      vistos.add(h.id);
      habitantes.push(h);
    }
  }
  const creaciones: CreacionMundo[] = [];
  for (const c of Array.isArray(v.creaciones) ? v.creaciones : []) {
    if (esRegistro(c) && esTexto(c.id) && esTexto(c.autor) && vistos.has(c.autor) && esNumero(c.tick)) {
      creaciones.push({ id: c.id, autor: c.autor, tipo: String(c.tipo ?? "arte").slice(0, 40), titulo: String(c.titulo ?? "").slice(0, 160), tick: c.tick });
    }
  }
  const encuentros: EncuentroMundo[] = [];
  for (const e of Array.isArray(v.encuentros) ? v.encuentros : []) {
    if (esRegistro(e) && esTexto(e.a) && esTexto(e.b) && vistos.has(e.a) && vistos.has(e.b) && esNumero(e.tick)) {
      encuentros.push({ a: e.a, b: e.b, tick: e.tick, tema: String(e.tema ?? "vida").slice(0, 40) });
    }
  }
  return {
    tick: Math.max(0, Math.floor(v.tick)),
    habitantes,
    creaciones: creaciones.slice(-TOPE_CREACIONES),
    encuentros: encuentros.slice(-TOPE_ENCUENTROS),
  };
}

/**
 * Guarda el mundo en este aparato. Devuelve `false` si no cabe o no hay almacenamiento (modo
 * privado, cuota llena): quien llama lo dice, no lo calla. Solo se guarda lo reciente.
 */
export function guardarMundo(estado: EstadoMundo, escenarioId?: string): boolean {
  const almacen = almacenLocal();
  if (!almacen) return false;
  const reducido: EstadoMundo = {
    ...estado,
    creaciones: estado.creaciones.slice(-TOPE_GUARDADO),
    encuentros: estado.encuentros.slice(-TOPE_GUARDADO),
  };
  try {
    almacen.setItem(claveMundo(escenarioId), JSON.stringify({ estado: reducido, timestamp: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Borra el mundo guardado de un escenario (al borrar el escenario). */
export function olvidarMundo(escenarioId?: string): void {
  try {
    almacenLocal()?.removeItem(claveMundo(escenarioId));
  } catch {
    /* sin almacenamiento no hay nada que olvidar */
  }
}

export interface OpcionesCarga extends OpcionesAvance {
  /** Reloj inyectable para probar. */
  ahora?: number;
  /** `false` = cargar tal cual, sin recuperar los ticks de la ausencia. */
  recuperarAusencia?: boolean;
}

/**
 * Carga el mundo guardado. Si pasó tiempo, lo pone al día con un tope (`TOPE_TICKS_AUSENCIA`) para no
 * bloquear el navegador. Devuelve `null` si no hay nada o está dañado.
 */
export function cargarMundo(escenarioId?: string, opciones: OpcionesCarga = {}): EstadoMundo | null {
  const almacen = almacenLocal();
  if (!almacen) return null;
  let bruto: string | null;
  try {
    bruto = almacen.getItem(claveMundo(escenarioId));
  } catch {
    return null;
  }
  if (!bruto) return null;
  try {
    const dato: unknown = JSON.parse(bruto);
    if (!esRegistro(dato)) return null;
    const estado = sanearEstado(dato.estado);
    if (!estado) return null;
    if (opciones.recuperarAusencia === false) return estado;
    const marca = esNumero(dato.timestamp) ? dato.timestamp : (opciones.ahora ?? Date.now());
    const segundos = Math.max(0, ((opciones.ahora ?? Date.now()) - marca) / 1000);
    const pasos = Math.min(Math.floor(segundos), TOPE_TICKS_AUSENCIA);
    return pasos > 0 ? avanzar(estado, pasos, opciones) : estado;
  } catch {
    return null;
  }
}
