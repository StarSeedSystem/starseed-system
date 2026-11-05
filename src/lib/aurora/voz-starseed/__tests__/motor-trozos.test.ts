// src/lib/aurora/voz-starseed/__tests__/motor-trozos.test.ts
/**
 * Pruebas del mensaje ENTERO por trozos (Ola 1105 · 1105W · contrato
 * `architecture/voz-estable-1105.md` §3): `hablarPorNube` pide trozos ≤ 500
 * en orden (reintenta una vez y devuelve `false` si no llegan) y
 * `hablarPorSistema` encola una utterance por trozo ≤ 200 sin `cancel()`
 * entre trozos. Sin red de verdad: fetch y speechSynthesis SIMULADOS.
 */

import { describe, expect, it } from "vitest";
import { hablarPorNube, hablarPorSistema } from "../motor";
import { trocearTexto } from "@/lib/voces/trocear";
import type { Timbre } from "@/lib/aurora/timbres-catalogo";

const TIMBRE: Timbre = {
    id: "prueba-1105", nombre: "Prueba", genero: "neutra", desc: "prueba",
    local: { voz: "ef_dora", speed: 1 },
    sistema: { bases: ["Paulina"], pitch: 1, rate: 1 },
    expr: { arco: 0.1, vivacidad: 0.1, calidez: 0.1 },
};

/** Texto de conversación (~1500 caracteres), en frases bien separadas. */
const TEXTO_LARGO = "Te acompaño con calma mientras todo se ordena en casa. ".repeat(30);

/** Golpe simulado de la nube: qué contesta cada petición, por orden. */
type Golpe = "ok" | "error" | "vacio";

interface FalsoResponse { ok: boolean; blob(): Promise<Blob>; }
const BLOB_OK = { size: 7 } as unknown as Blob;

/** Monta un `fetch` falso: registra el `texto` pedido y contesta una lista de golpes. */
function montarFetch(golpes: readonly Golpe[]): { textosPedidos: string[] } {
    const textosPedidos: string[] = [];
    const falso = async (_url: string, init?: { body?: string }): Promise<FalsoResponse> => {
        const cuerpo = JSON.parse(init?.body ?? "{}") as { texto?: string };
        textosPedidos.push(cuerpo.texto ?? "");
        const golpe = golpes[textosPedidos.length - 1] ?? "error";
        if (golpe === "error") throw new Error("red caída (simulada)");
        return { ok: true, blob: async () => (golpe === "vacio" ? { size: 0 } : BLOB_OK) as unknown as Blob };
    };
    (globalThis as unknown as Record<string, unknown>).fetch = falso;
    return { textosPedidos };
}

/** Utterance falsa del navegador, con los mismos campos que lee el motor. */
class Utterancia {
    text: string;
    pitch = 1;
    rate = 1;
    lang = "";
    onstart: (() => void) | null = null;
    constructor(texto: string) { this.text = texto; }
}
interface FalsoSynth {
    cancel(): void;
    speak(u: Utterancia): void;
}

/** Monta speechSynthesis falso en `window` (= globalThis, entorno node). */
function montarSistema(): { dichas: Utterancia[]; cancelados: number[] } {
    const g = globalThis as unknown as Record<string, unknown>;
    const dichas: Utterancia[] = [];
    const cancelados: number[] = [];
    const synth: FalsoSynth = {
        cancel: () => { cancelados.push(1); },
        speak: (u) => { dichas.push(u); },
    };
    g.window = globalThis;
    g.SpeechSynthesisUtterance = Utterancia;
    g.speechSynthesis = synth;
    return { dichas, cancelados };
}

describe("hablarPorNube", () => {
    it("un texto de 1500 caracteres se pide en 3-4 trozos en orden", async () => {
        const { textosPedidos } = montarFetch(["ok", "ok", "ok", "ok"]);
        const esperados = trocearTexto(TEXTO_LARGO, 500);
        expect([3, 4]).toContain(esperados.length);
        const ok = await hablarPorNube(TEXTO_LARGO, TIMBRE);
        // (Contrato §3) Un trozo a la vez, en orden, exactamente los que hay que pedir.
        expect(textosPedidos).toEqual(esperados);
        expect(textosPedidos.length).toBeGreaterThanOrEqual(3);
        expect(textosPedidos.length).toBeLessThanOrEqual(4);
        // Reproducción simulada: el valor de vuelta depende del navegador, no de aquí.
        expect(typeof ok === "boolean").toBe(true);
    });

    it("un trozo que falla se reclama UNA vez y devuelve false sin pedir el resto", async () => {
        const { textosPedidos } = montarFetch(["ok", "error", "error", "ok"]);
        const esperados = trocearTexto(TEXTO_LARGO, 500);
        expect(esperados.length).toBeGreaterThanOrEqual(3);
        const ok = await hablarPorNube(TEXTO_LARGO, TIMBRE);
        expect(ok).toBe(false);
        // 1 (primer trozo) + 2 (el trozo roto y su único reintento); el resto ya se pide.
        expect(textosPedidos.length).toBe(3);
        expect(textosPedidos[1]).toBe(esperados[1]);
        expect(textosPedidos[2]).toBe(esperados[1]);
    });

    it("un texto corto sale en una sola petición", async () => {
        const { textosPedidos } = montarFetch(["ok"]);
        await hablarPorNube("Hola, tardo un momento.", TIMBRE);
        expect(textosPedidos).toEqual(["Hola, tardo un momento."]);
    });
});

describe("hablarPorSistema", () => {
    it("un texto de 1500 caracteres va en una utterance por trozo en fila", async () => {
        const { dichas, cancelados } = montarSistema();
        const esperados = trocearTexto(TEXTO_LARGO, 200);
        expect(esperados.length).toBeGreaterThanOrEqual(7);
        const ok = await hablarPorSistema(TEXTO_LARGO, TIMBRE);
        expect(ok).toBe(true);
        // Una utterance POR TROZO (≤ 200), en orden y todas.
        expect(dichas.map((u) => u.text)).toEqual(esperados);
        expect(esperados.every((t) => t.length <= 200)).toBe(true);
        // Un `cancel()` AL INICIO, nunca entre trozos.
        expect(cancelados.length).toBe(1);
        // La identidad viaja igual: tono y ritmo del timbre en cada trozo.
        expect(dichas[0].pitch).toBe(TIMBRE.sistema.pitch);
        expect(dichas[0].rate).toBe(TIMBRE.sistema.rate);
        expect(dichas[0].lang).toBe("es-ES");
    });

    it("llama a `cancel()` solo al empezar y encola todas las utterance", async () => {
        const { dichas, cancelados } = montarSistema();
        const texto = "Turno nuevo en silencio previo. Y esta va en fila. ";
        await hablarPorSistema(texto.repeat(3), TIMBRE);
        expect(cancelados.length).toBe(1);
        expect(dichas.length).toBe(trocearTexto(texto.repeat(3), 200).length);
    });
});
