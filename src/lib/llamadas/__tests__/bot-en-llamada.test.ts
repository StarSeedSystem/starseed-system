/**
 * Bot en llamada — pruebas de la lógica de turnos PURA (sin red, sin micro, sin reloj
 * real: los tiempos entran como epoch y los servicios son lo que la prueba inyecta).
 */
import { describe, expect, it } from "vitest";
import {
    SILENCIO_MS,
    decidirTurno,
    elegirServidorVoz,
    engancharBot,
    estadoInicial,
    registrarTexto,
    soltarTurno,
    tomarTurno,
    ultimoHumano,
    type TextoLlamada,
} from "@/lib/llamadas/bot-en-llamada";

const BOT = "bot-a";
const P1 = "persona-1";
const P2 = "persona-2";

const con = (de: string, texto: string, en: number): TextoLlamada => ({ de, texto, en });

describe("turnos del bot", () => {
    it("sin textos no contesta", () => {
        const d = decidirTurno(estadoInicial(), 1000, { botId: BOT });
        expect(d).toEqual({ accion: "esperar", motivo: "nadie ha hablado todavía" });
    });

    it("con voz reciente (< 700 ms) espera el silencio", () => {
        const e = registrarTexto(estadoInicial(), con(P1, "hola", 900));
        const d = decidirTurno(e, 900 + SILENCIO_MS - 1, { botId: BOT });
        expect(d.accion).toBe("esperar");
        if (d.accion === "esperar") expect(d.motivo).toBe("no hay silencio aún");
    });

    it("con silencio suficiente contesta el último texto humano", () => {
        const e = registrarTexto(estadoInicial(), con(P1, "¿qué tal la reunión?", 1000));
        const d = decidirTurno(e, 1000 + SILENCIO_MS, { botId: BOT });
        expect(d).toEqual({ accion: "contestar", pregunta: "¿qué tal la reunión?" });
    });

    it("escucha al último de dos personas, no a la primera", () => {
        let e = registrarTexto(estadoInicial(), con(P1, "primero", 1000));
        e = registrarTexto(e, con(P2, "segundo", 1100));
        const d = decidirTurno(e, 1100 + SILENCIO_MS, { botId: BOT });
        expect(d).toEqual({ accion: "contestar", pregunta: "segundo" });
    });

    it("un texto del bot no desencadena otra respuesta", () => {
        const e = registrarTexto(estadoInicial(), con(BOT, "soy yo hablando", 2000));
        const d = decidirTurno(e, 2000 + 10_000, { botId: BOT });
        expect(d.accion).toBe("esperar");
    });

    it("una persona que habla mientras el bot suena lo CORTA", () => {
        const e = tomarTurno(registrarTexto(estadoInicial(), con(P1, "antes que nada", 3000)), BOT, 3100);
        const conCorte = registrarTexto(e, con(P2, "perdón, ya voy", 3500));
        const d = decidirTurno(conCorte, 3600, { botId: BOT });
        expect(d.accion).toBe("callar");
    });

    it("el texto que inició la respuesta no la corta (es anterior al turno)", () => {
        const e = tomarTurno(registrarTexto(estadoInicial(), con(P1, "pregunta", 1000)), BOT, 1200);
        expect(decidirTurno(e, 1300, { botId: BOT }).accion).toBe("esperar");
    });

    it("no repite respuesta a un texto ya contestado", () => {
        let e = registrarTexto(estadoInicial(), con(P1, "duda", 1000));
        e = soltarTurno(tomarTurno(e, BOT, 1800));
        const d = decidirTurno(e, 5000, { botId: BOT });
        expect(d).toEqual({ accion: "esperar", motivo: "ya está contestado" });
    });

    it("memoria corta y último texto humano correctos", () => {
        let e = estadoInicial();
        for (let i = 0; i < 40; i++) e = registrarTexto(e, con(P1, `n${i}`, i));
        expect(e.historial.length).toBeLessThanOrEqual(32);
        e = registrarTexto(e, con(BOT, "yo", 50));
        expect(ultimoHumano(e, BOT)?.de).toBe(P1);
    });
});

