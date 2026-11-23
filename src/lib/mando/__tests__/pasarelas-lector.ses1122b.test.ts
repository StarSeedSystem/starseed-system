import { describe, expect, it } from "vitest";

import { convertirInformePasarelas, pideRecarga } from "../pasarelas-lector";

const MEDIDOS = [
    "Make a single top-up of $5 or more to unlock 25M free tokens daily for life. Top up at https://apinex.bond/billing",
    "Your account balance is insufficient. Please recharge your account to continue using the API.",
    "Insufficient Balance (request_id: x)",
    "Purchase pre-paid credits to continue using Inference Providers.",
    "Your team x has either used all available credits or reached its monthly spending limit.",
];

const MEDIDO = "2026-11-22 10:00:00";
const MEDIDO_MS = Date.parse("2026-11-22T10:00:00");

function convertir(pasarela: Record<string, unknown>) {
    return convertirInformePasarelas({ t: MEDIDO, pasarelas: [pasarela] }, MEDIDO_MS);
}

describe("pideRecarga", () => {
    it("reconoce las frases con las que una pasarela pide pagar para seguir", () => {
        for (const mensaje of MEDIDOS) {
            expect(pideRecarga(mensaje)).toBe(true);
        }
    });

    it("no confunde una cuota que se repone sola con una recarga", () => {
        expect(pideRecarga(
            "escritura: cuota de ChatGPT agotada · la CLI: try again at Nov 22nd, 2026 7:45 PM",
        )).toBe(false);
        expect(pideRecarga("")).toBe(false);
        expect(pideRecarga(null)).toBe(false);
        expect(pideRecarga(undefined)).toBe(false);
    });
});

describe("convertirInformePasarelas · sin cupo con recarga", () => {
    it("pinta la recarga de pago en vez de «se repone sola»", () => {
        const datos = convertir({
            clave: "apinex", modelo: "free/glm-5.3-flash", estado: "sin_cupo", mensaje: MEDIDOS[0],
        });

        expect(datos.filas[0]).toMatchObject({
            id: "apinex",
            estado: "sin_cupo",
            necesitaPersona: false,
            accion: "Sin saldo: pide una recarga de pago; no se repone sola (decide Alex)",
        });
    });

    it("deja intacto el «se repone sola» cuando el mensaje es solo cuota", () => {
        const datos = convertir({
            clave: "codex", modelo: "gpt", estado: "sin_cupo", mensaje: "usage limit",
        });

        expect(datos.filas[0].accion).toBe("Sin cupo: apártala hasta que se reponga.");
    });

    it("no cambia la acción de un estado que no es sin cupo aunque el mensaje hable de pago", () => {
        const datos = convertir({
            clave: "groq", modelo: "openai/gpt-oss-20b", estado: "sin_clave", mensaje: MEDIDOS[1],
        });

        expect(datos.filas[0].accion).toBe("La clave falta o no vale: hay que renovarla.");
    });
});
