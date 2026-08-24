/**
 * Voz en streaming de Aurora (`streaming-voice.ts`) — verifica el
 * COMPORTAMIENTO que arregla la regresión real: hoy la voz espera a que el
 * streaming termine para arrancar («la voz se separa» del texto). Estos
 * tests comprueban que el troceador habla cláusula a cláusula según llegan
 * los tokens, que las cabeceras de personalidad cambian de voz SIN leerse en
 * voz alta (la regresión concreta que se cierra) y que la higiene (código,
 * marcadores internos) nunca llega al habla.
 */

import { describe, expect, it, vi } from "vitest";
import { createStreamingVoice, detectPersonaHeader, splitClauses } from "@/lib/aurora/streaming-voice";
import type { StreamingVoicePersona } from "@/lib/aurora/streaming-voice";

describe("createStreamingVoice — troceo en cláusulas mientras llega el stream", () => {
  it("no habla hasta cerrar la primera cláusula; letra a letra emite las cláusulas esperadas", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });
    const texto = "Hola, ¿qué tal? Todo bien.";
    const indiceCierrePrimeraClausula = texto.indexOf("?"); // "Hola, ¿qué tal?"

    for (let i = 0; i < texto.length; i++) {
      voice.feed(texto[i]);
      if (i < indiceCierrePrimeraClausula) {
        expect(voice.spoken).toHaveLength(0);
      }
    }
    voice.flush();

    expect(voice.spoken.map((s) => s.text)).toEqual(["Hola, ¿qué tal?", "Todo bien."]);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenNthCalledWith(1, "Hola, ¿qué tal?", undefined);
    expect(speak).toHaveBeenNthCalledWith(2, "Todo bien.", undefined);
  });

  it("el tope de 14 palabras dispara aunque no haya puntuación", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });
    const catorcePalabras =
      "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce";
    const palabrasExtra = "quince dieciseis";

    for (const palabra of catorcePalabras.split(" ")) {
      voice.feed(`${palabra} `);
    }
    // Con las 14 palabras completas (y su espacio final) ya cerró SOLA, sin
    // ningún punto ni coma de por medio — el tope de seguridad, no el resto
    // de reglas.
    expect(voice.spoken.map((s) => s.text)).toEqual([catorcePalabras]);

    // Dos palabras más NO alcanzan un segundo tope ni ninguna otra regla:
    // quedan pendientes hasta que algo las cierre.
    for (const palabra of palabrasExtra.split(" ")) {
      voice.feed(`${palabra} `);
    }
    expect(voice.spoken).toHaveLength(1);

    voice.flush();
    expect(voice.spoken.map((s) => s.text)).toEqual([catorcePalabras, palabrasExtra]);
  });

  it("un bloque de código ``` no se habla, y el troceo sigue funcionando con el resto", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });

    voice.feed("Aquí tienes un ejemplo:\n```js\nconsole.log('hola');\n");
    voice.feed("```\nY ya está.");
    voice.flush();

    const textos = voice.spoken.map((s) => s.text);
    expect(textos).toEqual(["Aquí tienes un ejemplo:", "Y ya está."]);
    expect(textos.join(" ")).not.toContain("console.log");
    expect(textos.join(" ")).not.toContain("```");
  });

  it("flush() emite lo que quede pendiente; stop() lo descarta sin hablar", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });
    voice.feed("Esto queda a medias sin puntuación final");
    expect(voice.spoken).toHaveLength(0);

    voice.flush();
    expect(voice.spoken.map((s) => s.text)).toEqual(["Esto queda a medias sin puntuación final"]);

    const speak2 = vi.fn();
    const voice2 = createStreamingVoice({ speak: speak2 });
    voice2.feed("Otro texto que tampoco cierra clausula");
    voice2.stop();
    voice2.flush(); // tras stop(), no queda nada pendiente que vaciar
    expect(voice2.spoken).toHaveLength(0);
    expect(speak2).not.toHaveBeenCalled();
  });

  it("si `speak` lanza una excepción, feed() no propaga (y la cláusula queda registrada igual)", () => {
    const voice = createStreamingVoice({
      speak: () => {
        throw new Error("boom");
      },
    });

    expect(() => voice.feed("Frase completa.")).not.toThrow();
    expect(voice.spoken.map((s) => s.text)).toEqual(["Frase completa."]);
  });

  it("con enabled:false no llama a speak() pero sigue troceando y avisando de cambios de personalidad", () => {
    const speak = vi.fn();
    const onPersonaChange = vi.fn();
    const resolvePersona = (name: string): StreamingVoicePersona | null =>
      name === "Atenea" ? { id: "atenea", name: "Atenea" } : null;
    const voice = createStreamingVoice({
      speak,
      onPersonaChange,
      resolvePersona,
      enabled: false,
      initialPersonaId: "aurora",
    });

    voice.feed("Aviso breve del sistema.");
    voice.feed("\n## Atenea: nueva sección.");
    voice.flush();

    expect(speak).not.toHaveBeenCalled();
    expect(onPersonaChange).toHaveBeenCalledTimes(1);
    expect(onPersonaChange).toHaveBeenCalledWith({ id: "atenea", name: "Atenea" });
    expect(voice.spoken.map((s) => s.text)).toEqual(["Aviso breve del sistema.", "nueva sección."]);
  });
});

