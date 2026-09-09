/**
 * Tests de la Ola 304 · Tarea zU8: aplicar la variación al fondo real.
 *
 * El módulo bajo prueba (`src/lib/design/aplicar-variacion.ts`) es PURO:
 * todo llega por parámetro. Se verifican los invariantes del enunciado:
 *   · el parche SOLO toca `background.living` (no secuestra el fondo);
 *   · `debeReaccionar` ignora el minuto pero no la franja horaria;
 *   · suelo de 20 s entre transiciones (`puedeCambiarAhora`);
 *   · las cuatro franjas en sus bordes (0, 6, 12, 20, 23).
 */

import { describe, expect, it } from "vitest";
import {
    MINIMO_ENTRE_CAMBIOS_MS,
    parcheDeVariacion,
    franjaHoraria,
    debeReaccionar,
    puedeCambiarAhora,
} from "@/lib/design/aplicar-variacion";
import type { ContextoVisual, VariacionVisual } from "@/lib/design/variaciones-contexto";

/** Contexto mínimo, estable y completo para los casos base. */
function contexto(parcial?: Partial<ContextoVisual>): ContextoVisual {
    return {
        area: "/network/politics",
        horaLocal: 14,
        densidadInformacion: "media",
        movimientoReducido: false,
        dispositivoModesto: false,
        ...parcial,
    };
}

/** Variación mínima, estable y completa para los casos base. */
function variacion(parcial?: Partial<VariacionVisual>): VariacionVisual {
    return {
        variante: "aurora",
        velocidad: 0.5,
        intensidad: 0.7,
        cicloSegundos: 42,
        acentos: ["#10B981", "#A855F7"],
        motivo: "aurora fluida y orgánica",
        ...parcial,
    };
}

describe("parcheDeVariacion", () => {
    it("solo toca background.living: nada de type, value ni capas", () => {
        const parche = parcheDeVariacion(variacion());
        const clavesBackground = parche.background
            ? Object.keys(parche.background)
            : [];
        expect(clavesBackground).toEqual(["living"]);
        expect(Object.keys(parche)).toEqual(["background"]);
    });

    it("traduce cada campo de la variación al bloque living", () => {
        const v = variacion({
            variante: "plasma",
            velocidad: 1.2,
            intensidad: 0.8,
            cicloSegundos: 0,
            acentos: ["#FF3CAC", "#784BA0"],
        });
        expect(parcheDeVariacion(v)).toEqual({
            background: {
                living: {
                    variant: "plasma",
                    speed: 1.2,
                    intensity: 0.8,
                    colors: ["#FF3CAC", "#784BA0"],
                    autoCycleSec: 0,
                },
            },
        });
    });

    it("entrega una copia de los acentos: mutar el parche no toca la variación", () => {
        const v = variacion({ acentos: ["#007FFF"] });
        const parche = parcheDeVariacion(v);
        const living = parche.background?.living;
        expect(living).toBeDefined();
        living?.colors.push("#FFBF00");
        expect(v.acentos).toEqual(["#007FFF"]);
    });
});

describe("debeReaccionar", () => {
    it("reacciona al primer contexto (anterior null)", () => {
        expect(debeReaccionar(null, contexto())).toBe(true);
    });

    it("NO reacciona si solo cambió el minuto dentro de la misma franja", () => {
        const antes = contexto({ horaLocal: 14 });
        const despues = contexto({ horaLocal: 14.5 });
        expect(debeReaccionar(antes, despues)).toBe(false);
    });

    it("reacciona al cambiar de franja horaria", () => {
        const antes = contexto({ horaLocal: 19 });
        const despues = contexto({ horaLocal: 20 });
        expect(debeReaccionar(antes, despues)).toBe(true);
    });

    it("reacciona al cambiar área, tema, densidad o movimiento reducido", () => {
        const base = contexto();
        expect(debeReaccionar(base, contexto({ area: "/biblioteca" }))).toBe(true);
        expect(debeReaccionar(base, contexto({ tema: "cyberdelico" }))).toBe(true);
        expect(debeReaccionar(base, contexto({ densidadInformacion: "alta" }))).toBe(true);
        expect(debeReaccionar(base, contexto({ movimientoReducido: true }))).toBe(true);
    });

    it("no reacciona a la semilla ni al dispositivo modesto solos", () => {
        const antes = contexto({ semilla: "perfil-1", dispositivoModesto: false });
        const despues = contexto({ semilla: "perfil-2", dispositivoModesto: true });
        expect(debeReaccionar(antes, despues)).toBe(false);
    });
});

describe("puedeCambiarAhora (suelo de 20 s)", () => {
    it("MINIMO_ENTRE_CAMBIOS_MS es exactamente 20 segundos", () => {
        expect(MINIMO_ENTRE_CAMBIOS_MS).toBe(20_000);
    });

    it("bloquea antes de 20 s y permite justo al cumplirlos", () => {
        const ultimo = 1_000_000;
        expect(puedeCambiarAhora(ultimo, ultimo + 19_999)).toBe(false);
        expect(puedeCambiarAhora(ultimo, ultimo + MINIMO_ENTRE_CAMBIOS_MS)).toBe(true);
    });

    it("un reloj que retrocede no bloquea para siempre", () => {
        expect(puedeCambiarAhora(5_000, 1_000)).toBe(true);
    });
});

describe("franjaHoraria (bordes)", () => {
    it("clasifica las horas frontera de cada franja", () => {
        expect(franjaHoraria(0)).toBe("madrugada");
        expect(franjaHoraria(6)).toBe("manana");
        expect(franjaHoraria(12)).toBe("tarde");
        expect(franjaHoraria(20)).toBe("noche");
        expect(franjaHoraria(23)).toBe("noche");
    });
});
