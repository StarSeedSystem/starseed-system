/**
 * Pruebas del bot en llamada (Ola 1015V · T): turnos puros y engancho con todo inyectable.
 * Sin red, sin micrófono y sin procesos: solo funciones puras y promesas resueltas al vuelo.
 */
import { describe, expect, it } from "vitest";
import {
    SILENCIO_RESPUESTA_MS,
    elegirServidorVoz,
    engancharBot,
    estadoInicialTurnos,
    evaluarTurno,
    textoPersona,
    type CandidatoVoz,
    type EstadoTurnos,
    type FrasePersona,
} from "@/lib/llamadas/bot-en-llamada";

const frase = (de: string, texto: string, t = 0): FrasePersona => ({ de, texto, t });
const cerebro = (texto: string) => () => texto;

describe("textoPersona", () => {
    it("corta al bot en cuanto una persona comparte texto", () => {
        const estado: EstadoTurnos = { ...estadoInicialTurnos(), bot: { id: "bot", desde: 0 } };
        const d = textoPersona(estado, frase("p1", "hola", 10));
        expect(d.accion).toBe("cortar");
        expect(d.estado.bot).toBeNull();
        expect(d.estado.frases).toHaveLength(1);
    });

    it("ignora la frase vacía y el eco inmediato del mismo texto", () => {
        const e = estadoInicialTurnos();
        expect(textoPersona(e, frase("p1", "   ", 5)).estado).toBe(e);
        const primera = textoPersona(e, frase("p1", "hola", 5)).estado;
        const eco = textoPersona(primera, frase("p1", "hola", 100));
        expect(eco.accion).toBe("nada");
        expect(eco.estado).toBe(primera);
    });
});

describe("evaluarTurno", () => {
    it("espera al silencio exigido antes de contestar", () => {
        const { estado } = textoPersona(estadoInicialTurnos(), frase("p1", "¿qué tal?", 0));
        const antes = evaluarTurno(estado, SILENCIO_RESPUESTA_MS - 1, { responder: cerebro("mucho gusto") });
        expect(antes.accion).toBe("nada");
        const despues = evaluarTurno(estado, SILENCIO_RESPUESTA_MS, { responder: cerebro("mucho gusto") });
        expect(despues.accion).toBe("responder");
        expect(despues.texto).toBe("mucho gusto");
        expect(despues.estado.frases).toHaveLength(0);
    });

    it("no responde si ya hay un bot sonando, ni repite la pregunta si el cerebro calló", () => {
        const bot = evaluarTurno(textoPersona(estadoInicialTurnos(), frase("p1", "hola", 0)).estado, 800, { responder: cerebro("hola") }).estado;
        expect(evaluarTurno({ ...bot, bot: { id: "bot", desde: 800 } }, 900, { responder: cerebro("hola") }).accion).toBe("nada");
        const silencio = evaluarTurno(textoPersona(estadoInicialTurnos(), frase("p1", "hola", 0)).estado, 800, { responder: () => null });
        expect(silencio.accion).toBe("nada");
        expect(evaluarTurno(silencio.estado, 2000, { responder: () => "atrás" }).accion).toBe("nada");
    });
});

describe("elegirServidorVoz", () => {
    const c = (id: string, latenciaMs: number, over: Partial<CandidatoVoz> = {}): CandidatoVoz =>
        ({ id, online: true, deConfianza: true, latenciaMs, ramLibreMB: 2000, ...over });

    it("elige el de menor latencia y deja fuera lo caído, lo ajeno y el sin memoria", () => {
        const r = elegirServidorVoz(
            [c("a", 90, { deConfianza: false }), c("b", 70, { online: false }), c("e", 95, { ramLibreMB: 100 }), c("c", 80)],
            null,
            { ramMinimaMB: 500 },
        );
        expect(r?.id).toBe("c");
    });

    it("histéresis: conserva el vigente salvo mejora clara, y hace relevo si se cae", () => {
        const vigente = c("v", 100);
        expect(elegirServidorVoz([c("n", 85), vigente], vigente)?.id).toBe("v");
        expect(elegirServidorVoz([c("n", 70), vigente], vigente)?.id).toBe("n");
        const caido = c("v", 100, { online: false });
        expect(elegirServidorVoz([caido, c("s", 190)], caido)?.id).toBe("s");
    });
});

describe("engancharBot", () => {
    it("responde tras el silencio y una persona lo corta en mitad de la frase", async () => {
        let alTexto!: (f: FrasePersona) => void;
        let tocado = 0;
        const recibidos: string[] = [];
        const bot = engancharBot(
            { onTexto: (cb) => (alTexto = cb) },
            {
                botId: "bot",
                responder: () => "todo en orden",
                sintetizar: async (texto) => { recibidos.push(texto); return null; },
                callar: () => { tocado += 1; },
                ahora: (() => { let t = 0; return () => (t += 1000); })(),
                silencioMs: 10,
            },
        );
        alTexto(frase("p1", "hola", 0));
        expect(bot.pulsar().accion).toBe("responder");
        expect(bot.estado().bot?.id).toBe("bot");
        await Promise.resolve();
        expect(recibidos).toEqual(["todo en orden"]);
        alTexto(frase("p2", "espérate", 500));
        expect(tocado).toBe(1);
        expect(bot.estado().bot).toBeNull();
        bot.cerrar();
    });
});
