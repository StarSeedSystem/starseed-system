import { describe, expect, it } from "vitest";

import { detalleDeMedidor } from "../medidores";

// (2026-09-25) Los agentes de fuera (Claude en Cowork, Hermes…) laten con
// `latido_externo.py` al cambiar de fase y no escriben log en la Mac: el medidor
// de agentes no debe llamarles «callados».
describe("medidor de agentes · agentes de fuera", () => {
    const externo = {
        tarea: "cw-fondo",
        fase: "verificando",
        modelo: "anthropic/claude-opus-5.5",
        minutos: 40,
        donde: "cowork",
        proveedor: "anthropic",
        quietoSegundos: 2400,
        bytesLog: 0,
        cola: "externo-cowork",
        medio: "claude",
        titulo: "Fondo del OS: 3 calidades adaptativas",
    };

    it("un externo quieto sale como «trabajando fuera», con su título y su fase", () => {
        const d = detalleDeMedidor("agentes", { latidos: [externo] });
        expect(d.filas[0].estado).toBe("trabajando fuera");
        expect(d.filas[0].titulo).toBe("Fondo del OS: 3 calidades adaptativas");
        expect(d.filas[0].porque).toContain("fase: verificando");
        expect(d.resumen).toContain("1 fuera");
        expect(d.resumen).not.toContain("sin escribir");
    });

    it("un agente de la Mac quieto sale como «sin escribir» (o «comprobando» si pasa las puertas)", () => {
        const mac = { ...externo, tarea: "T1", cola: "auto-1", donde: "mac", titulo: undefined };
        const d = detalleDeMedidor("agentes", { latidos: [{ ...mac, fase: "escribiendo" }] });
        expect(d.filas[0].estado).toBe("sin escribir");
        const enPuertas = detalleDeMedidor("agentes", { latidos: [mac] });
        expect(enPuertas.filas[0].estado).toBe("comprobando");
    });
});
