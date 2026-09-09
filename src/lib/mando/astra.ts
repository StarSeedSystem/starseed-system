/**
 * Astra — director de orquestación y artista-diseñador de sistemas del OS.
 *
 * Ola 294 · Tarea AR1 (2026-09-08). Por qué: Alex pidió integrar
 * `gpt-6-astra` (OpenAI, primer proveedor de pago de la flota) como
 * DIRECTOR que audita todos los contextos del OS y propone mejoras
 * priorizadas — nunca como escritor a granel (eso es de la flota
 * gratuita). Por eso este módulo es de funciones PURAS: definir su
 * identidad, estructurar sus sugerencias, priorizarlas y ponerle un
 * TECHO DE GASTO duro. Nunca contiene ni nombra valores de claves;
 * la clave vive solo en la variable `OPENAI_API_KEY` del entorno.
 */

export interface AmbitoAstra {
  id: string;
  etiqueta: string;
  queMira: string;
}

/** Los contextos del OS que Astra audita (concretos para este repositorio). */
export const AMBITOS_ASTRA: readonly AmbitoAstra[] = [
  { id: "funciones", etiqueta: "Funciones", queMira: "Qué hace falta y no está: capacidades que el OS promete (CLAUDE.md) y aún no existen." },
  { id: "diseno", etiqueta: "Diseño", queMira: "Identidad Crystal Liquid Glass y Trinity: coherencia visual, jerarquía, movimiento y tokens del design system." },
  { id: "arquitectura", etiqueta: "Arquitectura", queMira: "Capas, acoplamientos y deuda técnica entre src/lib, src/components y src/app." },
  { id: "accesibilidad", etiqueta: "Accesibilidad", queMira: "Contraste, foco, lectores de pantalla y navegación por teclado en las superficies del OS." },
  { id: "rendimiento", etiqueta: "Rendimiento", queMira: "Costes de render, bundles y llamadas repetidas; la Mac de 8 GB manda." },
  { id: "seguridad-y-claves", etiqueta: "Seguridad y claves", queMira: "Que ninguna clave toque el cliente ni el repo, listas blancas de lectura y rutas /api/mando/* solo locales." },
  { id: "economia-de-agentes", etiqueta: "Economía de agentes", queMira: "Orquestación sin agotar créditos: escritores gratuitos, revisores baratos y ningún derrape de cuota." },
  { id: "contenido-y-canales", etiqueta: "Contenido y canales", queMira: "Feed, publicación y singularidad del contenido (Entidad Única, se referencia, no se duplica)." },
  { id: "descubribilidad", etiqueta: "Descubribilidad", queMira: "La regla dorada del CLAUDE.md §11: una ruta que no está en el OmniDock ni en el catálogo de apps no existe para el usuario." },
] as const;

/** Puntuación discreta 1..5 (impacto, esfuerzo, riesgo). Compartida por todos los campos. */
export type Puntuacion = 1 | 2 | 3 | 4 | 5;

/** Tarea propuesta por Astra lista para caer en una ola del enjambre. */
export interface PropuestaTarea {
  titulo: string;
  archivos: string[];
  prompt: string;
}

/**
 * Una sugerencia estructurada de Astra. El campo `evidencia` cita SIEMPRE
 * archivo y línea; `archivos` los lista limpios para el Mando. `impacto`,
 * `esfuerzo` y `riesgo` van en 1..5 (5 = más impacto / más esfuerzo / más riesgo).
 */
export interface SugerenciaAstra {
  id: string;
  ambito: AmbitoAstra["id"];
  titulo: string;
  porque: string;
  evidencia: string[];
  impacto: Puntuacion;
  esfuerzo: Puntuacion;
  riesgo: Puntuacion;
  archivos: string[];
  propuestaDeTarea: PropuestaTarea | null;
}

/** Busca el objeto de ámbito por su id; null si no existe. */
export function ambitoPorId(id: string): AmbitoAstra | null {
  for (const a of AMBITOS_ASTRA) if (a.id === id) return a;
  return null;
}

/**
 * Construye el prompt de Astra para un ámbito y un contexto. PURA: no toca
 * red, disco ni entorno. El `system` define a Astra como director-artista-
 * diseñador de sistemas, cita el archivo y la línea, respeta la Tríada
 * Ideológica del proyecto y devuelve JSON estricto de la forma
 * `SugerenciaAstra[]`. El `user` lleva el ámbito concreto y el contexto.
 */
