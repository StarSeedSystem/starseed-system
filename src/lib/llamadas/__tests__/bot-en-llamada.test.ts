/**
 * Turnos del bot en la llamada (voz fusionada de Astraura): silencio ≥ 700 ms, una
 * persona habla lo corta, un solo bot a la vez, elección del servidor de voz de la
 * sesión y entrega de la pista por omnivoice-mixer. Temporizadores y mezclador
 * inyectables: sin red, sin micro, sin procesos.
 */
import { describe, expect, it } from "vitest";
import { elegirServidorVoz, entregarPistaBot, esMensajeTextoLlamada, SILENCIO_MS, TurnosBot } from "@/lib/llamadas/bot-en-llamada";
import type { MensajeTextoLlamada } from "@/lib/llamadas/bot-en-llamada";
type Temporizador = { cb: () => void; ms: number; cancelado: boolean };
function turnosDePrueba(botId = "bot-1") {
    const temporizadores: Temporizador[] = [];
    const respuestas: string[] = [];
    const cortes: number[] = [];
    const bot = new TurnosBot(botId, {
        responder: (texto) => respuestas.push(texto),
        cortar: () => cortes.push(cortes.length + 1),
        programar: (cb, ms) => {
            const t: Temporizador = { cb, ms, cancelado: false };
            temporizadores.push(t);
            return () => { t.cancelado = true; };
        },
    });
    const sinCancelar = () => temporizadores.filter((t) => !t.cancelado);
    return { bot, temporizadores, sinCancelar, respuestas, cortes };
}
const persona = (texto: string, en: number, de = "yo:pestana"): MensajeTextoLlamada => ({ de, rol: "persona", texto, en });
describe("turnos del bot en la llamada", () => {
    it("habla tras el silencio ≥ 700 ms de la última persona", () => {
        const p = turnosDePrueba();
        p.bot.texto(persona("hola", 1000));
        expect(p.sinCancelar().map((t) => t.ms)).toEqual([SILENCIO_MS]);
    });
    it("los parciales de otra persona reinician el silencio", () => {
        const p = turnosDePrueba();
        p.bot.texto(persona("hola", 1000));
        p.bot.texto({ de: "otra:p2", rol: "persona", texto: "sigo ", parcial: true, en: 1400 });
        expect(p.temporizadores[0].cancelado).toBe(true);
        expect(p.sinCancelar()).toHaveLength(1);
    });
    it("los finales dentro del silencio se acumulan en la respuesta", () => {
        const p = turnosDePrueba();
        p.bot.texto(persona("hola", 1000));
        p.bot.texto(persona("hola comunidad", 1200, "otra:p2"));
        p.sinCancelar()[0].cb();
        expect(p.respuestas).toEqual(["hola hola comunidad"]);
    });
    it("una persona que habla CORTA al bot que contestaba", () => {
        const p = turnosDePrueba();
        p.bot.texto(persona("hola", 1000));
        p.sinCancelar()[0].cb();
        expect(p.respuestas).toEqual(["hola"]);
        p.bot.texto(persona("espera", 1600));
        expect(p.cortes).toHaveLength(1);
        expect(p.bot.estado().activo).toBe(false);
    });
    it("un solo bot a la vez: mientras otro contesta, este calla", () => {
        const p = turnosDePrueba();
        p.bot.texto(persona("hola", 1000));
        p.bot.texto({ de: "otro-bot", rol: "bot", evento: "empieza", en: 1200 });
        p.sinCancelar()[0].cb();
        expect(p.respuestas).toEqual([]);
        p.bot.texto({ de: "otro-bot", rol: "bot", evento: "termina", en: 2200 });
        expect(p.bot.estado().otroBotActivo).toBe(false);
    });
    it("los anuncios del propio bot marcan el estado, no disparan respuestas", () => {
        const p = turnosDePrueba();
        p.bot.texto({ de: "bot-1", rol: "bot", evento: "empieza", en: 100 });
        expect(p.bot.estado().activo).toBe(true);
        expect(p.sinCancelar()).toHaveLength(0);
        p.bot.texto({ de: "bot-1", rol: "bot", evento: "termina", en: 900 });
        expect(p.bot.estado().activo).toBe(false);
    });
    it("un mensaje mal formado se ignora sin lanzar", () => {
        const p = turnosDePrueba();
        expect(() => p.bot.texto({ de: "", rol: "persona", texto: "x", en: 1 } as MensajeTextoLlamada)).not.toThrow();
        expect(esMensajeTextoLlamada({ de: "", rol: "persona", texto: "x", en: 1 })).toBe(false);
        expect(esMensajeTextoLlamada(null)).toBe(false);
        expect(esMensajeTextoLlamada(persona("válido", 2000))).toBe(true);
    });
});
describe("elegirServidorVoz", () => {
    const base = { encendida: true, deConfianza: true, ramLibreMb: 1000 };
    it("elige la de menor latencia medida entre las válidas", () => {
        const e = elegirServidorVoz([{ id: "a1", ...base, latenciaMs: 120 }, { id: "mac", ...base, latenciaMs: 40 }], null, 0);
        expect(e.id).toBe("mac");
    });
    it("descarta apagadas, sin confianza, sin RAM o sin latencia medida", () => {
        const e = elegirServidorVoz([
            { id: "apagada", latenciaMs: 10, ...base, encendida: false },
            { id: "extraña", latenciaMs: 10, ...base, deConfianza: false },
            { id: "reventada", latenciaMs: 10, encendida: true, deConfianza: true, ramLibreMb: 1 },
            { id: "sin-medir", latenciaMs: null, ...base },
        ], null, 0);
        expect(e.id).toBeNull();
    });
    it("histéresis: se mantiene la actual salvo mejora clara (>25 %)", () => {
        const adentro = { id: "actual", latenciaMs: 200, ...base };
        const nueva = { id: "nueva", latenciaMs: 200, ...base };
        expect(elegirServidorVoz([adentro, { ...nueva, latenciaMs: 180 }], "actual", 100).id).toBe("actual");
        expect(elegirServidorVoz([adentro, { ...nueva, latenciaMs: 90 }], "actual", 100).id).toBe("nueva");
        expect(elegirServidorVoz([adentro, nueva], "actual", 100).id).toBe("actual");
    });
});
describe("pista de audio del bot", () => {
    it("se entrega por el mixer con ganancia de neurona y al motor, nunca lanza", () => {
        const ganancias: Record<string, number> = {}; const puestas: unknown[] = [];
        expect(entregarPistaBot({} as MediaStreamTrack, {
            neurona: "bot-aurora", nivel: 0.6,
            mezcla: { setNeuronMixGain: (id, g) => { ganancias[id] = g; } },
            motor: { ponerPistaAudio: (p) => puestas.push(p) },
        })).toBe(true);
        expect(ganancias["bot-aurora"]).toBe(0.6);
        expect(puestas).toHaveLength(1);
    });
    it("sin pista o sin motor devuelve falso, sin lanzar", () => {
        expect(() => entregarPistaBot(null, { neurona: "n", nivel: 1, mezcla: null, motor: null })).not.toThrow();
    });
});
