// src/lib/aurora/voz-starseed/__tests__/nivel-estudio.test.ts
/**
 * Pruebas del nivel «estudio» y de la regla instantánea del motor único
 * (Ola 1018V · VST1018F). Todo es puro: ninguna prueba toca red, disco,
 * micrófono ni procesos; las medidas de voz son falsas, en memoria.
 */

import { describe, it, expect } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import type { Capacidades } from "../capacidades";
import { estudioDisponible, nivelPorDefecto, nivelesDisponibles } from "../niveles";
import {
    elegirMotorInstantaneo,
    type CandidatoInstantaneo,
} from "../motor";

/** Capacidades de laboratorio, sin señalar nada que no se pida. */
function caps(parcial: Partial<Capacidades>): Capacidades {
    return {
        memoriaGB: null,
        nucleos: null,
        webgpu: false,
        wasmSimd: false,
        movil: false,
        daemonLocal: false,
        ...parcial,
    };
}

/** Medida falsa de «primer-sonido» (el tipo que ordena la regla instantánea). */
function medida(motor: string, valor: number, neurona = "n1"): MedidaVoz {
    return { neurona, motor, tipo: "primer-sonido", valor, timestamp: 1_000 };
}

describe("estudioDisponible (nivel «estudio» de VoiceStudio, Ola 1018V)", () => {
    it("demonio de voz vivo y 8 GB de RAM: disponible", () => {
        expect(estudioDisponible(caps({ daemonLocal: true, memoriaGB: 8 }))).toBe(true);
    });

    it("con poco hardware (menos de 8 GB) y sin señales: no disponible", () => {
        expect(estudioDisponible(caps({ daemonLocal: true, memoriaGB: 4 }))).toBe(false);
    });

    it("VoiceStudio dijo vivo por descubrir() y 8 GB: disponible sin demonio", () => {
        expect(estudioDisponible(caps({ memoriaGB: 16 }), { voicestudio: true })).toBe(true);
    });

    it("VoiceStudio vivo pero con menos de 8 GB libre: no disponible", () => {
        expect(estudioDisponible(caps({ memoriaGB: 6 }), { voicestudio: true })).toBe(false);
    });

    it("si lo sirve otra neurona de la malla, disponible aunque esta neurona no aguante", () => {
        expect(estudioDisponible(caps({ memoriaGB: 2 }), { sirveOtraNeurona: true })).toBe(true);
    });

    it("sin nada vivo y sin señales: no disponible", () => {
        expect(estudioDisponible(caps({ memoriaGB: 16 }))).toBe(false);
    });

    it("sin informar de la RAM no se atreve con «estudio»", () => {
        expect(estudioDisponible(caps({ daemonLocal: true, memoriaGB: null }))).toBe(false);
    });
});

describe("nivelPorDefecto y nivelesDisponibles", () => {
    it("demo­nio vivo con 8 GB cae en «estudio» y sin RAM suficiente en «alta»", () => {
        expect(nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 8 }))).toBe("estudio");
        expect(nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 6 }))).toBe("alta");
    });

    it("con VoiceStudio vivo y 8 GB el defecto es «estudio» sin demonio del rito", () => {
        expect(nivelPorDefecto(caps({ memoriaGB: 8 }), { voicestudio: true })).toBe("estudio");
    });

    it("nivelesDisponibles nunca pierde «minima», la red de seguridad", () => {
        const lista = nivelesDisponibles(caps({ daemonLocal: true, memoriaGB: 8 }));
        expect(lista[0]).toBe("estudio");
        expect(lista[lista.length - 1]).toBe("minima");
    });
});

/** Flota de laboratorio: las mismas vías que el motor único puede abrir hoy. */
const FLOTA: CandidatoInstantaneo[] = [
    { motor: "kittentts", nivel: "ligera", claseLicencia: "libre" },
    { motor: "kokoro", nivel: "ligera", claseLicencia: "libre" },
    { motor: "omnivoice", nivel: "alta", claseLicencia: "personal" },
    { motor: "supertonic", nivel: "ligera", claseLicencia: "condicionada" },
    { motor: "voicestudio", nivel: "estudio", claseLicencia: "personal" },
];

