/**
 * Formato del chat de Astraura (`chat-format.ts`) — verifica el arreglo de
 * los TRES síntomas reportados: (1) las directivas `[[ACCION: …]]` se
 * mostraban/guardaban en crudo en la burbuja del mensaje, (2) la cabecera de
 * personalidad podía salir duplicada dos veces seguidas, y (3) un "\n"
 * literal de una directiva podía acabar impreso tal cual en vez de como
 * salto de línea real. También cubre `hideIncompleteDirective` (la pieza que
 * hace que el streaming se vea limpio mientras una directiva está a medio
 * escribir) y la higiene equivalente en `streaming-voice.ts` (una directiva
 * nunca se lee en voz alta, ni siquiera partida entre varios `feed()`).
 */

import { describe, expect, it, vi } from "vitest";
import {
  formatAssistantText,
  collapseRepeatedSpeakers,
  hideIncompleteDirective,
  unescapeLiteralNewlines,
} from "@/lib/aurora/chat-format";
import { createStreamingVoice } from "@/lib/aurora/streaming-voice";

describe("formatAssistantText — quita directivas", () => {
  it("quita una directiva simple y conserva el texto alrededor", () => {
    const raw = "Hola, voy a hacerlo.\n\n[[ACCION: abrir_pizarra {}]]\n\nListo, ya está abierta.";
    expect(formatAssistantText(raw)).toBe("Hola, voy a hacerlo.\n\nListo, ya está abierta.");
  });

  it("quita varias directivas seguidas, con y sin argumentos", () => {
    const raw = [
      "[[ACCION: abrir_cerebro {}]]",
      "",
      "[[ACCION: navegar {\"ruta\":\"/agent\"}]]",
      "",
      "[[ACCION: ejecutar_skill {\"nombre\":\"investigación\",\"args\":{\"consulta\":\"sistema de IA StarSeed OS\"}}]]",
      "",
      "Aquí tienes el resumen que pediste.",
    ].join("\n");
    expect(formatAssistantText(raw)).toBe("Aquí tienes el resumen que pediste.");
  });

  it("caso borde real: JSON de la directiva con `]]` dentro de una cadena, y con \\n de JSON — la directiva entera desaparece, sin dejar restos ni `\\n` impresos", () => {
    const raw =
      'Antes del bloque.\n\n' +
      '[[ACCION: crear_en_pizarra {"texto":"# Sistema de IA StarSeed\\n\\n' +
      'Nota: usa [[ así ]] en el wiki\\n- Ollama (local)\\n- Anthropic Claude"}]]\n\n' +
      'Después del bloque.';

    const out = formatAssistantText(raw);
    expect(out).toBe("Antes del bloque.\n\nDespués del bloque.");
    // Ni rastro del JSON de la directiva ni del "\n" impreso que traía dentro.
    expect(out).not.toContain("ACCION");
    expect(out).not.toContain("\\n");
    expect(out).not.toContain("Ollama");
  });

  it("un texto sin ninguna directiva queda intacto (salvo recorte de extremos)", () => {
    const raw = "  Este mensaje no trae ninguna directiva, solo texto normal.  ";
    expect(formatAssistantText(raw)).toBe("Este mensaje no trae ninguna directiva, solo texto normal.");
  });
});

describe("formatAssistantText — colapsa cabeceras duplicadas (caso real reportado)", () => {
  it("reproduce el bug exacto del reporte: cabecera duplicada + directivas → mensaje limpio con la cabecera UNA sola vez", () => {
    const raw = [
      "💬 [Aurora (StarSeed Core)]:",
      "💬 [Aurora (StarSeed Core)]:",
      "",
      "[[ACCION: abrir_cerebro {}]]",
      "",
      "[[ACCION: navegar {\"ruta\":\"/agent\"}]]",
      "",
      "[[ACCION: ejecutar_skill {\"nombre\":\"investigación\",\"args\":{\"consulta\":\"sistema de IA StarSeed OS\"}}]]",
      "",
      "Maggasukha, voy a mostrarte cómo funciona el sistema…",
      "",
      "[[ACCION: crear_en_pizarra {\"texto\":\"# Sistema de IA StarSeed\\n\\n## Modelos Activos:\\n- Ollama (local)\\n- Anthropic Claude\"}]]",
    ].join("\n");

    const out = formatAssistantText(raw);

    expect(out).toBe(
      "💬 [Aurora (StarSeed Core)]:\n\nMaggasukha, voy a mostrarte cómo funciona el sistema…",
    );
    // La cabecera aparece UNA sola vez.
    expect(out.match(/Aurora \(StarSeed Core\)/g)).toHaveLength(1);
    // Ninguna directiva ni su JSON queda visible.
    expect(out).not.toContain("[[ACCION");
    expect(out).not.toContain("Ollama");
  });
});

