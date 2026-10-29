import { describe, it, expect } from "vitest";
import { aplicarMovimientoReducido, movimientoDe } from "@/lib/design/registros-movimiento";
import { DESTELLOS_MAX_POR_SEGUNDO, presetOrbe, type EstadoOrbe } from "@/lib/design/animaciones-orbe";
import { REGISTRO_ORBE_BOTS, estadoOrbeDeFase, movimientoOrbe, presetOrbeDeFase } from "../orbe-bucle";

const FASES = ["reposo", "observando", "esperando", "actuando", "hecho", "rechazado"] as const;
const ESPERADO: Record<(typeof FASES)[number], EstadoOrbe> = {
    reposo: "reposo",
    observando: "escucha",
    esperando: "piensa",
    actuando: "habla",
    hecho: "reposo",
    rechazado: "reposo",
};

describe("estadoOrbeDeFase", () => {
    it("mapea el bucle a escuchar, pensar, hablar o reposar", () => {
        for (const fase of FASES) expect(estadoOrbeDeFase(fase)).toBe(ESPERADO[fase]);
    });
    it("es determinista para todas las fases", () => {
        for (const fase of FASES) expect(estadoOrbeDeFase(fase)).toBe(estadoOrbeDeFase(fase));
    });
});

describe("movimientoOrbe", () => {
    it("usa el registro sobrio de Astraura por defecto", () => {
        expect(REGISTRO_ORBE_BOTS).toBe("sobrio");
        expect(movimientoOrbe()).toEqual(movimientoDe("sobrio", "astraura"));
    });
    it("con reducido deja duración 0 y escala 1", () => {
        const m = movimientoOrbe("expresivo", true);
        expect(m).toEqual(aplicarMovimientoReducido(movimientoDe("expresivo", "astraura")));
        expect(m.entrada.ms).toBe(0);
        expect(m.salida.ms).toBe(0);
        expect(m.respiracion).toEqual({ escala: 1, periodoMs: 0 });
    });
});

describe("presetOrbeDeFase", () => {
    it("entrega el preset del estado mapeado con el registro pedido", () => {
        for (const fase of FASES) {
            expect(presetOrbeDeFase(fase, "expresivo")).toEqual(
                presetOrbe(ESPERADO[fase], "expresivo"),
            );
        }
    });
    it("nunca supera los destellos por segundo del OS", () => {
        for (const fase of FASES) {
            expect(1000 / presetOrbeDeFase(fase).periodoMs).toBeLessThanOrEqual(
                DESTELLOS_MAX_POR_SEGUNDO,
            );
        }
    });
    it("con movimiento reducido la orbe queda quieta", () => {
        const p = presetOrbeDeFase("observando", "sobrio", true);
        expect(p).toEqual(presetOrbe("escucha", "sobrio", true));
        expect(p.periodoMs).toBe(0);
        expect(p.escala).toEqual([1, 1]);
        expect(p.ondas).toBe(0);
    });
});
