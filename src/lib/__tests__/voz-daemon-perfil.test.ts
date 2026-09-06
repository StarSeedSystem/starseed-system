/**
 * Tests del puente timbre → demonio (Tarea D · Ola 263 · Forja fase 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprueban dos cosas que unen la F4 (el perfil neuronal) con la F5 (que el
 * demonio y el motor local lo apliquen):
 *
 *   1. `sintetizarEnDaemon` manda `seed` y `pitch` en el JSON del cuerpo SOLO
 *      cuando se le pasan, y los omite cuando no (no fijar valores que el
 *      llamador no pidió: el demonio derivaría solo su semilla determinista).
 *   2. La traducción del motor local (`parametrosPorNivel(timbre, "estudio")`)
 *      para TIMBRES[0] produce un `instruct` válido y un `seed` numérico.
 *
 * `fetch` se parchea con `vi.stubGlobal`: el módulo llama a `fetch` de la
 * vía directa (4500) y, si falla, a la del demonio (4444); capturamos TODOS los
 * cuerpos para verificar sin depender de qué puerta responde.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sintetizarEnDaemon } from "@/lib/aurora/voz-starseed/daemon";
import { parametrosPorNivel } from "@/lib/aurora/voz-starseed/motor";
import { TIMBRES } from "@/lib/aurora/timbres";

/** Devuelve los cuerpos JSON que el código bajo prueba mandó a `fetch`. */
function capturarCuerpos(): { cuerpos: Record<string, unknown>[]; llamadas: number } {
    const cuerpos: Record<string, unknown>[] = [];
    const fn = vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
            const init = _init ?? {};
            if (typeof init.body === "string") {
                const texto = init.body;
                // El cuerpo del POST es JSON; lo guardamos tal cual para inspeccionarlo.
                cuerpos.push(JSON.parse(texto) as Record<string, unknown>);
            }
            // Responde con un WAV vacío de 4 bytes para que el cliente lo tome
            // como «sintetizó algo». Con `byteLength > 0` evita reintentar la
            // segunda puerta solo si queremos; aquí devolvemos siempre OK en la
            // primera para que el cuerpo capturado sea el de la vía directa.
            return new Response(new Uint8Array([82, 73, 70, 70]).buffer, {
                status: 200,
                headers: { "Content-Type": "audio/wav" },
            });
        },
    );
    vi.stubGlobal("fetch", fn);
    return {
        cuerpos,
        get llamadas() {
            return fn.mock.calls.length;
        },
    };
}

describe("sintetizarEnDaemon envía seed y pitch al demonio", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("manda seed y pitch en el cuerpo cuando se le pasan", async () => {
        const { cuerpos } = capturarCuerpos();
        await sintetizarEnDaemon("hola aurora", {
            voz: "ef_dora",
            speed: 1,
            instruct: "female",
            seed: 123456,
            pitch: 1.2,
        });
        expect(cuerpos.length).toBeGreaterThan(0);
        const cuerpo = cuerpos[0];
        expect(cuerpo.seed).toBe(123456);
        expect(cuerpo.pitch).toBe(1.2);
    });

    it("no manda seed ni pitch cuando no se le pasan", async () => {
        const { cuerpos } = capturarCuerpos();
        await sintetizarEnDaemon("hola aurora", { voz: "ef_dora", speed: 1 });
        expect(cuerpos.length).toBeGreaterThan(0);
        const cuerpo = cuerpos[0];
        // Ausencia real: ni la clave ni un valor por defecto inventado aquí.
        expect("seed" in cuerpo).toBe(false);
        expect("pitch" in cuerpo).toBe(false);
    });

    it("manda solo seed (sin pitch) cuando solo se le da seed", async () => {
        const { cuerpos } = capturarCuerpos();
        await sintetizarEnDaemon("hola aurora", { voz: "ef_dora", speed: 1, seed: 42 });
        const cuerpo = cuerpos[0];
        expect(cuerpo.seed).toBe(42);
        expect("pitch" in cuerpo).toBe(false);
    });
});

describe("la traducción del motor local produce instruct válido y seed numérico", () => {
    it("TIMBRES[0] (Aurora) traduce a instruct válido y seed numérico", () => {
        const p = parametrosPorNivel(TIMBRES[0], "estudio");
        expect(p.via).toBe("local");
        if (p.via !== "local") return; // estrecha el tipo sin `any`
        // El instruct debe ser no vacío y válido: Aurora es «female, young
        // adult, moderate pitch», que el espejo conserva íntegro.
        expect(typeof p.instruct).toBe("string");
        expect((p.instruct ?? "").length).toBeGreaterThan(0);
        // La semilla es un número finito: viaja al demonio y fija el timbre.
        expect(typeof p.seed).toBe("number");
        expect(Number.isFinite(p.seed)).toBe(true);
        // El tono está dentro del rango que el demonio acota ([0.7, 1.4]).
        expect(p.pitch).toBeGreaterThanOrEqual(0.7);
        expect(p.pitch).toBeLessThanOrEqual(1.4);
    });

    it("el instruct de TIMBRES[0] no contiene texto libre inválido", () => {
        // Aurora usa tokens del vocabulario cerrado del demonio; si se filtrara
        // texto libre, el demonio lo descartaría TODO y caería al default.
        const p = parametrosPorNivel(TIMBRES[0], "estudio");
        if (p.via !== "local") return;
        const tokens = (p.instruct ?? "").split(",").map((t) => t.trim().toLowerCase());
        const validos = new Set([
            "female",
            "male",
            "child",
            "teenager",
            "young adult",
            "middle-aged",
            "elderly",
            "very low pitch",
            "low pitch",
            "moderate pitch",
            "high pitch",
            "very high pitch",
            "whisper",
            "american accent",
            "australian accent",
            "british accent",
            "canadian accent",
            "chinese accent",
            "indian accent",
            "japanese accent",
            "korean accent",
            "portuguese accent",
            "russian accent",
        ]);
        for (const token of tokens) {
            expect(validos.has(token), `token «${token}» no está en el vocabulario del demonio`).toBe(true);
        }
    });
});