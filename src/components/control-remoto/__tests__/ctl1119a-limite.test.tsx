/**
 * CTL1119A · el límite de tiempo elegido al aceptar se guarda EN LA ACEPTACIÓN (no solo en el punto):
 * la sesión que se abra después tiene su `fin` y se corta cuando toca. En neuronas ajenas o públicas
 * el tope del dueño manda y nunca se supera (se recorta, no se ignora).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const HUELLA = "abcdef0123456789abcdef0123456789";
const PIDE = { huella: HUELLA, spki: "c3BraQ", cuenta: "otra-cuenta", nombre: "Mac de Alex", neurona: "99999999-2222-4333-8444-555555555555", desde: "2026-11-18T08:25:16Z" };
const e = vi.hoisted(() => ({ v: null as unknown }));

vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => e.v,
    guardarPermisoLocal: (p: unknown) => {
        e.v = p;
        window.dispatchEvent(new CustomEvent("starseed:control-neuronas-cambio"));
    },
    puertaControl: () => ({ sesionActiva: () => null, sesionesActivas: () => [] }),
    presentarmeA: async () => ({ ok: true }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({ aparatoLocal: async () => ({ codigo: "A1B2" }), codigoDe: async () => "E5F6" }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "11111111-2222-4333-8444-555555555555", listNeurons: async () => [] }));
vi.mock("@/lib/banco-llamadas/app", () => ({ estadoBanco: () => null, ultimoInforme: () => null, informarBanco: () => undefined, armarBanco: () => true, apagarBanco: () => undefined }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "mi-cuenta" }));

import { ControlEntreNeuronasPanel, finElegido, opcionInicial, opcionesPara, textoRestante, topeMinimos } from "../banda-control";

type ControladorGuardado = { huella: string; limite?: { tipo: string; minutos?: number; hora?: string }; aceptadoEn?: string };
const aceptados = () => (e.v as { controladores: ControladorGuardado[] }).controladores;

beforeEach(() => {
    e.v = { encendido: true, nivel: "controlar", controladores: [], pendientes: [PIDE] };
});
afterEach(() => cleanup());

describe("CTL1119A · el límite elegido llega a la aceptación", () => {
    it("con 15 min elegidos, la aceptación guarda el límite (y no solo el punto de color)", async () => {
        render(<ControlEntreNeuronasPanel />);
        await userEvent.click(await screen.findByRole("button", { name: "Aceptar" }));
        await waitFor(() => expect(aceptados()).toHaveLength(1));
        expect(aceptados()[0].limite).toEqual({ tipo: "minutos", minutos: 15 });
        expect(typeof aceptados()[0].aceptadoEn).toBe("string");
    });

    it("el tope del dueño recorta lo elegido en vez de guardar un límite mayor", async () => {
        e.v = { encendido: true, nivel: "controlar", controladores: [], pendientes: [{ ...PIDE, filtro: { maxMin: 5 } }] };
        render(<ControlEntreNeuronasPanel />);
        await userEvent.click(await screen.findByRole("button", { name: "Aceptar" }));
        await waitFor(() => expect(aceptados()).toHaveLength(1));
        expect(aceptados()[0].limite).toEqual({ tipo: "minutos", minutos: 5 });
    });
});

describe("CTL1119A · el filtro del dueño y los textos del límite", () => {
    it("en una neurona propia no hay tope y el defecto es «sin límite»", () => {
        expect(topeMinimos({ cuenta: "mi-cuenta" }, "mi-cuenta")).toBeNull();
        expect(opcionesPara(true, null)).toEqual(["sin-limite", "15-min", "1-hora", "hasta"]);
        expect(opcionInicial(true, null)).toBe("sin-limite");
    });

    it("una pública sin tope declarado queda en 15 min; una ajena sin tope declarado permite sin límite", () => {
        expect(topeMinimos({ cuenta: "otra", publico: true }, "mi-cuenta")).toBe(15);
        expect(topeMinimos({ cuenta: "otra" }, "mi-cuenta")).toBeNull();
        expect(opcionInicial(false, 15)).toBe("15-min");
    });

    it("lo elegido se recorta al tope y «sin límite» no se cuela cuando el dueño no lo permite", () => {
        const ahora = Date.parse("2026-11-19T10:00:00Z");
        expect(finElegido("15-min", "", ahora, 5, false)).toEqual({ ok: true, fin: ahora + 5 * 60_000 });
        expect(finElegido("1-hora", "", ahora, 60, false)).toEqual({ ok: true, fin: ahora + 60 * 60_000 });
        expect(finElegido("sin-limite", "", ahora, 15, false)).toEqual({ ok: false, motivo: "El dueño no permite dejar el control sin límite." });
    });

    it("el punto de color dice el tiempo que queda y no inventa nada sin límite", () => {
        const ahora = Date.parse("2026-11-19T10:00:00Z");
        expect(textoRestante(null, ahora)).toBeNull();
        expect(textoRestante(ahora + 90_000, ahora)).toBe("Quedan 2 min");
        expect(textoRestante(ahora + 3_600_000, ahora)).toMatch(/quedan 1 h/);
    });
});
