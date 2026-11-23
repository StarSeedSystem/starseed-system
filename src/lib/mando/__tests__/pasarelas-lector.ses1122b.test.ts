import { describe, expect, it } from "vitest";

import { convertirInformePasarelas } from "../pasarelas-lector";
import { pideRecarga, resumenProveedores } from "../director-datos";

const MEDIDO = "2026-11-22 20:17:21";
const MEDIDO_MS = Date.parse("2026-11-22T20:17:21");

const MENSAJES_RECARGA = [
    "Make a single top-up of $5 or more to unlock 25M free tokens daily for life.",
    "Your account balance is insufficient. Please recharge your account to continue using the API.",
    "Insufficient Balance (request_id: f22a050a)",
    "Your team has either used all available credits or reached its monthly spending limit.",
    "Purchase pre-paid credits to continue using Inference Providers.",
];

describe("pideRecarga", () => {
    it("reconoce las pasarelas que piden una recarga de pago", () => {
        for (const mensaje of MENSAJES_RECARGA) {
            expect(pideRecarga(mensaje)).toBe(true);
        }
    });

    it("no confunde un cupo normal con una recarga", () => {
        expect(pideRecarga("429 rate limit exceeded, try again later")).toBe(false);
        expect(pideRecarga("")).toBe(false);
        expect(pideRecarga(undefined)).toBe(false);
    });
});

describe("convertirInformePasarelas y la recarga", () => {
    it("un sin_cupo que pide recarga no dice «se repone sola» ni ofrece fichaje", () => {
        const datos = convertirInformePasarelas({
            t: MEDIDO,
            pasarelas: [{
                clave: "apinex", modelo: "free/glm-5.3-flash",
                variable: "STARSEED_PASARELA_APINEX_KEY", tiene_clave: true,
                estado: "sin_cupo", mensaje: MENSAJES_RECARGA[0],
            }],
        }, MEDIDO_MS);

        expect(datos.filas[0]).toMatchObject({
            estado: "sin_cupo",
            necesitaPersona: false,
            enlace: "",
            accion: "Sin saldo: pide una recarga de pago; no se repone sola (decide Alex)",
        });
    });

    it("un sin_cupo normal sí se repone sola y no ofrece fichaje", () => {
        const datos = convertirInformePasarelas({
            t: MEDIDO,
            pasarelas: [{
                clave: "groq", modelo: "openai/gpt-oss-20b",
                variable: "GROQ_API_KEY", tiene_clave: true,
                estado: "sin_cupo", mensaje: "429 rate limit exceeded",
            }],
        }, MEDIDO_MS);

        expect(datos.filas[0]).toMatchObject({
            estado: "sin_cupo",
            necesitaPersona: false,
            enlace: "",
        });
        expect(datos.filas[0].accion).toContain("se repone sola");
    });

    it("el fichaje conserva su enlace y su persona", () => {
        const datos = convertirInformePasarelas({
            t: MEDIDO,
            pasarelas: [{
                clave: "apinex", modelo: "free/glm-5.3-flash",
                variable: "STARSEED_PASARELA_APINEX_KEY", tiene_clave: true,
                estado: "fichaje", mensaje: "Daily check-in required to use free models.",
            }],
        }, MEDIDO_MS);

        expect(datos.filas[0]).toMatchObject({
            estado: "fichaje",
            necesitaPersona: true,
            enlace: "https://apinex.bond/airdrop?tab=quests",
        });
    });
});

describe("resumenProveedores y la recarga", () => {
    it("no pide check-in cuando el motivo pide recargar saldo", () => {
        const r = resumenProveedores({
            apinex: { estado: "vivo", motivo: "http error 402: payment required (top-up)" },
        }, []);
        expect(r[0].necesitaCheckin).toBe(false);
    });

    it("sigue pidiendo check-in en un fichaje de verdad", () => {
        const r = resumenProveedores({
            apinex: { estado: "fichaje", motivo: "daily check-in required" },
        }, []);
        expect(r[0].necesitaCheckin).toBe(true);
    });
});
