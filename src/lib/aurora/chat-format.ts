/**
 * StarSeed OS — SANEADO del texto de chat de Astraura/Aurora (capa PURA).
 * ============================================================================
 * El bug que este módulo cierra: hoy el chat MUESTRA y GUARDA el texto crudo
 * del modelo tal cual llega, directivas incluidas — el usuario ve literalmente
 * `[[ACCION: nombre {...}]]` en la burbuja del mensaje, a veces con la
 * cabecera de personalidad duplicada dos veces seguidas (`chat-surface.tsx`
 * nunca llamaba a `stripDirectives`, que ya existía en `actions.ts` pero solo
 * se usaba para lo que se LEE en voz alta, no para lo que se MUESTRA/GUARDA).
 *
 * `formatAssistantText(raw)` es el saneado ÚNICO que arregla los tres
 * síntomas reportados, en el mismo orden en que aparecen en el texto:
 *
 *   1) Directivas en crudo → se QUITAN del texto visible/guardado (reutiliza
 *      `stripDirectives` de `actions.ts` para las COMPLETAS — nunca se
 *      reimplementa ese parseo — y `hideIncompleteDirective` de aquí mismo
 *      para la que esté a MEDIO ESCRIBIR mientras el streaming sigue en
 *      marcha: ver el comentario de esa función).
 *   2) Cabecera de personalidad duplicada → `collapseRepeatedSpeakers` quita
 *      la repetición consecutiva del MISMO hablante (reutiliza el detector de
 *      cabeceras `detectPersonaHeader` de `streaming-voice.ts` — el mismo que
 *      ya usa el motor de voz para cambiar de personalidad — así "qué cuenta
 *      como cabecera" se define en un único sitio para voz Y texto).
 *   3) `\n` literales de una directiva → `unescapeLiteralNewlines` es la red
 *      de seguridad: el JSON de una directiva escribe SIEMPRE un salto de
 *      línea como la secuencia de dos caracteres `\n` (JSON no admite un
 *      salto de línea real dentro de una cadena). `JSON.parse` (dentro de
 *      `parseDirectives`, en `actions.ts`) ya lo interpreta bien en el camino
 *      feliz — quien ejecuta la acción recibe el texto con saltos de línea
 *      REALES —, pero si algún resto de esa directiva sobrevive al recorte
 *      (JSON que el parser no reconoce entero) y acaba mostrándose, debe
 *      verse como una línea nueva de verdad, no como el texto "\n" impreso.
 *
 * Deliberadamente PURO: ninguna función de aquí toca `window`, `document` ni
 * React — son transformaciones de string a string, testeables en Node y
 * seguras de llamar tanto sobre el texto FINAL de un mensaje como sobre el
 * ACUMULADO PARCIAL de un streaming en marcha (ver `hideIncompleteDirective`).
 */

import { stripDirectives } from "@/lib/aurora/actions";
import { detectPersonaHeader } from "@/lib/aurora/streaming-voice";

// ── 1) Directiva incompleta (streaming a medias) ────────────────────────────

/**
 * Apertura de una directiva `[[ACCION: nombre …` — deliberadamente más laxa
 * que el `DIRECTIVE_RE` de `actions.ts` (que exige el cierre `]]` para
 * considerarla un match): es justo lo que hace falta para encontrar una
 * directiva que TODAVÍA no cerró. Mismo prefijo, mismo criterio de nombre.
 * Sin flag `g` a propósito: cada uso se resuelve con `.exec()` sobre un
 * substring nuevo, así que no hay `lastIndex` que arrastrar entre llamadas.
 */
