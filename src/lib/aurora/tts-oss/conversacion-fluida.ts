/**
 * CONVERSACIÓN FLUIDA (VZR1011D) — plática por latencia MEDIDA, nunca teórica.
 * ─────────────────────────────────────────────────────────────────────────────
 *  · El motor se elige con el primer sonido MEDIDO en esta neurona (y su factor
 *    de tiempo real), dentro del presupuesto de conversación (≤ 0,8 s).
 *  · La primera frase se habla mientras el modelo sigue escribiendo; la siguiente
 *    se sintetiza mientras suena la anterior (`frasesListas` + `planificarTandas`).
 *  · Si la persona habla, se corta al instante (≤ 100 ms) y se escucha.
 *  · Capas: aparato › otra neurona local › malla › Spaces › voz del sistema. Lo
 *    que no llega al presupuesto pasa al siguiente sin dejar silencios.
 *
 * Todo es PURO: relojes y motores se simulan en las pruebas; no toca red ni disco.
 * La lectura/narración manda por calidad; la conversación, por latencia medida.
 */

import { trocearTexto } from "@/lib/voces/trocear";

export const PRESUPUESTO_PRIMER_SONIDO_MS = 800;
export const INTERRUPCION_MAX_MS = 100;
/** Ritmo de habla de referencia (caracteres por segundo) para estimar duraciones. */
export const CARACTERES_POR_SEGUNDO = 14;

export type CapaVoz = "aparato" | "neurona-local" | "malla" | "spaces" | "sistema";
export const ORDEN_CAPAS: readonly CapaVoz[] = ["aparato", "neurona-local", "malla", "spaces", "sistema"];
export type ModoVoz = "conversacion" | "lectura";

/** Lo medido en ESTA neurona para un motor (mediana de `medidas-voz.ts`). */
export interface MedidaMotorVoz {
  primerSonidoMs: number | null;
  factorTiempoReal?: number | null;
  muestras?: number;
}

export interface CandidatoVoz {
  motor: string;
  capa: CapaVoz;
  medida?: MedidaMotorVoz | null;
  /** Calidad editorial (0..1) para el modo lectura. */
  calidad?: number;
  idioma?: string | null;
  disponible?: boolean;
}

export interface OpcionesVoz {
  presupuestoMs?: number;
  modo?: ModoVoz;
  idioma?: string | null;
  caracteresPorSegundo?: number;
}

export interface DescarteVoz {
  motor: string;
  motivo: "no-disponible" | "idioma" | "presupuesto" | "sin-medida" | "hueco";
}

export interface EleccionVoz {
  motor: string | null;
  capa: CapaVoz | null;
  primerSonidoMs: number | null;
  factorTiempoReal: number | null;
  medido: boolean;
  cabeEnPresupuesto: boolean;
  descartados: DescarteVoz[];
}

export interface TandaVoz {
  texto: string;
  inicioSintesisMs: number;
  primerSonidoMs: number;
  finMs: number;
  huecoMs: number;
  duracionMs: number;
}

export interface PlanVoz {
  motor: string | null;
  capa: CapaVoz | null;
  tandas: TandaVoz[];
  primerSonidoMs: number | null;
  huecoMaximoMs: number;
  cabeEnPresupuesto: boolean;
  descartados: DescarteVoz[];
}

export type FaseVoz = "sintetizando" | "hablando" | "escuchando";

export interface EstadoVoz {
  fase: FaseVoz;
  desde: number;
  motor: string | null;
}

export interface CorteVoz {
  estado: EstadoVoz;
  efectos: Array<"cortar-audio" | "escuchar">;
  latenciaMs: number;
  dentroDelPresupuesto: boolean;
}

const numeroPositivo = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const idiomaBase = (v: unknown): string | null => {
  const base = typeof v === "string" ? v.trim().toLowerCase().split(/[-_]/)[0] : "";
  return /^[a-z]{2,3}$/.test(base) ? base : null;
};

const rangoCapa = (capa: CapaVoz): number => {
  const i = ORDEN_CAPAS.indexOf(capa);
  return i < 0 ? ORDEN_CAPAS.length : i;
};

/** Capa por defecto de los motores ya conocidos (el resto, en la malla). */
export function capaDeMotor(motor: string): CapaVoz {
  const id = (motor ?? "").trim().toLowerCase();
  if (id === "browser" || id === "navegador" || id === "sistema") return "sistema";
  if (id === "kokoro" || id === "kitten" || id === "chatterbox") return "aparato";
  if (id === "voice158" || id === "vibevoice" || id === "voicebox") return "neurona-local";
  if (id === "openvoice2" || id === "omnivoice" || id === "voxcpm" || id === "bark" || id === "gpt-sovits") return "spaces";
  return "malla";
}

