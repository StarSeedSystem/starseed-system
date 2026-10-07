import { describe, it, expect } from "vitest";
import { decidirAcceso } from "../guardian";

describe("decidirAcceso", () => {
    it("mando apagado → 404", () => {
        expect(decidirAcceso({ bandera: false, habilitado: false, produccion: true, esLocal: false, hayUsuario: true, tieneCapacidad: true, rpcFallo: false })).toBe(404);
    });

    it("hoy: sin bandera, local pasa sin sesión → 200", () => {
        expect(decidirAcceso({ bandera: false, habilitado: true, produccion: true, esLocal: true, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(200);
    });

    it("no producción pasa → 200", () => {
        expect(decidirAcceso({ bandera: false, habilitado: true, produccion: false, esLocal: false, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(200);
    });

    it("con bandera, no producción pasa sin sesión → 200", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: false, esLocal: false, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(200);
    });

    it("producción no local sin sesión → 401", () => {
        expect(decidirAcceso({ bandera: false, habilitado: true, produccion: true, esLocal: false, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(401);
    });

    it("con bandera, producción no local sin sesión → 401", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: true, esLocal: false, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(401);
    });

    it("hoy: sin bandera, producción no local con sesión → 200", () => {
        expect(decidirAcceso({ bandera: false, habilitado: true, produccion: true, esLocal: false, hayUsuario: true, tieneCapacidad: false, rpcFallo: false })).toBe(200);
    });

    it("con bandera, RPC falla → 503", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: true, esLocal: false, hayUsuario: true, tieneCapacidad: false, rpcFallo: true })).toBe(503);
    });

    it("con bandera, RPC falla aunque tenga capacidad → 503", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: true, esLocal: false, hayUsuario: true, tieneCapacidad: true, rpcFallo: true })).toBe(503);
    });

    it("con bandera, sin capacidad → 403", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: true, esLocal: false, hayUsuario: true, tieneCapacidad: false, rpcFallo: false })).toBe(403);
    });

    it("con bandera, con capacidad → 200", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: true, esLocal: false, hayUsuario: true, tieneCapacidad: true, rpcFallo: false })).toBe(200);
    });

    it("con bandera, local pasa sin comprobar nada → 200", () => {
        expect(decidirAcceso({ bandera: true, habilitado: true, produccion: true, esLocal: true, hayUsuario: false, tieneCapacidad: false, rpcFallo: false })).toBe(200);
    });
});
