import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Plantilla launchd del demonio de voz nativo del OS. Se lee del disco en tiempo
// de test para que el autómata analice SIEMPRE el archivo real (2026-09-06, Ola 255).
const PLIST = path.join(process.cwd(), "native/astraura-voice/com.starseed.astraura-voice.plist");

function contenidoDelPlist(): string {
  return readFileSync(PLIST, "utf8");
}

/** Valor de una clave top-level del plist (parseo por regex sobre el XML). */
function valorDe(clave: string): string | null {
  const contenido = contenidoDelPlist();
  const m = contenido.match(new RegExp(`<key>${clave}</key>\\s*<string>([^<]+)</string>`));
  return m ? m[1].trim() : null;
}

describe("plantilla plist del demonio de voz: prioridad normal (Ola 255)", () => {
  it("ProcessType es 'Interactive' (CPU e I/O normales para tts-server y asr_stream_server)", () => {
    const valor = valorDe("ProcessType");
    expect(valor).toBe("Interactive");
  });

  it("no contiene '<string>Background</string>' en ninguna parte (la plantilla vieja estrangulaba CPU y E/S)", () => {
    const contenido = contenidoDelPlist();
    expect(contenido).not.toContain("<string>Background</string>");
  });

  it("LowPriorityIO es '<false/>' (sin prioridad de E/S de fondo)", () => {
    const contenido = contenidoDelPlist();
    const m = contenido.match(/<key>LowPriorityIO<\/key>\s*(<(?:true|false)\/>)/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("<false/>");
  });
});