describe("createStreamingVoice — cabeceras de personalidad a mitad de respuesta", () => {
  it("una cabecera cambia de personalidad, avisa por onPersonaChange y NO aparece en el texto hablado (regresión clave)", () => {
    const speak = vi.fn();
    const onPersonaChange = vi.fn();
    const resolvePersona = (name: string): StreamingVoicePersona | null =>
      name === "Hephaestus" ? { id: "hephaestus", name: "Hephaestus" } : null;
    const voice = createStreamingVoice({ speak, onPersonaChange, resolvePersona });

    voice.feed("### 💬 [Hephaestus]: ");
    voice.feed("Aquí está el código.");
    voice.flush();

    expect(onPersonaChange).toHaveBeenCalledTimes(1);
    expect(onPersonaChange).toHaveBeenCalledWith({ id: "hephaestus", name: "Hephaestus" });

    const textos = voice.spoken.map((s) => s.text);
    expect(textos).toEqual(["Aquí está el código."]);
    // La regresión del original: leía "almohadilla almohadilla almohadilla
    // Hephaestus dos puntos" porque nunca quitaba la cabecera del habla.
    for (const t of textos) {
      expect(t).not.toContain("#");
      expect(t).not.toContain("[Hephaestus]");
      expect(t).not.toContain("💬");
    }
  });

  it("lo acumulado ANTES de una cabecera se habla con la personalidad anterior, no con la nueva", () => {
    const speak = vi.fn();
    const onPersonaChange = vi.fn();
    const resolvePersona = (name: string): StreamingVoicePersona | null =>
      name === "Hephaestus" ? { id: "hephaestus", name: "Hephaestus" } : null;
    const voice = createStreamingVoice({
      speak,
      onPersonaChange,
      resolvePersona,
      initialPersonaId: "aurora",
    });

    voice.feed("Aurora dice algo primero sin punto final");
    voice.feed("\n### 💬 [Hephaestus]: Y ahora sigo yo.");
    voice.flush();

    expect(voice.spoken).toEqual([
      { text: "Aurora dice algo primero sin punto final", personaId: "aurora" },
      { text: "Y ahora sigo yo.", personaId: "hephaestus" },
    ]);
  });

  it("reconoce las variantes de cabecera con y sin emoji (encabezado, negrita, sólo emoji)", () => {
    const casos: { linea: string; nombreEsperado: string; restoEsperado: string }[] = [
      { linea: "### 💬 [Hephaestus]: hola", nombreEsperado: "Hephaestus", restoEsperado: "hola" },
      { linea: "### 🌸 Aurora (Alma Viva): hola", nombreEsperado: "Aurora (Alma Viva)", restoEsperado: "hola" },
      { linea: "**⚒️ Hephaestus**: hola", nombreEsperado: "Hephaestus", restoEsperado: "hola" },
      { linea: "## Atenea: hola", nombreEsperado: "Atenea", restoEsperado: "hola" },
      { linea: "🔮 Hermione: hola", nombreEsperado: "Hermione", restoEsperado: "hola" },
    ];

    for (const { linea, nombreEsperado, restoEsperado } of casos) {
      expect(detectPersonaHeader(linea)).toEqual({ name: nombreEsperado, rest: restoEsperado });
    }
  });

  it("no confunde una frase normal con dos puntos con una cabecera", () => {
    expect(detectPersonaHeader("Nota: recuerda traer agua")).toBeNull();
    expect(detectPersonaHeader("Preguntas: ¿cómo estás?")).toBeNull();
    expect(detectPersonaHeader("Hola, ¿qué tal?")).toBeNull();
  });

  it("una cabecera sintácticamente válida pero con nombre no reconocido se trata como texto normal", () => {
    const speak = vi.fn();
    const onPersonaChange = vi.fn();
    const resolvePersona = (): StreamingVoicePersona | null => null; // no reconoce ningún nombre
    const voice = createStreamingVoice({ speak, onPersonaChange, resolvePersona, initialPersonaId: "aurora" });

    voice.feed("### Instalación: sigue estos pasos.");
    voice.flush();

    expect(onPersonaChange).not.toHaveBeenCalled();
    expect(voice.spoken).toEqual([
      { text: "### Instalación: sigue estos pasos.", personaId: "aurora" },
    ]);
  });

  it("sin resolvePersona, cualquier cabecera sintáctica se acepta usando el nombre leído como id", () => {
    const speak = vi.fn();
    const onPersonaChange = vi.fn();
    const voice = createStreamingVoice({ speak, onPersonaChange });

    voice.feed("## Atenea: hola de nuevo.");
    voice.flush();

    expect(onPersonaChange).toHaveBeenCalledWith({ id: "Atenea", name: "Atenea" });
    expect(voice.spoken).toEqual([{ text: "hola de nuevo.", personaId: "Atenea" }]);
  });
});

