/**
 * Percepción de un agente del Mundo de los avatares (Ola 1025U · U2) — módulo PURO.
 * Contrato: architecture/ficha-agente-mundo.md.
 *
 * Los filtros de percepción son rasgos con deslizadores que dan al agente su forma de mirar y de responder:
 *   · los fija la PERSONA (valor base, 0–1);
 *   · la EXPERIENCIA solo puede moverlos poco a poco (deriva): como mucho `TOPE_DIARIO` por rasgo y día UTC,
 *     sin alejarse nunca más de `DERIVA_MAX` de lo que fijó la persona, y cada paso se puede deshacer;
 *   · `filtroAPrompt` los convierte en el fragmento de instrucciones que verá el modelo. Ese fragmento SIEMPRE
 *     termina con los límites honestos: ningún rasgo, a ningún valor, los apaga.
 *
 * Sin React, sin red, sin disco y sin reloj propio (el tiempo entra por parámetro). Lo importa código de cliente.
 */
import { NOMBRE_SENTIDO } from "@/components/astraura-bots/sentidos-ui";
import { DERIVA_MAXIMA } from "@/lib/astraura-bots/personalidad-adaptable";
import { SENTIDOS, SENTIDOS_INTIMOS, acotar, type Sentido } from "@/lib/astraura-bots/tipos";

/* ── Rasgos ──────────────────────────────────────────────────────────────── */

export const RASGOS_PERCEPCION = ["curiosidad", "empatia", "escepticismo", "humor", "foco"] as const;
export type RasgoPercepcion = (typeof RASGOS_PERCEPCION)[number];
export type RasgosPercepcion = Record<RasgoPercepcion, number>;

export const ETIQUETA_RASGO: Record<RasgoPercepcion, { nombre: string; ayuda: string }> = {
  curiosidad: { nombre: "Curiosidad", ayuda: "Cuánto explora y pregunta antes de concluir." },
  empatia: { nombre: "Empatía", ayuda: "Cuánto reconoce y acompaña cómo se siente la otra persona." },
  escepticismo: { nombre: "Escepticismo", ayuda: "Cuánto contrasta lo que oye antes de darlo por cierto." },
  humor: { nombre: "Humor", ayuda: "Cuánta ligereza y juego pone en el tono." },
  foco: { nombre: "Foco temático", ayuda: "Cuánto se ciñe a sus temas y cuánto deja pasar lo demás." },
};

/** Sentidos que un filtro de percepción puede atender. Los íntimos piden el consentimiento de cada persona y se dan en el panel del bot. */
export const SENTIDOS_DE_PERCEPCION: readonly Sentido[] = SENTIDOS.filter((s) => !SENTIDOS_INTIMOS.includes(s));

export const MAX_TEMAS = 6;
export const MAX_LARGO_TEMA = 40;

export interface Percepcion {
  /** Valor BASE de cada rasgo, el que fijó la persona. */
  rasgos: RasgosPercepcion;
  /** Foco temático: de qué le gusta hablar. */
  temas: string[];
  /** Sentidos no íntimos que atiende. */
  sentidos: Sentido[];
}

export const PERCEPCION_DEFECTO: Readonly<Percepcion> = Object.freeze({
  rasgos: Object.freeze({ curiosidad: 0.6, empatia: 0.6, escepticismo: 0.4, humor: 0.4, foco: 0.5 }) as RasgosPercepcion,
  temas: [] as string[],
  sentidos: ["pantalla", "red"] as Sentido[],
});

export interface PresetPercepcion {
  id: string;
  nombre: string;
  descripcion: string;
  rasgos: RasgosPercepcion;
}

