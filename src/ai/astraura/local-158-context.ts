/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT · CONTEXTO COMPACTO (fusión de habilidades, Ola local-158)
 * ---------------------------------------------------------------------------
 * El backend BitNet b1.58 tiene una ventana de contexto PEQUEÑA (los modelos
 * de `ASTRAURA_158_MODELS` declaran `context: 4096`; `buildAstraura158Prompt`
 * reserva ya 9000 caracteres solo para la transcripción de la conversación).
 * El bloque de "cerebro" que `astrauraChat()` antepone para el resto de
 * fuentes (personalidad compilada completa + contexto de pantalla + estado de
 * voz + descripción larga de CADA capacidad activa + contexto de usuario)
 * puede pesar varios miles de caracteres: perfecto para un modelo de 1M de
 * contexto, pero suficiente para dejar sin sitio a la conversación real (o a
 * la propia respuesta) en el 1.58 local.
 *
 * `buildLocal158CompactContext` sustituye ese bloque, SOLO para los
 * candidatos 1.58 (local y nube), por un resumen denso y acotado en
 * caracteres: qué personalidad está activa, qué habilidades tiene encendidas
 * (solo la ETIQUETA corta, no la descripción de `skillsSystemPrompt`) y qué
 * conexiones puede usar. Así el 1.58 local SIGUE fusionando skills/conectores/
 * personalidad — el pedido de la ola —, pero sin agotar su contexto.
 *
 * Prioridad (más a menos importante; se recorta primero lo último si no
 * cabe en el presupuesto): personalidad → habilidades → conexiones.
 *
 * Función PURA, determinista y sin red — fácil de testear sin mocks.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface Local158ContextParts {
  /** Nombre(s) de la(s) personalidad(es) activa(s), en orden de prioridad. */
  personalityNames?: string[];
  /** Etiquetas de las habilidades/capacidades activas (ya filtradas por chat). */
  skillLabels?: string[];
  /** Nombres de los conectores/integraciones activos para este chat. */
  connectorNames?: string[];
}

/**
 * Presupuesto POR DEFECTO del bloque compacto, en caracteres. El contexto
 * real del backend 1.58 (~4096 tokens ≈ 12-16k caracteres) se reparte entre
 * este bloque, la personalidad interna del backend, la transcripción
 * (`HISTORY_BUDGET_CHARS` = 9000 en `providers/astraura-158.ts`) y la
 * respuesta que va a generar: 600 caracteres deja margen de sobra a todo lo
 * demás sin dejar la fusión de habilidades fuera.
 */
export const LOCAL_158_CONTEXT_BUDGET_CHARS = 600;

const HEADER = "Contexto compacto de Astraura (fusión de habilidades):";

/** Quita vacíos y duplicados preservando el orden de prioridad de entrada. */
function dedupeNonEmpty(list: string[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = String(raw ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Compone `"<prefijo><item1>, <item2>…."` añadiendo items mientras quepan en
 * `maxChars`. Si sobran items sin sitio, añade `· +N más` (solo si el propio
 * aviso cabe). Si NI SIQUIERA el primer item cabe, devuelve "" (la sección
 * entera se omite en vez de dejar un prefijo colgando sin contenido).
 */
function fitLine(prefix: string, items: string[], maxChars: number): string {
  if (maxChars <= prefix.length) return "";
  let line = prefix;
  let count = 0;
  for (const item of items) {
    const sep = count > 0 ? ", " : "";
    const next = `${sep}${item}`;
    if (line.length + next.length + 1 > maxChars) break; // +1 reserva el punto final
    line += next;
    count++;
  }
  if (count === 0) return "";
  const restantes = items.length - count;
  if (restantes > 0) {
    const suffix = ` · +${restantes} más`;
    if (line.length + suffix.length + 1 <= maxChars) line += suffix;
  }
  return `${line}.`;
}

/**
 * Construye el bloque compacto (o "" si no hay nada que decir / el
 * presupuesto es demasiado pequeño ni para la cabecera). Nunca lanza.
 */
export function buildLocal158CompactContext(
  parts: Local158ContextParts,
  budgetChars: number = LOCAL_158_CONTEXT_BUDGET_CHARS,
): string {
  const budget = Math.max(0, Math.floor(Number(budgetChars) || 0));
  if (budget <= HEADER.length + 4) return "";

  const sections: { label: string; items: string[] }[] = [
    { label: "Personalidad activa", items: dedupeNonEmpty(parts?.personalityNames) },
    { label: "Habilidades activas", items: dedupeNonEmpty(parts?.skillLabels) },
    { label: "Conexiones activas", items: dedupeNonEmpty(parts?.connectorNames) },
  ].filter((s) => s.items.length > 0);

  if (!sections.length) return "";

  const lines: string[] = [];
  let used = HEADER.length + 1; // +1 por el salto de línea tras la cabecera
  for (const section of sections) {
    if (used >= budget) break;
    const remaining = budget - used;
    const line = fitLine(`${section.label}: `, section.items, remaining);
    if (!line) continue; // esta sección no cupo: se omite, NO rompe el bucle
    lines.push(line);
    used += line.length + 1;
  }

  if (!lines.length) return "";
  const out = [HEADER, ...lines].join("\n");
  // Cinturón de seguridad: el cálculo de arriba ya respeta el presupuesto,
  // pero un recorte final garantiza el contrato pase lo que pase.
  return out.length <= budget ? out : out.slice(0, budget);
}