const mediana = (valores: number[]): number | null => {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** De las medidas crudas de la neurona a la mediana por motor. Puro. */
export function resumirMedidas(
  medidas: readonly { motor: string; tipo: string; valor: number }[] | null | undefined,
): Record<string, MedidaMotorVoz> {
  const grupos = new Map<string, { ps: number[]; rtf: number[] }>();
  for (const m of Array.isArray(medidas) ? medidas : []) {
    if (!m || typeof m.motor !== "string" || !m.motor.trim() || !numeroPositivo(m.valor)) continue;
    if (m.tipo !== "primer-sonido" && m.tipo !== "tiempo-real-voz") continue;
    const g = grupos.get(m.motor) ?? { ps: [], rtf: [] };
    if (m.tipo === "primer-sonido") g.ps.push(m.valor);
    else g.rtf.push(m.valor);
    grupos.set(m.motor, g);
  }
  const salida: Record<string, MedidaMotorVoz> = {};
  for (const [motor, g] of grupos) {
    salida[motor] = {
      primerSonidoMs: (() => {
        const ps = mediana(g.ps);
        return ps === null ? null : Math.round(ps);
      })(),
      factorTiempoReal: mediana(g.rtf),
      muestras: g.ps.length + g.rtf.length,
    };
  }
  return salida;
}

/** Frases completas listas para hablar y el resto que aún está escribiéndose. */
export function frasesListas(
  texto: string,
  maxCaracteres = 180,
): { frases: string[]; resto: string } {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return { frases: [], resto: "" };
  const max = Math.max(20, Math.round(maxCaracteres));
  const fin = limpio.match(/^([\s\S]*[.!?…])(?=\s|$)/);
  const completas = fin ? fin[1].trim() : "";
  let resto = fin ? limpio.slice(fin[1].length).trim() : limpio;
  const frases: string[] = [];
  if (completas) frases.push(...trocearTexto(completas, max));
  if (resto.length > max) {
    const partes = trocearTexto(resto, max);
    resto = partes.pop() ?? "";
    frases.push(...partes);
  }
  return { frases, resto: resto.trim() };
}

/** Duración estimada de la locución (sin contar la síntesis). */
export function estimarDuracionMs(
  texto: string,
  caracteresPorSegundo = CARACTERES_POR_SEGUNDO,
): number {
  const caracteres = Math.max(1, (texto ?? "").replace(/\s+/g, " ").trim().length);
  const cps = numeroPositivo(caracteresPorSegundo) && caracteresPorSegundo > 0
    ? caracteresPorSegundo
    : CARACTERES_POR_SEGUNDO;
  return Math.max(1, Math.round((caracteres / cps) * 1000));
}

const primerSonidoDe = (c: CandidatoVoz): number | null =>
  numeroPositivo(c.medida?.primerSonidoMs) ? c.medida!.primerSonidoMs! : null;

const factorDe = (c: CandidatoVoz): number => {
  const f = c.medida?.factorTiempoReal;
  return typeof f === "number" && Number.isFinite(f) && f > 0 ? f : 1;
};

const calidadDe = (c: CandidatoVoz): number =>
  typeof c.calidad === "number" && Number.isFinite(c.calidad) ? c.calidad : 0;

/** ¿Este candidato sirve para el idioma pedido? Sin idioma declarado, sí. */
const sirveIdioma = (c: CandidatoVoz, idioma: string | null): boolean =>
  !idioma || !c.idioma || idiomaBase(c.idioma) === idioma;

/** Orden por capas y, dentro de la capa, por latencia MEDIDA (nunca la teórica). */
function ordenConversacion(candidatos: readonly CandidatoVoz[], presupuesto: number): CandidatoVoz[] {
  const caben = candidatos
    .filter((c) => primerSonidoDe(c) !== null && primerSonidoDe(c)! <= presupuesto)
    .sort((a, b) =>
      rangoCapa(a.capa) - rangoCapa(b.capa) ||
      primerSonidoDe(a)! - primerSonidoDe(b)! ||
      factorDe(a) - factorDe(b) ||
      a.motor.localeCompare(b.motor));
  const sinMedida = candidatos
    .filter((c) => primerSonidoDe(c) === null)
    .sort((a, b) => rangoCapa(a.capa) - rangoCapa(b.capa) || a.motor.localeCompare(b.motor));
  const lentos = candidatos
    .filter((c) => primerSonidoDe(c) !== null && primerSonidoDe(c)! > presupuesto)
    .sort((a, b) => rangoCapa(a.capa) - rangoCapa(b.capa) || primerSonidoDe(a)! - primerSonidoDe(b)!);
  return [...caben, ...sinMedida, ...lentos];
}

/** En lectura manda la calidad; la latencia solo desempata. */
function ordenLectura(candidatos: readonly CandidatoVoz[]): CandidatoVoz[] {
  return [...candidatos].sort((a, b) =>
    calidadDe(b) - calidadDe(a) ||
    rangoCapa(a.capa) - rangoCapa(b.capa) ||
    (primerSonidoDe(a) ?? Number.POSITIVE_INFINITY) - (primerSonidoDe(b) ?? Number.POSITIVE_INFINITY) ||
    a.motor.localeCompare(b.motor));
}

function candidatosVivos(
  candidatos: readonly CandidatoVoz[],
  idioma: string | null,
): CandidatoVoz[] {
  return (Array.isArray(candidatos) ? candidatos : []).filter(
    (c) => c && typeof c.motor === "string" && c.motor.trim() !== "" && c.disponible !== false && sirveIdioma(c, idioma),
  );
}

export function elegirMotorVoz(
  candidatos: readonly CandidatoVoz[],
  opciones: OpcionesVoz = {},
): EleccionVoz {
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_PRIMER_SONIDO_MS;
  const vivos = candidatosVivos(candidatos, idiomaBase(opciones.idioma) ?? null);
  const orden = opciones.modo === "lectura" ? ordenLectura(vivos) : ordenConversacion(vivos, presupuesto);
  const elegido = orden[0] ?? null;
  const primerSonidoMs = elegido ? primerSonidoDe(elegido) : null;
  const descartados: DescarteVoz[] = [];
  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    if (c === elegido) continue;
    if (!c || typeof c.motor !== "string" || c.disponible === false) descartados.push({ motor: c?.motor ?? "?", motivo: "no-disponible" });
    else if (!sirveIdioma(c, idiomaBase(opciones.idioma) ?? null)) descartados.push({ motor: c.motor, motivo: "idioma" });
    else if (primerSonidoDe(c) === null) descartados.push({ motor: c.motor, motivo: "sin-medida" });
    else if (primerSonidoDe(c)! > presupuesto && opciones.modo !== "lectura") descartados.push({ motor: c.motor, motivo: "presupuesto" });
  }
  return {
    motor: elegido?.motor ?? null,
    capa: elegido?.capa ?? null,
    primerSonidoMs,
    factorTiempoReal: elegido ? factorDe(elegido) : null,
    medido: primerSonidoMs !== null,
    cabeEnPresupuesto: primerSonidoMs !== null && primerSonidoMs <= presupuesto,
    descartados,
  };
}

