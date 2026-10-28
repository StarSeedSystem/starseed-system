/**
 * Plática fluida — VZR1011D · contrato `architecture/astraura-voces-y-robots.md` §2.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decide con qué motor se habla en una CONVERSACIÓN por la latencia MEDIDA en
 * esta neurona (primer audio y factor de tiempo real), no por la ficha teórica.
 * Presupuesto: ≤ 800 ms hasta el primer sonido; lo que no llega pasa al
 * siguiente eslabón sin dejar silencios. En lectura o narración manda la
 * calidad. Las capas se respetan: aparato › otra neurona de la cuenta › malla
 * del grupo › Spaces › voz del sistema.
 *
 * Empieza a hablar con la primera frase mientras el modelo de lenguaje sigue
 * escribiendo (`trocear.ts`) y pide la siguiente mientras suena la anterior.
 * Si la persona empieza a hablar, el interruptor mide el corte (< 100 ms).
 *
 * PURO: sin red, disco, DOM ni `node:*`; relojes y motores se inyectan en las
 * pruebas. No sustituye a `engine-registry` ni a `speak-router`: les da el
 * orden y el plan; el registro sigue siendo la fuente de los motores.
 */

import { trocearTexto } from "@/lib/voces/trocear";

/** Contexto de uso: la conversación exige rapidez; leer o narrar, calidad. */
export type ContextoVoz = "conversacion" | "lectura" | "narracion";

/** Capas de la voz, de la más cercana a la más lejana. */
export type CapaVoz = "aparato" | "neurona-cuenta" | "malla-grupo" | "spaces" | "sistema";

/** Orden duro de las capas (el mismo del contrato §2.4). */
export const ORDEN_CAPAS: readonly CapaVoz[] = [
  "aparato",
  "neurona-cuenta",
  "malla-grupo",
  "spaces",
  "sistema",
];

/** Presupuesto de conversación hasta el primer sonido, en ms. */
export const PRESUPUESTO_PRIMER_SONIDO_MS = 800;

/** Tope del corte cuando la persona empieza a hablar, en ms. */
export const PRESUPUESTO_INTERRUPCION_MS = 100;

/** Trozo máximo en conversación (frases cortas = arranque antes). */
export const MAX_TROZO_CONVERSACION = 160;

/** Trozo máximo al leer o narrar (manda la calidad, no la prisa). */
export const MAX_TROZO_LECTURA = 280;

/** Ritmo estimado del habla en español, en palabras por segundo. */
export const PALABRAS_POR_SEGUNDO = 2.5;

/** Muestras recientes que se resumen por motor (la mediana evita un pico suelto). */
export const MAX_MUESTRAS_POR_MOTOR = 5;

/** Una medida REAL guardada por `medidas-voz.ts`, vista desde este módulo. */
export interface MuestraLatencia {
  motor: string;
  tipo: "primer-sonido" | "tiempo-real-voz";
  valor: number;
  timestamp?: number;
}

/** Lo medido para un motor, ya resumido. `undefined` = aún no hay medida. */
export interface ResumenLatencia {
  primerSonidoMs?: number;
  factorTiempoReal?: number;
  muestrasPrimerSonido: number;
  muestrasTiempoReal: number;
}

/** Un motor disponible y de qué capa es. */
export interface MotorCandidato {
  motor: string;
  capa?: CapaVoz;
  /** Calidad editorial 0..5 (para lectura/narración). */
  calidad?: number;
}

/** Opciones del orden y de la elección. */
export interface OpcionesFluidez {
  contexto?: ContextoVoz;
  presupuestoMs?: number;
  /** true = si no hay NINGUNA medida, no tocar el orden de entrada. */
  respetarOrdenBase?: boolean;
}

/** Un tramo de voz planificado en la línea de tiempo (ms desde el inicio). */
export interface TramoPlan {
  indice: number;
  texto: string;
  pideEnMs: number;
  suenaEnMs: number;
  terminaEnMs: number;
  duracionMs: number;
  silencioMs: number;
}

/** El plan completo de una locución fluida. */
export interface PlanFluidez {
  motor: string | null;
  capa: CapaVoz | null;
  frases: string[];
  tramos: TramoPlan[];
  cumplePresupuesto: boolean;
  silencioMaximoMs: number;
  motivo: string;
  respaldo: string[];
}

/** Lo que devuelve el interruptor al cortar la voz. */
export interface ResultadoInterrupcion {
  latenciaMs: number;
  cumple: boolean;
}

