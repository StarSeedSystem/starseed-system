import { describe, it, expect } from "vitest";
import { puntuacionAportacion, type AportacionEvaluada } from "@/lib/hub/relevancia";

// Prueba de la puntuación honesta del Hub (SP092928): sustituye la relevancia
// fingida con Math.random por una señal determinista derivada de la
// participación real. Puros: entrada → salida, sin red ni disco.

const casi = (extra: Partial<AportacionEvaluada> = {}): AportacionEvaluada => ({
    members: [],
    urgencyVal: 1,
    messagingGroupCreated: false,
    goalsAchieved: false,
    ...extra,
});

describe("puntuacionAportacion", () => {
    it("una solicitud recién publicada sin coordinación puntúa bajo y determinista", () => {
        expect(puntuacionAportacion(casi({ urgencyVal: 2 }))).toBe(8);
        expect(puntuacionAportacion(casi())).toBe(4);
    });

    it("cada voluntario inscrito suma participación real hasta el décimo", () => {
        const diez = Array.from({ length: 10 }, (_, i) => ({ name: `v${i}` }));
        expect(puntuacionAportacion(casi({ members: diez, urgencyVal: 1 }))).toBe(64);
    });

    it("a partir de diez voluntarios la escala se sostiene (no escala el tocho)", () => {
        const quince = Array.from({ length: 15 }, (_, i) => ({ name: `v${i}` }));
        expect(puntuacionAportacion(casi({ members: quince, urgencyVal: 1 }))).toBe(64);
    });

    it("la urgencia declarada se clamp a [0,4] y NaN cuenta como cero", () => {
        expect(puntuacionAportacion(casi({ urgencyVal: 4 }))).toBe(16);
        expect(puntuacionAportacion(casi({ urgencyVal: 7 }))).toBe(16);
        expect(puntuacionAportacion(casi({ urgencyVal: 0 }))).toBe(0);
        expect(puntuacionAportacion(casi({ urgencyVal: -3 }))).toBe(0);
        expect(puntuacionAportacion(casi({ urgencyVal: Number.NaN }))).toBe(0);
    });

    it("la coordinación real alrededor de la aportación suma bonos fijos", () => {
        expect(puntuacionAportacion(casi({ messagingGroupCreated: true }))).toBe(12);
        expect(puntuacionAportacion(casi({ calendarItemId: "cal-1" }))).toBe(12);
        expect(puntuacionAportacion(casi({ goalsAchieved: true }))).toBe(12);
        expect(
            puntuacionAportacion(
                casi({ messagingGroupCreated: true, calendarItemId: "cal-1", goalsAchieved: true }),
            ),
        ).toBe(28);
    });

    it("el máximo alcanzable es exactamente 100", () => {
        const diez = Array.from({ length: 10 }, (_, i) => ({ name: `v${i}` }));
        expect(
            puntuacionAportacion(
                casi({
                    members: diez,
                    urgencyVal: 4,
                    messagingGroupCreated: true,
                    calendarItemId: "cal-1",
                    goalsAchieved: true,
                }),
            ),
        ).toBe(100);
    });

    it("misma señal misma salida: no hay azar ni dependencia del orden de nombres", () => {
        const estado = casi({
            members: [{ name: "Ana" }, { name: "Bruno" }],
            urgencyVal: 3,
        });
        expect(puntuacionAportacion(estado)).toBe(
            puntuacionAportacion(casi({ members: [{ name: "Zed" }, { name: "Ana" }], urgencyVal: 3 })),
        );
    });
});
