/**
 * VST1018F (2/3) — elección PURA del motor de la primera frase de una
 * conversación (`elegirMotorPrimeraFrase` en `motor.ts`), con medidas falsas:
 *  · gana el permitido con la menor latencia medida («primer-sonido»);
 *  · fuera de lo personal no suena ningún motor de pesos no comerciales;
 *  · los motores sin la voz de la persona no entran;
 *  · «estudio» solo en lectura, doblaje y audiolibros;
 *  · sin medidas gana el primero permitido que llega (la cadena del demonio).
 * Sin red, sin audio y sin reloj de pared: la hora entra por `ahora`.
 */

import { describe, expect, it } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import { elegirMotorPrimeraFrase, type ViaPrimeraFrase } from "@/lib/aurora/voz-starseed/motor";

const AHORA = 1_760_000_000_000;

/** Medida falsa de «primer-sonido» a menos de un segundo de AHORA. */
function primerSonido(motor: string, valor: number, extra: Partial<MedidaVoz> = {}): MedidaVoz {
    return {
        neurona: "n-1",
        motor,
        tipo: "primer-sonido",
        valor,
        timestamp: AHORA - 1_000,
        ...extra,
    };
}

const CADENA: ViaPrimeraFrase[] = [
    { motor: "demonio", nivel: "alta", claseLicencia: "personal", tieneLaVoz: true },
    { motor: "kokoro", nivel: "ligera", claseLicencia: "libre", tieneLaVoz: true },
    { motor: "sistema", nivel: "minima", claseLicencia: "libre", tieneLaVoz: false },
];

describe("elegirMotorPrimeraFrase · la primera frase sale del más rápido", () => {
    it("elige el permitido con la menor latencia medida", () => {
        const eleccion = elegirMotorPrimeraFrase(CADENA, [
            primerSonido("demonio", 900),
            primerSonido("kokoro", 300),
        ], { ahora: AHORA });
        expect(eleccion.nivel).toBe("ligera");
        expect(eleccion.motor).toBe("kokoro");
        expect(eleccion.latenciaMs).toBe(300);
        expect(eleccion.motivo).toContain("menor latencia medida");
    });
});
