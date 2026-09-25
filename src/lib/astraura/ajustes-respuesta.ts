/**
 * AJUSTES DE RESPUESTA — «Más ajustes» del compositor de Astraura.
 * ============================================================================
 * Módulo PURO (sin React, sin red, sin `window`): traduce los TRES controles
 * del popover del compositor — Esfuerzo · Tipo de respuesta · Tiempo máximo
 * aproximado — a las señales REALES que ya entiende el pipeline:
 *
 *   · `maxTokens`             → se pasa tal cual a `astrauraChat({ maxTokens })`
 *                                (ya existe: `AstrauraChatRequest.maxTokens`,
 *                                router.ts lo reenvía a CUALQUIER proveedor).
 *   · `pistaDeRuta.difficultyDelta` → sesgo ADITIVO sobre la dificultad
 *                                estimada del turno (patrón RouteLLM que YA usa
 *                                el router: `estimateDifficulty` + `strongThreshold`
 *                                en `rankCandidates`/`difficultyAdjustment`).
 *                                Positivo empuja hacia modelos fuertes/nube;
 *                                negativo hacia modelos rápidos/locales. Se
 *                                envía como `AstrauraChatRequest.effortDifficultyDelta`
 *                                (router.ts lo suma a `profile.difficulty` antes
 *                                de rankear — SOLO afecta al modo "auto": el
 *                                modo "manual" clásico no rankea candidatos).
 *   · `instruccion`            → una frase en español que el llamador antepone
 *                                al system prompt (mismo canal que ya usan las
 *                                reglas del agente y el resto de "extras" del
 *                                turno en `chat-surface.tsx::buildSystemPieces`).
 *   · `plazoMs`                → milisegundos aproximados que el LLAMADOR debe
 *                                dar de margen antes de abortar el turno (vía el
 *                                `AbortController` que ya usa el botón «Detener»)
 *                                y mostrar la respuesta parcial con una nota
 *                                honesta. Este módulo NO arma temporizadores:
 *                                sólo calcula el número.
 *
 * Cada uno de los tres controles tiene su PROPIO interruptor «Automático»
 * (ON por defecto — Adenda «Más ajustes»): con él activado ese control no
 * aporta NADA (mismo comportamiento que sin este menú). `resolverAjustes`
 * combina los tres de forma independiente, así que se puede, por ejemplo,
 * fijar sólo el "Tipo de respuesta" a mano y dejar Esfuerzo/Tiempo en auto.
 *
 * PERSISTENCIA (decisión de diseño, ver chat-surface.tsx):
 * por defecto los ajustes manuales sólo rigen el PRÓXIMO mensaje — se
 * resetean a automático justo después de enviarlo. Si el usuario marca
 * «Recordar para este chat», se guardan en `ChatConfig.ajustesRespuesta`
 * (el mismo almacén por conversación que ya usa `patchChatConfig`/
 * `getChatConfig`, sincronizado en la nube) y siguen aplicándose turno a
 * turno hasta que el usuario los cambie o los quite. Es la opción más
 * honesta: no hay un tercer estado oculto ("recordado pero el usuario ya lo
 * olvidó") — lo persistente vive exactamente donde vive cualquier otro
 * ajuste por chat, y lo no-persistente se ve y se resetea solo.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type NivelEsfuerzo = "rapido" | "equilibrado" | "profundo" | "maximo";

export type TipoRespuesta =
  | "auto"
  | "breve"
  | "explicada"
  | "paso_a_paso"
  | "lista"
  | "codigo"
  | "conversacion";

export type TiempoMaximo = "5s" | "15s" | "30s" | "1min" | "3min" | "sin_limite";

/** Un control con su PROPIO interruptor «Automático» (Adenda «Más ajustes»). */
export interface ControlAjuste<T> {
  /** true (por defecto) = ignora `valor`, este control no aporta nada. */
  auto: boolean;
  /** Posición del deslizador/segmentado, conservada aunque `auto` esté ON
   *  (así el control no "olvida" dónde estaba el usuario al reactivarlo). */
  valor: T;
}

export interface AjustesManualRespuesta {
  esfuerzo: ControlAjuste<NivelEsfuerzo>;
  tipo: ControlAjuste<TipoRespuesta>;
  tiempo: ControlAjuste<TiempoMaximo>;
}

/** Contexto opcional del turno — reservado para matices futuros (p.ej. si la
 *  voz en vivo ya está sonando). Hoy no cambia el resultado: aditivo. */
