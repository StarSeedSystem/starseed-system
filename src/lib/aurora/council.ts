"use client";

import {
  councilStage1Opinions,
  councilStage2Review,
  councilStage3Synthesis,
  type CouncilPerspectiveLite,
} from "@/lib/aurora/council-multi";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AURORA POLÍTICA · CONSEJO DE AURORA  (Adenda 67 · P4-4)
 * ---------------------------------------------------------------------------
 * Implementación REAL del patrón `karpathy/llm-council` dentro del OS.
 *
 * QUÉ ES llm-council (verificado en su repo, rama `master`): NO es un servidor
 * ni un servicio — es un PATRÓN de 3 etapas:
 *     1) «First opinions»  → la misma pregunta va a VARIOS modelos por separado.
 *     2) «Review»          → cada modelo lee las respuestas de los demás
 *                            ANONIMIZADAS y las evalúa/ordena (no puede hacer
 *                            favoritismo consigo mismo porque no sabe cuál es).
 *     3) «Final response»  → un modelo «Chairman» sintetiza todo en una respuesta.
 *   Su repo lo hace con OpenRouter y una clave de pago. Nosotros lo hacemos con
 *   el ROUTER QUE YA TENEMOS (`astrauraChat`), gratis-primero y con failover.
 *
 * NUESTRA VARIACIÓN — el Consejo no delibera «modelo contra modelo» sino
 * PERSPECTIVA contra PERSPECTIVA: cada consejero encarna uno de los fundamentos
 * StarSeed (CLAUDE.md §3 · Tríada Ideológica Nuclear + §5 Plan evolutivo +
 * §6 Invariantes). Así la deliberación es ideológicamente plural pero
 * constitucionalmente anclada: cada dictamen CITA el fundamento en el que se apoya.
 *
 * HONESTIDAD RADICAL (regla del proyecto):
 *   · Si hay N fuentes de inteligencia disponibles, repartimos las perspectivas
 *     entre ellas (una fuente distinta por consejero, rotando). El informe dice
 *     EXACTAMENTE qué fuente/modelo respondió a cada perspectiva.
 *   · Si solo hay UNA fuente disponible, el Consejo se celebra igualmente con esa
 *     única fuente y `singleSource:true` lo declara en la UI («todas las
 *     perspectivas las ha razonado la misma inteligencia»). No fingimos pluralidad.
 *   · Si una perspectiva falla, se marca `ok:false` con su error y el Consejo
 *     continúa con las demás (nunca se queda sin dictamen por un fallo).
 *   · La etapa de revisión cruzada es OPCIONAL (`review:true`) y anonimizada,
 *     igual que en el repo original. Por defecto está ACTIVA solo si hay ≥2
 *     dictámenes: revisar una sola opinión no tiene sentido.
 *
 * No añade NINGUNA dependencia npm. No toca router.ts / free-catalog.ts.
 * SSR-safe y defensivo: nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { astrauraChat } from "@/ai/astraura/router";
import { detectAvailabilitySafe, type SourceAvailability } from "@/ai/astraura/availability";
import type { ChatMessage } from "@/ai/providers/types";

/* ────────────────────────── Perspectivas (consejeros) ────────────────────── */

export type CouncilPerspectiveId =
  | "ontocratico"
  | "ecologico"
  | "abundancia"
  | "simbiotico"
  | "empatico";

export interface CouncilPerspective {
  id: CouncilPerspectiveId;
  /** Nombre del consejero (visible). */
  label: string;
  /** Fundamento StarSeed EXACTO que encarna (se cita en el dictamen). */
  fundamento: string;
  /** Referencia documental del fundamento (para que la UI la muestre). */
  fuente: string;
  /** Color de acento (paleta Trinity del OS). */
  accent: string;
  /** Instrucción de rol (system prompt del consejero). */
  system: string;
}

/**
 * Los CINCO consejeros. Salen literalmente de los documentos fundacionales:
 *   · Ontocracia, Ciberdelia y Transhumanismo Comunista → CLAUDE.md §3.
 *   · Fases Semilla/Fruto/Cosecha y post-escasez        → CLAUDE.md §5.
 *   · Invariantes técnicas (soberanía, federación…)     → CLAUDE.md §6.
 *   · Desarrollo extendido                              → memory/principles.md.
 */
