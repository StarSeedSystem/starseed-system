/**
 * StarSeed OS — VOZ EN STREAMING de Aurora/Astraura (capa PURA, SSR-safe).
 * ============================================================================
 * El problema que resuelve: hoy `speakAuroraReply(texto)` (`turn.ts`) se llama
 * SOLO cuando el streaming ya terminó — el mensaje aparece entero y DESPUÉS
 * arranca la voz, leyendo todo de un tirón. El usuario lo nota como «la voz se
 * separa» del texto: dos eventos desacoplados en vez de uno vivo.
 *
 * El programa original (el que este módulo reconstruye) hablaba MIENTRAS
 * generaba: alimentaba el motor TOKEN A TOKEN y, en cuanto el acumulado
 * formaba una CLÁUSULA hablable — fin de frase, o coma/punto y coma/dos
 * puntos con suficientes palabras detrás, o un tope de seguridad — la
 * disparaba a la cola de voz sin esperar al resto del mensaje. Así la voz
 * arranca con la primera cláusula, no con el mensaje completo.
 *
 * Este módulo es esa pieza, aislada y con types estrictos:
 *   · `splitClauses(text)` — el TROCEADOR puro: dado el texto acumulado hasta
 *     ahora, devuelve las cláusulas ya cerradas (lo bastante completas para
 *     hablarse) y lo que aún queda pendiente (`rest`), sin tocar nada externo.
 *   · `detectPersonaHeader(line)` — reconoce si una línea es una CABECERA de
 *     personalidad (`### 💬 [Hephaestus]:`, `**⚒️ Hephaestus**:`, `## Atenea:`,
 *     `🔮 Hermione:`…) que el backend intercala a mitad de respuesta cuando
 *     cambia quién habla (diálogo coral). MEJORA sobre el original: el
 *     original NO retiraba la cabecera del texto hablado, así que Aurora leía
 *     literalmente «almohadilla almohadilla almohadilla Hephaestus dos
 *     puntos» — la regresión que este módulo cierra. Aquí la cabecera se
 *     detecta, se retira del habla y SOLO dispara el cambio de voz.
 *   · `createStreamingVoice(opts)` — el ORQUESTADOR con estado: recibe tokens
 *     por `feed()`, mantiene el buffer pendiente, decide cuándo hay cabecera
 *     (cambia de personalidad) y cuándo hay cláusula (llama a `opts.speak`),
 *     con higiene de lo que NUNCA debe leerse en voz alta (bloques de código,
 *     marcadores `[[goto:...]]`, y directivas `[[ACCION: nombre {json}]]` del
 *     protocolo de control del OS — ver `actions.ts` — incluidas las que
 *     llegan PARTIDAS entre varios `feed()`: el bloque queda pendiente sin
 *     hablarse hasta que su `]]` de cierre aparece, igual que un bloque de
 *     código a medio llegar).
 *
 * Deliberadamente NO toca `window` ni el DOM: es lógica pura, testable en
 * Node. Quien lo use en el navegador (el puente de Aurora, `AuroraProvider`)
 * pasa su propio `speak(text, personaId)` — el mismo `bridge().speak` que ya
 * usa `speakAuroraReply` en `turn.ts` — y este módulo nunca sabe que existe
 * un `<audio>`, un `SpeechSynthesisUtterance` o un motor OSS detrás.
 *
 * Robustez: `feed()` NUNCA lanza (ver Reglas del repo). Cualquier fallo del
 * `speak` que provee el llamador, o de los resolvers opcionales, se atrapa y
 * se ignora — Aurora nunca se queda muda por una excepción ajena.
 */

/** Una personalidad activa para efectos de voz: id interno + nombre visible. */
export interface StreamingVoicePersona {
  id: string;
  name: string;
}

export interface StreamingVoiceOptions {
  /** Habla una cláusula. Lo provee el llamante (el puente de Aurora: `speak(text, persona)`). */
  speak: (text: string, personaId?: string) => void;
  /** Se avisa cuando cambia quién habla, para que la UI/orbe lo refleje. */
  onPersonaChange?: (persona: StreamingVoicePersona) => void;
  /**
   * Resuelve el id real de personalidad a partir del nombre de la cabecera.
   * Devuelve null si no la conoce.
   *
   * Si NO se provee, cualquier cabecera reconocida sintácticamente se acepta
   * (usando el propio nombre leído como id) — cómodo para pruebas y para
   * llamantes sin roster propio. Si SÍ se provee y devuelve null para un
   * nombre concreto, esa línea deja de tratarse como cabecera (no se retira
   * del habla, no cambia la voz): evita que un título de sección cualquiera
   * («### Instalación: pasos») que por sintaxis se parezca a una cabecera
   * dispare un cambio de personalidad fantasma.
   */
  resolvePersona?: (name: string) => StreamingVoicePersona | null;
  /** Personalidad de partida. */
  initialPersonaId?: string;
  /** Si es false, no habla (pero sigue troceando y avisando de cambios). Por defecto true. */
  enabled?: boolean;
}