export function promptAstra(ambito: string, contexto: string): { system: string; user: string } {
  const a = ambitoPorId(ambito);
  const etiqueta = a ? a.etiqueta : ambito;
  const queMira = a ? a.queMira : "Auditoría general del OS.";

  const system = [
    "Eres Astra, director de orquestación y artista-diseñador de sistemas de StarSeed OS.",
    "Tu papel es AUDITAR y PROPONER, nunca escribir código a granel: la flota gratuita del enjambre se encarga de eso.",
    "Eres perfeccionista, concreto y citable: cada sugerencia incluye SIEMPRE el archivo y la línea exactos (formato `ruta/archivo.ts:NNN`).",
    "No propones nada que ya exista en el repositorio ni en las memorias: primero comprueba con el grafo de código y con la documentación viva.",
    "Respetas la Tríada Ideológica del proyecto —ontocracia, ciberdelia, transhumanismo comunista— y las invariantes del §6 del CLAUDE.md (descentralización, identidad soberana, código abierto, singularidad del contenido, privacidad/transparencia dual, dualidad cuenta/perfil, justicia restaurativa).",
    "Respondes ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con la forma de `SugerenciaAstra[]` y nada más. Cada elemento tiene los campos: id, ambito, titulo, porque, evidencia (citas con archivo y línea), impacto (1-5), esfuerzo (1-5), riesgo (1-5), archivos (rutas relativas), propuestaDeTarea (objeto {titulo, archivos, prompt} o null).",
  ].join(" ");

  const user = [
    `ÁMBITO: ${etiqueta} (id=${a ? a.id : ambito}).`,
    `QUÉ MIRAR: ${queMira}`,
    "",
    "CONTEXTO:",
    contexto,
    "",
    "Devuelve solo el JSON con la lista de sugerencias. Si no hay nada que mejorar en este ámbito, devuelve [].",
  ].join("\n");

  return { system, user };
}

/** Fija un valor a 1..5 (clamp); si no es número, devuelve 3 (neutro). */
function clampPuntuacion(v: unknown): Puntuacion {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 3;
  const c = Math.max(1, Math.min(5, n));
  return c as Puntuacion;
}

/** Cadena vacía → array vacío. Si no es string, devuelve []. */
function aListaDeTexto(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x.trim().length > 0) out.push(x.trim());
  return out;
}

/** Quita vallas ```json ... ```, espacios y comillas envolventes para extraer el JSON. */
function extraerJson(bruto: string): string {
  let s = bruto.trim();
  const valla = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (valla && valla[1]) s = valla[1].trim();
  if (s.startsWith("```")) s = s.slice(3).trim();
  if (s.endsWith("```")) s = s.slice(0, -3).trim();
  return s;
}

