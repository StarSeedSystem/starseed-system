import { describe, it, expect } from "vitest";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import {
    estadoOrbeDeFase,
    estadoAvatarDeFase,
    REGISTRO_ORBE_BOT,
    movimientoOrbeBot,
    MovimientoOrbeBotOutput,
} from "@/lib/design/animaciones-orbe";

function propiedadesCss(texto: string): string[] {
    return [...texto.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
}

const FASES: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];

describe("estadoOrbeDeFase", () => {
    it("undefined devuelve reposo", () => {
        expect(estadoOrbeDeFase(undefined)).toBe("reposo");
    });

    it("mpea estados a fases", () => {
        expect(estadoOrbeDeFase("reposo")).toBe("reposo");
        expect(estadoOrbeDeFase("escucha")).toBe("observando");
        expect(estadoOrbeDeFase("piensa")).toBe("pensando");
        expect(estadoOrbeDeFase("habla")).toBe("actuando");
        expect(estadoOrbeDeFase("siembra")).toBe("siembra");
    });
});

describe("estadoAvatarDeFase", () => {
    it("observando → listening", () => {
        expect(estadoAvatarDeFase("observando")).toBe("listening");
    });

    it("esperando → thinking", () => {
        expect(estadoAvatarDeFase("esperando")).toBe("thinking");
    });

    it("actuando → speaking", () => {
        expect(estadoAvatarDeFase("actuando")).toBe("speaking");
    });

    it("undefined → idle", () => {
        expect(estadoAvatarDeFase(undefined)).toBe("idle");
    });
});

describe("REGISTRO_ORBE_BOT", () => {
    it("es sobrio por defecto", () => {
        expect(REGISTRO_ORBE_BOT).toBe("sobrio");
    });
});

describe("movimientoOrbeBot", () => {
    it("sin bucle todavía, reposo", () => {
        const mov = movimientoOrbeBot("reposo");
        expect(mov.estado).toBe("reposo");
        expect(mov.animacion).not.toBe("none");
    });

    it("usa el registro sobrio por defecto", () => {
        expect(REGISTRO_ORBE_BOT).toBe("sobrio");
        const mov = movimientoOrbeBot("observando");
        expect(mov.estado).toBe("escucha");
        expect(mov.animacion.startsWith("orbebot-escucha ")).toBe(true);
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
        for (const fase of FASES) {
            const mov = movimientoOrbeBot(fase, "experimental");
            expect(mov.keyframes.startsWith("@keyframes orbebot-")).toBe(true);
            for (const propiedad of propiedadesCss(mov.keyframes)) {
                expect(["transform", "opacity"]).toContain(propiedad);
            }
        }
    });

    it("${fase} queda quieto, sin latido ni transición", () => {
        for (const fase of FASES) {
            const mov = movimientoOrbeBot(fase, "sobrio", true);
            expect(mov.animacion).toBe("none");
            expect(mov.transicion).toBe("none");
            expect(mov.keyframes).toContain("@keyframes orbebot-");
            expect(mov.keyframes).toContain("scale(1)");
            expect(mov.keyframes).toContain("rotate(0deg)");
        }
    });

    it("el estado sigue siendo el real aunque no se mueva", () => {
        expect(movimientoOrbeBot("actuando", "sobrio", true).estado).toBe("habla");
    });
});