import { describe, it, expect } from "vitest";
import { presetOrbe, type EstadoOrbe } from "@/lib/design/animaciones-orbe";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import type { FaseBucle } from "../bucle";
import {
    REGISTRO_ORBE_BOT,
    estadoAvatarDeFase,
    estadoOrbeDeFase,
    movimientoOrbeBot,
} from "../orbe-movimiento";

const FASES: { fase: FaseBucle; estado: EstadoOrbe }[] = [
    { fase: "reposo", estado: "reposo" },
    { fase: "observando", estado: "escucha" },
    { fase: "esperando", estado: "piensa" },
    { fase: "actuando", estado: "habla" },
    { fase: "hecho", estado: "reposo" },
    { fase: "rechazado", estado: "reposo" },
];

/** Propiedades declaradas dentro de los `@keyframes`. */
function propiedadesCss(texto: string): string[] {
    return [...texto.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
}

describe("estadoOrbeDeFase — el estado real del bot manda", () => {
    for (const { fase, estado } of FASES) {
        it(`${fase} → ${estado}`, () => {
            expect(estadoOrbeDeFase(fase)).toBe(estado);
        });
    }
    it("sin bucle todavía, reposo", () => {
        expect(estadoOrbeDeFase(undefined)).toBe("reposo");
    });
    it("el avatar cuántico sigue al mismo estado", () => {
        expect(estadoAvatarDeFase("observando")).toBe("listening");
        expect(estadoAvatarDeFase("esperando")).toBe("thinking");
        expect(estadoAvatarDeFase("actuando")).toBe("speaking");
        expect(estadoAvatarDeFase(undefined)).toBe("idle");
    });
});

describe("movimientoOrbeBot — el preset de Astraura, sin números sueltos", () => {
    it("usa el registro sobrio por defecto", () => {
        expect(REGISTRO_ORBE_BOT).toBe("sobrio");
        const mov = movimientoOrbeBot("observando");
        expect(mov.estado).toBe("escucha");
        expect(mov.animacion.startsWith("orbebot-escucha ")).toBe(true);
    });

    it("el periodo y la escala salen de presetOrbe", () => {
        for (const registro of ["sobrio", "expresivo", "experimental"] as RegistroMovimiento[]) {
            const preset = presetOrbe("piensa", registro);
            const mov = movimientoOrbeBot("esperando", registro);
            expect(mov.animacion).toContain(`${preset.periodoMs}ms`);
            expect(mov.keyframes).toContain(`scale(${preset.escala[0]})`);
            expect(mov.keyframes).toContain(`scale(${preset.escala[1]})`);
        }
    });

    it("la transición del arrastre usa la entrada del registro de movimiento", () => {
        const m = movimientoDe("sobrio", "astraura");
        const mov = movimientoOrbeBot("reposo");
        expect(mov.transicion).toBe(
            `left ${m.entrada.ms}ms ${m.entrada.curva}, top ${m.entrada.ms}ms ${m.entrada.curva}`,
        );
        expect(mov.transicion).toContain(`${m.entrada.ms}ms`);
        expect(mov.transicion).not.toContain("200ms");
    });

    it("es determinista y solo anima transform y opacity", () => {
        expect(movimientoOrbeBot("actuando")).toEqual(movimientoOrbeBot("actuando"));
        for (const { fase } of FASES) {
            const mov = movimientoOrbeBot(fase, "experimental");
            expect(mov.keyframes.startsWith("@keyframes orbebot-")).toBe(true);
            for (const propiedad of propiedadesCss(mov.keyframes)) {
                expect(["transform", "opacity"]).toContain(propiedad);
            }
        }
    });
});

describe("movimientoOrbeBot — movimiento reducido", () => {
    for (const { fase } of FASES) {
        it(`${fase} queda quieto, sin latido ni transición`, () => {
            const mov = movimientoOrbeBot(fase, "sobrio", true);
            expect(mov.animacion).toBe("none");
            expect(mov.transicion).toBe("none");
            expect(mov.keyframes).toContain("@keyframes orbebot-");
            expect(mov.keyframes).toContain("scale(1)");
            expect(mov.keyframes).toContain("rotate(0deg)");
        });
    }
    it("el estado sigue siendo el real aunque no se mueva", () => {
        expect(movimientoOrbeBot("actuando", "sobrio", true).estado).toBe("habla");
    });
});
