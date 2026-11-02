import { describe, it, expect } from "vitest";
import {
    puntuarMotores,
    pesoDeOlvido,
    VIDA_MEDIA_MS,
    GANANCIA_VOTO_MS,
    type MedidaElector,
    type VotoVoz,
} from "@/lib/aurora/voz-starseed/elector-aprende";
import { elegirMotorPrimeraFrase, nivelParaMotor, type CandidatoMotorVoz } from "../motor";
import type { MedidaVoz } from "../../medidas-voz";

const AHORA = 1_700_000_000_000;
const GRUPO = { uso: "conversacion" as const, contexto: "grupo" as const };

function medida(parcial: Partial<MedidaElector> = {}): MedidaElector {
    return { motor: "omnivoice", neurona: "n1", latenciaPrimeraFraseMs: 300, errores: 0, t: AHORA - 1_000, ...parcial };
}
function voto(parcial: Partial<VotoVoz> = {}): VotoVoz {
    return { motor: "omnivoice", voto: -1, t: AHORA - 1_000, ...parcial };
}
/** `cuantas` medidas del mismo motor-neurona (por defecto, el mínimo para poder mandar). */
function tandas(motor: string, neurona: string, latencia: number, cuantas = 5, parcial: Partial<MedidaElector> = {}): MedidaElector[] {
    return Array.from({ length: cuantas }, () => medida({ motor, neurona, latenciaPrimeraFraseMs: latencia, ...parcial }));
}
const ordenDe = (medidas: MedidaElector[], votos: VotoVoz[] = []): string[] =>
    (puntuarMotores(medidas, votos, AHORA)["n1"] ?? []).map((m) => m.motor);

describe("elector-aprende · aprende de lo medido y del 👍/👎 (Ola 1018V · N)", () => {
    it("pesoDeOlvido vale 1 al medir y 0,5 cuando pasan los 7 días", () => {
        expect(pesoDeOlvido(0)).toBe(1);
        expect(pesoDeOlvido(VIDA_MEDIA_MS)).toBeCloseTo(0.5, 12);
        expect(pesoDeOlvido(-5)).toBe(1);
        expect(pesoDeOlvido(Number.NaN)).toBe(1);
    });

    it("sin medidas ni votos, o con datos ilegibles, devuelve {} y no lanza", () => {
        expect(puntuarMotores([], [], AHORA)).toEqual({});
        expect(puntuarMotores(undefined, null, AHORA)).toEqual({});
        expect(puntuarMotores([null, "x"] as unknown as MedidaElector[], [undefined] as unknown as VotoVoz[], Number.NaN)).toEqual({});
    });

    it("con 3 medidas nada cambia: quedan «sin medir» en su orden de entrada", () => {
        expect(ordenDe([...tandas("lento", "n1", 900, 3), ...tandas("rapido", "n1", 200, 3)])).toEqual(["lento", "rapido"]);
    });

    it("con 5 medidas el rápido sube a la cabeza", () => {
        expect(ordenDe([...tandas("lento", "n1", 900), ...tandas("rapido", "n1", 200)])).toEqual(["rapido", "lento"]);
    });

    it("lo no medido queda «sin medir», con puntuación null, aunque tenga votos", () => {
        const [poco] = puntuarMotores(tandas("poco", "n1", 100, 2), [voto({ motor: "poco", voto: 1 })], AHORA)["n1"];
        expect(poco).toEqual({ motor: "poco", puntuacion: null, medidas: 2, estado: "sin-medir" });
    });

    it("un motor rápido con muchos 👎 baja detrás del lento sin quejas", () => {
        const votos = Array.from({ length: 4 }, () => voto({ motor: "veloz", t: AHORA }));
        expect(ordenDe([...tandas("veloz", "n1", 250), ...tandas("lento", "n1", 800)], votos)).toEqual(["lento", "veloz"]);
    });

    it("un 👍 premiado adelanta al levemente más lento", () => {
        const votos = [voto({ motor: "querido", voto: 1, t: AHORA })];
        expect(ordenDe([...tandas("otro", "n1", 300), ...tandas("querido", "n1", 320)], votos)).toEqual(["querido", "otro"]);
    });

    it("el olvido pesa los votos y las medidas: a los 7 días, la mitad", () => {
        const conVotoViejo = puntuarMotores(tandas("m", "n1", 250, 5, { t: AHORA }), [voto({ motor: "m", t: AHORA - VIDA_MEDIA_MS })], AHORA);
        const conVotoNuevo = puntuarMotores(tandas("m", "n1", 250, 5, { t: AHORA }), [voto({ motor: "m", t: AHORA })], AHORA);
        expect(conVotoViejo["n1"][0].puntuacion).toBeCloseTo(250 + GANANCIA_VOTO_MS / 2, 6);
        expect(conVotoNuevo["n1"][0].puntuacion).toBeCloseTo(250 + GANANCIA_VOTO_MS, 6);
    });

    it("los votos de un motor sin medidas no molestan ni crean candidatos", () => {
        expect(puntuarMotores([], [voto({ motor: "fantasma", voto: 1 })], AHORA)).toEqual({});
    });

    it("un motor que falla pierde contra otro de latencia igual", () => {
        const medidas = [...tandas("queda", "n1", 400), ...tandas("falla", "n1", 400, 5, { errores: 1 })];
        expect(ordenDe(medidas)).toEqual(["queda", "falla"]);
    });

    it("cada neurona ordena con sus propias medidas, sin arrastrar a la otra", () => {
        const medidas = [
            ...tandas("rapido", "n1", 200),
            ...tandas("rapido", "n2", 200, 3),
            ...tandas("lento", "n2", 800),
        ];
        const salida = puntuarMotores(medidas, [], AHORA);
        expect(salida["n1"].map((m) => m.motor)).toEqual(["rapido"]);
        expect(salida["n2"].map((m) => m.motor)).toEqual(["lento", "rapido"]);
        expect(salida["n2"][1]).toMatchObject({ estado: "sin-medir", puntuacion: null, medidas: 3 });
    });

    it("lo medido hace tiempo pesa menos: si fue rápido ayer y lento hoy, manda hoy", () => {
        const medidas = [...tandas("m", "n1", 100, 3, { t: AHORA - VIDA_MEDIA_MS }), ...tandas("m", "n1", 700, 2, { t: AHORA })];
        expect(puntuarMotores(medidas, [], AHORA)["n1"][0].puntuacion).toBeGreaterThan(400);
    });

    it("descarta basura, horas futuras y latencias imposibles", () => {
        expect(ordenDe([
            medida({ motor: "navegador", t: AHORA + 1 }),
            medida({ motor: "navegador", latenciaPrimeraFraseMs: -5 }),
            medida({ motor: "   " }),
            null as unknown as MedidaElector,
        ])).toEqual([]);
    });
});