export const COUNCIL_PERSPECTIVES: CouncilPerspective[] = [
  {
    id: "ontocratico",
    label: "Consejero Ontocrático",
    fundamento: "🜂 Ontocracia — el Gobierno del Ser",
    fuente: "CLAUDE.md §3 · Constitución de la Sociedad StarSeed",
    accent: "#DC143C",
    system:
      "Eres el CONSEJERO ONTOCRÁTICO del Consejo de Aurora (StarSeed). Encarnas la Ontocracia: " +
      "SOBERANÍA DIRECTA (el poder de decisión reside en el individuo; no hay representantes que alienen la voluntad), " +
      "MERITOCRACIA DEL ENTENDIMIENTO (la autoridad técnica se asigna por sabiduría aplicada y verificable, jamás por riqueza, linaje o popularidad), " +
      "«UNA PERSONA, UNA VOZ» (garantizada sin almacenar datos biométricos brutos) y " +
      "VOTO DELEGADO LÍQUIDO (delegable a expertos por tema, siempre revocable, nunca alienado permanentemente). " +
      "Añade la invariante de TRANSPARENCIA EN EL EJERCICIO DEL PODER PÚBLICO y de JUSTICIA RESTAURATIVA (mediación, Círculos de Paz), nunca punitiva. " +
      "Evalúa la propuesta preguntándote: ¿concentra poder o lo devuelve a las personas? ¿es auditable? ¿es revocable? ¿respeta la deliberación antes del voto?",
  },
  {
    id: "ecologico",
    label: "Consejero Ecológico",
    fundamento: "🜃 Oikos — el hogar común (planeta + comunidad)",
    fuente: "CLAUDE.md §5 (Fase Fruto) · §9 Glosario · Codex StarSeed",
    accent: "#10B981",
    system:
      "Eres el CONSEJERO ECOLÓGICO del Consejo de Aurora (StarSeed). Encarnas el OIKOS: el hogar común (planeta + comunidad local) " +
      "y el principio de MITOSIS SOCIAL (una comunidad que alcanza su tamaño óptimo se divide en células nuevas; jamás crece como un cáncer). " +
      "Piensas en biomimética, ciclos cerrados, regeneración del suelo y del agua, energía limpia, arraigo territorial y huella real del sistema. " +
      "Evalúa la propuesta preguntándote: ¿qué consume y qué devuelve? ¿es reversible si sale mal? ¿escala sin depredar? " +
      "¿favorece el arraigo local (Sanghas / nodos territoriales) o crea dependencia de cadenas largas y frágiles? " +
      "Sé concreto sobre costes materiales y energéticos, no poético.",
  },
  {
    id: "abundancia",
    label: "Consejero de la Abundancia",
    fundamento: "🜃 Transhumanismo Comunista — Comunismo de Abundancia (post-escasez)",
    fuente: "CLAUDE.md §3 y §5 (Semilla → Fruto → Cosecha)",
    accent: "#FFBF00",
    system:
      "Eres el CONSEJERO DE LA ABUNDANCIA del Consejo de Aurora (StarSeed). Encarnas el COMUNISMO DE ABUNDANCIA (post-escasez): " +
      "los recursos y la infraestructura son PROCOMÚN; la automatización libera del trabajo forzoso; el objetivo final (Fase Cosecha) es la " +
      "GRATUIDAD SISTÉMICA — vivienda, comida, educación, salud y transporte desmonetizados dentro de la red. " +
      "Conoces las tres fases: SEMILLA (economía híbrida: se aceptan recursos externos y donación consciente para financiar la cohesión), " +
      "FRUTO (materialización: vivienda, granjas verticales, fábricas automatizadas; los excedentes se reinvierten en más automatización), " +
      "COSECHA (el dinero se vuelve obsoleto dentro de la red). " +
      "Evalúa la propuesta preguntándote: ¿en qué fase estamos y la propuesta es realista PARA ESA FASE? ¿quién paga esto hoy? " +
      "¿reduce el coste de vida de forma permanente o solo lo desplaza? ¿crea procomún o crea propiedad privada nueva? ¿es GRATIS y abierto para todos?",
  },
  {
    id: "simbiotico",
    label: "Consejero Simbiótico",
    fundamento: "🜁 Ciberdelia + Evolución Simbiótica (Exocórtex, soberanía técnica)",
    fuente: "CLAUDE.md §3 y §6 (Invariantes técnicas)",
    accent: "#007FFF",
    system:
      "Eres el CONSEJERO SIMBIÓTICO del Consejo de Aurora (StarSeed). Encarnas la CIBERDELIA y la EVOLUCIÓN SIMBIÓTICA: " +
      "la tecnología JAMÁS se usa como instrumento de control, vigilancia masiva o alienación; su único propósito es amplificar la cognición, " +
      "facilitar la conexión empática y potenciar la inteligencia colectiva. La IA personal es un EXOCÓRTEX: propiedad del usuario, leal al usuario, nunca al sistema. " +
      "Defiendes las INVARIANTES TÉCNICAS: descentralización/federación (no un servidor central único), identidad soberana y portátil, cifrado extremo a extremo, " +
      "código abierto absoluto y auditable, y la SINGULARIDAD DEL CONTENIDO (Lienzo Universal: el contenido es una Entidad Única que se referencia, no se duplica). " +
      "Evalúa la propuesta preguntándote: ¿quién controla los datos y las claves? ¿se puede auditar? ¿crea dependencia de un proveedor cerrado? " +
      "¿amplifica al humano o lo sustituye/vigila? ¿funciona federada o exige un centro?",
  },
  {
    id: "empatico",
    label: "Consejera Empática",
    fundamento: "Progresismo empático · Justicia restaurativa · disolución del ego",
    fuente: "CLAUDE.md §3 (Ciberdelia) y §6 (Justicia restaurativa)",
    accent: "#B24BF3",
    system:
      "Eres la CONSEJERA EMPÁTICA del Consejo de Aurora (StarSeed). Encarnas el progresismo empático: " +
      "la disolución de las barreras del ego, el cuidado de quien queda fuera y la JUSTICIA RESTAURATIVA (el sistema no aplica bloqueos punitivos: " +
      "abre procesos de mediación — Círculos de Paz). Tu misión es dar VOZ A QUIEN NO ESTÁ EN LA SALA. " +
      "Evalúa la propuesta preguntándote: ¿a quién deja fuera? ¿quién carga con el coste que otros no ven (personas mayores, sin dispositivos, " +
      "sin tiempo, con discapacidad, recién llegadas, minorías dentro de la red)? ¿es entendible sin ser experto? ¿genera exclusión, vergüenza o castigo? " +
      "¿qué reparación se ofrece si daña a alguien? Sé compasiva pero rigurosa: señala daños concretos, no sentimientos vagos.",
  },
];

