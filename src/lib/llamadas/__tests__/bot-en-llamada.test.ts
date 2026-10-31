/**
 * Pruebas del turno del bot invitado en llamada (Ola 1015V · VZF1015T).
 * Todo pura: sin red, sin micrófono y sin procesos — el transporte, el mixer y el
 * reloj van inyectados. Contrato: architecture/voz-fusionada-astraura.md §5.
 */
import { describe, it, expect } from "vitest";
import {
    aplicarMensajeLlamada,
    ESTADO_INI,
    SILENCIO_MS,
    silencioSuficiente,
    tomarTurno,
    quienSintetiza,
    BotEnLlamada,
    type MensajeLlamada,
    type EstadoTurnos,
    type PiezasBot,
} from "@/lib/llamadas/bot-en-llamada";
import type { FichaServidorVoz, PeticionServidorVoz, SesionVoz } from "@/lib/network/servidor-voz-sesion";

const HORA = 1_760_000_000_000;
const textoPersona = (en: number, texto = "hola, ¿me oís?") => ({ tipo: "persona" as const, de: "u-1", texto, en });
const sesion = (): SesionVoz => ({ miembros: ["neurona-1", "n-habla"], tipo: "llamada" });
const habla = (ms: number): { oido: []; habla: { motor: string; primerSonidoMs: number }[] } => ({ oido: [], habla: [{ motor: "omnivoice", primerSonidoMs: ms }] });
const oido = (tiempoReal: number): { oido: { motor: string; idiomas: string[]; tiempoReal: number; flujo: boolean }[]; habla: [] } => ({ oido: [{ motor: "parakeet", idiomas: ["es"], tiempoReal, flujo: true }], habla: [] });
const ficha = (neurona: string, extra: Partial<FichaServidorVoz> = {}): FichaServidorVoz => ({
    neurona,
    latido: HORA - 5_000,
    ramLibreMb: 2048,
    mia: true,
    ...extra,
});
const pedir = (extra: Partial<PeticionServidorVoz> = {}): PeticionServidorVoz => ({
    sesion: sesion(),
    fichas: [ficha("n-oido", { voz: oido(8) }), ficha("n-habla", { voz: habla(200) })],
    ahora: HORA,
    ...extra,
});

describe("aplicarMensajeLlamada", () => {
    it("una persona que comparte texto corta al bot al instante y fija el oído", () => {
        const e1 = aplicarMensajeLlamada(ESTADO_INI, { tipo: "bot-habla", de: "bot-1", texto: "sí", en: 10 });
        expect(e1.botHablador).toBe("bot-1");
        const e2 = aplicarMensajeLlamada(e1, textoPersona(500));
        expect(e2.botHablador).toBeNull();
        expect(e2.persona).toBe("u-1");
        expect(e2.personaTexto).toBe("hola, ¿me oís?");
        expect(e2.personaEn).toBe(500);
    });

    it("un solo bot a la vez: el segundo anuncio no toma el turno", () => {
        const e1 = aplicarMensajeLlamada(ESTADO_INI, { tipo: "bot-habla", de: "bot-1", texto: "sí", en: 10 });
        const e2 = aplicarMensajeLlamada(e1, { tipo: "bot-habla", de: "bot-2", texto: "yo", en: 20 });
        expect(e2.botHablador).toBe("bot-1");
        expect(e2.desde).toBe(10);
    });

    it("bot-callar libera el turno, pero solo el del bot que lo anuncia", () => {
        const e1 = aplicarMensajeLlamada(ESTADO_INI, { tipo: "bot-habla", de: "bot-1", texto: "sí", en: 10 });
        const e2 = aplicarMensajeLlamada(e1, { tipo: "bot-callar", de: "bot-2" });
        expect(e2.botHablador).toBe("bot-1");
        const e3 = aplicarMensajeLlamada(e1, { tipo: "bot-callar", de: "bot-1" });
        expect(e3.botHablador).toBeNull();
        expect(e3.persona).toBeNull();
    });
});

describe("silencio y turnos", () => {
    it("sin silencio (menos de SILENCIO_MS) el bot no toma el turno", () => {
        const e = aplicarMensajeLlamada(ESTADO_INI, textoPersona(1000));
        expect(SILENCIO_MS).toBe(700);
        expect(silencioSuficiente(e, 1000 + SILENCIO_MS - 1)).toBe(false);
        expect(tomarTurno(e, "bot-1", 1000 + SILENCIO_MS - 1)).toBe(e);
    });

    it("con SILENCIO_MS de silencio y nadie hablando, toma el turno", () => {
        const e = aplicarMensajeLlamada(ESTADO_INI, textoPersona(1000));
        const t = tomarTurno(e, "bot-1", 1000 + SILENCIO_MS);
        expect(t.botHablador).toBe("bot-1");
        expect(t.desde).toBe(1000 + SILENCIO_MS);
        // Ahora está hablando: otra voz no puede cruzarse.
        expect(tomarTurno(t, "bot-2", t.desde! + 5000).botHablador).toBe("bot-1");
    });

    it("sin texto de persona nunca toma el turno", () => {
        expect(tomarTurno(ESTADO_INI, "bot-1", 9000)).toBe(ESTADO_INI);
        expect(silencioSuficiente(ESTADO_INI, 9000)).toBe(false);
    });
});