describe("servidor de voz de la sesión", () => {
    it("sin candidatas fiables devuelve null", () => {
        expect(elegirServidorVoz([{ id: "x", latenciaMs: 10, ramLibreGB: 9, confianza: false }], null)).toBeNull();
    });

    it("descarta sin RAM suficiente y elige la menor latencia", () => {
        const id = elegirServidorVoz(
            [
                { id: "a", latenciaMs: 400, ramLibreGB: 0.1, confianza: true },
                { id: "b", latenciaMs: 300, ramLibreGB: 4, confianza: true },
                { id: "c", latenciaMs: 100, ramLibreGB: 2, confianza: true },
            ],
            null,
        );
        expect(id).toBe("c");
    });

    it("histéresis: el vigente aguanta salvo que otro mejore por el margen", () => {
        const cands = [
            { id: "vigente", latenciaMs: 200, ramLibreGB: 4, confianza: true },
            { id: "mejor", latenciaMs: 100, ramLibreGB: 4, confianza: true },
        ];
        expect(elegirServidorVoz(cands, "vigente")).toBe("vigente");
        expect(elegirServidorVoz(cands, "vigente", { margenMs: 50 })).toBe("mejor");
    });
});

describe("enganche del bot", () => {
    /** Servicios en memoria: lo que el real hace con el modelo, el mixer y el canal. */
    let terminarHabla: () => void;
    const servicios = () => {
        const publicados: TextoLlamada[] = [];
        let cortado = 0;
        let ganancia = 0;
        return {
            publicados,
            servicios: {
                publicarTexto: (t: TextoLlamada) => { publicados.push(t); },
                responder: async (pregunta: string) => `eco de: ${pregunta}`,
                hablar: () => new Promise<void>((r) => { terminarHabla = r; }),
                callar: () => { cortado += 1; },
                ganancia: (v: number) => { ganancia = v; },
            },
            /** Hace sonar la locución del bot (en el real, la manda el mixer al terminar). */
            terminarHabla: () => terminarHabla?.(),
            cortes: () => cortado,
            gananciaAplica: () => ganancia,
        };
    };

    it("tras el silencio responde y publica su texto por el canal", async () => {
        const s = servicios();
        const bot = engancharBot({ botId: BOT, servicios: s.servicios });
        bot.recibir(con(P1, "¿a qué hora cenamos?", 1000));
        bot.tictac(1000 + SILENCIO_MS);
        await new Promise((r) => setTimeout(r, 5));
        expect(s.publicados).toEqual([con(BOT, "eco de: ¿a qué hora cenamos?", expect.any(Number))]);
        expect(s.gananciaAplica()).toBe(1);
        s.terminarHabla();
        await new Promise((r) => setTimeout(r, 5));
        expect(bot.estado().hablando).toBeNull();
    });

    it("una persona que habla mientras el bot suena lo corta", async () => {
        const s = servicios();
        const bot = engancharBot({ botId: BOT, servicios: s.servicios, volumen: 0.5 });
        bot.recibir(con(P1, "pregunta", 1000));
        bot.tictac(1800);
        await new Promise((r) => setTimeout(r, 5));
        expect(bot.estado().hablando?.botId).toBe(BOT);
        bot.recibir(con(P2, "corto", 1900));
        await new Promise((r) => setTimeout(r, 5));
        expect(s.cortes()).toBe(1);
        expect(bot.estado().hablando).toBeNull();
        s.terminarHabla();
    });

    it("un fallo del modelo no tumba nada: queda en silencio y suelta la palabra", async () => {
        const s = servicios();
        const serviciosRotos = { ...s.servicios, responder: async () => { throw new Error("externo"); } };
        const bot = engancharBot({ botId: BOT, servicios: serviciosRotos });
        bot.recibir(con(P1, "hola", 1000));
        bot.tictac(1000 + SILENCIO_MS);
        await new Promise((r) => setTimeout(r, 10));
        expect(s.publicados.length).toBe(0);
        expect(bot.estado().hablando).toBeNull();
    });
});