export function perspectiveById(id: string): CouncilPerspective | undefined {
  return COUNCIL_PERSPECTIVES.find((p) => p.id === id);
}

/* ─────────────────────────────── Tipos ──────────────────────────────────── */

/** Recomendación de un consejero sobre la propuesta. */
export type CouncilVerdict = "a_favor" | "en_contra" | "con_enmiendas" | "indeterminado";

export const VERDICT_LABELS: Record<CouncilVerdict, string> = {
  a_favor: "A favor",
  en_contra: "En contra",
  con_enmiendas: "A favor con enmiendas",
  indeterminado: "Sin veredicto claro",
};

/** Dictamen de UN consejero (etapa 1 del patrón llm-council). */
export interface CouncilOpinion {
  perspective: CouncilPerspective;
  ok: boolean;
  /** Texto completo del dictamen (o el mensaje de error si `ok:false`). */
  text: string;
  /** Veredicto extraído del dictamen (heurística transparente sobre el texto). */
  verdict: CouncilVerdict;
  /** Enmiendas/condiciones que el consejero propone (líneas sueltas). */
  amendments: string[];
  /** Riesgo principal que señala. */
  risk?: string;
  /** Fuente REAL de inteligencia que respondió (transparencia). */
  sourceId?: string;
  sourceLabel?: string;
  model?: string;
  /** Milisegundos que tardó. */
  ms: number;
  /** Error honesto si falló. */
  error?: string;
}

