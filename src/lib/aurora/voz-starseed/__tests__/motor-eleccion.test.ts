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