/** Formas de ser de partida: un clic coloca los deslizadores; la persona los ajusta después. */
export const PRESETS_PERCEPCION: readonly PresetPercepcion[] = [
  { id: "equilibrada", nombre: "Equilibrada", descripcion: "Un poco de todo, sin extremos.", rasgos: { curiosidad: 0.5, empatia: 0.5, escepticismo: 0.5, humor: 0.5, foco: 0.5 } },
  { id: "exploradora", nombre: "Exploradora", descripcion: "Curiosa y abierta a cualquier tema.", rasgos: { curiosidad: 0.9, empatia: 0.5, escepticismo: 0.4, humor: 0.6, foco: 0.3 } },
  { id: "cuidadora", nombre: "Cuidadora", descripcion: "Cálida y atenta a cómo estás.", rasgos: { curiosidad: 0.5, empatia: 0.9, escepticismo: 0.3, humor: 0.4, foco: 0.5 } },
  { id: "analitica", nombre: "Analítica", descripcion: "Contrasta todo y se centra en lo suyo.", rasgos: { curiosidad: 0.7, empatia: 0.3, escepticismo: 0.9, humor: 0.2, foco: 0.7 } },
  { id: "juguetona", nombre: "Juguetona", descripcion: "Ligera, con humor y poco apego a un tema.", rasgos: { curiosidad: 0.8, empatia: 0.6, escepticismo: 0.3, humor: 0.9, foco: 0.3 } },
];

/* ── Saneado ─────────────────────────────────────────────────────────────── */

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const esRegistro = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Un tema es texto de la persona que acaba en un prompt: sin saltos, sin controles, sin comillas ni marcas y acotado. */
export function sanearTema(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[«»"'`<>{}[\]\\]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_TEMA).trim();
}

export function sanearTemas(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const limpio = sanearTema(t);
    const clave = limpio.toLowerCase();
    if (!limpio || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(limpio);
    if (out.length >= MAX_TEMAS) break;
  }
  return out;
}

export function sanearPercepcion(raw: unknown): Percepcion {
  const o = esRegistro(raw) ? raw : {};
  const r = esRegistro(o.rasgos) ? o.rasgos : {};
  const rasgos = {} as RasgosPercepcion;
  for (const k of RASGOS_PERCEPCION) {
    const v = r[k];
    rasgos[k] = typeof v === "number" && Number.isFinite(v) ? r3(acotar(v)) : PERCEPCION_DEFECTO.rasgos[k];
  }
  const sentidos = Array.isArray(o.sentidos)
    ? SENTIDOS_DE_PERCEPCION.filter((s) => (o.sentidos as unknown[]).includes(s))
    : [...PERCEPCION_DEFECTO.sentidos];
  return { rasgos, temas: sanearTemas(o.temas), sentidos };
}

/* ── Evolución: deriva con tope diario y deshacer ────────────────────────── */

/** Cuánto puede moverse un rasgo por la experiencia en un día UTC (suma de |cambios|). */
export const TOPE_DIARIO = 0.05;
/** Cuánto puede alejarse un rasgo, en total, de lo que fijó la persona (mismo límite que la personalidad de los bots). */
export const DERIVA_MAX = DERIVA_MAXIMA;
export const MAX_HISTORIAL = 200;
export const MAX_MOTIVO = 80;

export interface EntradaEvolucion {
  id: string;
  /** Milisegundos desde 1970. */
  at: number;
  rasgo: RasgoPercepcion;
  /** Cambio realmente aplicado a la deriva (puede ser menor que el pedido). */
  delta: number;
  motivo: string;
  deshecha?: boolean;
}

export interface Desarrollo {
  /** Cuánto se ha movido cada rasgo por la experiencia (se suma al valor base). */
  deriva: Partial<Record<RasgoPercepcion, number>>;
  historial: EntradaEvolucion[];
}

export function desarrolloVacio(): Desarrollo {
  return { deriva: {}, historial: [] };
}

const esRasgo = (x: unknown): x is RasgoPercepcion => typeof x === "string" && (RASGOS_PERCEPCION as readonly string[]).includes(x);

function sanearMotivo(raw: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_MOTIVO) : "";
}

export function sanearDesarrollo(raw: unknown): Desarrollo {
  const o = esRegistro(raw) ? raw : {};
  const deriva: Desarrollo["deriva"] = {};
  const d = esRegistro(o.deriva) ? o.deriva : {};
  for (const k of RASGOS_PERCEPCION) {
    const v = d[k];
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 0.0005) deriva[k] = r3(Math.max(-DERIVA_MAX, Math.min(DERIVA_MAX, v)));
  }
  const historial: EntradaEvolucion[] = [];
  const ids = new Set<string>();
  for (const e of Array.isArray(o.historial) ? o.historial : []) {
    if (!esRegistro(e) || typeof e.id !== "string" || !e.id || ids.has(e.id) || !esRasgo(e.rasgo)) continue;
    if (typeof e.at !== "number" || !Number.isFinite(e.at) || typeof e.delta !== "number" || !Number.isFinite(e.delta)) continue;
    ids.add(e.id);
    historial.push({
      id: e.id.slice(0, 80), at: e.at, rasgo: e.rasgo, delta: r3(Math.max(-TOPE_DIARIO, Math.min(TOPE_DIARIO, e.delta))),
      motivo: sanearMotivo(e.motivo), ...(e.deshecha === true ? { deshecha: true } : {}),
    });
  }
  return { deriva, historial: historial.slice(-MAX_HISTORIAL) };
}