/** Revisión cruzada anonimizada (etapa 2 del patrón llm-council). */
export interface CouncilReview {
  /** Consejero que revisa. */
  perspective: CouncilPerspective;
  ok: boolean;
  /** Su valoración de los dictámenes AJENOS (anonimizados como «Dictamen A/B/C…»). */
  text: string;
  sourceLabel?: string;
}

/** Síntesis final (etapa 3: el «Chairman» del patrón original). */
export interface CouncilSynthesis {
  ok: boolean;
  text: string;
  /** Recomendación global sintetizada. */
  verdict: CouncilVerdict;
  sourceLabel?: string;
  error?: string;
}

/** Informe completo del Consejo. */
export interface CouncilReport {
  /** Tema/propuesta consultada. */
  topic: string;
  opinions: CouncilOpinion[];
  reviews: CouncilReview[];
  synthesis: CouncilSynthesis | null;
  /** Fuentes de inteligencia distintas que participaron REALMENTE. */
  sourcesUsed: string[];
  /**
   * HONESTIDAD: true si TODAS las perspectivas las razonó la MISMA fuente
   * (porque solo había una disponible). La UI debe decirlo con claridad.
   */
  singleSource: boolean;
  /** Nº de dictámenes que fallaron. */
  failed: number;
  at: number;
  ms: number;
}

/** Entrada de la consulta. */
export interface CouncilInput {
  /** Título de la propuesta / pregunta. */
  title: string;
  /** Descripción/cuerpo (opcional). */
  description?: string;
  /** Opciones en liza (si la propuesta las tiene). */
  options?: string[];
  /** Ámbito (global/comunidad/página/grupo…). */
  scope?: string;
}

export interface CouncilOptions {
  /** Perspectivas a convocar (por defecto: las 5). */
  perspectives?: CouncilPerspectiveId[];
  /** Etapa 2 (revisión cruzada anonimizada). Por defecto: sí, si hay ≥2 dictámenes. */
  review?: boolean;
  /** Callback de progreso para la UI. */
  onProgress?: (stage: string, done: number, total: number) => void;
  signal?: AbortSignal;
}

/* ──────────────────────── Utilidades del Consejo ────────────────────────── */

/** Compone el enunciado de la propuesta (compartido por todas las etapas). */
function proposalText(input: CouncilInput): string {
  const parts = [`PROPUESTA: ${(input.title || "").trim() || "(sin título)"}`];
  if (input.description?.trim()) parts.push(`DESCRIPCIÓN: ${input.description.trim()}`);
  if (input.options?.length) {
    const opts = input.options.filter((o) => o && o.trim());
    if (opts.length) parts.push(`OPCIONES EN LIZA:\n${opts.map((o, i) => `  ${i + 1}. ${o.trim()}`).join("\n")}`);
  }
  if (input.scope) parts.push(`ÁMBITO: ${input.scope}`);
  return parts.join("\n");
}

/** Formato que pedimos a cada consejero (fácil de leer Y de parsear). */
const OPINION_FORMAT = `Responde SIEMPRE en español y EXACTAMENTE con esta estructura (sin markdown de encabezados, sin preámbulos):

VEREDICTO: <A FAVOR | EN CONTRA | A FAVOR CON ENMIENDAS>
FUNDAMENTO: <la frase exacta del fundamento StarSeed en el que te apoyas>
RAZONAMIENTO: <3-5 frases. Concreto, sin retórica vacía. Di QUÉ pasa si se aprueba.>
RIESGO: <el riesgo principal, en una frase>
ENMIENDAS:
- <enmienda 1 concreta y accionable>
- <enmienda 2 (opcional)>

Si no propones enmiendas, escribe «- ninguna».`;