export interface StreamingVoice {
  /** Alimenta un token del stream. Habla solo cuando se cierra una cláusula. */
  feed(token: string): void;
  /** Vacía lo que quede pendiente al terminar el mensaje. */
  flush(): void;
  /** Cancela: descarta el buffer sin hablar. */
  stop(): void;
  /** Diagnóstico/tests: cláusulas ya emitidas, en orden. */
  readonly spoken: { text: string; personaId?: string }[];
}

// ── Higiene del texto hablado ───────────────────────────────────────────────
// Mismo patrón que usa el resto del OS para las directivas internas (ver
// `engine.ts`/`voice-notes.ts`: `/\[\[goto:[^\]]+\]\]/gi`) — nunca deben
// leerse en voz alta, son control interno, no contenido.
const GOTO_MARKER_RE = /\[\[goto:[^\]]+\]\]/gi;

/** Limpia una cláusula candidata: quita marcadores internos y normaliza espacios. */
function cleanupClauseText(raw: string): string {
  const sinMarcadores = raw.replace(GOTO_MARKER_RE, " ");
  return sinMarcadores.replace(/\s+/g, " ").trim();
}

/** ¿Queda algo pronunciable (alguna letra o dígito) tras la limpieza? */
function isSpeakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Cuenta "palabras" (fragmentos sin espacio) en un tramo de texto. */
function countWords(text: string, start: number, end: number): number {
  const seg = text.slice(start, end);
  const found = seg.match(/\S+/g);
  return found ? found.length : 0;
}

/**
 * Escanea UN tramo sin bloques de código y corta cláusulas por las reglas del
 * original (probadas): fin de frase `[.?!]` seguido de espacio/fin, dos
 * saltos de línea seguidos, coma/punto y coma/dos puntos seguido de espacio
 * con ≥6 palabras acumuladas, o tope de seguridad de 14 palabras.
 *
 * Con `force=true`, lo que quede pendiente al final del tramo (aunque no
 * cumpla ninguna regla) se emite igualmente como última cláusula — lo usan
 * el `flush()` público y el corte forzoso justo antes de un bloque de código
 * o de una cabecera de personalidad (ninguno de los dos va a "completar" la
 * frase que dejaron a medias).
 */
function scanClauseBoundaries(text: string, force: boolean): { clauses: string[]; rest: string } {
  const clauses: string[] = [];
  const n = text.length;
  let clauseStart = 0;
  let i = 0;

  const cut = (end: number): void => {
    const candidate = cleanupClauseText(text.slice(clauseStart, end));
    if (isSpeakable(candidate)) clauses.push(candidate);
    clauseStart = end;
  };

  while (i < n) {
    const ch = text[i];

    // Dos saltos de línea seguidos: ruptura dura (párrafo nuevo), se descartan.
    if (ch === "\n" && text[i + 1] === "\n") {
      cut(i);
      let j = i;
      while (j < n && text[j] === "\n") j++;
      clauseStart = j;
      i = j;
      continue;
    }

    // Fin de frase: `.` `?` `!` seguido de espacio/salto de línea o de fin de tramo.
    if (ch === "." || ch === "?" || ch === "!") {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) {
        cut(i + 1);
        i = clauseStart;
        continue;
      }
    }

    // Coma / punto y coma / dos puntos + espacio, con ≥6 palabras acumuladas.
    if (ch === "," || ch === ";" || ch === ":") {
      const next = text[i + 1];
      if (next === " " || next === "\t") {
        if (countWords(text, clauseStart, i + 1) >= 6) {
          cut(i + 1);
          i = clauseStart;
          continue;
        }
      }
    }

    // Tope de seguridad: 14 palabras acumuladas, haya o no puntuación. Se
    // comprueba SOLO en cada frontera de palabra (un espacio) — nunca a
    // mitad de una palabra, o el corte partiría un token en dos mientras se
    // alimenta letra a letra (el recuento `\S+` ya cuenta como "palabra"
    // cualquier fragmento no vacío en cuanto aparece su primer carácter).
    if (/\s/.test(ch) && countWords(text, clauseStart, i) >= 14) {
      cut(i);
      i = clauseStart;
      continue;
    }

    i++;
  }

  // Fin del tramo con la 14ª palabra ya completa pero sin espacio detrás
  // todavía (p.ej. el mensaje termina justo ahí): mismo criterio que el "o
  // fin" de `[.?!]` — no hace falta esperar a que empiece una 15ª palabra.
  if (clauseStart < n && countWords(text, clauseStart, n) >= 14) {
    cut(n);
  }

  if (force) {
    if (clauseStart < n) cut(n);
    return { clauses, rest: "" };
  }

  return { clauses, rest: text.slice(clauseStart) };
}

