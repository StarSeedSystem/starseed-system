/**
 * Sueños del Mundo de los avatares (Ola 1025U · U4) — módulo PURO.
 * Contrato: architecture/suenos-mundo-avatares.md.
 *
 * Un sueño es un PROCESO IMAGINATIVO: uno o varios agentes del mundo (siempre IAs, siempre «Bot de IA») se turnan
 * para imaginar un tema. Lo que dicen es imaginación de una IA, no hechos, y la interfaz lo dice.
 *
 * Aquí viven las reglas, sin I/O, sin React, sin red y sin reloj propio (el tiempo entra por parámetro):
 *   · el PLAN (quién habla y en qué orden) y el PROMPT de cada turno, que usa `promptDeAgente` de la ficha;
 *   · los TOPES (turnos por sueño, sueños por hora y por agente, automáticos, llamadas por hora del agente);
 *   · la CREACIÓN para la crónica del mundo, con sus autores;
 *   · lo que cada agente RECUERDA al despertar, respetando el alcance de memoria
 *     (`nucleo/alcance-memoria.ts`: personal › perfil › grupo › pública, nunca al revés), y cómo empuja sus rasgos;
 *   · el saneado de lo que viene del disco.
 * Lo importa código de cliente: nada de `node:*`.
 */
import type { ChatMessage } from "@/ai/providers/types";
import { ORDEN_ALCANCE, puedeEscribirEn, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { esTipoDueno } from "@/lib/astraura-bots/tipos";
import type { AgenteMundoRef, OrigenAgenteMundo } from "@/lib/avatares/mundo/agente-mundo";
import type { CreacionMundo, EncuentroMundo, HabitanteMundo } from "@/lib/avatares/mundo/simulacion";
import {
  actorMemoriaDe, limpiarTexto, promptDeAgente, puedeFluir, puedeLlamar,
  type ConfigAgente, type RasgoPercepcion,
} from "@/lib/avatares/agente/config-agente";

/* ═══════════════════════════════ Tipos ═══════════════════════════════ */

export type TipoSueno = "individual" | "colectivo";
export type OrigenSueno = "manual" | "encuentro";
/**
 * `en-curso` solo existe mientras corre; si se lee del disco un sueño `en-curso`, la pestaña se cerró a medias y
 * pasa a `interrumpido`. `sin-ia` = no había una IA disponible (se dice, y no se inventa texto).
 */
export type EstadoSueno = "en-curso" | "completo" | "cancelado" | "sin-ia" | "interrumpido";

export interface TurnoSueno {
  autorId: string;
  autorNombre: string;
  texto: string;
  at: number;
}

export interface ConsolidacionSueno {
  /** Cuántos agentes guardaron un recuerdo. */
  recuerdos: number;
  /** Cuántos rasgos se movieron por la experiencia (con el tope diario de la ficha). */
  rasgos: number;
  /** Lo que no se pudo o no se debió guardar, ya redactado. */
  avisos: string[];
}

export interface Sueno {
  id: string;
  tipo: TipoSueno;
  /** 1 (individual) o 2–6 (colectivo). Todos son IAs: `esBotIA` siempre `true`. */
  participantes: AgenteMundoRef[];
  tema: string;
  /** Un id de autor por turno previsto, en orden. */
  orden: string[];
  turnos: TurnoSueno[];
  estado: EstadoSueno;
  creadoEn: number;
  terminadoEn?: number;
  escenarioId: string;
  origen: OrigenSueno;
  /** Por qué no terminó (sin IA, tope, cancelado…). */
  motivo?: string;
  consolidacion?: ConsolidacionSueno;
}

/* ═══════════════════════════════ Topes ═══════════════════════════════ */

export const HORA_MS = 60 * 60 * 1000;

/** Todo tope del módulo, en un sitio, para que la interfaz los enseñe y las pruebas los lean. */
export const TOPES_SUENO = {
  participantesMin: 2,
  participantesMax: 6,
  /** Turnos por participante en un sueño colectivo. */
  rondas: 2,
  turnosIndividual: 3,
  /** Máximo de turnos (= llamadas a la IA) de UN sueño. */
  turnosMax: 12,
  suenosPorHora: 6,
  suenosPorAgentePorHora: 3,
  /** Los sueños automáticos (apagados por defecto) tienen además su propio tope. */
  automaticosPorHora: 2,
  caracteresTema: 120,
  caracteresTurno: 400,
  maxTokensTurno: 160,
  /** Cuánto se espera a la IA en cada turno antes de decir que no hay respuesta. */
  esperaTurnoMs: 45_000,
  /** Últimos sueños que se guardan en este aparato por escenario. */
  guardadosPorEscenario: 12,
  /** Un sueño automático nace entre dos que ya se conocen: vínculo mínimo (cada encuentro suma 0,1). */
  vinculoMinimoAutomatico: 0.3,
  /** La misma pareja no sueña sola dos veces seguidas dentro de este plazo. */
  enfriamientoParMs: 30 * 60 * 1000,
  /** Un encuentro más viejo que esto (en ticks del mundo) ya no despierta un sueño. */
  antiguedadMaxEncuentroTicks: 30,
} as const;

/** Ajustes por escenario. Los sueños automáticos nacen apagados. */
export interface AjustesSuenos {
  automaticos: boolean;
}
export const AJUSTES_SUENOS_DEFECTO: Readonly<AjustesSuenos> = Object.freeze({ automaticos: false });

export const ETIQUETA_ESTADO_SUENO: Record<EstadoSueno, string> = {
  "en-curso": "Soñando",
  completo: "Completo",
  cancelado: "Cancelado",
  "sin-ia": "Sin IA disponible",
  interrumpido: "Interrumpido",
};

/* ═══════════════════════════════ Plan ═══════════════════════════════ */

export interface PlanSueno {
  tipo: TipoSueno;
  tema: string;
  participantes: AgenteMundoRef[];
  /** Un id de autor por turno, en orden de turnos. */
  orden: string[];
}

export type ResultadoPlan = { ok: true; plan: PlanSueno } | { ok: false; motivo: string };

export function normalizarTema(raw: unknown): string {
  return limpiarTexto(raw, TOPES_SUENO.caracteresTema);
}

/**
 * Orden de turnos de un sueño. Uno solo = sueño individual (se turna consigo mismo: continúa su propio sueño);
 * de 2 a 6 = colectivo, por rondas en el orden dado. Los repetidos cuentan una vez. Nunca más de `turnosMax`.
 */
export function planSueno(participantes: readonly AgenteMundoRef[], tema: unknown): ResultadoPlan {
  const vistos = new Set<string>();
  const unicos: AgenteMundoRef[] = [];
  for (const p of participantes) {
    if (!p || vistos.has(p.id)) continue;
    vistos.add(p.id);
    unicos.push(p);
  }
  if (unicos.length === 0) return { ok: false, motivo: "Elige al menos un agente para soñar." };
  if (unicos.length > TOPES_SUENO.participantesMax) {
    return { ok: false, motivo: `Como mucho ${TOPES_SUENO.participantesMax} agentes en un sueño.` };
  }
  const limpio = normalizarTema(tema);
  if (!limpio) return { ok: false, motivo: "Ponle un tema al sueño." };

  if (unicos.length === 1) {
    return {
      ok: true,
      plan: { tipo: "individual", tema: limpio, participantes: unicos, orden: Array.from({ length: TOPES_SUENO.turnosIndividual }, () => unicos[0].id) },
    };
  }
  const orden: string[] = [];
  for (let ronda = 0; ronda < TOPES_SUENO.rondas; ronda++) {
    for (const p of unicos) orden.push(p.id);
  }
  return { ok: true, plan: { tipo: "colectivo", tema: limpio, participantes: unicos, orden: orden.slice(0, TOPES_SUENO.turnosMax) } };
}

function idLibre(base: string, usados: ReadonlySet<string>): string {
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Un sueño nuevo, listo para correr. `usados` evita repetir un id. */
export function nuevoSueno(
  plan: PlanSueno, escenarioId: string, origen: OrigenSueno, ahora: number, usados: ReadonlySet<string> = new Set(),
): Sueno {
  return {
    id: idLibre(`sueno-${Math.max(0, Math.floor(ahora)).toString(36)}`, usados),
    tipo: plan.tipo,
    participantes: plan.participantes.map((p) => ({ ...p, dueno: { ...p.dueno } })),
    tema: plan.tema,
    orden: [...plan.orden],
    turnos: [],
    estado: "en-curso",
    creadoEn: ahora,
    escenarioId,
    origen,
  };
}

/** Quién habla el próximo turno, o `null` si ya hablaron todos. */
export function siguienteAutor(s: Pick<Sueno, "orden" | "turnos" | "participantes">): AgenteMundoRef | null {
  const id = s.orden[s.turnos.length];
  return id ? s.participantes.find((p) => p.id === id) ?? null : null;
}

/* ═══════════════════════════════ Prompt de cada turno ═══════════════════════════════ */

/** Lo que el modelo no debe copiar de un turno ajeno ni de la persona: sin controles, comillas ni marcas. */
export function limpiarTurno(raw: unknown, nombre?: string): string {
  let t = typeof raw === "string" ? raw : "";
  // Si el modelo antepone su nombre («Luna: …»), se quita.
  const limpioNombre = nombre ? limpiarTexto(nombre, 80) : "";
  if (limpioNombre) {
    const pref = new RegExp(`^\\s*(?:[*_#>\\-\\s]*)${limpioNombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[*_]*\\s*[:\\-–—]\\s*[*_]*\\s*`, "i");
    t = t.replace(pref, "");
  }
  t = limpiarTexto(t, TOPES_SUENO.caracteresTurno + 40);
  if (t.length > TOPES_SUENO.caracteresTurno) {
    const corte = t.slice(0, TOPES_SUENO.caracteresTurno);
    const espacio = corte.lastIndexOf(" ");
    t = (espacio > TOPES_SUENO.caracteresTurno * 0.6 ? corte.slice(0, espacio) : corte).trim();
  }
  return t;
}

/**
 * Los mensajes de UN turno. El sistema lleva lo que la ficha le dice al modelo (`promptDeAgente`: quién es, capas con
 * perspectiva y filtro de percepción con los límites honestos) y las reglas del sueño. El hilo solo contiene lo dicho
 * en ESTE sueño: ninguna memoria de nadie entra en el prompt, así un sueño compartido no puede filtrar lo personal de
 * un participante a otro.
 */
export function promptTurno(agente: AgenteMundoRef, sueno: Pick<Sueno, "tipo" | "tema" | "participantes" | "turnos">, config: ConfigAgente): ChatMessage[] {
  const otros = sueno.participantes.filter((p) => p.id !== agente.id).map((p) => limpiarTexto(p.nombre, 60)).filter(Boolean);
  const reglas = [
    sueno.tipo === "individual"
      ? "PROCESO IMAGINATIVO · sueño individual del Mundo de los avatares. Sueñas a solas y continúas tu propio sueño."
      : `PROCESO IMAGINATIVO · sueño compartido del Mundo de los avatares con ${otros.join(", ")}. Todos sois IAs y os turnáis.`,
    "- Es un ejercicio de imaginación, no hechos: nada de lo que sueñes ocurrió de verdad ni debe tomarse como real.",
    `- Tema del sueño: ${sueno.tema}.`,
    "- Escribe SOLO tu turno, en español y en primera persona, en 1 a 3 frases (máximo 60 palabras). Sin listas, sin títulos, sin comillas y sin escribir tu nombre al principio.",
    "- Recoge algo de lo ya dicho y añade una imagen o una idea nueva; no repitas.",
    "- No inventes datos personales ni reveles nada privado de la cuenta ni de ninguna persona.",
  ];
  const hilo = sueno.turnos.length
    ? ["Hilo del sueño hasta ahora:", ...sueno.turnos.map((t) => `- ${limpiarTexto(t.autorNombre, 60)}: ${limpiarTexto(t.texto, TOPES_SUENO.caracteresTurno)}`)].join("\n")
    : "Aún nadie ha hablado: abre el sueño tú.";
  return [
    { role: "system", content: `${promptDeAgente(config, agente)}\n\n${reglas.join("\n")}` },
    { role: "user", content: `${hilo}\n\nEs tu turno, ${limpiarTexto(agente.nombre, 60) || "agente"}.` },
  ];
}

/* ═══════════════════════════════ Para la crónica del mundo ═══════════════════════════════ */

export const TIPO_CREACION_SUENO = "sueño";

/**
 * La creación REAL del sueño para la crónica del mundo: una por autor que habló, para que cada uno figure como autor.
 * Solo un sueño completo es una obra; uno cancelado o cortado no lo es. Los ids empiezan por `sueno:` para que no se
 * confundan con las obras de la simulación (`obra:`), que son juego.
 */
export function resultadoACreacion(sueno: Sueno, tick: number): CreacionMundo[] {
  if (sueno.estado !== "completo" || sueno.turnos.length === 0) return [];
  const autores: string[] = [];
  for (const t of sueno.turnos) if (!autores.includes(t.autorId)) autores.push(t.autorId);
  const titulo = `${sueno.tipo === "colectivo" ? "Sueño compartido" : "Sueño"}: ${sueno.tema}`.slice(0, 160);
  return autores.map((autor) => ({ id: `sueno:${sueno.id}:${autor}`, autor, tipo: TIPO_CREACION_SUENO, titulo, tick }));
}

/* ═══════════════════════════════ Memoria: qué recuerda cada quien ═══════════════════════════════ */

/**
 * El alcance más PRIVADO donde este agente puede escribir: personal para uno personal, de grupo para uno de grupo
 * (que declara su grupo) y público para uno público. Nunca abre lo que su actor no puede leer.
 */
export function alcanceDeRecuerdo(agente: AgenteMundoRef): AlcanceMemoria {
  const actor = actorMemoriaDe(agente);
  return ORDEN_ALCANCE.find((a) => puedeEscribirEn(actor, a)) ?? "publica";
}

/**
 * ¿Puede el recuerdo de `receptor` incluir lo que dijo `autor`? Solo si no lo abre más de lo que estaba: lo dicho por un
 * agente de alcance X solo viaja a un recuerdo igual o más privado (`puedeFluir`), y entre dos de grupo, solo del mismo.
 */
export function puedeRecordarLinea(receptor: AgenteMundoRef, autor: AgenteMundoRef): boolean {
  if (receptor.id === autor.id) return true;
  const a = alcanceDeRecuerdo(autor);
  const r = alcanceDeRecuerdo(receptor);
  if (!puedeFluir(a, r)) return false;
  if (a === "grupo" && r === "grupo") return actorMemoriaDe(autor).grupoId === actorMemoriaDe(receptor).grupoId;
  return true;
}

const corto = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`);

function lista(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Lo que `agente` recuerda del sueño: con quién soñó, el tema, lo que dijo él y, de lo que dijeron los demás, solo
 * lo que su recuerdo puede llevar sin abrirlo (ver `puedeRecordarLinea`). Texto plano (la ficha quita comillas).
 */
export function textoRecuerdo(sueno: Sueno, agente: AgenteMundoRef): string {
  const companeros = sueno.participantes.filter((p) => p.id !== agente.id).map((p) => p.nombre);
  const cabecera = companeros.length ? `Soñé con ${lista(companeros)} sobre ${sueno.tema}.` : `Soñé a solas sobre ${sueno.tema}.`;
  const mios = sueno.turnos.filter((t) => t.autorId === agente.id);
  const partes = [cabecera];
  if (mios.length) partes.push(`Yo dije: ${corto(mios[mios.length - 1].texto, 140)}`);
  const porId = new Map(sueno.participantes.map((p) => [p.id, p] as const));
  const ajenos = sueno.turnos
    .filter((t) => t.autorId !== agente.id)
    .filter((t) => {
      const autor = porId.get(t.autorId);
      return !!autor && puedeRecordarLinea(agente, autor);
    })
    .slice(-2);
  for (const t of ajenos) partes.push(`${t.autorNombre}: ${corto(t.texto, 90)}`);
  return partes.join(" ");
}

/**
 * Cómo la experiencia de un sueño empuja los rasgos del agente: poco (0,01 de un máximo de 0,05 al día por rasgo, que
 * hace cumplir `registrarExperiencia`), siempre reversible, y solo si habló. Curiosidad por explorar; empatía si fue
 * con otros; foco si fue a solas.
 */
export function empujesDeSueno(sueno: Sueno, agente: AgenteMundoRef): Partial<Record<RasgoPercepcion, number>> {
  if (!sueno.turnos.some((t) => t.autorId === agente.id)) return {};
  return sueno.tipo === "colectivo" ? { curiosidad: 0.01, empatia: 0.01 } : { curiosidad: 0.01, foco: 0.01 };
}

export function motivoExperiencia(sueno: Sueno): string {
  return `Sueño: ${sueno.tema}`.slice(0, 80);
}

/* ═══════════════════════════════ Uso por hora (topes) ═══════════════════════════════ */

/** Marcas de tiempo (ms) de la última hora, en este aparato. */
export interface UsoSuenos {
  inicios: number[];
  automaticos: number[];
  /** Por agente: cuándo participó en un sueño. */
  participaciones: Record<string, number[]>;
  /** Por agente: cuándo se llamó a la IA en su nombre (un turno = una llamada). */
  llamadas: Record<string, number[]>;
}

export function usoVacio(): UsoSuenos {
  return { inicios: [], automaticos: [], participaciones: {}, llamadas: {} };
}

const MAX_MARCAS = 200;

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const esRegistro = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function marcasValidas(raw: unknown, ahora: number): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is number => esNumero(m) && m <= ahora + 60_000 && ahora - m < HORA_MS).slice(-MAX_MARCAS);
}

function mapaDeMarcas(raw: unknown, ahora: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!esRegistro(raw)) return out;
  for (const [id, marcas] of Object.entries(raw).slice(0, 200)) {
    const v = marcasValidas(marcas, ahora);
    if (v.length) out[id.slice(0, 200)] = v;
  }
  return out;
}

/** Lee el uso guardado sin fiarse de nada: tira lo que ya pasó de la hora y lo roto. */
export function sanearUso(raw: unknown, ahora: number): UsoSuenos {
  const o = esRegistro(raw) ? raw : {};
  return {
    inicios: marcasValidas(o.inicios, ahora),
    automaticos: marcasValidas(o.automaticos, ahora),
    participaciones: mapaDeMarcas(o.participaciones, ahora),
    llamadas: mapaDeMarcas(o.llamadas, ahora),
  };
}

/** Cuántas marcas caen en la última hora. */
export function enLaUltimaHora(marcas: readonly number[] | undefined, ahora: number): number {
  return (marcas ?? []).filter((m) => ahora - m >= 0 && ahora - m < HORA_MS).length;
}

export function registrarInicio(uso: UsoSuenos, participantes: readonly AgenteMundoRef[], automatico: boolean, ahora: number): UsoSuenos {
  const limpio = sanearUso(uso, ahora);
  const participaciones = { ...limpio.participaciones };
  for (const p of participantes) participaciones[p.id] = [...(participaciones[p.id] ?? []), ahora].slice(-MAX_MARCAS);
  return {
    ...limpio,
    inicios: [...limpio.inicios, ahora].slice(-MAX_MARCAS),
    automaticos: automatico ? [...limpio.automaticos, ahora].slice(-MAX_MARCAS) : limpio.automaticos,
    participaciones,
  };
}

export function registrarLlamada(uso: UsoSuenos, agenteId: string, ahora: number): UsoSuenos {
  const limpio = sanearUso(uso, ahora);
  return { ...limpio, llamadas: { ...limpio.llamadas, [agenteId]: [...(limpio.llamadas[agenteId] ?? []), ahora].slice(-MAX_MARCAS) } };
}

export type TipoTope = "global" | "agente" | "automaticos" | "llamadas";
export type Veredicto = { ok: true } | { ok: false; motivo: string; tope: TipoTope };

export interface EntradaTopes {
  uso: UsoSuenos;
  participantes: readonly AgenteMundoRef[];
  /** Un id de autor por turno previsto. */
  orden: readonly string[];
  /** La ficha de cada agente: de ella sale su tope de llamadas por hora. */
  configDe: (agente: AgenteMundoRef) => ConfigAgente;
  ahora: number;
  automatico: boolean;
}

/** ¿Cabe este sueño en los topes? Mira los sueños de la hora, los del agente, los automáticos y las llamadas de su ficha. */
export function comprobarTopes(e: EntradaTopes): Veredicto {
  const { uso, participantes, orden, configDe, ahora, automatico } = e;
  if (enLaUltimaHora(uso.inicios, ahora) >= TOPES_SUENO.suenosPorHora) {
    return { ok: false, tope: "global", motivo: `Ya hubo ${TOPES_SUENO.suenosPorHora} sueños esta hora (el tope). Vuelve a intentarlo más tarde.` };
  }
  if (automatico && enLaUltimaHora(uso.automaticos, ahora) >= TOPES_SUENO.automaticosPorHora) {
    return { ok: false, tope: "automaticos", motivo: `Ya hubo ${TOPES_SUENO.automaticosPorHora} sueños automáticos esta hora (el tope).` };
  }
  for (const p of participantes) {
    if (enLaUltimaHora(uso.participaciones[p.id], ahora) >= TOPES_SUENO.suenosPorAgentePorHora) {
      return { ok: false, tope: "agente", motivo: `${p.nombre} ya soñó ${TOPES_SUENO.suenosPorAgentePorHora} veces esta hora (el tope por agente).` };
    }
    const turnos = orden.filter((id) => id === p.id).length;
    const llamadas = enLaUltimaHora(uso.llamadas[p.id], ahora);
    // `puedeLlamar` pregunta por UNA llamada más: con `turnos - 1` más ya hechas caben todas las del plan.
    if (turnos > 0 && !puedeLlamar(configDe(p).motores, llamadas + turnos - 1)) {
      return { ok: false, tope: "llamadas", motivo: `${p.nombre} no tiene llamadas suficientes esta hora (tope de su ficha: ${configDe(p).motores.topePorHora} por hora).` };
    }
  }
  return { ok: true };
}

/* ═══════════════════════════════ Sueños automáticos (nacen de encuentros) ═══════════════════════════════ */

export interface CandidatoAutomatico {
  a: AgenteMundoRef;
  b: AgenteMundoRef;
  tema: string;
  tick: number;
}

export interface EntradaAutomatico {
  encuentros: readonly EncuentroMundo[];
  /** Solo cuentan los encuentros posteriores a este tick (los que ya vio el módulo no se reconsideran). */
  desdeTick: number;
  /** Tick actual del mundo: un encuentro demasiado viejo no cuenta. */
  tickActual: number;
  habitantes: readonly Pick<HabitanteMundo, "id" | "vinculos">[];
  agentes: ReadonlyMap<string, AgenteMundoRef>;
  recientes: readonly Pick<Sueno, "participantes" | "creadoEn">[];
  ahora: number;
}

/**
 * ¿Algún encuentro nuevo merece un sueño? El más reciente entre dos agentes que SE CONOCEN (vínculo mínimo), que no
 * hayan soñado juntos hace poco. El tema del sueño es el de su encuentro. No decide los topes: eso es `comprobarTopes`.
 */
export function candidatoAutomatico(e: EntradaAutomatico): CandidatoAutomatico | null {
  const vinculoDe = new Map(e.habitantes.map((h) => [h.id, h.vinculos] as const));
  const nuevos = e.encuentros
    .filter((x) => x.tick > e.desdeTick && e.tickActual - x.tick <= TOPES_SUENO.antiguedadMaxEncuentroTicks)
    .sort((x, y) => y.tick - x.tick);
  for (const enc of nuevos) {
    const a = e.agentes.get(enc.a);
    const b = e.agentes.get(enc.b);
    if (!a || !b || a.id === b.id) continue;
    const fuerza = Math.max(vinculoDe.get(a.id)?.[b.id] ?? 0, vinculoDe.get(b.id)?.[a.id] ?? 0);
    if (fuerza + 1e-9 < TOPES_SUENO.vinculoMinimoAutomatico) continue;
    const yaSonaron = e.recientes.some(
      (s) => e.ahora - s.creadoEn < TOPES_SUENO.enfriamientoParMs
        && s.participantes.length === 2
        && s.participantes.some((p) => p.id === a.id)
        && s.participantes.some((p) => p.id === b.id),
    );
    if (yaSonaron) continue;
    const tema = normalizarTema(enc.tema);
    if (!tema) continue;
    return { a, b, tema, tick: enc.tick };
  }
  return null;
}

/* ═══════════════════════════════ Saneado (lo que viene del disco) ═══════════════════════════════ */

const ORIGENES: readonly OrigenAgenteMundo[] = ["personalidad", "bot", "agente-grupo"];
const ESTADOS: readonly EstadoSueno[] = ["en-curso", "completo", "cancelado", "sin-ia", "interrumpido"];

function sanearParticipante(raw: unknown): AgenteMundoRef | null {
  if (!esRegistro(raw)) return null;
  const origen = ORIGENES.find((o) => o === raw.origen);
  const idOrigen = limpiarTexto(raw.idOrigen, 160);
  const nombre = limpiarTexto(raw.nombre, 120);
  if (!origen || !idOrigen || !nombre || !esRegistro(raw.dueno)) return null;
  const tipo = raw.dueno.tipo === "cuenta" ? "cuenta" : esTipoDueno(raw.dueno.tipo) ? raw.dueno.tipo : null;
  const duenoId = limpiarTexto(raw.dueno.id, 160);
  if (!tipo || !duenoId) return null;
  const avatarRef = typeof raw.avatarRef === "string" && raw.avatarRef ? raw.avatarRef.slice(0, 500) : undefined;
  return { id: `${origen}:${idOrigen}`, origen, idOrigen, nombre, dueno: { tipo, id: duenoId }, ...(avatarRef ? { avatarRef } : {}), esBotIA: true };
}

/**
 * Un sueño leído del disco o de otro aparato → un sueño válido, o `null`. Nunca lanza. Al LEER, un sueño «en curso» pasa
 * a «interrumpido» (no está corriendo); al ESCRIBIR el que corre ahora se guarda tal cual (`preservarEnCurso`).
 */
export function sanearSueno(raw: unknown, preservarEnCurso = false): Sueno | null {
  if (!esRegistro(raw)) return null;
  const id = limpiarTexto(raw.id, 80);
  const tema = normalizarTema(raw.tema);
  const estadoCrudo = ESTADOS.find((e) => e === raw.estado);
  if (!id || !tema || !estadoCrudo || !esNumero(raw.creadoEn) || raw.creadoEn < 0) return null;

  const participantes: AgenteMundoRef[] = [];
  for (const p of Array.isArray(raw.participantes) ? raw.participantes : []) {
    const ref = sanearParticipante(p);
    if (ref && !participantes.some((x) => x.id === ref.id)) participantes.push(ref);
    if (participantes.length >= TOPES_SUENO.participantesMax) break;
  }
  if (participantes.length === 0) return null;
  const tipo: TipoSueno = participantes.length === 1 ? "individual" : "colectivo";

  const ids = new Set(participantes.map((p) => p.id));
  const orden = (Array.isArray(raw.orden) ? raw.orden : []).filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, TOPES_SUENO.turnosMax);
  const turnos: TurnoSueno[] = [];
  for (const t of Array.isArray(raw.turnos) ? raw.turnos : []) {
    if (!esRegistro(t) || typeof t.autorId !== "string" || !ids.has(t.autorId) || !esNumero(t.at)) continue;
    const texto = limpiarTexto(t.texto, TOPES_SUENO.caracteresTurno);
    if (!texto) continue;
    const autor = participantes.find((p) => p.id === t.autorId);
    turnos.push({ autorId: t.autorId, autorNombre: autor?.nombre ?? "", texto, at: t.at });
    if (turnos.length >= orden.length || turnos.length >= TOPES_SUENO.turnosMax) break;
  }

  const enCurso = estadoCrudo === "en-curso" && !preservarEnCurso;
  const motivoCrudo = limpiarTexto(raw.motivo, 300);
  const consolidacion = esRegistro(raw.consolidacion)
    ? {
        recuerdos: esNumero(raw.consolidacion.recuerdos) ? Math.max(0, Math.min(TOPES_SUENO.participantesMax, Math.round(raw.consolidacion.recuerdos))) : 0,
        rasgos: esNumero(raw.consolidacion.rasgos) ? Math.max(0, Math.min(40, Math.round(raw.consolidacion.rasgos))) : 0,
        avisos: (Array.isArray(raw.consolidacion.avisos) ? raw.consolidacion.avisos : []).map((a) => limpiarTexto(a, 200)).filter(Boolean).slice(0, 12),
      }
    : undefined;
  return {
    id,
    tipo,
    participantes,
    tema,
    orden,
    turnos,
    // Un sueño «en curso» leído del disco no está corriendo: la pestaña se cerró a medias.
    estado: enCurso ? "interrumpido" : estadoCrudo,
    creadoEn: raw.creadoEn,
    ...(esNumero(raw.terminadoEn) && raw.terminadoEn >= 0 ? { terminadoEn: raw.terminadoEn } : {}),
    escenarioId: limpiarTexto(raw.escenarioId, 120),
    origen: raw.origen === "encuentro" ? "encuentro" : "manual",
    ...(enCurso ? { motivo: "Se cortó antes de terminar (se cerró la pestaña o se recargó la página)." } : motivoCrudo ? { motivo: motivoCrudo } : {}),
    ...(consolidacion ? { consolidacion } : {}),
  };
}

/** Los últimos sueños válidos de una lista cruda, sin ids repetidos, los más recientes al final. */
export function sanearSuenos(raw: unknown, max: number = TOPES_SUENO.guardadosPorEscenario, preservarEnCurso = false): Sueno[] {
  const out: Sueno[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const s = sanearSueno(item, preservarEnCurso);
    if (!s || ids.has(s.id)) continue;
    ids.add(s.id);
    out.push(s);
  }
  return out.sort((a, b) => a.creadoEn - b.creadoEn).slice(-Math.max(0, max));
}