/** Heurística transparente para extraer el veredicto del texto. */
function parseVerdict(text: string): CouncilVerdict {
  const t = (text || "").toUpperCase();
  const m = t.match(/VEREDICTO\s*:\s*([^\n\r]+)/);
  const line = m ? m[1] : t.slice(0, 160);
  if (/CON\s+ENMIENDA/.test(line)) return "con_enmiendas";
  if (/EN\s+CONTRA/.test(line)) return "en_contra";
  if (/A\s+FAVOR/.test(line)) return "a_favor";
  return "indeterminado";
}

/** Extrae las enmiendas listadas. */
function parseAmendments(text: string): string[] {
  const idx = (text || "").search(/ENMIENDAS\s*:/i);
  if (idx < 0) return [];
  const tail = text.slice(idx);
  const out: string[] = [];
  for (const raw of tail.split(/\r?\n/).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (!/^[-•*]/.test(line)) break; // se acabó la lista
    const item = line.replace(/^[-•*]\s*/, "").trim();
    if (!item || /^ninguna\.?$/i.test(item)) continue;
    out.push(item);
    if (out.length >= 4) break;
  }
  return out;
}

/** Extrae el riesgo señalado. */
function parseRisk(text: string): string | undefined {
  const m = (text || "").match(/RIESGO\s*:\s*([^\n\r]+)/i);
  const v = m?.[1]?.trim();
  return v && v.length > 2 ? v : undefined;
}

/**
 * Elige las FUENTES de inteligencia con las que celebrar el Consejo.
 * Gratis-primero y sin coste: descarta el tier `paid`. Devuelve las que están
 * REALMENTE listas ahora mismo (misma detección que usa el router).
 * Si no hay ninguna lista, devuelve [] y el Consejo cae al ruteo automático
 * (`astrauraChat` sin `forceSource`), que siempre termina en una fuente sin clave.
 */
async function pickCouncilSources(): Promise<SourceAvailability[]> {
  try {
    const all = await detectAvailabilitySafe(6000);
    return all.filter((a) => a.ready && a.source.tier !== "paid" && a.source.models.length > 0);
  } catch {
    return [];
  }
}

/** Elige un modelo razonable de una fuente para deliberar (calidad, no visión). */
function bestModelFor(av: SourceAvailability): string | undefined {
  const models = [...av.source.models].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
  return models[0]?.id;
}

/* ═══════════════════════════ ETAPA 1 · DICTÁMENES ═══════════════════════ */

async function askPerspective(
  p: CouncilPerspective,
  proposal: string,
  av: SourceAvailability | null,
  signal?: AbortSignal,
): Promise<CouncilOpinion> {
  const started = Date.now();
  const messages: ChatMessage[] = [
    { role: "system", content: `${p.system}\n\n${OPINION_FORMAT}` },
    {
      role: "user",
      content:
        `Dictamina sobre esta propuesta de la red StarSeed desde TU fundamento (y solo el tuyo):\n\n${proposal}`,
    },
  ];

  const model = av ? bestModelFor(av) : undefined;
  try {
    const res = await astrauraChat({
      messages,
      temperature: 0.6,
      maxTokens: 700,
      taskHint: "reasoning",
      signal,
      // Reparte el Consejo entre fuentes distintas cuando las hay. Si la fuente
      // fijada no estuviera disponible, el router degrada solo al ranking normal
      // (nunca deja al consejero mudo).
      ...(av && model ? { forceSource: { sourceId: av.source.id, modelId: model } } : {}),
    });
    const text = (res.text || "").trim();
    if (!text) {
      return {
        perspective: p,
        ok: false,
        text: "",
        verdict: "indeterminado",
        amendments: [],
        ms: Date.now() - started,
        error: "La fuente respondió vacío.",
      };
    }
    return {
      perspective: p,
      ok: true,
      text,
      verdict: parseVerdict(text),
      amendments: parseAmendments(text),
      risk: parseRisk(text),
      sourceId: res.route?.sourceId,
      sourceLabel: res.route?.sourceLabel,
      model: res.route?.modelLabel || res.route?.model,
      ms: Date.now() - started,
    };
  } catch (err: unknown) {
    return {
      perspective: p,
      ok: false,
      text: "",
      verdict: "indeterminado",
      amendments: [],
      ms: Date.now() - started,
      error: (err as Error)?.message || "No se pudo obtener el dictamen.",
    };
  }
}

