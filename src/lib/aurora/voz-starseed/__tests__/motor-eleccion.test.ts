// src/lib/aurora/voz-starseed/__tests__/motor-eleccion.test.ts
/**
 * TESTS DE ELECCIÓN DEL NIVEL «ESTUDIO» (Ola 1018F · rescate de la rama
 * nube/41020433959, adaptados a la API de hoy).
 * ─────────────────────────────────────────────────────────────────────────────
 * En main la elección por motor con medianas medidas (`latenciasMedidas`,
 * `elegirMotorPrimeraFrase`) no existe: el contrato que se integró es el NIVEL
 * «estudio» decidido con el estado MEDIDO de VoiceStudio (`EstadoEstudio`) y
 * acotado por el `uso` del turno (niveles.ts). Aquí se prueba ese contrato.
 */

import { describe, expect, it } from "vitest";

import type { Capacidades } from "../capacidades";
import type { MedidaVoz } from "../../medidas-voz";
import {
    elegirMotorPorLatencia,
    latenciasPorMotor,
    motorPermitidoMasRapido,
    nivelParaMotor,
} from "../motor";
import {
    estudioDisponible,
    nivelPorDefecto,
    nivelTopeSegunUso,
    estudioSegunUso,
    type EstadoEstudio,
} from "../niveles";

/** Capacidades base (las más pobres): cada prueba solo toca lo que le importa. */
const base: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

/** El buen estado medido: VoiceStudio vivo con 8 GB libres en esta neurona. */
const medidoBien: EstadoEstudio = {
    voicestudioVivo: true,
    memoriaLibreGB: 8,
    servidaPorOtraNeurona: false,
};

describe("estudioDisponible · el estado medido manda", () => {
    it("sin medición no hay nivel «estudio»", () => {
        expect(estudioDisponible(undefined)).toBe(false);
        expect(estudioDisponible()).toBe(false);
    });

    it("descarta lo no válido: muerte, memoria por debajo del mínimo y sin servido", () => {
        expect(
            estudioDisponible({ voicestudioVivo: false, memoriaLibreGB: 16, servidaPorOtraNeurona: false }),
        ).toBe(false);
        expect(
            estudioDisponible({ voicestudioVivo: true, memoriaLibreGB: 7.5, servidaPorOtraNeurona: false }),
        ).toBe(false);
        expect(
            estudioDisponible({ voicestudioVivo: true, memoriaLibreGB: null, servidaPorOtraNeurona: false }),
        ).toBe(false);
    });

    it("con 8 GB de memoria LIBRES medidos, o servido por otra neurona, sí hay estudio", () => {
        expect(estudioDisponible(medidoBien)).toBe(true);
        expect(
            estudioDisponible({ voicestudioVivo: true, memoriaLibreGB: null, servidaPorOtraNeurona: true }),
        ).toBe(true);
    });
});

describe("el uso del turno decide si «estudio» compite", () => {
    it("en conversación y avisos no compite: el tope es «alta»", () => {
        expect(estudioSegunUso("conversacion")).toBe(false);
        expect(estudioSegunUso("aviso")).toBe(false);
        expect(nivelTopeSegunUso("conversacion")).toBe("alta");
        expect(nivelTopeSegunUso("aviso")).toBe("alta");
    });

    it("en lectura, doblaje y audiolibros sí compite: sin tope", () => {
        expect(estudioSegunUso("lectura")).toBe(true);
        expect(estudioSegunUso("doblaje")).toBe(true);
        expect(estudioSegunUso("audiolibro")).toBe(true);
        expect(nivelTopeSegunUso("audiolibro")).toBeNull();
    });
});

describe("nivelPorDefecto · con el estado de VoiceStudio medido", () => {
    it("aunque la medición sea la mejor, en conversación no gana el estudio", () => {
        expect(nivelPorDefecto(base, medidoBien, "conversacion")).toBe("alta");
    });

    it("en audiolibros el estudio medido sí gana, incluso sin demonio ni WebGPU", () => {
        expect(nivelPorDefecto(base, medidoBien, "audiolibro")).toBe("estudio");
    });

    it("servido por otra neurona y audiolibro en equipo sin nada: estudio, no ligera ni mínima", () => {
        const servido: EstadoEstudio = {
            voicestudioVivo: true,
            memoriaLibreGB: null,
            servidaPorOtraNeurona: true,
        };
        expect(nivelPorDefecto(base, servido, "audiolibro")).toBe("estudio");
    });

    it("sin medición manda la regla histórica del demonio: no se descarta a nadie por no medir", () => {
        expect(nivelPorDefecto({ ...base, daemonLocal: true, memoriaGB: 8 }, undefined, "audiolibro")).toBe(
            "estudio",
        );
    });

    it("demonio local pero VoiceStudio no disponible con audiolibro: alta, y nunca acota un nivel caído", () => {
        const caido: EstadoEstudio = { voicestudioVivo: false, memoriaLibreGB: 16, servidaPorOtraNeurona: false };
        expect(nivelPorDefecto({ ...base, daemonLocal: true }, caido, "audiolibro")).toBe("alta");
    });
});

