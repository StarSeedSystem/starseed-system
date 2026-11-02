import { describe, expect, it } from "vitest";

import {
    AVISO_PANTALLA_CERRADA,
    decidirDespiertoWeb,
    normalizarProcesos,
    textoEstadoDespiertoWeb,
    type EntradaDespiertoWeb,
} from "../despierto-web";

/** El caso sano: pestaña visible, soporte, un proceso corriendo y aún sin bloqueo. */
export const SANO: EntradaDespiertoWeb = {
    soporte: true,
    visible: true,
    procesos: ["transmision"],
    bloqueo: false,
};

describe("normalizarProcesos", () => {
    it("quita vacíos, recorta blancos y desduplica", () => {
        expect(normalizarProcesos([" transmision", "estacion", "transmision", "", "  "])).toEqual([
            "transmision",
            "estacion",
        ]);
    });
});

describe("decidirDespiertoWeb — pedir solo con proceso vivo, pestaña visible y soporte", () => {
    it("un proceso visible sin bloqueo pide", () => {
        expect(decidirDespiertoWeb(SANO)).toBe("pedir");
    });

    it("con bloqueo concedido y procesos vivos no insiste", () => {
        expect(decidirDespiertoWeb({ ...SANO, bloqueo: true })).toBe("nada");
    });

    it("sin procesos suelta el bloqueo que ya no hace falta", () => {
        expect(decidirDespiertoWeb({ ...SANO, procesos: [], bloqueo: true })).toBe("soltar");
        expect(decidirDespiertoWeb({ ...SANO, procesos: [] })).toBe("nada");
    });

    it("pestaña oculta o sin soporte nunca pide, y suelta si tenía", () => {
        const oculta = decidirDespiertoWeb({ ...SANO, visible: false });
        const sinSoporte = decidirDespiertoWeb({ ...SANO, soporte: false });
        expect(oculta).toBe("nada");
        expect(sinSoporte).toBe("nada");
        expect(decidirDespiertoWeb({ ...SANO, visible: false, bloqueo: true })).toBe("soltar");
        expect(decidirDespiertoWeb({ ...SANO, soporte: false, bloqueo: true })).toBe("soltar");
    });
});

describe("textoEstadoDespiertoWeb", () => {
    it("nombra el proceso mantenido y cuanta varios", () => {
        expect(textoEstadoDespiertoWeb(SANO)).toContain("transmision");
        expect(textoEstadoDespiertoWeb({ ...SANO, procesos: ["transmision", "estacion"], bloqueo: true })).toContain(
            "2",
        );
    });

    it("sin soporte, oculta o sin procesos, dice la verdad de cada situación", () => {
        expect(textoEstadoDespiertoWeb({ ...SANO, soporte: false })).toContain("no permite");
        expect(textoEstadoDespiertoWeb({ ...SANO, visible: false })).toContain("suelto");
        expect(textoEstadoDespiertoWeb({ ...SANO, procesos: [] })).toContain("Sin procesos");
    });

    it("el aviso constante habla del límite del navegador y ofrece la alternativa", () => {
        expect(AVISO_PANTALLA_CERRADA).toContain("tapa");
        expect(AVISO_PANTALLA_CERRADA).toContain("keepalive");
    });
});