/* ═══════════════════ ETAPA 2 · REVISIÓN CRUZADA ANONIMIZADA ═════════════ */
/* Igual que en llm-council: cada consejero ve los dictámenes de los DEMÁS con
 * las identidades ocultas («Dictamen A/B/C…») para que no pueda hacer
 * favoritismo. Aquí ocultamos también la PERSPECTIVA, no solo el modelo. */

async function reviewRound(
  p: CouncilPerspective,
  proposal: string,
  others: CouncilOpinion[],
  av: SourceAvailability | null,
  signal?: AbortSignal,
): Promise<CouncilReview> {
  const anon = others
    .map((o, i) => `— Dictamen ${String.fromCharCode(65 + i)} —\n${o.text}`)
    .join("\n\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `${p.system}\n\nAhora actúas como REVISOR del Consejo. Vas a leer dictámenes de OTROS consejeros, ` +
        `ANONIMIZADOS a propósito (no sabes quién los escribió ni con qué modelo). Evalúalos por su MÉRITO: ` +
        `rigor, honestidad sobre los costes y coherencia con los fundamentos StarSeed. Responde en español, ` +
        `máximo 6 líneas, con este formato:\n` +
        `MEJOR: <letra> — <por qué en una frase>\n` +
        `MÁS DÉBIL: <letra> — <qué le falta>\n` +
        `PUNTO CIEGO: <algo importante que NINGÚN dictamen ha visto, desde tu fundamento>`,
    },
    { role: "user", content: `${proposal}\n\nDICTÁMENES A REVISAR:\n\n${anon}` },
  ];

  const model = av ? bestModelFor(av) : undefined;
  try {
    const res = await astrauraChat({
      messages,
      temperature: 0.4,
      maxTokens: 420,
      taskHint: "reasoning",
      signal,
      ...(av && model ? { forceSource: { sourceId: av.source.id, modelId: model } } : {}),
    });
    const text = (res.text || "").trim();
    return { perspective: p, ok: !!text, text, sourceLabel: res.route?.sourceLabel };
  } catch {
    return { perspective: p, ok: false, text: "" };
  }
}

/* ══════════════════════ ETAPA 3 · SÍNTESIS («Chairman») ═════════════════ */