/**
 * Reordena una cadena ya construida con lo MEDIDO en esta neurona: primero los
 * que caben en el presupuesto (por capa y latencia medida), luego los que aún no
 * tienen medida (su sitio original) y al final los que se pasan de presupuesto.
 */
export function ordenarCadenaPorLatencia(
  cadena: readonly string[],
  medidas: Record<string, MedidaMotorVoz> | null | undefined,
  opciones: OpcionesVoz = {},
): string[] {
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_PRIMER_SONIDO_MS;
  if (opciones.modo === "lectura") return [...cadena];
  const indiceEnCadena = (motor: string): number => cadena.indexOf(motor);
  const candidatos = cadena.map((motor) => ({
    motor,
    capa: capaDeMotor(motor),
    medida: medidas?.[motor] ?? null,
  }));
  const caben = candidatos
    .filter((c) => primerSonidoDe(c) !== null && primerSonidoDe(c)! <= presupuesto)
    .sort((a, b) =>
      rangoCapa(a.capa) - rangoCapa(b.capa) ||
      primerSonidoDe(a)! - primerSonidoDe(b)! ||
      factorDe(a) - factorDe(b) ||
      indiceEnCadena(a.motor) - indiceEnCadena(b.motor));
  const sinMedida = candidatos.filter((c) => primerSonidoDe(c) === null);
  const lentos = candidatos
    .filter((c) => primerSonidoDe(c) !== null && primerSonidoDe(c)! > presupuesto)
    .sort((a, b) => primerSonidoDe(a)! - primerSonidoDe(b)!);
  return [...caben, ...sinMedida, ...lentos].map((c) => c.motor);
}

