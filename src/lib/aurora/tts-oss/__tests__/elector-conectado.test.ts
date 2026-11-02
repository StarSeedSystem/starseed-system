// @vitest-environment jsdom
/**
 * El elector que aprende CONECTADO al router de voz (Ola 1018V · N, el cable
 * que faltaba): `reordenarCadenaPorLatenciaMedida` ya no ordena por su media
 * ad hoc, sino por `puntuarMotores` — olvido exponencial, mínimo de medidas y
 * correcciones que penalizan. Con las medidas reales del almacén
 * (`medidas-voz`, anotadas aquí con reloj inyectado) y sin red ni audio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anotarMedida } from "@/lib/aurora/medidas-voz";
import {
    medidasParaElector,
    reordenarCadenaPorLatenciaMedida,
} from "@/lib/aurora/tts-oss/speak-router";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";
import { MEDIDAS_MINIMAS, VIDA_MEDIA_MS } from "@/lib/aurora/voz-starseed/elector-aprende";

const AHORA = 1_700_000_000_000;
let NEURONA = "";

type Link = Parameters<typeof reordenarCadenaPorLatenciaMedida>[0][number];
const cadena = (m: string[]): Link[] => m as unknown as Link[];

/** Anota una medida del almacén con reloj inyectado (hace `anteMs`). */
function medir(
    motor: string,
    valor: number,
    opciones: { anteMs?: number; tipo?: "primer-sonido" | "correccion"; neurona?: string } = {},
): void {
    expect(
        anotarMedida(
            { neurona: opciones.neurona ?? NEURONA, motor, tipo: opciones.tipo ?? "primer-sonido", valor },
            { ahora: () => AHORA - (opciones.anteMs ?? 0) },
        ),
    ).toBe(true);
}

const ordenDe = (medidas: readonly Link[]): string[] => medidas.map((l) => String(l));

beforeEach(() => {
    window.localStorage.clear();
    NEURONA = neuronDeviceIdActual();
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("la cadena de conversación se ordena con el elector que aprende", () => {
    it("sin medidas no cambia nada", () => {
        const c = cadena(["chatterbox", "kokoro", "kitten"]);
        expect(reordenarCadenaPorLatenciaMedida(c)).toEqual(c);
    });

    it("con el mínimo de medidas el rápido sube a la cabeza y el no medido se queda en su sitio", () => {
        for (let i = 0; i < MEDIDAS_MINIMAS; i++) {
            medir("chatterbox", 900);
            medir("kokoro", 200);
        }
        const salida = reordenarCadenaPorLatenciaMedida(cadena(["chatterbox", "kokoro", "kitten"]));
        expect(ordenDe(salida)).toEqual(["kokoro", "chatterbox", "kitten"]);
    });

    it("con 3 medidas NO cambia nada (queda «sin medir»)", () => {
        for (let i = 0; i < 3; i++) {
            medir("chatterbox", 900);
            medir("kokoro", 200);
        }
        const c = cadena(["chatterbox", "kokoro"]);
        expect(reordenarCadenaPorLatenciaMedida(c)).toEqual(c);
    });

    it("un motor rápido con muchas correcciones pierde frente a uno lento sin quejas", () => {
        for (let i = 0; i < MEDIDAS_MINIMAS; i++) {
            medir("kokoro", 200);
            medir("chatterbox", 500);
        }
        for (let i = 0; i < 6; i++) medir("kokoro", 1, { tipo: "correccion" });
        expect(ordenDe(reordenarCadenaPorLatenciaMedida(cadena(["kokoro", "chatterbox"])))).toEqual([
            "chatterbox",
            "kokoro",
        ]);
    });

    it("el olvido pesa: lo rápido de hace 7 días ya no manda frente a lo vivo de hoy", () => {
        // Rápido andaba a 100 ms hace 7 días (peso ½) y ahora va a 800; media con olvido ≈ 500,
        // frente a otro motor de 450 ms hoy: SIN olvido sería 380 y mandaría el de antes.
        for (let i = 0; i < 3; i++) medir("kokoro", 100, { anteMs: VIDA_MEDIA_MS });
        for (let i = 0; i < 2; i++) medir("kokoro", 800);
        for (let i = 0; i < MEDIDAS_MINIMAS; i++) medir("chatterbox", 450);
        expect(ordenDe(reordenarCadenaPorLatenciaMedida(cadena(["kokoro", "chatterbox"])))).toEqual([
            "chatterbox",
            "kokoro",
        ]);
    });

    it("las medidas de OTRA neurona no reordenan esta cadena", () => {
        medir("kokoro", 200, { neurona: "otra-neurona" });
        medir("chatterbox", 900, { neurona: "otra-neurona" });
        const c = cadena(["chatterbox", "kokoro"]);
        expect(reordenarCadenaPorLatenciaMedida(c)).toEqual(c);
    });

    it("un motor medido que no está en la cadena no la rompe ni la reordena", () => {
        for (let i = 0; i < MEDIDAS_MINIMAS; i++) medir("kokoro", 200);
        const c = cadena(["chatterbox"]);
        expect(reordenarCadenaPorLatenciaMedida(c)).toEqual(c);
    });
});

describe("medidasParaElector · del almacén al elector", () => {
    it("reparte las correcciones entre las latencias del mismo motor, sin inventar latencias", () => {
        const salida = medidasParaElector(
            [
                { neurona: NEURONA, motor: "kokoro", tipo: "primer-sonido", valor: 200, timestamp: AHORA },
                { neurona: NEURONA, motor: "kokoro", tipo: "primer-sonido", valor: 300, timestamp: AHORA },
                { neurona: NEURONA, motor: "kokoro", tipo: "correccion", valor: 1, timestamp: AHORA },
                { neurona: NEURONA, motor: "kokoro", tipo: "correccion", valor: 1, timestamp: AHORA },
            ],
            AHORA,
        );
        expect(salida).toHaveLength(2);
        expect(salida.every((m) => m.latenciaPrimeraFraseMs > 0)).toBe(true);
        expect(salida.every((m) => m.errores === 1)).toBe(true);
    });

    it("descarta horas futuras y basura, y las correcciones de un motor sin latencias no cuentan", () => {
        const salida = medidasParaElector(
            [
                { neurona: NEURONA, motor: "kokoro", tipo: "primer-sonido", valor: 200, timestamp: AHORA + 1 },
                { neurona: NEURONA, motor: "kokoro", tipo: "primer-sonido", valor: Number.NaN, timestamp: AHORA },
                { neurona: NEURONA, motor: "chatterbox", tipo: "correccion", valor: 1, timestamp: AHORA },
            ],
            AHORA,
        );
        expect(salida).toEqual([]);
    });
});