// ── (VST1018F-d2b · parte 2) ELECCIÓN DE LA PRIMERA FRASE ───────────────────
// Sale del motor PERMITIDO de menor latencia MEDIDA que tenga la voz de esa
// persona; «estudio» no compite (lectura, doblaje, audiolibros). Elección PURA
// con medidas falsas, sin red, micrófono, altavoz ni procesos
// (contrato architecture/voz-voicestudio.md §4).

const NEURONA_ID = "neurona-test-1018";
const AHORA = 1_000_000_000;

/** Medida falsa de «primer-sonido» en la neurona de prueba. */
function primeraSonido(motor: string, valor: number, timestamp: number = AHORA): MedidaVoz {
    return { neurona: NEURONA_ID, motor, tipo: "primer-sonido", valor, timestamp };
}

/** Medida falsa de OTRO tipo: no cuenta para la primera frase. */
function otraMedida(
    motor: string,
    tipo: Exclude<MedidaVoz["tipo"], "primer-sonido">,
    valor: number,
): MedidaVoz {
    return { neurona: NEURONA_ID, motor, tipo, valor, timestamp: AHORA };
}

describe("elegirMotorPorLatencia · el más rápido medido, o null sin medidas", () => {
    it("sin medidas, o sin ninguna de primer-sonido, no hay elección", () => {
        expect(elegirMotorPorLatencia([])).toBeNull();
        expect(
            elegirMotorPorLatencia([otraMedida("kokoro", "tiempo-real-oido", 500), otraMedida("kokoro", "correccion", 1)]),
        ).toBeNull();
    });

    it("ignora lo que no es una medición válida: NaN, negativos y tipos ajenos", () => {
        const elegido = elegirMotorPorLatencia([
            primeraSonido("kokoro", Number.NaN),
            primeraSonido("kokoro", -100),
            otraMedida("kokoro", "tiempo-real-voz", 500),
            primeraSonido("supertonic", 350),
        ]);
        expect(elegido).toEqual({ motor: "supertonic", latenciaMs: 350 });
    });

    it("el recorte de las 20 más recientes deja fuera a quien solo tenía medidas viejas", () => {
        const viejas: MedidaVoz[] = Array.from({ length: 20 }, (_, i) =>
            primeraSonido("kokoro", 999, AHORA - 40_000 + i),
        );
        const nuevas: MedidaVoz[] = Array.from({ length: 20 }, (_, i) =>
            primeraSonido("supertonic", 200, AHORA - 20_000 + i),
        );
        expect(elegirMotorPorLatencia([...viejas, ...nuevas])).toEqual({ motor: "supertonic", latenciaMs: 200 });
    });
});

describe("nivelParaMotor · el nivel según el motor entrante", () => {
    it("sistema minima y kokoro ligera", () => {
        expect(nivelParaMotor("sistema")).toBe("minima");
        expect(nivelParaMotor("system")).toBe("minima");
        expect(nivelParaMotor("kokoro")).toBe("ligera");
    });

    it("los motores locales rápidos suenan por «alta», JAMÁS por «estudio» en conversación", () => {
        const locales = ["voicemorphic", "voicestudio", "omnivoice", "kittentts", "moss-tts-nano", "supertonic"];
        for (const id of locales) {
            expect(nivelParaMotor(id)).toBe("alta");
            expect(nivelParaMotor(id)).not.toBe("estudio");
        }
    });

    it("los de espacio de nube y lo desconocido caen a «nube»", () => {
        for (const id of ["openvoice2", "chatterbox", "voxcpm", "cosyvoice3", "qwen3-tts", "dots-tts", "motor-raro"]) {
            expect(nivelParaMotor(id)).toBe("nube");
        }
    });
});

describe("motorPermitidoMasRapido · licencia por contexto sobre la elección", () => {
    const rapidoPeroNoComercial: MedidaVoz[] = [
        primeraSonido("voicemorphic", 50),
        primeraSonido("kokoro", 300),
    ];

    it("en grupo, un motor personal más rápido NO gana: el mostrador es kokoro, que es libre", () => {
        expect(motorPermitidoMasRapido(rapidoPeroNoComercial, "grupo", {})).toEqual({
            motor: "kokoro",
            latenciaMs: 300,
        });
    });

    it("en uso personal con la capa de persona de acuerdo, el personal rápido GANA", () => {
        expect(motorPermitidoMasRapido(rapidoPeroNoComercial, "personal", { persona: "personal" })).toEqual({
            motor: "voicemorphic",
            latenciaMs: 50,
        });
    });

    it("la capa de la neurona restringiendo a libre echa al personal aunque el uso sea personal", () => {
        expect(motorPermitidoMasRapido(rapidoPeroNoComercial, "personal", { persona: "personal", neurona: "libre" }))
            .toEqual({ motor: "kokoro", latenciaMs: 300 });
    });

    it("un motor medido que el catálogo no declara compite sin bloqueo de licencia", () => {
        expect(motorPermitidoMasRapido([primeraSonido("supertonic", 120)], "grupo", {})).toEqual({
            motor: "supertonic",
            latenciaMs: 120,
        });
    });

    it("sin medidas no hay primera frase especial: cae la elección por hardware de siempre", () => {
        expect(motorPermitidoMasRapido([], "grupo", {})).toBeNull();
        expect(motorPermitidoMasRapido([otraMedida("kokoro", "correccion", 1)], "grupo", {})).toBeNull();
    });
});
