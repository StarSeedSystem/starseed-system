import { describe, expect, it } from "vitest";
import type { FaseBucle } from "../bucle";
import {
    REGISTRO_ORBE_BOTS,
    estadoOrbeDeFase,
    movimientoOrbe,
    presetOrbeDeFase,
} from "@/lib/design/orbe-bucle";
import { cssKeyframesOrbe } from "@/lib/design/animaciones-orbe";
import { movimientoDe } from "@/lib/design/registros-movimiento";

const FASES: FaseBucle[] = [
    "reposo",
    "observando",
    "esperando",
    "actuando",
    "hecho",
    "rechazado",
];

function propiedadesCss(texto: string): string[] {
    return [...texto.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
}

describe("movimiento de la orbe de los bots por fase", () => {
    it("cada fase pinta keyframes de su estado y solo anima transform y opacity", () => {
        for (const fase of FASES) {
            const css = cssKeyframesOrbe(presetOrbeDeFase(fase, "experimental"));
            expect(css.startsWith("@keyframes orbe-")).toBe(true);
            for (const propiedad of propiedadesCss(css)) {
                expect(["transform", "opacity"]).toContain(propiedad);
            }
        }
    });

    it("la transición del arrastre toma la entrada del registro, no 200 ms fijos", () => {
        const entrada = movimientoOrbe().entrada;
        expect(entrada).toEqual(movimientoDe(REGISTRO_ORBE_BOTS, "astraura").entrada);
        expect(`${entrada.ms}ms ${entrada.curva}`).not.toBe(
            "200ms cubic-bezier(0.4, 0, 0.2, 1)",
        );
    });

    it("con movimiento reducido todas las fases quedan quietas y conservan su estado", () => {
        const esperado = {
            reposo: "reposo",
            observando: "escucha",
            esperando: "piensa",
            actuando: "habla",
            hecho: "reposo",
            rechazado: "reposo",
        } as const;
        for (const fase of FASES) {
            const preset = presetOrbeDeFase(fase, "sobrio", true);
            expect(estadoOrbeDeFase(fase)).toBe(esperado[fase]);
            expect(preset.periodoMs).toBe(0);
            expect(preset.escala).toEqual([1, 1]);
            expect(preset.ondas).toBe(0);
            const css = cssKeyframesOrbe(preset);
            expect(css).toContain("@keyframes orbe-quieto");
            expect(css).toContain("scale(1)");
            expect(css).toContain("rotate(0deg)");
        }
    });
});