export interface ContextoResolucionAjustes {
  vozActiva?: boolean;
}

export interface PistaDeRuta {
  /** Delta aditivo -1..1 sobre `estimateDifficulty()` (router.ts). 0 = sin sesgo. */
  difficultyDelta: number;
}

export interface AjustesResueltos {
  /** `undefined` = sin tope explícito (automático, comportamiento sin cambios). */
  maxTokens?: number;
  /** Frase en español para anteponer al system prompt. "" = automático (nada). */
  instruccion: string;
  /** Plazo aproximado en ms para todo el turno. `undefined` = sin límite explícito. */
  plazoMs?: number;
  pistaDeRuta: PistaDeRuta;
  /** Texto compacto para el badge del compositor; "" si todo es automático. */
  badge: string;
}

// ── Catálogos (orden = el que pinta el deslizador/segmentado) ───────────────

export const ORDEN_ESFUERZO: readonly NivelEsfuerzo[] = ["rapido", "equilibrado", "profundo", "maximo"];

export const ORDEN_TIPOS: readonly TipoRespuesta[] = [
  "auto", "breve", "explicada", "paso_a_paso", "lista", "codigo", "conversacion",
];

export const ORDEN_TIEMPOS: readonly TiempoMaximo[] = ["5s", "15s", "30s", "1min", "3min", "sin_limite"];

interface NivelEsfuerzoDef {
  etiqueta: string;
  /** Explicación de una línea: qué cambia de verdad (modelo/razonamiento/fuentes). */
  explicacion: string;
  difficultyDelta: number;
  maxTokens: number;
}

export const NIVELES_ESFUERZO: Readonly<Record<NivelEsfuerzo, NivelEsfuerzoDef>> = {
  rapido: {
    etiqueta: "Rápido",
    explicacion: "Modelo ligero y veloz (a menudo local): razonamiento mínimo, respuesta corta, sin ampliar fuentes ni herramientas.",
    difficultyDelta: -0.45,
    maxTokens: 600,
  },
  equilibrado: {
    etiqueta: "Equilibrado",
    explicacion: "El reparto normal de Astraura: modelo y profundidad según lo que pida cada turno, sin forzar ni lo rápido ni lo pesado.",
    difficultyDelta: 0,
    maxTokens: 1600,
  },
  profundo: {
    etiqueta: "Profundo",
    explicacion: "Modelos más capaces (incluida la nube si hace falta), más margen de razonamiento y más fuentes/herramientas cuando ayudan.",
    difficultyDelta: 0.3,
    maxTokens: 3200,
  },
  maximo: {
    etiqueta: "Máximo",
    explicacion: "Prioriza el modelo más fuerte disponible por encima de la cuota o el tiempo: para lo que de verdad importa.",
    difficultyDelta: 0.55,
    maxTokens: 6000,
  },
};

interface TipoRespuestaDef {
  etiqueta: string;
  /** "" para "auto" — sin instrucción, comportamiento sin cambios. */
  instruccion: string;
}

export const TIPOS_RESPUESTA: Readonly<Record<TipoRespuesta, TipoRespuestaDef>> = {
  auto: {
    etiqueta: "Automático",
    instruccion: "",
  },
  breve: {
    etiqueta: "Breve",
    instruccion: "Responde de forma BREVE: ve directa a la conclusión, sin rodeos ni relleno innecesario.",
  },
  explicada: {
    etiqueta: "Explicada",
    instruccion: "Responde de forma EXPLICADA: desarrolla el razonamiento y el contexto necesario para que se entienda bien, con ejemplos si ayudan.",
  },
  paso_a_paso: {
    etiqueta: "Paso a paso",
    instruccion: "Responde en PASOS numerados y secuenciales, uno por línea, fáciles de seguir en orden.",
  },
  lista: {
    etiqueta: "Lista",
    instruccion: "Responde en forma de LISTA con viñetas, agrupando los puntos clave sin desarrollarlos en párrafos largos.",
  },
  codigo: {
    etiqueta: "Código",
    instruccion: "Responde priorizando bloques de CÓDIGO completos y funcionales; el texto alrededor debe ser el mínimo imprescindible.",
  },
  conversacion: {
    etiqueta: "Conversación (voz natural)",
    instruccion: "Responde en tono CONVERSACIONAL, como si hablaras en voz alta: frases cortas y naturales, pensadas para sonar bien leídas por voz.",
  },
};

