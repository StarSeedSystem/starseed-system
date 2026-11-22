import { describe, expect, it } from "vitest";

import {
    PERPLEJIDAD_BASE,
    UMBRALES_INVERSION,
    evaluarSparse2_4,
    type MedicionMotor,
} from "../laboratorio/sparse-nvidia";

const referencia = (extra: Partial<MedicionMotor> = {}): MedicionMotor => ({
    perplejidad: PERPLEJIDAD_BASE,
    tokensPorSegundo: 100,
    costoHoraUsd: 0,
    ...extra,
});

const candidato = (extra: Partial<MedicionMotor> = {}): MedicionMotor => ({
    perplejidad: 5.5,
    tokensPorSegundo: 220,
    costoHoraUsd: 0.5,
    ...extra,
});

describe("evaluarSparse2_4", () => {
    it("la perplejidad de partida es la medida del motor actual (5,38)", () => {
        expect(PERPLEJIDAD_BASE).toBe(5.38);
    });

    it("invierte cuando el throughput sube y la perplejidad se mantiene", () => {
        const r = evaluarSparse2_4(referencia(), candidato());
        expect(r.veredicto).toBe("invertir");
        expect(r.gananciaThroughput).toBeCloseTo(2.2, 5);
        expect(r.perdidaPerplejidadPct).toBeCloseTo(2.23, 1);
        expect(r.costoPorMillonTokensUsd).toBeCloseTo(0.63, 1);
        expect(r.ahorroTiempoPct).toBeCloseTo(54.55, 1);
        expect(r.motivos.length).toBeGreaterThan(0);
    });

    it("no invierte si la perplejidad empeora más del umbral", () => {
        const r = evaluarSparse2_4(referencia(), candidato({ perplejidad: 5.8 }));
        expect(r.veredicto).toBe("no-invertir");
        expect(r.motivos.join(" ")).toMatch(/perplejidad/i);
    });

    it("no invierte si la ganancia no llega al mínimo", () => {
        const r = evaluarSparse2_4(referencia(), candidato({ tokensPorSegundo: 120 }));
        expect(r.veredicto).toBe("no-invertir");
        expect(r.motivos.join(" ")).toMatch(/throughput|ganancia/i);
    });

    it("no invierte si la GPU en la nube sale más cara que el techo por millón de tokens", () => {
        const r = evaluarSparse2_4(referencia(), candidato({ costoHoraUsd: 2 }));
        expect(r.veredicto).toBe("no-invertir");
        expect(r.costoPorMillonTokensUsd).toBeGreaterThan(
            UMBRALES_INVERSION.costoMaximoPorMillonUsd,
        );
        expect(r.motivos.join(" ")).toMatch(/coste|coste por millón/i);
    });

    it("pide medir antes de invertir si falta la perplejidad o el throughput", () => {
        const sinPerplejidad = evaluarSparse2_4(
            referencia(),
            candidato({ perplejidad: null }),
        );
        expect(sinPerplejidad.veredicto).toBe("medir-mas");
        expect(sinPerplejidad.perdidaPerplejidadPct).toBeNull();
        expect(sinPerplejidad.motivos.join(" ")).toMatch(/perplejidad/i);

        const sinThroughput = evaluarSparse2_4(
            referencia({ tokensPorSegundo: null }),
            candidato(),
        );
        expect(sinThroughput.veredicto).toBe("medir-mas");
        expect(sinThroughput.gananciaThroughput).toBeNull();
        expect(sinThroughput.motivos.join(" ")).toMatch(/tokens por segundo|throughput/i);
    });

    it("un throughput de cero no se puede evaluar: no se inventa la ganancia", () => {
        const r = evaluarSparse2_4(referencia(), candidato({ tokensPorSegundo: 0 }));
        expect(r.veredicto).toBe("medir-mas");
        expect(r.gananciaThroughput).toBeNull();
        expect(r.costoPorMillonTokensUsd).toBeNull();
    });

    it("respeta umbrales propios: con un mínimo más bajo, la misma medición compensa", () => {
        const medicion = candidato({ tokensPorSegundo: 130, costoHoraUsd: 0 });
        expect(evaluarSparse2_4(referencia(), medicion).veredicto).toBe("no-invertir");
        const r = evaluarSparse2_4(referencia(), medicion, { gananciaMinima: 1.2 });
        expect(r.veredicto).toBe("invertir");
    });
});
