/**
 * (Ola 302) La voz de Aurora nunca vuelve a sonar masculina: `elegirVozRespetandoGenero`
 * DESCARTA las voces del género contrario al pedido y, cuando no queda ninguna
 * del género deseado, recurre a la mejor de siempre marcando `generoIncumplido`
 * para que la interfaz pueda decir la verdad. Cubre también el detector de
 * género por nombre (`generoDeVozDelNavegador`) con su tolerancia a
 * mayúsculas/acentos, y que los nombres desconocidos no se descartan.
 */

import { describe, expect, it } from "vitest";
import {
  elegirVozRespetandoGenero,
  generoDeVozDelNavegador,
} from "@/lib/aurora/tts-oss/browser-voices";

import type { GeneroVoz } from "@/lib/aurora/tts-oss/browser-voices";

/** Construye una `SpeechSynthesisVoice` falsa (planos, sin `window`). */
function voz(nombre: string, lang = "es-ES"): SpeechSynthesisVoice {
  return {
    name: nombre,
    lang,
    voiceURI: `urn:moz-tts:${nombre}`,
    localService: false,
    default: false,
  };
}

describe("generoDeVozDelNavegador", () => {
  it("reconoce voces femeninas en español (con y sin acento)", () => {
    expect(generoDeVozDelNavegador("Microsoft Mónica Natural")).toBe("femenina");
    expect(generoDeVozDelNavegador("Microsoft Monica - Spanish (Spain)")).toBe("femenina");
    expect(generoDeVozDelNavegador("Google español")).toBe("femenina");
    expect(generoDeVozDelNavegador("Paulina")).toBe("femenina");
    expect(generoDeVozDelNavegador("Marisol")).toBe("femenina");
  });

  it("reconoce voces masculinas en español", () => {
    expect(generoDeVozDelNavegador("Microsoft Raúl Natural")).toBe("masculina");
    expect(generoDeVozDelNavegador("Microsoft Raul - Spanish")).toBe("masculina");
    expect(generoDeVozDelNavegador("Jorge")).toBe("masculina");
    expect(generoDeVozDelNavegador("Diego")).toBe("masculina");
    expect(generoDeVozDelNavegador("Álvaro")).toBe("masculina");
  });

  it("devuelve neutra para nombres desconocidos", () => {
    expect(generoDeVozDelNavegador("Siri voice 3")).toBe("neutra");
    expect(generoDeVozDelNavegador("")).toBe("neutra");
    expect(generoDeVozDelNavegador("Samantha")).toBe("femenina");
  });
});

describe("elegirVozRespetandoGenero", () => {
  it("si hay femenina, ella gana aunque haya masculina mejor rankeada", () => {
    const voces = [
      voz("Microsoft Jorge Natural", "es-ES"),
      voz("Microsoft Diego - Spanish (Spain)", "es-ES"),
      voz("Microsoft Mónica Natural", "es-ES"),
    ];
    const r = elegirVozRespetandoGenero("femenina", voces);
    expect(r.voice?.name).toBe("Microsoft Mónica Natural");
    expect(r.generoIncumplido).toBe(false);
  });

  it("con SOLO voces masculinas se devuelve una con generoIncumplido", () => {
    const voces = [
      voz("Microsoft Jorge Natural", "es-ES"),
      voz("Microsoft Diego - Spanish (Spain)", "es-ES"),
    ];
    const r = elegirVozRespetandoGenero("femenina", voces);
    expect(r.voice).not.toBeNull();
    expect(r.generoIncumplido).toBe(true);
  });

  it("los nombres desconocidos (neutra) no se descartan y no incumplen", () => {
    const voces = [
      voz("Siri voice 3", "es-ES"),
      voz("Microsoft Jorge Natural", "es-ES"),
    ];
    const r = elegirVozRespetandoGenero("femenina", voces);
    expect(r.generoIncumplido).toBe(false);
    expect(r.voice?.name).toBe("Siri voice 3");
  });

  it("devuelve null solo cuando no hay voces en absoluto", () => {
    const r = elegirVozRespetandoGenero("femenina", []);
    expect(r.voice).toBeNull();
    expect(r.generoIncumplido).toBe(false);
  });
});

// Referencia tipográfica para que `GeneroVoz` y `tipoGenero` se mantengan en
// sincronía de vocabulario (el detector alimenta el descarte del ranking).
const _vocabulario: { genero: GeneroVoz; resultado: ReturnType<typeof generoDeVozDelNavegador> }[] = [];
void _vocabulario;