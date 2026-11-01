import { describe, it, expect } from "vitest";
import {
    SILENCIO_BOT_MS,
    botTermina,
    elegirServidorVoz,
    estadoBotInicial,
    personaDice,
    ticBot,
    type CandidatoVoz,
    type TextoLlamada,
} from "@/lib/llamadas/bot-en-llamada";

const texto = (decir: string, t: number): TextoLlamada => ({ de: "p1", texto: decir, t });
const candidato = (id: string, latenciaMs: number, extra: Partial<CandidatoVoz> = {}): CandidatoVoz => ({
    id,
    latenciaMs,
    ramLibreMB: 8000,
    vivo: true,
    deConfianza: true,
    ...extra,
});

describe("turnos del bot en llamada", () => {
    it("el bot arranca callado y sin nada pendiente", () => {
        const e0 = estadoBotInicial();
        expect(e0.pendientes).toEqual([]);
        expect(e0.habla).toBe(false);
    });

    it("el texto de una persona queda en cola sin cortar a nadie", () => {
        const r = personaDice(estadoBotInicial(), texto("hola", 100));
        expect(r.cortaBot).toBe(false);
        expect(r.estado.pendientes).toEqual([texto("hola", 100)]);
    });

    it("con menos silencio del que espera, el bot no contesta", () => {
        const r1 = personaDice(estadoBotInicial(), texto("hola", 100));
        const r2 = ticBot(r1.estado, 100 + SILENCIO_BOT_MS - 1);
        expect(r2.contestar).toBeNull();
    });

    it("con silencio suficiente el bot contesta todo lo dicho y ocupa el turno", () => {
        const r1 = personaDice(estadoBotInicial(), texto("hola", 100));
        const r2 = ticBot(r1.estado, 100 + SILENCIO_BOT_MS);
        expect(r2.contestar).toBe("hola");
        expect(r2.estado.habla).toBe(true);
        expect(r2.estado.pendientes).toEqual([]);
    });

    it("un solo bot a la vez: mientras el turno está ocupado, nadie más contesta", () => {
        const r1 = personaDice(estadoBotInicial(), texto("hola", 100));
        const r2 = ticBot(r1.estado, 900);
        expect(r2.contestar).toBe("hola");
        const r3 = ticBot(r2.estado, 5000);
        expect(r3.contestar).toBeNull();
        // Una persona corta al bot; tras su silencio, el bot completa desde ahí.
        const r4 = personaDice(r2.estado, texto("otra vez", 950));
        expect(r4.cortaBot).toBe(true);
        const r5 = ticBot(r4.estado, 950 + SILENCIO_BOT_MS);
        expect(r5.contestar).toBe("otra vez");
    });

    it("una persona que habla corta al bot", () => {
        const r1 = personaDice(estadoBotInicial(), texto("hola", 100));
        const r2 = ticBot(r1.estado, 900);
        const r3 = personaDice(r2.estado, texto("corto", 950));
        expect(r3.cortaBot).toBe(true);
        expect(r3.estado.habla).toBe(false);
    });

    it("cada texto nuevo reinicia el silencio: manda el último", () => {
        const r1 = personaDice(estadoBotInicial(), texto("primera", 0));
        const r2 = personaDice(r1.estado, texto("segunda", 600));
        const r3 = ticBot(r2.estado, 700);
        expect(r3.contestar).toBeNull();
        const r4 = ticBot(r3.estado, 1300);
        expect(r4.contestar).toBe("primera segunda");
    });

    it("al terminar el bot vuelve a poder contestar tras el siguiente silencio", () => {
        const r1 = personaDice(estadoBotInicial(), texto("hola", 100));
        const r2 = ticBot(r1.estado, 900);
        const libre = botTermina(r2.estado);
        expect(libre.habla).toBe(false);
        const r3 = personaDice(libre, texto("más", 2000));
        const r4 = ticBot(r3.estado, 2000 + SILENCIO_BOT_MS);
        expect(r4.contestar).toBe("más");
    });
});

describe("elegirServidorVoz", () => {
    it("gana la menor latencia medida entre las neuronas útiles", () => {
        const elegido = elegirServidorVoz([candidato("a", 300), candidato("b", 120), candidato("c", 400)], null);
        expect(elegido?.id).toBe("b");
    });

    it("descarta la neurona apagada, sin confianza o sin RAM de voz", () => {
        const elegido = elegirServidorVoz(
            [
                candidato("a", 5),
                { ...candidato("b", 120), vivo: false },
                candidato("c", 130, { deConfianza: false }),
                candidato("d", 140, { ramLibreMB: 599 }),
            ],
            null,
        );
        expect(elegido?.id).toBe("a");
    });

    it("histéresis: el vigente se mantiene si está dentro de la tolerancia", () => {
        const elegido = elegirServidorVoz([candidato("a", 100), candidato("b", 220)], "a");
        expect(elegido?.id).toBe("a");
    });

    it("histéresis: si el vigente pesa más que el mejor, toma el relevo", () => {
        const elegido = elegirServidorVoz([candidato("a", 100 + 160), candidato("b", 100)], "a");
        expect(elegido?.id).toBe("b");
    });

    it("si el vigente se apaga, la siguiente toma el relevo sola", () => {
        const elegido = elegirServidorVoz([candidato("a", 5, { vivo: false }), candidato("b", 180)], "a");
        expect(elegido?.id).toBe("b");
    });

    it("sin ninguna neurona útil no hay quien sintetice", () => {
        expect(elegirServidorVoz([candidato("a", 10, { vivo: false })], "a")).toBeNull();
        expect(elegirServidorVoz([], "a")).toBeNull();
    });
});