// ── (VST1018N) EL ELECTOR APLICADO ──────────────────────────────────────────
// La conexión de verdad: `elegirMotorPrimeraFrase` (motor.ts) consume
// `puntuarMotores` con lo medido (`medidas-voz.ts`) y el pulgar (`votos-voz.ts`).
describe("elector-aprende · aplicado en la elección de la primera frase (1018N)", () => {
    const NEURONA = "neurona-1018n";
    const candidato = (id: string): CandidatoMotorVoz => ({
        id, claseLicencia: "libre", tieneVoz: true, nivel: nivelParaMotor(id),
    });
    /** Medidas falsas de `medidas-voz.ts` («primer-sonido») sin red ni disco. */
    const medidasVoice = (motor: string, valor: number, cuantas: number, timestamp = AHORA - 1_000): MedidaVoz[] =>
        Array.from({ length: cuantas }, () => ({ neurona: NEURONA, motor, tipo: "primer-sonido" as const, valor, timestamp }));

    it("aplicado: un motor rápido con muchos 👎 pierde contra el lento (ambos con 5 medidas)", () => {
        const votos = Array.from({ length: 4 }, (_, i) => voto({ motor: "kokoro", t: AHORA - i }));
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("kokoro"), candidato("chatterbox")],
            medidas: [...medidasVoice("kokoro", 250, 5), ...medidasVoice("chatterbox", 800, 5)],
            votos, ahora: AHORA,
        });
        expect(r?.motor).toBe("chatterbox");
        expect(r?.latenciaMs).toBe(800);
    });

    it("aplicado: con 3 medidas no cambia nada — la mediana de siempre decide", () => {
        const votos = Array.from({ length: 4 }, (_, i) => voto({ motor: "kokoro", t: AHORA - i }));
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("kokoro"), candidato("chatterbox")],
            medidas: [...medidasVoice("kokoro", 250, 3), ...medidasVoice("chatterbox", 800, 3)],
            votos, ahora: AHORA,
        });
        expect(r?.motor).toBe("kokoro");
        expect(r?.latenciaMs).toBe(250);
    });

    it("aplicado: con medidas bastantes y sin votos, el elector elige lo mismo que la mediana", () => {
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("kokoro"), candidato("chatterbox")],
            medidas: [...medidasVoice("kokoro", 250, 5), ...medidasVoice("chatterbox", 800, 5)],
            ahora: AHORA,
        });
        expect(r?.motor).toBe("kokoro");
    });

    it("sin reloj no se usa el elector: el pulgar no muda la mediana de siempre", () => {
        const votos = Array.from({ length: 4 }, (_, i) => voto({ motor: "kokoro", t: AHORA - i }));
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [candidato("kokoro"), candidato("chatterbox")],
            medidas: [...medidasVoice("kokoro", 250, 5), ...medidasVoice("chatterbox", 800, 5)],
            votos,
        });
        expect(r?.motor).toBe("kokoro");
    });

    it("aplicado: la licencia del contexto manda también con el elector (en grupo nada personal)", () => {
        const r = elegirMotorPrimeraFrase({
            ...GRUPO,
            candidatos: [
                { id: "voicemorphic", claseLicencia: "personal", tieneVoz: true, nivel: nivelParaMotor("voicemorphic") },
                candidato("chatterbox"),
            ],
            medidas: [...medidasVoice("voicemorphic", 100, 6), ...medidasVoice("chatterbox", 900, 6)],
            ahora: AHORA,
        });
        expect(r?.motor).toBe("chatterbox");
    });
});