describe("collapseRepeatedSpeakers", () => {
  it("colapsa una cabecera duplicada consecutiva del mismo hablante", () => {
    const text = "💬 [Aurora (StarSeed Core)]:\n💬 [Aurora (StarSeed Core)]:\n\nHola, aquí estoy.";
    expect(collapseRepeatedSpeakers(text)).toBe("💬 [Aurora (StarSeed Core)]:\n\nHola, aquí estoy.");
  });

  it("cabeceras de hablantes DISTINTOS no se colapsan", () => {
    const text = "### 💬 [Hephaestus]: hola\n### 💬 [Atenea]: y hola también";
    expect(collapseRepeatedSpeakers(text)).toBe(text);
  });

  it("dos cabeceras del MISMO hablante separadas por contenido real no se colapsan (no son consecutivas)", () => {
    const text = "🔮 Hermione: primera intervención.\n\nDatos varios aquí.\n\n🔮 Hermione: segunda intervención.";
    expect(collapseRepeatedSpeakers(text)).toBe(text);
  });

  it("si la cabecera repetida trae texto tras los ':', se conserva ese texto y solo se quita el prefijo redundante", () => {
    const text = "🔮 Hermione: hola\n🔮 Hermione: mundo";
    expect(collapseRepeatedSpeakers(text)).toBe("🔮 Hermione: hola\nmundo");
  });

  it("un texto sin cabeceras queda intacto", () => {
    const text = "Sin ninguna cabecera de personalidad aquí.\nSegunda línea normal.";
    expect(collapseRepeatedSpeakers(text)).toBe(text);
  });
});

describe("hideIncompleteDirective — streaming a medias", () => {
  it("una directiva que empezó pero no cerró se oculta desde su apertura", () => {
    const parcial = 'Aquí voy a hacer algo:\n\n[[ACCION: crear_pizarra {"titulo":"Plan';
    expect(hideIncompleteDirective(parcial)).toBe("Aquí voy a hacer algo:\n\n");
  });

  it("en cuanto llega el cierre '\\]\\]', deja de ocultarse (ya no hay nada incompleto)", () => {
    const completo = 'Aquí voy a hacer algo:\n\n[[ACCION: crear_pizarra {"titulo":"Plan"}]]\n\nListo.';
    expect(hideIncompleteDirective(completo)).toBe(completo);
  });

  it("con varias directivas, solo se oculta la ÚLTIMA si es la que quedó sin cerrar", () => {
    const parcial = '[[ACCION: abrir_cerebro {}]] texto en medio [[ACCION: navegar {"ruta":"/x"';
    expect(hideIncompleteDirective(parcial)).toBe(
      '[[ACCION: abrir_cerebro {}]] texto en medio ',
    );
  });

  it("un texto sin ninguna apertura de directiva no se toca", () => {
    const texto = "Texto normal, sin corchetes dobles por ningún lado.";
    expect(hideIncompleteDirective(texto)).toBe(texto);
  });

  it("integrado en formatAssistantText: el acumulado parcial del streaming nunca enseña JSON a medias", () => {
    const chunks = [
      "Voy a abrir tu pizarra.\n\n",
      "[[ACCION: crear_pizarra ",
      '{"titulo":"Plan de la sem',
    ];
    let acc = "";
    for (const c of chunks) {
      acc += c;
      const shown = formatAssistantText(acc);
      expect(shown).not.toContain("[[ACCION");
      expect(shown).not.toContain("titulo");
    }
    expect(formatAssistantText(acc)).toBe("Voy a abrir tu pizarra.");

    // Llega el resto y cierra: AHORA sí se limpia entera y aparece lo que
    // venga después, sin ningún rastro del JSON. El espacio doble que queda
    // donde estaba la directiva (stripDirectives no colapsa ESPACIOS, solo
    // saltos de línea de más — comportamiento REUTILIZADO de actions.ts, sin
    // tocar) es aceptable: nunca queda un salto de línea de sobra visible.
    acc += '","icono":"📋"}]]\n\nAquí la tienes.';
    expect(formatAssistantText(acc)).toBe("Voy a abrir tu pizarra.\n\nAquí la tienes.");
  });
});