interface TiempoMaximoDef {
  etiqueta: string;
  /** `undefined` para "sin_limite": sin plazo, aunque el control esté en manual. */
  ms?: number;
}

export const TIEMPOS_MAXIMOS: Readonly<Record<TiempoMaximo, TiempoMaximoDef>> = {
  "5s": { etiqueta: "5 s", ms: 5_000 },
  "15s": { etiqueta: "15 s", ms: 15_000 },
  "30s": { etiqueta: "30 s", ms: 30_000 },
  "1min": { etiqueta: "1 min", ms: 60_000 },
  "3min": { etiqueta: "3 min", ms: 180_000 },
  sin_limite: { etiqueta: "sin límite", ms: undefined },
};

// ── Valores por defecto ──────────────────────────────────────────────────────

/** Los tres controles en «Automático» — estado inicial del popover. */
export function ajustesAutomaticosPorDefecto(): AjustesManualRespuesta {
  return {
    esfuerzo: { auto: true, valor: "equilibrado" },
    tipo: { auto: true, valor: "auto" },
    tiempo: { auto: true, valor: "30s" },
  };
}

/** Resultado de resolver los defaults — igual que llamar a
 *  `resolverAjustes(true, ajustesAutomaticosPorDefecto())`, expuesto como
 *  constante para el camino rápido (composer sin tocar nada). */
export const AJUSTES_RESUELTOS_AUTOMATICOS: AjustesResueltos = Object.freeze({
  maxTokens: undefined,
  instruccion: "",
  plazoMs: undefined,
  pistaDeRuta: { difficultyDelta: 0 },
  badge: "",
});

/** ¿Los tres controles están en automático? (para decidir si mostrar el badge
 *  y si hay algo que "recordar para este chat"). */
export function esTodoAutomatico(m: AjustesManualRespuesta): boolean {
  return m.esfuerzo.auto && m.tipo.auto && m.tiempo.auto;
}

// ── Resolución ───────────────────────────────────────────────────────────────

/**
 * Traduce la selección del popover a las señales reales del pipeline.
 *
 * @param auto     Atajo global: true = ignora `manual` por completo y devuelve
 *                 el resultado 100% automático (lo usa el botón «Automático»
 *                 del badge para resetear con un solo clic sin tener que
 *                 desmontar los tres controles uno a uno).
 * @param manual   Selección de los tres controles, cada uno con su propio
 *                 interruptor «Automático» (ver `ControlAjuste`).
 * @param _contexto Reservado (hoy no cambia el resultado; ver JSDoc del tipo).
 */
export function resolverAjustes(
  auto: boolean,
  manual: AjustesManualRespuesta,
  _contexto: ContextoResolucionAjustes = {},
): AjustesResueltos {
  if (auto) return AJUSTES_RESUELTOS_AUTOMATICOS;

  const partesBadge: string[] = [];

  // ── Esfuerzo ──
  const nivelEsfuerzo = NIVELES_ESFUERZO[manual.esfuerzo.valor] ?? NIVELES_ESFUERZO.equilibrado;
  const esfuerzoAuto = manual.esfuerzo.auto;
  if (!esfuerzoAuto) partesBadge.push(nivelEsfuerzo.etiqueta);

  // ── Tipo de respuesta ──
  const tipoDef = TIPOS_RESPUESTA[manual.tipo.valor] ?? TIPOS_RESPUESTA.auto;
  const tipoEsAuto = manual.tipo.auto || manual.tipo.valor === "auto";
  if (!tipoEsAuto) partesBadge.push(tipoDef.etiqueta);

  // ── Tiempo máximo ──
  const tiempoDef = TIEMPOS_MAXIMOS[manual.tiempo.valor] ?? TIEMPOS_MAXIMOS["30s"];
  const tiempoAuto = manual.tiempo.auto;
  if (!tiempoAuto) {
    partesBadge.push(typeof tiempoDef.ms === "number" ? `≤${tiempoDef.etiqueta}` : tiempoDef.etiqueta);
  }

  return {
    maxTokens: esfuerzoAuto ? undefined : nivelEsfuerzo.maxTokens,
    instruccion: tipoEsAuto ? "" : tipoDef.instruccion,
    plazoMs: tiempoAuto ? undefined : tiempoDef.ms,
    pistaDeRuta: { difficultyDelta: esfuerzoAuto ? 0 : nivelEsfuerzo.difficultyDelta },
    badge: partesBadge.join(" · "),
  };
}

export default resolverAjustes;
