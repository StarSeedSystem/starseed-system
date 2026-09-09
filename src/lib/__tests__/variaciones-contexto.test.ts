/**
 * Tests de la Ola 304 · Tarea zU4: variaciones de diseño por contexto.
 *
 * El módulo bajo prueba (`src/lib/design/variaciones-contexto.ts`) es PURO y
 * DETERMINISTA: la misma entrada produce SIEMPRE el mismo objeto, y dentro no
 * hay `Math.random()`, `Date.now()` ni `window` — todo llega por parámetro.
 *
 * Se verifican los invariantes del enunciado:
 *   · determinismo (dos llamadas idénticas → objeto igual);
 *   · el movimiento reducido manda sobre todo lo demás;
 *   · la densidad alta baja la intensidad;
 *   · dos semillas distintas pueden dar variantes distintas;
 *   · todos los valores dentro de sus rangos (velocidad 0–2, intensidad 0–1).
 */

import { describe, expect, it } from "vitest";
import {
    variacionPara,
    type ContextoVisual,
} from "@/lib/design/variaciones-contexto";

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

describe("variacionPara", () => {
    it("es determinista: dos llamadas idénticas devuelven el mismo objeto", () => {
        const ctx = contexto({ area: "/network/politics", semilla: "perfil-civico" });
        const a = variacionPara(ctx);
        const b = variacionPara(ctx);
        expect(a).toEqual(b);
    });

    it("es determinista sin semilla", () => {
        expect(variacionPara(contexto())).toEqual(variacionPara(contexto()));
    });

    it("el movimiento reducido manda sobre todo lo demás", () => {
        // Aunque haya mucha información, sea de noche y el dispositivo sea
        // potente, el movimiento debe quedar desactivado del todo.
        const v = variacionPara(
            contexto({
                area: "/network/culture",
                tema: "cyberdelico",
                horaLocal: 23,
                densidadInformacion: "alta",
                movimientoReducido: true,
                dispositivoModesto: false,
            })
        );
        expect(v.velocidad).toBe(0);
        expect(v.cicloSegundos).toBe(0);
    });

    it("con densidad alta la intensidad es menor que con densidad media", () => {
        const base = contexto({ area: "/network/politics", semilla: "s" });
        const baja = variacionPara({ ...base, densidadInformacion: "media" });
        const alta = variacionPara({ ...base, densidadInformacion: "alta" });
        expect(alta.intensidad).toBeLessThan(baja.intensidad);
    });

    it("dos semillas distintas pueden dar variantes distintas", () => {
        // No es una garantía absoluta para toda semilla, pero el desempate por
        // hash debe ser capaz de escoger variantes distintas dentro de la misma
        // familia. Se buscan dos semillas que difieran, no un par concreto.
        const base = contexto({ area: "/network/culture" });
        const variantes = new Set<string>();
        for (let i = 0; i < 40; i += 1) {
            variantes.add(variacionPara({ ...base, semilla: `perfil-${i}` }).variante);
            if (variantes.size > 1) break;
        }
        expect(variantes.size).toBeGreaterThan(1);
    });

    describe("rangos de valores", () => {
        it.each([0, 1, 6, 7, 12, 20, 21, 23])(
            "mantiene velocidad e intensidad dentro de rango (hora %s)",
            (horaLocal) => {
                const ctx = {
                    area: "/biblioteca",
                    tema: "minimal" as const,
                    horaLocal,
                    densidadInformacion: "alta" as const,
                    movimientoReducido: false,
                    dispositivoModesto: true,
                    semilla: "x",
                };
                const v = variacionPara(ctx);
                expect(v.velocidad).toBeGreaterThanOrEqual(0);
                expect(v.velocidad).toBeLessThanOrEqual(2);
                expect(v.intensidad).toBeGreaterThanOrEqual(0);
                expect(v.intensidad).toBeLessThanOrEqual(1);
                // Dispositivo modesto: intensidad contenida y sin ciclo automático.
                expect(v.intensidad).toBeLessThanOrEqual(0.4);
                expect(v.cicloSegundos).toBe(0);
            }
        );

        it("siempre entrega una variante válida del catálogo", () => {
            const validas = ["aurora", "nebula", "starfield", "mycelium", "plasma", "prisma", "ocean"];
            const v = variacionPara(
                contexto({ area: "/red", tema: "solarpunk", semilla: "nodo-1", horaLocal: 3 })
            );
            expect(validas).toContain(v.variante);
        });
    });

    it("la familia por área elige con criterio (gobernanza → prisma)", () => {
        const v = variacionPara(contexto({ area: "/network/politics" }));
        // prisma es la candidata basal del área; la semilla puede desempatar,
        // así que basta con comprobar que llega una candidata de su familia.
        expect(["prisma", "starfield", "nebula"]).toContain(v.variante);
    });

    it("explica el motivo en español", () => {
        const v = variacionPara(contexto({ semilla: "perfil" }));
        expect(v.motivo.length).toBeGreaterThan(0);
        expect(/[a-záéíóúñ]/i.test(v.motivo)).toBe(true);
    });

    it("la hora nocturna atenúa la intensidad frente al mediodía", () => {
        const base = contexto({ area: "/network/culture", semilla: "y" });
        const dia = variacionPara({ ...base, horaLocal: 14 });
        const noche = variacionPara({ ...base, horaLocal: 23 });
        expect(noche.intensidad).toBeLessThan(dia.intensidad);
    });
});