describe("splitClauses — troceador puro", () => {
  it("cierra por fin de frase, y dos puntos/coma sólo con ≥6 palabras acumuladas", () => {
    // "Primero," lleva 1 palabra: la coma NO cierra por sí sola.
    const r1 = splitClauses("Primero, segundo, tercero.");
    expect(r1.clauses).toEqual(["Primero, segundo, tercero."]);
    expect(r1.rest).toBe("");

    // 6 palabras antes de la coma: SÍ cierra ahí.
    const r2 = splitClauses("Uno dos tres cuatro cinco seis, siete ocho.");
    expect(r2.clauses[0]).toBe("Uno dos tres cuatro cinco seis,");
  });

  it("dos saltos de línea cierran cláusula aunque no haya puntuación", () => {
    const r = splitClauses("Primer párrafo sin punto\n\nSegundo párrafo.");
    expect(r.clauses).toEqual(["Primer párrafo sin punto", "Segundo párrafo."]);
  });

  it("deja en `rest` lo que aún no cierra ninguna regla", () => {
    const r = splitClauses("Esto sigue a medias");
    expect(r.clauses).toEqual([]);
    expect(r.rest).toBe("Esto sigue a medias");
  });

  it("nunca emite cláusulas vacías o de solo puntuación", () => {
    const r = splitClauses("... ¡! ??? \n\n Hola.");
    expect(r.clauses.every((c) => /[\p{L}\p{N}]/u.test(c))).toBe(true);
  });

  it("quita los marcadores [[goto:...]] del texto hablado", () => {
    const r = splitClauses("Vamos [[goto:/inicio]] ya mismo.");
    expect(r.clauses).toEqual(["Vamos ya mismo."]);
  });
});