describe("elegirMotorInstantaneo con medidas falsas (regla instantánea, Ola 1018V)", () => {
    it("elige el motor PERMITIDO con menor latencia MEDIDA", () => {
        const electo = elegirMotorInstantaneo(FLOTA, [medida("kokoro", 90), medida("kittentts", 45)], {
            contexto: "personal",
        });
        expect(electo?.motor).toBe("kittentts");
        expect(electo?.nivel).toBe("ligera");
    });

    it("el motor con latencia peor nunca gana a uno medido mejor", () => {
        const electo = elegirMotorInstantaneo(FLOTA, [medida("kokoro", 20)], { contexto: "personal" });
        expect(electo?.motor).toBe("kokoro");
    });

    it("un motor «personal» no entra por omisión, aunque sea el más rápido", () => {
        const electo = elegirMotorInstantaneo(
            FLOTA,
            [medida("omnivoice", 10), medida("kokoro", 200)],
            { contexto: "personal" },
        );
        expect(electo?.motor).toBe("kokoro");
    });

    it("entrar en lo personal exige capas que autoricen pesos personales", () => {
        const electo = elegirMotorInstantaneo(
            FLOTA,
            [medida("omnivoice", 10), medida("kokoro", 200)],
            { contexto: "personal", capas: { persona: "personal" } },
        );
        expect(electo?.motor).toBe("omnivoice");
    });

    it("en grupo ni comunitario no sale nada «personal», ni con capas personales", () => {
        const electo = elegirMotorInstantaneo(
            FLOTA,
            [medida("omnivoice", 10), medida("kittentts", 50)],
            { contexto: "grupo", capas: { persona: "personal" } },
        );
        expect(electo?.motor).toBe("kittentts");
    });

    it("la condicionada sin su condición cumplida queda fuera", () => {
        const electo = elegirMotorInstantaneo(
            FLOTA,
            [medida("supertonic", 5), medida("kokoro", 80)],
            { contexto: "personal" },
        );
        expect(electo?.motor).toBe("kokoro");
    });

    it("sin medidas sale el primer PERMITIDO en orden de llegada", () => {
        const electo = elegirMotorInstantaneo(FLOTA, [], { contexto: "personal" });
        expect(electo?.motor).toBe("kittentts");
    });

    it("un motor sin la voz de esa persona queda fuera, aunque sea el más rápido", () => {
        const electo = elegirMotorInstantaneo(
            FLOTA.map((c) => (c.motor === "omnivoice" ? { ...c, suena: false } : c)),
            [medida("omnivoice", 10), medida("kittentts", 50)],
            { contexto: "personal", capas: { persona: "personal" } },
        );
        expect(electo?.motor).toBe("kittentts");
    });

    it("«estudio» no sale en conversación ni avisos: solo lectura, doblaje y audiolibros", () => {
        const sinEstudio = elegirMotorInstantaneo(
            FLOTA,
            [medida("voicestudio", 15), medida("kittentts", 60)],
            { contexto: "personal", capas: { persona: "personal" }, permitirEstudio: false },
        );
        expect(sinEstudio?.motor).toBe("kittentts");
        const conEstudio = elegirMotorInstantaneo(
            FLOTA,
            [medida("voicestudio", 15), medida("kittentts", 60)],
            { contexto: "personal", capas: { persona: "personal" }, permitirEstudio: true },
        );
        expect(conEstudio?.motor).toBe("voicestudio");
    });

    it("misma entrada, mismo motor: la frase NUNCA se parte entre dos motores", () => {
        const medidas = [medida("kittentts", 40), medida("kokoro", 35)];
        const uno = elegirMotorInstantaneo(FLOTA, medidas, { contexto: "personal" });
        const dos = elegirMotorInstantaneo(FLOTA, medidas, { contexto: "personal" });
        expect(uno).toEqual(dos);
        expect(uno).not.toBeNull();
    });
});