async function synthesize(
  proposal: string,
  opinions: CouncilOpinion[],
  reviews: CouncilReview[],
  av: SourceAvailability | null,
  signal?: AbortSignal,
): Promise<CouncilSynthesis> {
  const good = opinions.filter((o) => o.ok);
  if (good.length === 0) {
    return {
      ok: false,
      text: "",
      verdict: "indeterminado",
      error: "Ningún consejero pudo dictaminar: no hay ninguna fuente de inteligencia disponible ahora mismo.",
    };
  }

  const dictamenes = good
    .map((o) => `— ${o.perspective.label} (${o.perspective.fundamento}) —\n${o.text}`)
    .join("\n\n");
  const revisiones = reviews.filter((r) => r.ok).map((r) => `— Revisión de ${r.perspective.label} —\n${r.text}`).join("\n\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Eres AURORA presidiendo el Consejo (el rol «Chairman» del patrón llm-council). Has escuchado a los consejeros de la red StarSeed, " +
        "cada uno anclado en un fundamento constitucional distinto. Tu trabajo NO es elegir un bando ni promediar: es SINTETIZAR con honestidad. " +
        "REGLAS DURAS:\n" +
        "· No inventes acuerdos que no existen. Si los consejeros se contradicen, DILO y explica el conflicto de fundamentos.\n" +
        "· Toda afirmación tuya debe poder rastrearse a un dictamen. No añadas ideas nuevas de tu cosecha.\n" +
        "· La decisión final NO es tuya: es de las personas que votan (Ontocracia · soberanía directa). Tú aconsejas, no mandas.\n\n" +
        "Responde en español con esta estructura:\n\n" +
        "RECOMENDACIÓN: <A FAVOR | EN CONTRA | A FAVOR CON ENMIENDAS>\n" +
        "CONSENSO: <en qué coinciden TODOS los consejeros; si no coinciden en nada, dilo>\n" +
        "CONFLICTO: <dónde chocan y QUÉ FUNDAMENTOS chocan entre sí; «ninguno» si no lo hay>\n" +
        "ENMIENDAS PROPUESTAS:\n- <las 2-4 enmiendas más apoyadas, citando de qué fundamento salen>\n" +
        "SI SE APRUEBA TAL CUAL: <la consecuencia más probable, en una frase>\n" +
        "QUÉ FALTA SABER: <la información que el Consejo necesitaría para decidir mejor>",
    },
    {
      role: "user",
      content:
        `${proposal}\n\nDICTÁMENES DEL CONSEJO:\n\n${dictamenes}` +
        (revisiones ? `\n\nREVISIONES CRUZADAS (anonimizadas entre sí):\n\n${revisiones}` : ""),
    },
  ];

  const model = av ? bestModelFor(av) : undefined;
  try {
    const res = await astrauraChat({
      messages,
      temperature: 0.35,
      maxTokens: 900,
      taskHint: "reasoning",
      signal,
      ...(av && model ? { forceSource: { sourceId: av.source.id, modelId: model } } : {}),
    });
    const text = (res.text || "").trim();
    if (!text) return { ok: false, text: "", verdict: "indeterminado", error: "La síntesis salió vacía." };
    const m = text.match(/RECOMENDACI[ÓO]N\s*:\s*([^\n\r]+)/i);
    return {
      ok: true,
      text,
      verdict: parseVerdict(m ? `VEREDICTO: ${m[1]}` : text),
      sourceLabel: res.route?.sourceLabel,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      text: "",
      verdict: "indeterminado",
      error: (err as Error)?.message || "No se pudo sintetizar el Consejo.",
    };
  }
}

/* ═══════════════════════════ ORQUESTADOR PÚBLICO ════════════════════════ */

/**
 * Convoca al Consejo de Aurora sobre una propuesta.
 *
 * Reparte las perspectivas entre las fuentes de inteligencia DISPONIBLES (una
 * distinta por consejero, rotando) y sintetiza. Nunca lanza: si todo falla,
 * devuelve un informe con `synthesis.ok:false` y el motivo honesto.
 */