const DIRECTIVE_OPEN_RE = /\[\[\s*ACCION\s*:/i;

/**
 * Si el texto (el acumulado hasta ahora, posiblemente a mitad de streaming)
 * tiene una directiva `[[ACCION: …` que EMPEZÓ pero cuyo cierre `]]` todavía
 * no llegó, oculta desde esa apertura hasta el final. Sin esto, mientras el
 * modelo sigue escribiendo el JSON token a token, el usuario vería llaves sin
 * cerrar y comillas sueltas aparecer y desaparecer en la burbuja — el detalle
 * que hace que el streaming se vea "sucio". Con esto, la burbuja simplemente
 * no muestra nada de la directiva hasta que `stripDirectives` la quita del
 * todo en cuanto cierra.
 *
 * Pura: no sabe nada de streaming, solo mira el string que recibe. Sobre un
 * texto YA COMPLETO (mensaje terminado) es un no-op salvo que quede basura
 * real sin cerrar — no debería pasar en el camino feliz, pero si pasa, más
 * vale ocultarla que enseñar JSON roto.
 */
export function hideIncompleteDirective(text: string): string {
  if (!text) return "";
  let searchFrom = 0;
  for (;;) {
    const tail = text.slice(searchFrom);
    const m = DIRECTIVE_OPEN_RE.exec(tail);
    if (!m) return text; // no queda ninguna apertura: nada que ocultar
    const openStart = searchFrom + m.index;
    const afterOpen = openStart + m[0].length;
    const closeIdx = text.indexOf("]]", afterOpen);
    if (closeIdx === -1) return text.slice(0, openStart); // esta apertura no cerró: ocultar desde aquí
    // Cerró de verdad: seguimos buscando por si hay OTRA apertura después,
    // que sí quede incompleta (caso: varias directivas seguidas y la última
    // aún no cerró).
    searchFrom = closeIdx + 2;
  }
}

// ── 2) Cabeceras de personalidad repetidas ──────────────────────────────────

/**
 * Normaliza un nombre de cabecera para comparar dos apariciones como "el
 * mismo hablante": sin tildes, sin mayúsculas, espacios colapsados. A
 * propósito NO quita el paréntesis (p.ej. "(StarSeed Core)") — dos
 * variantes de personalidad con paréntesis distinto son personalidades
 * DISTINTAS en este OS (voz/estilo propios), así que deben seguir
 * tratándose como hablantes distintos y NO colapsarse entre sí.
 */
function foldSpeakerName(raw: string): string {
  return raw
    .normalize("NFD")
    // Diacríticos (tildes) sueltos tras NFD — referenciados por escape
    // Unicode (no como caracteres sueltos) para no dejar un combining
    // character ilegible en el código, mismo criterio que `chat-surface.tsx`
    // (`foldPersonaName`) y `streaming-voice.ts`.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Detecta cabecera sin dejar que un fallo del regex se escape hacia el llamante. */
function safeDetectHeader(line: string): { name: string; rest: string } | null {
  try {
    return detectPersonaHeader(line);
  } catch {
    return null;
  }
}

/**
 * Colapsa cabeceras de personalidad REPETIDAS y CONSECUTIVAS (`💬 [Aurora
 * (StarSeed Core)]:` dos veces seguidas, el síntoma nº2 del bug reportado).
 * "Consecutivas" = sin ningún contenido real entre medias — solo líneas en
 * blanco, o directamente la línea siguiente. Si entre dos cabeceras del MISMO
 * hablante hay contenido real, ya no es una duplicación accidental (es el
 * hablante retomando la palabra más adelante) y AMBAS se conservan.
 *
 * Si la repetición trae texto tras los ":" (p.ej. "💬 [Aurora]: hola" seguido
 * de "💬 [Aurora]: mundo"), no se pierde ese texto: solo se quita el
 * "[Nombre]:" redundante y se conserva el resto como continuación.
 *
 * Expuesta aparte de `formatAssistantText` para poder testearla sola.
 */
export function collapseRepeatedSpeakers(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const out: string[] = [];
  // Nombre (normalizado) de la cabecera "abierta": la más reciente que no ha
  // visto contenido real después. null = no hay ninguna racha abierta.
  let openHeaderFold: string | null = null;

  for (const line of lines) {
    const header = safeDetectHeader(line);
    if (header) {
      const folded = foldSpeakerName(header.name);
      if (openHeaderFold !== null && folded === openHeaderFold) {
        // Mismo hablante que la cabecera anterior, sin nada real entre
        // medias: es la duplicación del bug. Se colapsa, conservando el
        // texto (si lo hay) que traiga esta repetición tras los ":".
        if (header.rest.trim()) out.push(header.rest);
        continue;
      }
      openHeaderFold = folded;
      out.push(line);
      continue;
    }
    if (line.trim() !== "") {
      // Contenido real: cierra la racha. Una reaparición MÁS ADELANTE de
      // este mismo nombre ya no cuenta como duplicado consecutivo.
      openHeaderFold = null;
    }
    out.push(line);
  }
  return out.join("\n");
}

// ── 3) "\n" literales de una directiva ──────────────────────────────────────

/** Aísla bloques de código ``` … ``` — capturados, para que `split` los deje aparte. */
const CODE_FENCE_RE = /(```[\s\S]*?```)/g;

/**
 * Convierte secuencias "\n" LITERALES (dos caracteres: barra invertida + la
 * letra "n" — lo que escribe JSON para un salto de línea dentro de una
 * cadena) en saltos de línea REALES. Ver la cabecera del fichero para el
 * porqué: es la red de seguridad del punto 3 del bug.
 *
 * NUNCA toca el interior de un bloque de código ``` ``` — ahí un "\n" puede
 * ser parte legítima de un ejemplo (regex, JSON, una ruta de Windows) que
 * Astraura esté enseñando a propósito; desfigurar ese ejemplo sería peor que
 * el bug que este saneado corrige. Deliberadamente estrecha además en OTRO
 * sentido: solo el par barra-invertida + "n" — nunca "\t", "\r" ni una barra
 * invertida seguida de cualquier otra letra.
 */
export function unescapeLiteralNewlines(text: string): string {
  if (!text) return "";
  return text
    .split(CODE_FENCE_RE)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\\n/g, "\n")))
    .join("");
}

// ── Saneado completo ─────────────────────────────────────────────────────────

/** Colapsa 3+ saltos de línea seguidos a un máximo de 2 (un párrafo en blanco). */
function normalizeBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * El saneado COMPLETO para MOSTRAR y GUARDAR una respuesta de Astraura: quita
 * las directivas (completas vía `stripDirectives` de `actions.ts`, la que
 * esté a medias vía `hideIncompleteDirective`), repara cualquier "\n" literal
 * que sobreviva, colapsa cabeceras de personalidad repetidas consecutivas,
 * normaliza líneas en blanco de más y recorta los extremos.
 *
 * Segura de llamar en cada chunk del streaming (idempotente sobre el
 * acumulado parcial: nunca dejará ver una directiva a medio escribir) y sobre
 * el texto final antes de guardarlo — MISMA función, mismo resultado en
 * ambos casos, así lo que el usuario ve mientras escribe Astraura es
 * exactamente lo que queda guardado en la conversación.
 *
 * IMPORTANTE: esto es saneado de PANTALLA, no de EJECUCIÓN — las directivas
 * se ejecutan aparte, sobre el texto CRUDO (`parseDirectives`/`runDirectives`
 * en `chat-surface.tsx`), antes de llamar a esta función. Aplicar este
 * saneado nunca debe sustituir esa ejecución.
 */
export function formatAssistantText(raw: string): string {
  if (!raw) return "";
  let text = stripDirectives(raw);
  text = hideIncompleteDirective(text);
  text = unescapeLiteralNewlines(text);
  text = collapseRepeatedSpeakers(text);
  text = normalizeBlankLines(text);
  return text.trim();
}
