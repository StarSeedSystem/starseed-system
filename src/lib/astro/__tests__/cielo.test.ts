import { describe, expect, it } from "vitest";
import { alturaSol, faseLunar, horasDelSol, proximaFase, proximoCambioDeSigno, signosDelCielo } from "../cielo";

const minutos = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000;

describe("el cielo real", () => {
    it("fases conocidas: luna nueva del eclipse del 8-4-2024 y llena del 23-4-2024", () => {
        const nueva = faseLunar(new Date("2024-04-08T18:21:00Z"));
        expect(nueva.iluminada).toBeLessThan(0.01);
        expect(nueva.nombre).toBe("Luna nueva");
        const llena = faseLunar(new Date("2024-04-23T23:49:00Z"));
        expect(llena.iluminada).toBeGreaterThan(0.99);
        expect(llena.nombre).toBe("Luna llena");
        expect(faseLunar(new Date("2024-04-15T19:13:00Z")).nombre).toBe("Cuarto creciente");
    });
    it("la próxima llena después del 10-4-2024 cae el 23-4 (±2 h)", () => {
        expect(minutos(proximaFase(new Date("2024-04-10T00:00:00Z"), "llena"), new Date("2024-04-23T23:49:00Z"))).toBeLessThan(120);
    });
    it("orto y ocaso de Madrid en el solsticio de 2024 (±5 min)", () => {
        const { orto, ocaso } = horasDelSol(new Date("2024-06-21T12:00:00Z"), 40.4168, -3.7038);
        expect(minutos(orto!, new Date("2024-06-21T04:44:00Z"))).toBeLessThan(5);
        expect(minutos(ocaso!, new Date("2024-06-21T19:48:00Z"))).toBeLessThan(5);
    });
    it("noche polar: sin orto ni ocaso", () => {
        const { orto, ocaso } = horasDelSol(new Date("2024-12-21T12:00:00Z"), 78.2, 15.6);
        expect(orto).toBeNull();
        expect(ocaso).toBeNull();
    });
    it("el Sol está alto al mediodía y bajo el horizonte a medianoche", () => {
        expect(alturaSol(new Date("2024-06-21T12:14:00Z"), 40.4168, -3.7038)).toBeGreaterThan(70);
        expect(alturaSol(new Date("2024-06-21T00:14:00Z"), 40.4168, -3.7038)).toBeLessThan(-20);
    });
    it("signos: Sol en Cáncer el 1-7-2024 y en Libra el 28-9-2026", () => {
        expect(signosDelCielo(new Date("2024-07-01T12:00:00Z")).sol.nombre).toBe("Cáncer");
        expect(signosDelCielo(new Date("2026-09-28T12:00:00Z")).sol.nombre).toBe("Libra");
        expect(signosDelCielo(new Date("2024-04-23T23:49:00Z")).luna.nombre).toBe("Escorpio");
    });
    it("el Sol entra en Escorpio hacia el 23-10-2026 (±1 día)", () => {
        const c = proximoCambioDeSigno(new Date("2026-09-28T12:00:00Z"));
        expect(c.signo.nombre).toBe("Escorpio");
        expect(Math.abs(c.fecha.getTime() - new Date("2026-10-23T08:00:00Z").getTime())).toBeLessThan(36 * 3_600_000);
    });
});
