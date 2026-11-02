// src/lib/aurora/voz-starseed/__tests__/nivel-estudio.test.ts
/**
 * PRUEBA PURA DE LA ELECCIÓN DEL NIVEL «ESTUDIO» (Ola 1018V · VST1018F, parte 3 de 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Reglas de `architecture/voz-voicestudio.md` §3-§4 que aquí se comprueban —
 * con medidas FALSAS inyectadas, sin red, sin disco, sin reloj ni audio:
 *
 *  · «estudio» SOLO si `descubrir()` de voicestudio.ts dijo vivo y la neurona
 *    tiene ≥ 8 GB libres, o si otra neurona de la malla lo sirve.
 *  · «estudio» solo para lectura larga, doblaje y audiolibros; en conversación
 *    y avisos el tope es «alta».
 *  · La degradación nunca sube un nivel ya caído.
 *
 * El módulo probado es `nivel-estudio` en la costura pública de `niveles.ts`.
 */

import { describe, it, expect } from "vitest";

import type { Capacidades } from "../capacidades";
import {
    acotarNivel,
    estudioDisponible,
    nivelesDisponibles,
    nivelPorDefecto,
    nivelTopeSegunUso,
    siguienteNivel,
    RAM_MIN_ESTUDIO_GB,
    type EstadoEstudio,
    type UsoVoz,
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

/** Medida falsa buena y medida falsa mala, para la elección. */
const bien: EstadoEstudio = { voicestudioVivo: true, memoriaLibreGB: 8, servidaPorOtraNeurona: false };
const mal: EstadoEstudio = { voicestudioVivo: false, memoriaLibreGB: 16, servidaPorOtraNeurona: false };
const sinEscala: EstadoEstudio = { voicestudioVivo: true, memoriaLibreGB: null, servidaPorOtraNeurona: true };

describe("estudioDisponible · solo con la medición contundente", () => {
    it("sin medición de VoiceStudio nunca hay «estudio»", () => {
        expect(estudioDisponible(undefined)).toBe(false);
        expect(estudioDisponible()).toBe(false);
    });

    it("el estado muerto descalifica aunque sobren memoria", () => {
        expect(estudioDisponible(mal)).toBe(false);
    });

    it("servido por OTRA neurona de la malla basta, sin memoria propia conocida", () => {
        expect(estudioDisponible(sinEscala)).toBe(true);
        expect(
            estudioDisponible({ voicestudioVivo: true, memoriaLibreGB: 0, servidaPorOtraNeurona: true }),
        ).toBe(true);
    });

    it("lo servido solo cuenta si quien lo sirve está vivo", () => {
        expect(
            estudioDisponible({ voicestudioVivo: false, memoriaLibreGB: null, servidaPorOtraNeurona: true }),
        ).toBe(false);
    });
});

describe("el uso del turno: «estudio» solo es lectura larga, doblaje y audiolibros", () => {
    it("el tope en conversación y avisos es «alta», nunca llega a estudio", () => {
        expect(nivelTopeSegunUso("conversacion")).toBe("alta");
        expect(nivelTopeSegunUso("aviso")).toBe("alta");
        expect(nivelPorDefecto(base, bien, "conversacion")).toBe("alta");
        expect(nivelPorDefecto(base, bien, "aviso")).toBe("alta");
        // El primer nivel ofertado en conversación tampoco es estudio.
        expect(nivelesDisponibles(base, bien, "conversacion")).not.toContain("estudio");
    });

    it("lectura, doblaje y audiolibros sí llegan al estudio medido", () => {
        for (const uso of ["lectura", "doblaje", "audiolibro"] as const satisfies readonly UsoVoz[]) {
            expect(nivelPorDefecto(base, bien, uso)).toBe("estudio");
            expect(nivelesDisponibles(base, bien, uso)[0]).toBe("estudio");
        }
    });

    it("sin uso no se acota: elección por hardware solo (compatibilidad de llamadores antiguos)", () => {
        expect(nivelPorDefecto(base, bien)).toBe("estudio");
        expect(nivelPorDefecto(base, sinEscala)).toBe("estudio");
        expect(nivelPorDefecto(base, mal, undefined)).not.toBe("estudio");
    });
});

describe("el orden de la cadena y la degradación nunca rompen la regla", () => {
    it("«estudio» está POR ENCIMA de «alta»: la cadena desciende y «estudio» cae a «alta»", () => {
        expect(siguienteNivel("estudio")).toBe("alta");
        expect(siguienteNivel("alta")).toBe("nube");
        expect(siguienteNivel("minima")).toBeNull();
    });

    it("acotarNivel baja al tope pero jamás SUBE un nivel ya caído", () => {
        expect(acotarNivel("estudio", "alta")).toBe("alta");
        expect(acotarNivel("alta", "alta")).toBe("alta");
        // El mínimo no vuelve a subir porque el uso lo permitiera.
        expect(acotarNivel("minima", "alta")).toBe("minima");
        expect(acotarNivel("ligera", "alta")).toBe("ligera");
    });

    it("nivelesDisponibles mantiene el orden estudio › alta › nube › ligera › minima", () => {
        expect(nivelesDisponibles(base, bien, "audiolibro")).toEqual([
            "estudio", "alta", "nube", "ligera", "minima",
        ]);
    });

    it("sin medición del disco manda la regla histórica del demonio con 8 GB", () => {
        expect(nivelPorDefecto({ ...base, daemonLocal: true, memoriaGB: 8 }, undefined, "audiolibro")).toBe("estudio");
        expect(nivelPorDefecto({ ...base, daemonLocal: true, memoriaGB: 6 }, undefined, "audiolibro")).toBe("alta");
        // Y en conversación el tope del uso acota igual al demonio bueno.
        expect(nivelPorDefecto({ ...base, daemonLocal: true, memoriaGB: 8 }, undefined, "conversacion")).toBe("alta");
    });
});
