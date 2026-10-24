/**
 * Guardia «una sola voz» (Ola 1015V · `voz-fusionada-astraura.md` §3).
 *
 * Todo lo que habla entra por `hablar()` de `voz-unica.ts`, que elige el motor
 * (voz en vivo → cadena del registro → suelo del navegador) y nunca lanza. Solo
 * los suelos de la capa pueden tocar `speechSynthesis` directamente; cualquier
 * superficie nueva que lo haga se salta la prioridad, la interrupción y el
 * `callar()` único.
 *
 * Si te salta: llama a `hablar(texto, { contexto })` de `@/lib/aurora/voz-unica`
 * en vez de construir un `SpeechSynthesisUtterance`. Las previsualizaciones de
 * motores concretos (`voces-catalogo.md` §1.4) son la única excepción legítima
 * y viven en `PENDIENTES` hasta que pasen por la puerta única.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..", "..", "..");
const ESTE = path.relative(SRC, __filename);

/** Los suelos permitidos: la capa que de verdad implementa la Web Speech API. */
const PERMITIDOS = new Set([
    "lib/aurora/engine.ts",
    "lib/aurora/voz-starseed/motor.ts",
    "lib/aurora/voz-rito.ts",
    "lib/aurora/tts-oss/browser-voices.ts",
    "lib/aurora/tts-oss/engine-registry.ts",
    "lib/aurora/voz-unica.ts",
    "lib/voces/diagnostico.ts",
]);

/**
 * Deuda declarada, no permiso permanente: previsualizadores que aún hablan
 * directo (deben pasar por `hablar()`) y las dos superficies de la tarea K
 * (acciones y superposición de Hermes). Cuando se migren, se borran de aquí.
 */
const PENDIENTES = new Set([
    "components/aurora/aurora-studio.tsx",
    "components/hermes/ai-overlay.tsx",
    "components/onboarding/selector-voz-inicial.tsx",
    "components/settings/aurora/voice-oss-panel.tsx",
    "lib/aurora/actions.ts",
]);

/** `speechSynthesis.speak(` o `new SpeechSynthesisUtterance`, con espacios tolerados. */
const DIRECTO = /speechSynthesis\s*\.\s*speak\s*\(|new\s+SpeechSynthesisUtterance\b/g;

export function usosDirectos(texto: string): string[] {
    return [...texto.matchAll(DIRECTO)].map((m) => m[0]);
}

function recorrer(dir: string, salida: string[] = []): string[] {
    for (const nombre of readdirSync(dir)) {
        const ruta = path.join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta, salida);
        else if (/\.(tsx?|jsx?|mjs)$/.test(nombre)) salida.push(ruta);
    }
    return salida;
}

/** Las pruebas pueden hablar directo: montan bancos y no pasan por la UI. */
function esPrueba(relativo: string): boolean {
    return /(^|\/)(__tests__|__mocks__)\//.test(relativo) || /\.(test|spec)\.(tsx?|jsx?)$/.test(relativo);
}

describe("una sola voz · nadie habla por su cuenta", () => {
    it("ningún archivo de src/ usa speechSynthesis directo fuera de los suelos de la capa", () => {
        const fallos: string[] = [];
        for (const archivo of recorrer(SRC)) {
            const relativo = path.relative(SRC, archivo).split(path.sep).join("/");
            if (relativo === ESTE || esPrueba(relativo)) continue;
            if (PERMITIDOS.has(relativo) || PENDIENTES.has(relativo)) continue;
            const lineas = readFileSync(archivo, "utf8").split("\n");
            lineas.forEach((linea, i) => {
                if (usosDirectos(linea).length) {
                    fallos.push(`src/${relativo}:${i + 1}: ${linea.trim().slice(0, 120)}`);
                }
            });
        }
        expect(fallos, `Habla por \`hablar()\` de @/lib/aurora/voz-unica:\n${fallos.join("\n")}`).toEqual([]);
    });

    it("la guardia reconoce las dos formas y no confunde el resto de la API", () => {
        expect(usosDirectos("window.speechSynthesis.speak(u);")).toEqual(["speechSynthesis.speak("]);
        expect(usosDirectos("const u = new SpeechSynthesisUtterance(texto);")).toEqual(["new SpeechSynthesisUtterance"]);
        expect(usosDirectos("window.speechSynthesis.cancel(); synth.getVoices();")).toEqual([]);
        expect(usosDirectos("// `speechSynthesis.speak()` en un comentario")).toEqual(["speechSynthesis.speak("]);
    });
});
