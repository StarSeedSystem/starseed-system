import { describe, expect, it } from "vitest";

import {
    CICLOS_SILENCIO_SIN_REINICIO,
    debeReiniciarNavegador,
    elegirOidoMovil,
} from "../oido-movil";

describe("elegirOidoMovil · qué oído usa el móvil", () => {
    it("con oído en la nube manda la línea estable por tramos", () => {
        const r = elegirOidoMovil({ nube: true, whisperDescargado: true, navegador: true });
        expect(r.motor).toBe("nube");
        expect(r.motivo).toMatch(/nube/i);
    });

    it("sin nube, si Whisper ya está descargado se oye en el navegador sin reiniciar", () => {
        const r = elegirOidoMovil({ nube: false, whisperDescargado: true, navegador: true });
        expect(r.motor).toBe("whisper-web");
        expect(r.motivo).toMatch(/whisper/i);
    });

    it("sin nube ni Whisper, el reconocedor del navegador solo se abre al detectar voz", () => {
        const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: true });
        expect(r.motor).toBe("navegador-por-voz");
        expect(r.motivo).toMatch(/voz/i);
    });

    it("sin nada más, queda el reconocedor del navegador como suelo", () => {
        const r = elegirOidoMovil({ nube: false, whisperDescargado: false, navegador: false });
        expect(r.motor).toBe("navegador");
        expect(r.motivo.length).toBeGreaterThan(0);
    });

    it("no muta las opciones y siempre explica el motivo", () => {
        const opciones = { nube: false, whisperDescargado: true, navegador: false };
        const copia = { ...opciones };
        const r = elegirOidoMovil(opciones);
        expect(opciones).toEqual(copia);
        expect(r.motivo.trim()).not.toBe("");
    });
});

describe("debeReiniciarNavegador · nunca en bucle tras dos silencios", () => {
    it("con 0 o 1 ciclo en silencio sí se reinicia", () => {
        expect(debeReiniciarNavegador({ ciclosEnSilencio: 0, enTurno: false })).toBe(true);
        expect(debeReiniciarNavegador({ ciclosEnSilencio: 1, enTurno: false })).toBe(true);
    });

    it("tras dos ciclos seguidos en silencio y sin turno pendiente NO se reinicia", () => {
        expect(CICLOS_SILENCIO_SIN_REINICIO).toBe(2);
        expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: false })).toBe(false);
        expect(debeReiniciarNavegador({ ciclosEnSilencio: 7, enTurno: false })).toBe(false);
    });

    it("si hay un turno pendiente sí se reinicia aunque haya silencio", () => {
        expect(debeReiniciarNavegador({ ciclosEnSilencio: 2, enTurno: true })).toBe(true);
        expect(debeReiniciarNavegador({ ciclosEnSilencio: 9, enTurno: true })).toBe(true);
    });

    it("un contador negativo no rompe la decisión", () => {
        expect(debeReiniciarNavegador({ ciclosEnSilencio: -3, enTurno: false })).toBe(true);
    });
});