/** Genera un id estable para una sugerencia que no trae uno. */
function idParaSugerencia(s: Record<string, unknown>, i: number): string {
  const base = `${String(s.ambito ?? "astra")}-${String(s.titulo ?? i)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `astra-${i}`;
}

/** Construye un `SugerenciaAstra` válido a partir de un objeto laxo, o null si no se puede. */
function normalizarSugerencia(raw: unknown, índice: number): SugerenciaAstra | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.titulo !== "string" || r.titulo.trim().length === 0) return null;
  const ambito = typeof r.ambito === "string" ? r.ambito : "funciones";
  const propuesta = (() => {
    const p = r.propuestaDeTarea;
    if (!p || typeof p !== "object") return null;
    const pp = p as Record<string, unknown>;
    if (typeof pp.titulo !== "string") return null;
    return {
      titulo: pp.titulo,
      archivos: aListaDeTexto(pp.archivos),
      prompt: typeof pp.prompt === "string" ? pp.prompt : "",
    };
  })();
  return {
    id: typeof r.id === "string" && r.id.trim().length > 0 ? r.id : idParaSugerencia(r, índice),
    ambito,
    titulo: r.titulo,
    porque: typeof r.porque === "string" ? r.porque : "",
    evidencia: aListaDeTexto(r.evidencia),
    impacto: clampPuntuacion(r.impacto),
    esfuerzo: clampPuntuacion(r.esfuerzo),
    riesgo: clampPuntuacion(r.riesgo),
    archivos: aListaDeTexto(r.archivos),
    propuestaDeTarea: propuesta,
  };
}

/**
 * Parsea la respuesta cruda de Astra. PURA y tolerante:
 *  - acepta JSON pelado o dentro de vallas ```json ... ```;
 *  - descarta entradas que no tengan `titulo`;
 *  - normaliza `impacto/esfuerzo/riesgo` a 1..5;
 *  - rellena `id` cuando falta.
 *  Si la cadena no parsea, devuelve [] (no lanza).
 */
export function parsearSugerencias(bruto: string): SugerenciaAstra[] {
  if (typeof bruto !== "string" || bruto.trim().length === 0) return [];
  const json = extraerJson(bruto);
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  const lista = Array.isArray(datos) ? datos : datos && typeof datos === "object" && Array.isArray((datos as { sugerencias?: unknown[] }).sugerencias)
    ? (datos as { sugerencias: unknown[] }).sugerencias
    : [];
  const out: SugerenciaAstra[] = [];
  for (let i = 0; i < lista.length; i++) {
    const s = normalizarSugerencia(lista[i], i);
    if (s) out.push(s);
  }
  return out;
}

/** Ordena por `impacto*2 - esfuerzo - riesgo` descendente, desempatando por ámbito. */
export function priorizar(sugerencias: SugerenciaAstra[]): SugerenciaAstra[] {
  const copia = sugerencias.slice();
  copia.sort((a, b) => {
    const sa = a.impacto * 2 - a.esfuerzo - a.riesgo;
    const sb = b.impacto * 2 - b.esfuerzo - b.riesgo;
    if (sa !== sb) return sb - sa;
    return a.ambito.localeCompare(b.ambito);
  });
  return copia;
}

/**
 * Precios por millón de tokens (USD) para los modelos que Astra puede usar.
 * Fuente: tarifas públicas de OpenAI (precios de `gpt-6` aún pendientes de
 * publicación oficial a 2026-09-08; los valores de `gpt-5.4` sirven de
 * estimación y se marcan con la nota `estimado`). Si el modelo no está en
 * la tabla, `costeEstimado` devuelve 0 (no lanza) y la política de
 * presupuesto lo rechaza cerrado.
 */
export const PRECIOS_POR_MILLON: Record<string, { entrada: number; salida: number; nota?: string }> = {
  "gpt-6-astra": { entrada: 5, salida: 15, nota: "estimado (aún sin tarifa pública oficial)" },
  "gpt-5.4": { entrada: 2.5, salida: 10, nota: "estimado" },
  "gpt-5.4-mini": { entrada: 0.25, salida: 2, nota: "estimado" },
  "gpt-5.5-pro": { entrada: 5, salida: 20, nota: "estimado" },
};

/** Coste estimado en USD para una llamada a un modelo. 0 si el modelo no está tabulado. */
export function costeEstimado(modelo: string, tokensIn: number, tokensOut: number): number {
  if (typeof modelo !== "string") return 0;
  const clave = modelo.trim();
  const precio = PRECIOS_POR_MILLON[clave];
  if (!precio) return 0;
  const ti = Number.isFinite(tokensIn) && tokensIn > 0 ? tokensIn : 0;
  const to = Number.isFinite(tokensOut) && tokensOut > 0 ? tokensOut : 0;
  return (ti / 1_000_000) * precio.entrada + (to / 1_000_000) * precio.salida;
}

/** Coste 0 → siempre dentro (gratis). Coste > 0 sin techo → fuera (fallar cerrado). */
export function dentroDePresupuesto(
  gastadoHoyUsd: number,
  costeNuevo: number,
  techoUsd: number,
): { ok: boolean; motivo: string } {
  const gastado = Number.isFinite(gastadoHoyUsd) ? gastadoHoyUsd : 0;
  const nuevo = Number.isFinite(costeNuevo) ? costeNuevo : 0;
  const techo = Number.isFinite(techoUsd) ? techoUsd : 0;

  if (nuevo <= 0) {
    return { ok: true, motivo: `Llamada sin coste (modelo gratis o desconocido): 0,00 USD.` };
  }
  if (techo <= 0) {
    return { ok: false, motivo: `Sin techo de gasto configurado y la llamada cuesta ${nuevo.toFixed(4)} USD: rechazo por defecto.` };
  }
  const total = gastado + nuevo;
  if (total > techo) {
    const queda = Math.max(0, techo - gastado);
    return {
      ok: false,
      motivo: `Techo de hoy: ${techo.toFixed(2)} USD. Llevas ${gastado.toFixed(4)} USD; la nueva llamada cuesta ${nuevo.toFixed(4)} USD y te pasarías a ${total.toFixed(4)} USD. Solo quedan ${queda.toFixed(4)} USD.`,
    };
  }
  const queda = techo - total;
  return {
    ok: true,
    motivo: `Techo ${techo.toFixed(2)} USD. Gastado hoy ${gastado.toFixed(4)} USD; nuevo ${nuevo.toFixed(4)} USD. Quedan ${queda.toFixed(4)} USD.`,
  };
}

/** Lee el techo diario del entorno. Si no existe, usa 2.00 USD (regla permanente del proyecto). */
export function techoAstraPorDefecto(env: Record<string, string | undefined> = process.env): number {
  const crudo = env.STARSEED_ASTRA_PRESUPUESTO_DIA_USD;
  if (!crudo) return 2.0;
  const n = Number.parseFloat(crudo);
  if (!Number.isFinite(n) || n < 0) return 2.0;
  return n;
}