describe("quienSintetiza", () => {
    it("elige el servidor de HABLA de la sesión (no el del oído)", () => {
        const p = pedir();
        expect(quienSintetiza(p).servidor).toBe("n-habla");
    });

    it("sin candidatos devuelve null con motivo y sin lanzar", () => {
        expect(quienSintetiza(null).servidor).toBeNull();
        expect(quienSintetiza({ fichas: [], sesion: sesion(), ahora: HORA }).motivo.length).toBeGreaterThan(0);
    });
});

describe("BotEnLlamada (enganche con MotorLlamada, todo inyectado)", () => {
    /** Ensambla el bot con dobles y capturas: nada real de red, micrófono ni mixer. */
    function ensamblar(opciones: { peticion?: PeticionServidorVoz | null; mudo?: boolean } = {}) {
        const recep: Array<(m: MensajeLlamada) => void> = [];
        const enviados: MensajeLlamada[] = [];
        const sonados: { texto: string; servidor: string }[] = [];
        const cortes: number[] = [];
        const ganancias: { neurona: string; ganancia: number }[] = [];
        let ahora = HORA;
        const piezas: PiezasBot = {
            botId: "bot-1",
            enviar: (m) => enviados.push(m),
            suscribir: (cb) => {
                recep.push(cb);
                return () => undefined;
            },
            responder: opciones.mudo ? () => null : (t) => `Eco: ${t}`,
            pedirServidorVoz: () => (opciones.peticion === undefined ? pedir() : opciones.peticion),
            hablar: (texto, servidor) => sonados.push({ texto, servidor }),
            cortar: () => cortes.push(ahora),
            ponerGanancia: (neurona, ganancia) => ganancias.push({ neurona, ganancia }),
            ahora: () => ahora,
        };
        return { bot: new BotEnLlamada(piezas), recep, enviados, sonados, cortes, ganancias, avanzar: (ms: number) => (ahora += ms) };
    }

    function estadoDe(h: ReturnType<typeof ensamblar>): EstadoTurnos {
        return h.bot.estado();
    }

    it("antes del silencio mínimo el bot espera: no habla ni toma el turno", () => {
        const h = ensamblar();
        h.recep[0](textoPersona(HORA));
        expect(h.bot.revisar()).toBe(false);
        expect(h.sonados).toEqual([]);
        expect(estadoDe(h).botHablador).toBeNull();
    });

    it("con el silencio cumplido contesta al texto de la persona por el servidor de la sesión", () => {
        const h = ensamblar();
        h.recep[0](textoPersona(HORA));
        h.avanzar(SILENCIO_MS);
        expect(h.bot.revisar()).toBe(true);
        expect(h.sonados).toEqual([{ texto: "Eco: hola, ¿me oís?", servidor: "n-habla" }]);
        expect(h.enviados).toEqual([{ tipo: "bot-habla", de: "bot-1", texto: "Eco: hola, ¿me oís?", en: HORA + SILENCIO_MS }]);
        expect(h.ganancias).toEqual([{ neurona: "bot-1", ganancia: 1 }]);
        const e = estadoDe(h);
        expect(e.botHablador).toBe("bot-1");
        expect(e.personaTexto).toBeNull();
    });

    it("no repite la respuesta a la misma frase", () => {
        const h = ensamblar();
        h.recep[0](textoPersona(HORA));
        h.avanzar(SILENCIO_MS);
        h.bot.revisar();
        h.avanzar(SILENCIO_MS * 2);
        expect(h.bot.revisar()).toBe(false);
        expect(h.sonados.length).toBe(1);
    });

    it("sin cerebro que responda, no parte de turno que no sonará", () => {
        const h = ensamblar({ mudo: true });
        h.recep[0](textoPersona(HORA));
        h.avanzar(SILENCIO_MS);
        expect(h.bot.revisar()).toBe(false);
        expect(estadoDe(h).botHablador).toBeNull();
    });

    it("una persona interrumpe: corta la síntesis y libera el turno", () => {
        const h = ensamblar();
        h.recep[0](textoPersona(HORA));
        h.avanzar(SILENCIO_MS);
        h.bot.revisar();
        h.recep[0](textoPersona(HORA + SILENCIO_MS + 200, "espera, déjame"));
        expect(h.cortes.length).toBe(1);
        expect(estadoDe(h).botHablador).toBeNull();
        expect(estadoDe(h).personaTexto).toBe("espera, déjame");
    });

    it("callar anuncia el fin y corta, pero solo si el turno era suyo", () => {
        const muda = ensamblar();
        muda.bot.callar();
        expect(muda.enviados).toEqual([]);
        expect(muda.cortes).toEqual([]);
        const viva = ensamblar();
        viva.recep[0](textoPersona(HORA));
        viva.avanzar(SILENCIO_MS);
        viva.bot.revisar();
        viva.bot.callar();
        expect(viva.enviados[1]).toEqual({ tipo: "bot-callar", de: "bot-1" });
        expect(viva.cortes.length).toBe(1);
        expect(estadoDe(viva).botHablador).toBeNull();
    });

    it("respetas debiendo turno de otro: cuando otro bot habla, no entra a hablar", () => {
        const h = ensamblar();
        h.recep[0](textoPersona(HORA));
        h.recep[0]({ tipo: "bot-habla", de: "bot-2", texto: "yo primero", en: HORA + 100 });
        h.avanzar(SILENCIO_MS + 100);
        expect(h.bot.revisar()).toBe(false);
        expect(h.sonados).toEqual([]);
        expect(estadoDe(h).botHablador).toBe("bot-2");
    });
});
