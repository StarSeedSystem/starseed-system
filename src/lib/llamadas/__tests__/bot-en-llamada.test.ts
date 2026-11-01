/**
 * Bot en llamada — turnos, elección del servidor de voz y enganche (todo inyectado).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    SILENCIO_RESPUESTA_MS,
    conectarBot,
    elegirServidorVoz,
    estadoTurnoInicial,
    preparadoParaContestar,
    registrarTexto,
    tomarTurno,
    type NeuronaVoz,
} from "@/lib/llamadas/bot-en-llamada";

const T0 = 1_000_000;
const texto = (de: string, texto: string, en: number) => ({ de, texto, en });

describe("turnos del bot", () => {
    it("no contesta sin texto previo ni antes del silencio de 700 ms", () => {
        const e = estadoTurnoInicial();
        expect(preparadoParaContestar(e, T0)).toBe(false);
        const conTexto = registrarTexto(e, texto("p1", "hola", T0));
        expect(preparadoParaContestar(conTexto, T0 + SILENCIO_RESPUESTA_MS - 1)).toBe(false);
        expect(preparadoParaContestar(conTexto, T0 + SILENCIO_RESPUESTA_MS)).toBe(true);
    });

    it("mientras contesta no toma otro turno: un solo bot a la vez", () => {
        const e = tomarTurno(estadoTurnoInicial(), "bot", T0);
        const masTexto = registrarTexto(e, texto("p1", "otra cosa", T0 + 1));
        expect(preparadoParaContestar(masTexto, T0 + SILENCIO_RESPUESTA_MS)).toBe(false);
    });

    it("una persona que habla corta al bot; algo anterior no", () => {
        const e = tomarTurno(estadoTurnoInicial(), "bot", T0);
        expect(registrarTexto(e, texto("p1", "corto", T0 + 5)).bot).toBeNull();
        const antes = registrarTexto(estadoTurnoInicial(), texto("p1", "hola", T0 - 10));
        expect(tomarTurno(antes, "bot", T0).bot).toEqual({ de: "bot", desde: T0 });
    });
});

describe("elegirServidorVoz", () => {
    const n = (id: string, sobre: Partial<NeuronaVoz>): NeuronaVoz => ({
        id,
        latenciaMs: null,
        ramLibreMb: 500,
        encendida: true,
        confianza: "propia",
        ...sobre,
    });

    it("solo encendidas y de confianza (ajena o apagada nunca; miembro sí)", () => {
        const c = [n("ajena", { confianza: "ajena" }), n("apagada", { encendida: false })];
        expect(elegirServidorVoz(c, null)).toBeNull();
        const d = [n("propia"), n("miembro", { confianza: "miembro" })];
        expect(["propia", "miembro"]).toContain(elegirServidorVoz(d, null));
    });

    it("menor latencia medida; sin medición solo si no queda otra", () => {
        const c = [n("sin-medir"), n("rapida", { latenciaMs: 150 })];
        expect(elegirServidorVoz(c, null)).toBe("rapida");
        expect(elegirServidorVoz([n("sin-medir")], null)).toBe("sin-medir");
    });

    it("histéresis: el vigente se conserva si no le supera claramente", () => {
        const c = [n("vigente", { latenciaMs: 200 }), n("algo-mejor", { latenciaMs: 150 })];
        expect(elegirServidorVoz(c, "vigente")).toBe("vigente");
        expect(elegirServidorVoz(c, "algo-mejor")).toBe("algo-mejor");
    });
});

describe("enganche con la llamada", () => {
    afterEach(() => vi.useRealTimers());

    function enlace() {
        const textos: { de: string; texto: string; en: number }[] = [];
        const oyentes = new Set<(t: { de: string; texto: string; en: number }) => void>();
        return {
            enviarTexto: (t: { de: string; texto: string; en: number }) => textos.push(t),
            escuchar: (cb: (t: { de: string; texto: string; en: number }) => void) => {
                oyentes.add(cb);
                return () => oyentes.delete(cb);
            },
            emitir: (t: { de: string; texto: string; en: number }) => {
                textos.push(t);
                for (const cb of oyentes) cb(t);
            },
        };
    }

    it("contesta con el último texto tras el silencio y la voz entra y sale por el mixer", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        const enlaceFalso = enlace();
        const respuestas: string[] = [];
        const ganancias: number[] = [];
        const suelta = conectarBot({
            idBot: "bot",
            escuchar: enlaceFalso,
            responder: (t: string) => void respuestas.push(t),
            mezclar: (_n: string, g: number) => ganancias.push(g),
            neuronaVoz: "v",
        });
        enlaceFalso.emitir(texto("p1", "hola bot", Date.now()));
        expect(respuestas).toEqual([]);
        await vi.advanceTimersByTimeAsync(SILENCIO_RESPUESTA_MS + 100);
        expect(respuestas).toEqual(["hola bot"]);
        expect(ganancias).toEqual([1, 0]);
        suelta();
        expect(ganancias.at(-1)).toBe(0);
    });

    it("un texto mientras contesta corta la voz al momento (ganancia 0)", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        const enlaceFalso = enlace();
        let cortesDeVoz = 0;
        const suelta = conectarBot({
            idBot: "bot",
            escuchar: enlaceFalso,
            responder: async () => {
                await new Promise((r) => setTimeout(r, 5_000));
            },
            mezclar: (_n: string, g: number) => {
                if (g === 0) cortesDeVoz += 1;
            },
            neuronaVoz: "v",
        });
        enlaceFalso.emitir(texto("p1", "cuéntame algo", Date.now()));
        await vi.advanceTimersByTimeAsync(SILENCIO_RESPUESTA_MS + 100);
        enlaceFalso.emitir(texto("p1", "cortado", Date.now()));
        await vi.advanceTimersByTimeAsync(300);
        expect(cortesDeVoz).toBeGreaterThan(0);
        suelta();
    });
});