describe("unescapeLiteralNewlines", () => {
  it("convierte '\\n' literal (dos caracteres) en un salto de línea real", () => {
    expect(unescapeLiteralNewlines("primera linea\\nsegunda linea")).toBe(
      "primera linea\nsegunda linea",
    );
  });

  it("no toca los saltos de línea reales que ya hay en el texto", () => {
    const texto = "primera linea\nsegunda linea";
    expect(unescapeLiteralNewlines(texto)).toBe(texto);
  });

  it("NO toca el interior de un bloque de código ``` — ahí un '\\n' puede ser un ejemplo legítimo", () => {
    const texto = 'Usa esto:\n```txt\nUn "\\n" representa un salto de línea en JSON.\n```\nFin.';
    expect(unescapeLiteralNewlines(texto)).toBe(texto);
  });

  it("un texto vacío no lanza y devuelve vacío", () => {
    expect(unescapeLiteralNewlines("")).toBe("");
  });
});

describe("streaming-voice — una directiva nunca se lee en voz alta", () => {
  it("una directiva completa en un solo feed() no se habla; el texto alrededor sí", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });

    voice.feed('Voy a abrirla. [[ACCION: abrir_pizarra {"titulo":"Plan"}]] Ya está lista.');
    voice.flush();

    const textos = voice.spoken.map((s) => s.text);
    expect(textos.join(" ")).not.toContain("ACCION");
    expect(textos.join(" ")).not.toContain("titulo");
    expect(textos.join(" ")).not.toContain("[[");
    expect(textos).toEqual(["Voy a abrirla.", "Ya está lista."]);
  });

  it("una directiva PARTIDA entre varios feed() (JSON a medias) tampoco se habla", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });

    voice.feed("Un momento: [[ACCION: crear_pizarra ");
    // Lo anterior a la apertura del bloque se habla YA (el bloque "corta el
    // hilo", igual que ya pasa con un ``` de código abierto — mismo
    // precedente, sin cambios ahí): "Un momento:" no espera a que la
    // directiva cierre.
    expect(voice.spoken.map((s) => s.text)).toEqual(["Un momento:"]);
    // Pero NADA del JSON de la directiva se habla mientras sigue abierta.
    voice.feed('{"titulo":"Plan de la semana"');
    expect(voice.spoken).toHaveLength(1);
    voice.feed(',"icono":"📋"}]] Aquí tienes el resultado.');
    voice.flush();

    const textos = voice.spoken.map((s) => s.text);
    expect(textos.join(" ")).not.toContain("titulo");
    expect(textos.join(" ")).not.toContain("Plan de la semana");
    expect(textos).toEqual(["Un momento:", "Aquí tienes el resultado."]);
  });

  it("una directiva que nunca cierra (mensaje cortado) se descarta entera al hacer flush(), nunca se habla", () => {
    const speak = vi.fn();
    const voice = createStreamingVoice({ speak });

    voice.feed('Aviso: [[ACCION: crear_pizarra {"titulo":"a medias, sin cerrar');
    voice.flush();

    const textos = voice.spoken.map((s) => s.text);
    expect(textos).toEqual(["Aviso:"]);
    expect(textos.join(" ")).not.toContain("medias");
  });
});