/** Simula la locución de los trozos con un motor medido: huecos entre tandas. */
function simularTandas(
  trozos: readonly string[],
  primerSonidoMs: number,
  factorTiempoReal: number,
  caracteresPorSegundo: number,
): { tandas: TandaVoz[]; huecoMaximoMs: number } {
  let finPrevio = 0;
  let inicioPrevio = 0;
  let huecoMaximoMs = 0;
  const tandas: TandaVoz[] = [];
  for (let i = 0; i < trozos.length; i++) {
    const duracionMs = estimarDuracionMs(trozos[i], null, caracteresPorSegundo);
    const sintesisMs = i === 0
      ? primerSonidoMs
      : Math.max(1, Math.round(duracionMs * factorTiempoReal));
    // La siguiente se sintetiza mientras suena la anterior (justo a tiempo).
    const inicioSintesisMs = i === 0 ? 0 : Math.max(inicioPrevio, finPrevio - sintesisMs);
    const primerSonido = Math.max(finPrevio, inicioSintesisMs + sintesisMs);
    const huecoMs = Math.max(0, primerSonido - finPrevio);
    huecoMaximoMs = Math.max(huecoMaximoMs, huecoMs);
    const finMs = primerSonido + duracionMs;
    tandas.push({ texto: trozos[i], inicioSintesisMs, primerSonidoMs: primerSonido, finMs, huecoMs, duracionMs });
    inicioPrevio = primerSonido;
    finPrevio = finMs;
  }
  return { tandas, huecoMaximoMs };
}

/**
 * Plan de tandas para un turno: elige el primer motor medido que cumple el
 * presupuesto TANTO en el primer sonido como en los huecos entre frases. Si un
 * motor se pasa, se prueba el siguiente (relevo sin silencios).
 */
export function planificarTandas(
  trozos: readonly string[],
  candidatos: readonly CandidatoVoz[],
  opciones: OpcionesVoz = {},
): PlanVoz {
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_PRIMER_SONIDO_MS;
  const cps = opciones.caracteresPorSegundo ?? CARACTERES_POR_SEGUNDO;
  const limpios = (Array.isArray(trozos) ? trozos : []).map((t) => (t ?? "").trim()).filter(Boolean);
  const vacio: PlanVoz = { motor: null, capa: null, tandas: [], primerSonidoMs: null, huecoMaximoMs: 0, cabeEnPresupuesto: false, descartados: [] };
  if (!limpios.length) return vacio;
  const vivos = candidatosVivos(candidatos, idiomaBase(opciones.idioma) ?? null);
  const orden = opciones.modo === "lectura" ? ordenLectura(vivos) : ordenConversacion(vivos, presupuesto);
  const descartados: DescarteVoz[] = [];
  for (const c of orden) {
    const primer = primerSonidoDe(c);
    if (primer === null) {
      descartados.push({ motor: c.motor, motivo: "sin-medida" });
      continue;
    }
    if (primer > presupuesto) {
      descartados.push({ motor: c.motor, motivo: "presupuesto" });
      continue;
    }
    const sim = simularTandas(limpios, primer, factorDe(c), cps);
    if (sim.huecoMaximoMs > presupuesto) {
      descartados.push({ motor: c.motor, motivo: "hueco" });
      continue;
    }
    return {
      motor: c.motor,
      capa: c.capa,
      tandas: sim.tandas,
      primerSonidoMs: sim.tandas[0]?.primerSonidoMs ?? null,
      huecoMaximoMs: sim.huecoMaximoMs,
      cabeEnPresupuesto: primer <= presupuesto,
      descartados,
    };
  }
  return { ...vacio, descartados };
}

export function crearEstadoVoz(ahora = 0, motor: string | null = null): EstadoVoz {
  return { fase: "sintetizando", desde: ahora, motor };
}

/**
 * La persona empieza a hablar: corta el audio al instante (`retardoCorteMs` es
 * solo para pruebas de un motor lento) y pasa a escuchar. Devuelve los efectos
 * que el llamador debe ejecutar; aquí no se toca audio.
 */
export function interrumpirVoz(
  estado: EstadoVoz,
  detectadaEn: number,
  opciones: { retardoCorteMs?: number } = {},
): CorteVoz {
  const retardoMs = Math.max(0, Math.round(opciones.retardoCorteMs ?? 0));
  const corteEn = Math.max(estado.desde, detectadaEn) + retardoMs;
  return {
    estado: { ...estado, fase: "escuchando", desde: corteEn },
    efectos: ["cortar-audio", "escuchar"],
    latenciaMs: retardoMs,
    dentroDelPresupuesto: retardoMs <= INTERRUPCION_MAX_MS,
  };
}