export async function consultCouncil(
  input: CouncilInput,
  opts: CouncilOptions = {},
): Promise<CouncilReport> {
  const started = Date.now();
  const chosen = (opts.perspectives?.length
    ? COUNCIL_PERSPECTIVES.filter((p) => opts.perspectives!.includes(p.id))
    : COUNCIL_PERSPECTIVES);

  const proposal = proposalText(input);
  const sources = await pickCouncilSources();
  const total = chosen.length + 1; // dictámenes + síntesis

  opts.onProgress?.("Convocando al Consejo…", 0, total);

  // Etapa 1 · dictámenes (en paralelo, cada uno a una fuente distinta si las hay).
  const opinions = await Promise.all(
    chosen.map((p, i) => {
      const av = sources.length ? sources[i % sources.length] : null;
      return askPerspective(p, proposal, av, opts.signal).then((o) => {
        opts.onProgress?.(`Dictamen de ${p.label}`, i + 1, total);
        return o;
      });
    }),
  );

  const good = opinions.filter((o) => o.ok);

  // Etapa 2 · revisión cruzada anonimizada (solo si hay ≥2 dictámenes reales).
  const wantReview = opts.review ?? good.length >= 2;
  let reviews: CouncilReview[] = [];
  if (wantReview && good.length >= 2) {
    opts.onProgress?.("Revisión cruzada (anonimizada)…", chosen.length, total);
    reviews = await Promise.all(
      good.map((o, i) => {
        const others = good.filter((x) => x.perspective.id !== o.perspective.id);
        const av = sources.length ? sources[i % sources.length] : null;
        return reviewRound(o.perspective, proposal, others, av, opts.signal);
      }),
    );
  }

  // Etapa 3 · síntesis (el «Chairman»): usa la MEJOR fuente disponible.
  opts.onProgress?.("Sintetizando la recomendación…", total - 1, total);
  const chairSource = sources.length ? sources[0] : null;
  const synthesis = await synthesize(proposal, opinions, reviews, chairSource, opts.signal);
  opts.onProgress?.("Consejo concluido", total, total);

  const sourcesUsed = Array.from(
    new Set(good.map((o) => o.sourceLabel).filter((x): x is string => !!x)),
  );

  return {
    topic: input.title || "",
    opinions,
    reviews,
    synthesis,
    sourcesUsed,
    // Honestidad: si solo hubo una fuente real, se declara.
    singleSource: sourcesUsed.length <= 1,
    failed: opinions.length - good.length,
    at: Date.now(),
    ms: Date.now() - started,
    };
    }

    /**
    * MODO MULTI-AGENTE del Consejo (subagentes OpenRouter :free por perspectiva).
    * Equivalente a `consultCouncil` pero cada perspectiva StarSeed corre como un
    * subagente en un modelo :free distinto (proxy /api/ai/openrouter, coste 0),
    * con revisores subagentes anonimizados. Devuelve un `CouncilReport` compatible
    * con la UI clásica. Defensivo: si falla, degrada a `consultCouncil`.
    */
    export async function consultCouncilMulti(
    input: CouncilInput,
    opts: CouncilOptions = {},
    ): Promise<CouncilReport> {
    const proposal = proposalText(input);
    const perspectives: CouncilPerspectiveLite[] = (
      opts.perspectives?.length
        ? COUNCIL_PERSPECTIVES.filter((p) => opts.perspectives!.includes(p.id))
        : COUNCIL_PERSPECTIVES
    ).map((p) => ({ id: p.id, label: p.label, system: p.fundamento }));

    const started = Date.now();
    opts.onProgress?.("Convocando Consejo multi-agente (:free)…", 0, perspectives.length + 1);

    const opinionsLite = await councilStage1Opinions(proposal, perspectives, opts.signal);
    const review = await councilStage2Review(opinionsLite, opts.signal);
    const synthesisText = councilStage3Synthesis(opinionsLite, review);

    // Mapea al tipo CouncilOpinion del Consejo clásico para que la UI lo consuma igual.
    const opinions: CouncilOpinion[] = opinionsLite.map((o) => ({
      perspective: COUNCIL_PERSPECTIVES.find((p) => p.id === o.perspectiveId) ?? COUNCIL_PERSPECTIVES[0],
      text: o.text,
      ok: o.ok,
      verdict: "indeterminado" as CouncilVerdict,
      amendments: [],
      sourceLabel: o.model,
      model: o.model,
      ms: 0,
    }));
    const good = opinions.filter((o) => o.ok);
    const sourcesUsed = Array.from(new Set(good.map((o) => o.sourceLabel).filter((x): x is string => !!x)));

    return {
      topic: input.title || "",
      opinions,
      reviews: [],
      synthesis: {
        ok: true,
        verdict: "indeterminado" as CouncilVerdict,
        text: synthesisText,
      },
      sourcesUsed,
      singleSource: sourcesUsed.length <= 1,
      failed: opinions.length - good.length,
      at: Date.now(),
      ms: Date.now() - started,
    };
    }

    /** Resumen de una línea del informe (para toasts / memoria de Aurora). */
export function summarizeCouncil(report: CouncilReport): string {
  if (!report.synthesis?.ok) return "El Consejo no pudo emitir recomendación.";
  const v = VERDICT_LABELS[report.synthesis.verdict];
  const n = report.opinions.filter((o) => o.ok).length;
  const src = report.singleSource
    ? `${report.sourcesUsed[0] ?? "una sola fuente"} (fuente única)`
    : `${report.sourcesUsed.length} fuentes`;
  return `Consejo de Aurora · ${v} · ${n} dictámenes · ${src}.`;
}