/** Capa conocida de los motores del registro (lo demás se trata como aparato). */
const CAPA_POR_MOTOR: Record<string, CapaVoz> = {
  voice158: "aparato",
  vibevoice: "aparato",
  voxcpm: "aparato",
  voicebox: "aparato",
  "gpt-sovits": "aparato",
  bark: "aparato",
  omnivoice: "aparato",
  chatterbox: "aparato",
  kokoro: "aparato",
  kitten: "aparato",
  supertonic: "aparato",
  openvoice2: "spaces",
  browser: "sistema",
  sistema: "sistema",
};

/** Capa de un motor; los desconocidos se consideran del aparato (el más barato). */
export function capaDeMotor(motor: string): CapaVoz {
  return CAPA_POR_MOTOR[motor] ?? "aparato";
}

/** Posición de una capa en el orden duro (menor = más cercana). */
export function indiceCapa(capa: CapaVoz): number {
  const i = ORDEN_CAPAS.indexOf(capa);
  return i >= 0 ? i : ORDEN_CAPAS.length;
}

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Mediana de una lista no vacía (ordena una copia; no muta la entrada). */
function mediana(valores: readonly number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/**
 * resumeLatencia — agrupa las muestras por motor y se queda con las
 * `MAX_MUESTRAS_POR_MOTOR` más recientes de cada tipo, en MEDIANA. Una medida
 * mala suelta no condena al motor ni lo corona. PURA.
 */
export function resumeLatencia(
  muestras: readonly MuestraLatencia[],
  maxPorMotor: number = MAX_MUESTRAS_POR_MOTOR,
): Record<string, ResumenLatencia> {
  const porMotor = new Map<string, { ps: number[]; rtf: number[] }>();
  for (const m of muestras) {
    if (!m || typeof m.motor !== "string" || !m.motor || !esNumero(m.valor) || m.valor <= 0) continue;
    if (m.tipo !== "primer-sonido" && m.tipo !== "tiempo-real-voz") continue;
    const grupo = porMotor.get(m.motor) ?? { ps: [], rtf: [] };
    if (m.tipo === "primer-sonido") grupo.ps.push(m.valor);
    else grupo.rtf.push(m.valor);
    porMotor.set(m.motor, grupo);
  }
  const resumen: Record<string, ResumenLatencia> = {};
  for (const [motor, grupo] of porMotor) {
    const tope = Math.max(1, Math.floor(maxPorMotor));
    const ps = grupo.ps.slice(-tope);
    const rtf = grupo.rtf.slice(-tope);
    resumen[motor] = {
      primerSonidoMs: ps.length ? mediana(ps) : undefined,
      factorTiempoReal: rtf.length ? mediana(rtf) : undefined,
      muestrasPrimerSonido: ps.length,
      muestrasTiempoReal: rtf.length,
    };
  }
  return resumen;
}

/** ¿El motor cumple el presupuesto con lo MEDIDO aquí? Sin medida, no se promete. */
export function cumplePresupuesto(
  resumen: ResumenLatencia | undefined,
  presupuestoMs: number = PRESUPUESTO_PRIMER_SONIDO_MS,
): boolean {
  return !!resumen && esNumero(resumen.primerSonidoMs) && resumen.primerSonidoMs <= presupuestoMs;
}

interface MotorConIndice {
  motor: MotorCandidato;
  indice: number;
  capa: CapaVoz;
  resumen?: ResumenLatencia;
  cumple: boolean;
}

/**
 * ordenarMotores — ordena los candidatos para hablar AHORA.
 *  · conversación: primero los medidos que caben en el presupuesto (más rápido
 *    primero), después los no medidos (por capa y orden de entrada) y al final
 *    los medidos que no caben. Lo que no llega pasa al siguiente sin silencio.
 *  · lectura/narración: manda la calidad; la latencia solo desempata.
 * Sin ninguna medida y `respetarOrdenBase`, devuelve el orden de entrada.
 * PURA: no muta `motores`.
 */
export function ordenarMotores(
  motores: readonly MotorCandidato[],
  muestras: readonly MuestraLatencia[],
  opciones: OpcionesFluidez = {},
): MotorCandidato[] {
  const contexto = opciones.contexto ?? "conversacion";
  const presupuesto = esNumero(opciones.presupuestoMs) && opciones.presupuestoMs > 0
    ? opciones.presupuestoMs
    : PRESUPUESTO_PRIMER_SONIDO_MS;
  const resumen = resumeLatencia(muestras);
  const vistos = new Set<string>();
  const lista: MotorConIndice[] = [];
  motores.forEach((m, indice) => {
    if (!m || typeof m.motor !== "string" || !m.motor || vistos.has(m.motor)) return;
    vistos.add(m.motor);
    const capa = m.capa ?? capaDeMotor(m.motor);
    const r = resumen[m.motor];
    lista.push({ motor: { ...m, capa }, indice, capa, resumen: r, cumple: cumplePresupuesto(r, presupuesto) });
  });

  const hayMedidas = lista.some((x) => x.resumen);
  if (!hayMedidas && opciones.respetarOrdenBase) return lista.map((x) => x.motor);

  const latencia = (x: MotorConIndice): number =>
    esNumero(x.resumen?.primerSonidoMs) ? (x.resumen as ResumenLatencia).primerSonidoMs as number : Number.POSITIVE_INFINITY;
  const rtf = (x: MotorConIndice): number =>
    esNumero(x.resumen?.factorTiempoReal) ? (x.resumen as ResumenLatencia).factorTiempoReal as number : Number.POSITIVE_INFINITY;
  const calidad = (x: MotorConIndice): number => (esNumero(x.motor.calidad) ? x.motor.calidad as number : 0);

  const orden = [...lista];
  if (contexto === "conversacion") {
    const grupo = (x: MotorConIndice): number => (x.cumple ? 0 : x.resumen ? 2 : 1);
    // Primero lo que cabe (o aún no se ha medido); dentro de ese grupo mandan las
    // CAPAS del contrato §2.4 (aparato › neurona › malla › Spaces › sistema) y,
    // dentro de cada capa, la latencia MEDIDA. Lo que no llega va al final.
    orden.sort((a, b) =>
      grupo(a) - grupo(b) ||
      indiceCapa(a.capa) - indiceCapa(b.capa) ||
      latencia(a) - latencia(b) ||
      rtf(a) - rtf(b) ||
      a.indice - b.indice,
    );
  } else {
    orden.sort((a, b) =>
      calidad(b) - calidad(a) ||
      latencia(a) - latencia(b) ||
      indiceCapa(a.capa) - indiceCapa(b.capa) ||
      a.indice - b.indice,
    );
  }
  return orden.map((x) => x.motor);
}

/** Elige el primer motor del orden; devuelve también por qué y si cumple. */
export function elegirMotor(
  motores: readonly MotorCandidato[],
  muestras: readonly MuestraLatencia[],
  opciones: OpcionesFluidez = {},
): { motor: string; capa: CapaVoz; resumen?: ResumenLatencia; cumple: boolean } | null {
  const orden = ordenarMotores(motores, muestras, opciones);
  const primero = orden[0];
  if (!primero) return null;
  const presupuesto = esNumero(opciones.presupuestoMs) && opciones.presupuestoMs > 0
    ? opciones.presupuestoMs
    : PRESUPUESTO_PRIMER_SONIDO_MS;
  const resumen = resumeLatencia(muestras)[primero.motor];
  return {
    motor: primero.motor,
    capa: primero.capa ?? capaDeMotor(primero.motor),
    resumen,
    cumple: cumplePresupuesto(resumen, presupuesto),
  };
}

/**
 * ordenarCadenaPorLatencia — atajo para la cadena del registro de voz: recibe
 * ids y devuelve ids. La capa se deduce con `capaDeMotor`. PURA.
 */
export function ordenarCadenaPorLatencia(
  cadena: readonly string[],
  muestras: readonly MuestraLatencia[],
  contexto: ContextoVoz = "conversacion",
  presupuestoMs: number = PRESUPUESTO_PRIMER_SONIDO_MS,
  respetarOrdenBase = true,
): string[] {
  return ordenarMotores(
    cadena.map((motor) => ({ motor })),
    muestras,
    { contexto, presupuestoMs, respetarOrdenBase },
  ).map((m) => m.motor);
}

/**
 * primeraFraseLista — para hablar mientras el modelo de lenguaje SIGUE
 * escribiendo: devuelve la primera frase cerrada del texto parcial y lo que
 * queda. `null` si aún no hay frase (se sigue acumulando). Si no aparece
 * puntuación y el texto ya es largo, corta por la última frontera de palabra
 * para no esperar a un punto que no llega. PURA.
 */
export function primeraFraseLista(
  texto: string,
  maxSinPunto: number = MAX_TROZO_CONVERSACION * 1.5,
): { frase: string; resto: string } | null {
  const limpio = (texto || "").replace(/\s+/g, " ").trimStart();
  if (!limpio) return null;
  const cierre = /[.!?…;:](?=\s|$)/.exec(limpio);
  if (cierre) {
    const fin = cierre.index + 1;
    const frase = limpio.slice(0, fin).trim();
    return frase ? { frase, resto: limpio.slice(fin).trimStart() } : null;
  }
  if (limpio.length < Math.max(1, maxSinPunto)) return null;
  const ventana = limpio.slice(0, Math.max(1, maxSinPunto));
  const corte = ventana.lastIndexOf(" ");
  const fin = corte > 0 ? corte : Math.max(1, maxSinPunto);
  const frase = limpio.slice(0, fin).trim();
  return frase ? { frase, resto: limpio.slice(fin).trimStart() } : null;
}

/** Trocea para hablar: frases cortas en conversación, más largas al leer. */
export function planificarFrases(
  texto: string,
  contexto: ContextoVoz = "conversacion",
  maxTrozo?: number,
): string[] {
  const max = esNumero(maxTrozo) && maxTrozo > 0
    ? maxTrozo
    : contexto === "conversacion" ? MAX_TROZO_CONVERSACION : MAX_TROZO_LECTURA;
  return trocearTexto(texto, max);
}

/** Duración estimada del audio de un texto (palabras ÷ ritmo), en ms. */
export function estimarDuracionMs(
  texto: string,
  palabrasPorSegundo: number = PALABRAS_POR_SEGUNDO,
): number {
  const ritmo = esNumero(palabrasPorSegundo) && palabrasPorSegundo > 0 ? palabrasPorSegundo : PALABRAS_POR_SEGUNDO;
  const palabras = (texto || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((palabras / ritmo) * 1000));
}

/**
 * planificarFluidez — plan de una locución: motor elegido por lo MEDIDO, frases
 * troceadas y línea de tiempo con el prefetch de cada frase mientras suena la
 * anterior. El primer silencio nunca debe superar el presupuesto; los huecos
 * entre frases se miden y se devuelven para poder afirmarlo en las pruebas.
 * PURA: no sintetiza ni reproduce nada.
 */
export function planificarFluidez(p: {
  texto: string;
  motores: readonly MotorCandidato[];
  muestras?: readonly MuestraLatencia[];
  contexto?: ContextoVoz;
  presupuestoMs?: number;
  maxTrozo?: number;
}): PlanFluidez {
  const contexto = p.contexto ?? "conversacion";
  const presupuesto = esNumero(p.presupuestoMs) && p.presupuestoMs > 0
    ? p.presupuestoMs
    : PRESUPUESTO_PRIMER_SONIDO_MS;
  const muestras = p.muestras ?? [];
  const orden = ordenarMotores(p.motores, muestras, { contexto, presupuestoMs: presupuesto });
  const elegido = orden[0] ?? null;
  const respaldo = orden.slice(1).map((m) => m.motor);
  const frases = planificarFrases(p.texto, contexto, p.maxTrozo);
  if (!elegido || !frases.length) {
    return {
      motor: elegido?.motor ?? null,
      capa: elegido ? (elegido.capa ?? capaDeMotor(elegido.motor)) : null,
      frases,
      tramos: [],
      cumplePresupuesto: false,
      silencioMaximoMs: 0,
      motivo: elegido
        ? "No hay texto que decir."
        : "Ningún motor disponible: la voz del sistema cubre el turno.",
      respaldo,
    };
  }

  const resumen = resumeLatencia(muestras)[elegido.motor];
  const medido = esNumero(resumen?.primerSonidoMs) ? resumen?.primerSonidoMs as number : null;
  const espera = medido ?? presupuesto + 1;
  const tramos: TramoPlan[] = [];
  frases.forEach((texto, indice) => {
    const anterior = tramos[indice - 1];
    // Se pide mientras suena la anterior; si la frase anterior es más corta que la
    // espera, se adelanta lo justo para que no quede un silencio mayor que el presupuesto.
    const pideEnMs = anterior
      ? Math.max(0, Math.min(anterior.suenaEnMs, anterior.terminaEnMs - espera))
      : 0;
    const suenaEnMs = pideEnMs + espera;
    const duracionMs = estimarDuracionMs(texto);
    const silencioMs = anterior ? Math.max(0, suenaEnMs - anterior.terminaEnMs) : Math.max(0, suenaEnMs);
    tramos.push({
      indice,
      texto,
      pideEnMs,
      suenaEnMs,
      terminaEnMs: suenaEnMs + duracionMs,
      duracionMs,
      silencioMs,
    });
  });
  const silencioMaximoMs = tramos.reduce((max, t) => Math.max(max, t.silencioMs), 0);
  const cumple = medido !== null && medido <= presupuesto;
  const motivo = medido === null
    ? `Sin medida de ${elegido.motor} en esta neurona: se intenta por capas y el presupuesto no se promete.`
    : cumple
      ? `${elegido.motor} medido aquí: ${Math.round(medido)} ms (≤ ${presupuesto} ms).`
      : `${elegido.motor} medido aquí: ${Math.round(medido)} ms, por encima de ${presupuesto} ms; pasa el siguiente sin silencio.`;
  return {
    motor: elegido.motor,
    capa: elegido.capa ?? capaDeMotor(elegido.motor),
    frases,
    tramos,
    cumplePresupuesto: cumple,
    silencioMaximoMs,
    motivo,
    respaldo,
  };
}

/** Mide el corte entre que la persona empieza a hablar y la voz se calla. PURA. */
export function medirInterrupcion(
  inicioVozMs: number,
  corteMs: number,
  presupuestoMs: number = PRESUPUESTO_INTERRUPCION_MS,
): ResultadoInterrupcion {
  const latenciaMs = Math.max(0, corteMs - inicioVozMs);
  return { latenciaMs, cumple: latenciaMs <= presupuestoMs };
}

/**
 * crearInterruptor — reloj inyectado para el barge-in: `oyePersona` marca cuándo
 * empezó a hablar, `cortar` devuelve la latencia real del corte y si cabe en el
 * presupuesto. No reproduce ni cancela nada: eso lo hace quien lo cablea.
 */
export function crearInterruptor(presupuestoMs: number = PRESUPUESTO_INTERRUPCION_MS): {
  oyePersona: (ahoraMs: number) => void;
  cortar: (ahoraMs: number) => ResultadoInterrupcion;
  escuchando: () => boolean;
} {
  let inicio: number | null = null;
  return {
    oyePersona: (ahoraMs: number) => {
      if (inicio === null && esNumero(ahoraMs)) inicio = ahoraMs;
    },
    cortar: (ahoraMs: number) => {
      const desde = inicio ?? (esNumero(ahoraMs) ? ahoraMs : 0);
      const r = medirInterrupcion(desde, esNumero(ahoraMs) ? ahoraMs : desde, presupuestoMs);
      inicio = null;
      return r;
    },
    escuchando: () => inicio !== null,
  };
}

/** Voz que otra neurona publica en el registro (solo lo que midió: `VozNodo.habla`). */
export interface VozPublicadaNeurona {
  nodoId: string;
  /** Motores que esa neurona usó de verdad, con su primer audio medido. */
  habla?: readonly { motor: string; primerSonidoMs: number }[];
  /** Otra neurona de la MISMA cuenta en la red local. */
  mismaCuenta?: boolean;
  /** Neurona de la sesión de grupo (malla del grupo). */
  grupo?: boolean;
}

/**
 * candidatosDeNeuronas — convierte lo publicado en el registro de neuronas en
 * candidatos de voz con su capa: la propia cuenta va antes que la malla del
 * grupo. Una neurona ajena (ni cuenta ni grupo) NO entra: su audio no sale de
 * ahí. El id lleva la neurona delante para no confundir el mismo motor en dos
 * aparatos. PURA: no lee red ni el registro; se lo dan ya medido.
 */
export function candidatosDeNeuronas(
  neuronas: readonly VozPublicadaNeurona[],
): { motores: MotorCandidato[]; muestras: MuestraLatencia[] } {
  const motores: MotorCandidato[] = [];
  const muestras: MuestraLatencia[] = [];
  for (const n of neuronas) {
    if (!n || typeof n.nodoId !== "string" || !n.nodoId) continue;
    const capa: CapaVoz | null = n.mismaCuenta ? "neurona-cuenta" : n.grupo ? "malla-grupo" : null;
    if (!capa) continue;
    for (const h of n.habla ?? []) {
      if (!h || typeof h.motor !== "string" || !h.motor || !esNumero(h.primerSonidoMs) || h.primerSonidoMs <= 0) continue;
      const motor = `neurona:${n.nodoId}:${h.motor}`;
      if (motores.some((m) => m.motor === motor)) continue;
      motores.push({ motor, capa });
      muestras.push({ motor, tipo: "primer-sonido", valor: h.primerSonidoMs });
    }
  }
  return { motores, muestras };
}
