// src/lib/aurora/voz-starseed/__tests__/motor-instantaneo.test.ts
/**
 * PRUEBA PURA DE LA PRIMERA FRASE (Ola 1018V · VST1018F · parte 2 de 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato `architecture/voz-voicestudio.md` §4: «Primera frase del más rápido
 * que tenga esa voz». La elección sale de datos INYECTADOS —sin red, sin
 * localStorage, sin reloj—: medidas falsas (`MedidaVoz`), candidatos con su
 * clase de licencia, el contexto de escucha y las capas de conciencia.
 */

import { describe, expect, it } from "vitest";

import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import {
    elegirMotorPrimeraFrase,
    usoParaContexto,
    type CandidatoInstantaneo,
} from "../motor";
import type { UsoVoz } from "../niveles";

/** Medida falsa de «primer sonido» para un motor (ms). */
function medida(motor: string, valor: number): MedidaVoz {
    return { neurona: "esta-neurona", motor, tipo: "primer-sonido", valor, timestamp: 1 };
}

function candidato(id: string, extra: Partial<CandidatoInstantaneo> = {}): CandidatoInstantaneo {
    return { id, claseLicencia: "libre", tieneLaVoz: true, ...extra };
}

const capas = {};

describe("usoParaContexto · el contexto del motor único traduce a uso del turno", () => {
    it("conversación, aviso y lectura se conservan; el rito es lectura larga", () => {
        expect(usoParaContexto("conversacion")).toBe<UsoVoz>("conversacion");
        expect(usoParaContexto("aviso")).toBe<UsoVoz>("aviso");
        expect(usoParaContexto("lectura")).toBe<UsoVoz>("lectura");
        expect(usoParaContexto("rito")).toBe<UsoVoz>("lectura");
    });

    it("la imaginación es conversación: el tope de estudio no se abre por el marco", () => {
        expect(usoParaContexto("imaginacion")).toBe<UsoVoz>("conversacion");
    });
});

describe("elegirMotorPrimeraFrase · el más rápido MEDIDO que tiene esa voz y licencia", () => {
    it("elige el motor de menor latencia media medida entre los aptos", () => {
        const elegido = elegirMotorPrimeraFrase(
            [candidato("kokoro"), candidato("kittentts"), candidato("supertonic")],
            [medida("kokoro", 900), medida("kittentts", 400), medida("supertonic", 250)],
            "personal",
            capas,
        );
        expect(elegido?.id).toBe("supertonic");
    });

    it("la latencia es la MEDIA de sus medidas, no una sola muestra", () => {
        const elegido = elegirMotorPrimeraFrase(
            [candidato("a"), candidato("b")],
            [medida("a", 1000), medida("a", 200), medida("b", 700)],
            "personal",
            capas,
        );
        expect(elegido?.id).toBe("a"); // media 600 < 700
    });

    it("un motor sin la voz de esa persona nunca suena la primera frase", () => {
        const elegido = elegirMotorPrimeraFrase(
            [candidato("kokoro", { tieneLaVoz: false }), candidato("alta-local")],
            [medida("kokoro", 100), medida("alta-local", 500)],
            "personal",
            capas,
        );
        expect(elegido?.id).toBe("alta-local");
    });

    it("el licensor manda: un motor no permitido queda fuera aunque sea el más rápido", () => {
        const elegido = elegirMotorPrimeraFrase(
            [candidato("omnivoice", { claseLicencia: "personal" }), candidato("kokoro")],
            [medida("omnivoice", 80), medida("kokoro", 400)],
            "grupo", // fuera de lo personal no entran los pesos no comerciales
            capas,
        );
        expect(elegido?.id).toBe("kokoro");
    });

    it("condicionada solo compite con la condición cumplida, nunca por omisión", () => {
        const elegido = elegirMotorPrimeraFrase(
            [
                candidato("supertonic", { claseLicencia: "condicionada" }),
                candidato("kokoro"),
            ],
            [medida("supertonic", 100), medida("kokoro", 400)],
            "comercial",
            capas,
        );
        expect(elegido?.id).toBe("kokoro"); // sin `condicionCumplida` no entra
    });

    it("sin medidas no gana nadie: la regla dice MEDIDA, no teórica", () => {
        const elegido = elegirMotorPrimeraFrase(
            [candidato("kokoro"), candidato("kittentts")],
            [],
            "personal",
            capas,
        );
        expect(elegido).toBeNull();
    });

    it("sin candidatos aptos devuelve null y quien llama sigue su cadena habitual", () => {
        expect(
            elegirMotorPrimeraFrase([], [medida("kokoro", 100)], "personal", capas),
        ).toBeNull();
        expect(
            elegirMotorPrimeraFrase(
                [candidato("a", { tieneLaVoz: false })],
                [medida("a", 100)],
                "publico",
                { neurona: "libre" },
            ),
        ).toBeNull();
    });

    it("empate en latencia: gana el primero que llegó (orden estable)", () => {
        const elegido = elegirMotorPrimeraFrase(
            [candidato("x"), candidato("y")],
            [medida("y", 300), medida("x", 300)],
            "personal",
            capas,
        );
        expect(elegido?.id).toBe("x");
    });
});