// ── Bloques que NUNCA deben leerse en voz alta ──────────────────────────────
// Dos formas de bloque "silencioso": un bloque de código ` ``` `…` ``` ` y una
// directiva `[[ACCION: nombre {json}]]` (el protocolo de control del OS, ver
// `actions.ts`). Ambos se tratan con el MISMO mecanismo: se busca cuál de los
// dos empieza ANTES en el texto pendiente, se fuerza a hablar lo anterior, y
// el bloque en sí se descarta entero (o se retiene en `rest` mientras no
// cierre) — así una directiva partida entre varios `feed()` nunca se lee a
// medias, igual que ya pasaba con un bloque de código a medio llegar.

/** Apertura de una directiva de voz — misma forma que `DIRECTIVE_RE` de `actions.ts`, sin exigir el cierre. */
const DIRECTIVE_OPEN_RE = /\[\[\s*ACCION\s*:/i;

/** Un bloque "silencioso" localizado en `text`: dónde empieza y qué marcador de cierre hay que buscar. */
interface SilentBlock {
  start: number;
  /** Índice desde el que buscar el marcador de cierre (justo tras la apertura). */
  searchCloseFrom: number;
  closeMarker: "```" | "]]";
}

/**
 * Localiza el PRÓXIMO bloque silencioso (código o directiva) en `text`, el
 * que empiece antes de los dos. `null` si no hay ninguno.
 */
function findNextSilentBlock(text: string): SilentBlock | null {
  const fenceStart = text.indexOf("```");
  const directiveMatch = DIRECTIVE_OPEN_RE.exec(text);

  if (fenceStart === -1 && !directiveMatch) return null;
  // Sin match de directiva, o el fence va ANTES (o empatan): gana el fence.
  // TS estrecha `directiveMatch` a no-nulo en la rama de abajo a partir de
  // esta misma condición (sin necesidad de un cast).
  if (!directiveMatch || (fenceStart !== -1 && fenceStart <= directiveMatch.index)) {
    return { start: fenceStart, searchCloseFrom: fenceStart + 3, closeMarker: "```" };
  }
  return {
    start: directiveMatch.index,
    searchCloseFrom: directiveMatch.index + directiveMatch[0].length,
    closeMarker: "]]",
  };
}

/**
 * Núcleo compartido de `splitClauses` (pública) y del forzado total que usa
 * `flush()`/los cortes internos. Antes de trocear por puntuación, aísla los
 * bloques SILENCIOSOS (código ` ``` `…` ``` `, o directiva `[[ACCION: …]]`):
 * lo anterior a un bloque se trocea (y se fuerza, porque el bloque interrumpe
 * la frase igual que lo haría un punto); el bloque en sí se descarta ENTERO
 * (nunca se habla); si el bloque abierto aún no cerró, todo desde su apertura
 * queda pendiente en `rest` —salvo que `force` sea true (fin de mensaje de
 * verdad), en cuyo caso también se descarta, porque no hay nada legible que
 * forzar dentro de código o de una directiva a medias.
 */
function splitClausesCore(text: string, force: boolean): { clauses: string[]; rest: string } {
  const clauses: string[] = [];
  let pending = text;

  for (;;) {
    const block = findNextSilentBlock(pending);
    if (!block) {
      const r = scanClauseBoundaries(pending, force);
      clauses.push(...r.clauses);
      return { clauses, rest: r.rest };
    }

    // Lo anterior al bloque se fuerza: el bloque corta el hilo, así que lo
    // que quedó a medias antes de él no va a completarse con más texto.
    const before = pending.slice(0, block.start);
    const r = scanClauseBoundaries(before, true);
    clauses.push(...r.clauses);

    const closeIdx = pending.indexOf(block.closeMarker, block.searchCloseFrom);
    if (closeIdx === -1) {
      // Bloque abierto sin cerrar todavía: no se sabe si es código/directiva
      // completa ni cuánto va a durar — no se habla nada de él hasta que cierre.
      if (force) return { clauses, rest: "" }; // fin de mensaje: se descarta, nunca se lee código ni JSON de directiva
      return { clauses, rest: pending.slice(block.start) };
    }
    // Bloque COMPLETO: se descarta entero y se sigue con lo que venga después.
    pending = pending.slice(closeIdx + block.closeMarker.length);
  }
}

/**
 * Trocea un texto (lo acumulado hasta ahora en el stream) en cláusulas
 * hablables, con la higiene de voz aplicada (bloques de código fuera,
 * marcadores `[[goto:...]]` fuera, espacios colapsados, nunca cláusulas
 * vacías o de solo puntuación). Pura: no habla, no cambia nada — solo
 * devuelve qué se puede hablar YA (`clauses`) y qué queda pendiente
 * (`rest`, a reintentar con más texto).
 */
export function splitClauses(text: string): { clauses: string[]; rest: string } {
  return splitClausesCore(text ?? "", false);
}

/** Fuerza TODO el texto pendiente a cláusulas (fin de mensaje / corte duro). */
function forceAllClauses(text: string): string[] {
  return splitClausesCore(text, true).clauses;
}

// ── Cabeceras de personalidad ───────────────────────────────────────────────
//
// Formas reconocidas, con o sin emoji, al principio de línea (hasta 3
// espacios de indentación, como el resto del markdown):
//   ### 💬 [Hephaestus]:        (encabezado + emoji + nombre entre corchetes)
//   ### 🌸 Aurora (Alma Viva):  (encabezado + emoji + nombre con paréntesis)
//   **⚒️ Hephaestus**:          (negrita + emoji + nombre)
//   ## Atenea:                  (encabezado, sin emoji)
//   🔮 Hermione:                (solo emoji + nombre, sin encabezado/negrita)
//
// La decoración (encabezado `#`, negrita `**`, emoji, o corchetes) es
// OBLIGATORIA para considerar que hay cabecera — así una frase cualquiera con
// dos puntos («Nota: recuerda esto») nunca se confunde con un cambio de voz.
// El emoji admite detrás un VARIATION SELECTOR-16 (U+FE0F: el codepoint
// invisible que fuerza a color el glifo anterior — el que sigue al martillo
// en "⚒️"). Se referencia por su escape Unicode (no como carácter suelto)
// para que el patrón no lleve un carácter invisible ilegible en el código.
// Grupos por ÍNDICE, no nombrados: `(?<nombre>...)` exige apuntar a ES2018+
// y este repo compila a ES2017 (TS1503) — el índice de cada uno se explica
// donde se desestructura, más abajo.
const PERSONA_HEADER_RE =
  /^[ \t]{0,3}(#{1,6}[ \t]+)?(\*\*[ \t]*)?((?:\p{S}\uFE0F?[ \t]*){0,3})(?:\[(\p{L}[\p{L}\p{N} '()-]*)\]|(\p{L}[\p{L}\p{N} '()-]*))(?:[ \t]*\*\*)?[ \t]*:[ \t]*(.*)$/u;

/**
 * Detecta una cabecera de personalidad al principio de una línea (una de las
 * formas de arriba). Devuelve el nombre leído (limpio, sin la decoración) y
 * el resto de la línea tras los dos puntos — o null si la línea no es una
 * cabecera. Pura: no resuelve el nombre contra ningún roster (eso lo hace el
 * llamante con `resolvePersona`).
 */
export function detectPersonaHeader(line: string): { name: string; rest: string } | null {
  if (!line) return null;
  const m = PERSONA_HEADER_RE.exec(line);
  if (!m) return null;

  // Grupos por ÍNDICE (ver el comentario sobre TS1503 encima del regex):
  //   1 encabezado · 2 negrita · 3 emoji · 4 nombre-entre-corchetes ·
  //   5 nombre-sin-corchetes · 6 resto de la línea tras los ":"
  const [, heading, bold, emoji, bracketName, plainName, rest] = m;
  const hasDecoration = Boolean(heading) || Boolean(bold) || Boolean(emoji) || Boolean(bracketName);
  if (!hasDecoration) return null;

  const rawName = bracketName ?? plainName ?? "";
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) return null;

  return { name, rest: rest ?? "" };
}

// ── Orquestador con estado ──────────────────────────────────────────────────

class StreamingVoiceEngine implements StreamingVoice {
  private readonly opts: StreamingVoiceOptions;
  private readonly enabledFlag: boolean;
  private buffer = "";
  private currentPersonaId: string | undefined;
  private readonly spokenList: { text: string; personaId?: string }[] = [];

  constructor(opts: StreamingVoiceOptions) {
    this.opts = opts;
    this.enabledFlag = opts.enabled ?? true;
    this.currentPersonaId = opts.initialPersonaId;
  }

  get spoken(): { text: string; personaId?: string }[] {
    return this.spokenList;
  }

  feed(token: string): void {
    try {
      this.buffer += token ?? "";
      this.pump();
    } catch {
      /* feed() nunca lanza. */
    }
  }

  flush(): void {
    try {
      this.forceSpeak(this.buffer);
    } catch {
      /* nunca lanza */
    }
    this.buffer = "";
  }

  stop(): void {
    this.buffer = "";
  }

  /** Procesa el buffer: cabeceras primero (línea actual), luego cláusulas normales. */
  private pump(): void {
    for (;;) {
      const lineStart = this.buffer.lastIndexOf("\n") + 1;
      const currentLine = this.buffer.slice(lineStart);
      const header = safeDetectHeader(currentLine);

      if (header) {
        const persona = this.tryResolvePersona(header.name);
        if (persona) {
          // 1) Lo acumulado ANTES de la cabecera se habla con la personalidad anterior.
          const before = this.buffer.slice(0, lineStart);
          this.forceSpeak(before);
          // 2) Se cambia de personalidad (y se avisa).
          this.setPersona(persona);
          // 3) Lo que siga en la misma línea tras los ":" es el nuevo pendiente.
          this.buffer = header.rest;
          continue;
        }
        // Sintaxis de cabecera pero nombre no reconocido: se trata como texto
        // normal (no se corta la voz esperando un cambio que no va a llegar).
      }

      const { clauses, rest } = splitClauses(this.buffer);
      for (const clause of clauses) this.speakClause(clause);
      if (rest === this.buffer) return; // nada más que hacer todavía: espera más tokens
      this.buffer = rest;
    }
  }

  private forceSpeak(text: string): void {
    if (!text) return;
    for (const clause of forceAllClauses(text)) this.speakClause(clause);
  }

  private speakClause(text: string): void {
    if (!text) return;
    const personaId = this.currentPersonaId;
    this.spokenList.push({ text, personaId });
    if (!this.enabledFlag) return;
    try {
      this.opts.speak(text, personaId);
    } catch {
      /* si `speak` lanza, se atrapa y se sigue: feed() nunca propaga. */
    }
  }

  private setPersona(persona: StreamingVoicePersona): void {
    this.currentPersonaId = persona.id;
    try {
      this.opts.onPersonaChange?.(persona);
    } catch {
      /* nunca lanza */
    }
  }

  /**
   * Resuelve un nombre de cabecera a personalidad. Sin `resolvePersona`,
   * cualquier cabecera sintácticamente válida se acepta (id = nombre leído).
   * Con `resolvePersona`, un null explícito RECHAZA la cabecera (ver el
   * comentario de `StreamingVoiceOptions.resolvePersona`).
   */
  private tryResolvePersona(name: string): StreamingVoicePersona | null {
    if (!this.opts.resolvePersona) return { id: name, name };
    try {
      return this.opts.resolvePersona(name) ?? null;
    } catch {
      return null;
    }
  }
}

/** Detecta cabecera sin dejar que un fallo del regex se escape hacia `feed()`. */
function safeDetectHeader(line: string): { name: string; rest: string } | null {
  try {
    return detectPersonaHeader(line);
  } catch {
    return null;
  }
}

/**
 * Crea un orquestador de voz en streaming: alimenta con `feed(token)` según
 * van llegando los tokens del modelo, habla cláusula a cláusula en cuanto se
 * cierran (fin de frase, o coma/punto y coma/dos puntos con ≥6 palabras, o
 * tope de 14 palabras) y cambia de personalidad al vuelo cuando el texto trae
 * una cabecera (`### 💬 [Nombre]:` y variantes) — sin leer la cabecera en voz
 * alta. Llama a `flush()` al terminar el mensaje para vaciar lo pendiente, o
 * a `stop()` para cancelar sin hablar el resto.
 */
export function createStreamingVoice(opts: StreamingVoiceOptions): StreamingVoice {
  return new StreamingVoiceEngine(opts);
}