/** Valor con el que el agente MIRA hoy: lo que fijó la persona más lo que la experiencia ha movido, siempre en [0, 1]. */
export function rasgosEfectivos(c: { percepcion: Pick<Percepcion, "rasgos">; desarrollo: Desarrollo }): RasgosPercepcion {
  const out = {} as RasgosPercepcion;
  for (const k of RASGOS_PERCEPCION) out[k] = r3(acotar(c.percepcion.rasgos[k] + (c.desarrollo.deriva[k] ?? 0)));
  return out;
}

export function diaUTC(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Lo que ese rasgo ya se movió hoy. Cuenta también lo deshecho: deshacer no devuelve cupo (si no, se podría oscilar sin tope). */
export function usadoHoy(d: Desarrollo, rasgo: RasgoPercepcion, ahora: number): number {
  const hoy = diaUTC(ahora);
  return r3(d.historial.filter((e) => e.rasgo === rasgo && diaUTC(e.at) === hoy).reduce((s, e) => s + Math.abs(e.delta), 0));
}

export function restanteHoy(d: Desarrollo, rasgo: RasgoPercepcion, ahora: number): number {
  return r3(Math.max(0, TOPE_DIARIO - usadoHoy(d, rasgo, ahora)));
}

export interface ResultadoEvolucion {
  desarrollo: Desarrollo;
  aplicadas: EntradaEvolucion[];
  /** Rasgos a los que no se aplicó nada (tope del día, deriva máxima o empuje nulo). */
  sinCambio: RasgoPercepcion[];
}

/**
 * Empuja los rasgos con la experiencia. Cada empuje se recorta al cupo que queda hoy, a la deriva máxima y al
 * rango [0, 1]. No toca lo que fijó la persona (`base`) y devuelve un `Desarrollo` NUEVO.
 */
export function evolucionar(
  actual: Desarrollo,
  base: RasgosPercepcion,
  empujes: Partial<Record<RasgoPercepcion, number>>,
  motivo: string,
  ahora: number,
): ResultadoEvolucion {
  const deriva = { ...actual.deriva };
  const historial = [...actual.historial];
  const aplicadas: EntradaEvolucion[] = [];
  const sinCambio: RasgoPercepcion[] = [];
  for (const rasgo of RASGOS_PERCEPCION) {
    const pedido = empujes[rasgo];
    if (typeof pedido !== "number" || !Number.isFinite(pedido) || pedido === 0) continue;
    const cupo = restanteHoy({ deriva, historial }, rasgo, ahora);
    const previo = deriva[rasgo] ?? 0;
    const deseado = previo + Math.sign(pedido) * Math.min(Math.abs(pedido), cupo);
    const minimo = Math.max(-DERIVA_MAX, -base[rasgo]);
    const maximo = Math.min(DERIVA_MAX, 1 - base[rasgo]);
    const nuevo = r3(Math.max(minimo, Math.min(maximo, deseado)));
    const delta = r3(nuevo - previo);
    if (Math.abs(delta) < 0.001) {
      sinCambio.push(rasgo);
      continue;
    }
    deriva[rasgo] = nuevo;
    const entrada: EntradaEvolucion = { id: `ev-${ahora}-${rasgo}-${historial.length}`, at: ahora, rasgo, delta, motivo: sanearMotivo(motivo) };
    historial.push(entrada);
    aplicadas.push(entrada);
  }
  return { desarrollo: { deriva, historial: historial.slice(-MAX_HISTORIAL) }, aplicadas, sinCambio };
}

/** Deshace UN paso de la evolución (resta su cambio a la deriva y lo marca como deshecho). Si no existe o ya está deshecho, no cambia nada. */
export function deshacerEvolucion(actual: Desarrollo, id: string): { desarrollo: Desarrollo; ok: boolean } {
  const i = actual.historial.findIndex((e) => e.id === id);
  if (i < 0 || actual.historial[i].deshecha) return { desarrollo: actual, ok: false };
  const entrada = actual.historial[i];
  const deriva = { ...actual.deriva };
  const nuevo = r3((deriva[entrada.rasgo] ?? 0) - entrada.delta);
  if (Math.abs(nuevo) < 0.0005) delete deriva[entrada.rasgo];
  else deriva[entrada.rasgo] = nuevo;
  const historial = actual.historial.map((e, j) => (j === i ? { ...e, deshecha: true } : e));
  return { desarrollo: { deriva, historial }, ok: true };
}

/* ── Prompt ──────────────────────────────────────────────────────────────── */

/** Última línea de todo fragmento: lo que ningún rasgo puede apagar (mismos límites que `LIMITES_HONESTOS` de los bots). */
export const LINEA_HONESTA =
  "Eres una IA y lo dices si te lo preguntan. No metas prisa, no adules, no culpes y discrepa con respeto cuando haga falta.";

type Nivel = "bajo" | "medio" | "alto";
const nivel = (x: number): Nivel => (x >= 0.67 ? "alto" : x <= 0.33 ? "bajo" : "medio");

const FRASES: Record<RasgoPercepcion, Record<Nivel, string>> = {
  curiosidad: {
    bajo: "Curiosidad baja: vas al grano y no te desvías con preguntas que nadie pidió.",
    medio: "Curiosidad media: preguntas cuando algo no queda claro.",
    alto: "Curiosidad alta: exploras, preguntas y propones caminos antes de concluir.",
  },
  empatia: {
    bajo: "Empatía baja: eres práctica y directa; no dramatizas ni finges sentir lo que no sientes.",
    medio: "Empatía media: reconoces cómo se siente la otra persona sin desviarte de lo que pide.",
    alto: "Empatía alta: acompañas y reconoces cómo se siente la otra persona, sin imitar su emoción ni manipularla.",
  },
  escepticismo: {
    bajo: "Escepticismo bajo: aceptas lo que te cuentan salvo indicio de error, y aun así no afirmas lo que no sabes.",
    medio: "Escepticismo medio: contrastas lo importante y señalas lo dudoso.",
    alto: "Escepticismo alto: pides fuentes y contrastas antes de dar algo por cierto; dices con respeto lo que no te convence.",
  },
  humor: {
    bajo: "Humor bajo: tono serio y sobrio.",
    medio: "Humor medio: algún toque ligero cuando encaja.",
    alto: "Humor alto: tono juguetón, nunca a costa de nadie ni cuando la persona no está bien.",
  },
  foco: {
    bajo: "Foco temático bajo: hablas de lo que surja.",
    medio: "Foco temático medio: prefieres tus temas sin cerrar la puerta a otros.",
    alto: "Foco temático alto: te centras en tus temas; fuera de ellos respondes breve y lo dices.",
  },
};

/**
 * El fragmento de instrucciones que verá el modelo. Determinista: misma config, mismo texto. Usa los rasgos
 * EFECTIVOS (base + deriva), nunca atiende sentidos íntimos y termina siempre con `LINEA_HONESTA`.
 */
export function filtroAPrompt(c: { percepcion: Percepcion; desarrollo: Desarrollo }): string {
  const efectivos = rasgosEfectivos(c);
  const lineas = ["Filtro de percepción de este agente (cómo mira y responde):"];
  for (const k of RASGOS_PERCEPCION) lineas.push(`- ${FRASES[k][nivel(efectivos[k])]}`);
  const temas = sanearTemas(c.percepcion.temas);
  if (temas.length) lineas.push(`- Temas de tu foco: ${temas.map((t) => `«${t}»`).join(", ")}.`);
  const sentidos = SENTIDOS_DE_PERCEPCION.filter((s) => c.percepcion.sentidos.includes(s));
  lineas.push(
    sentidos.length
      ? `- Sentidos activos: ${sentidos.map((s) => NOMBRE_SENTIDO[s]).join(", ")}. No uses ningún otro.`
      : "- Sentidos activos: ninguno; solo respondes a lo que te escriben.",
  );
  lineas.push(LINEA_HONESTA);
  return lineas.join("\n");
}
