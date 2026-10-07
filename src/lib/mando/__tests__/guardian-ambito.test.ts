/**
 * Vitest de PT1008D: decidirAcceso (arreglo 2 de §6.4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba unitaria del predicado puro decidirAcceso en @/lib/mando/guardian.ts:
 *   · Funciona por bandera, produccion, esLocal, hayUsuario, tieneCapacidad, rpcFallo.
 *   · Retorna 200, 401, 403, 404, 503 según el contrato §6.4.
 *   · Código típico de la tarea: hoy = sin bandera → 200; producción = bandera, no local, sin usuario → 401; etc.
 *   · TODAS las combinaciones relevantes, incluida la de hoy (sin bandera: local pasa sin sesión; producción no local con sesión pasa sin RPC).
 */

import { describe, it, expect } from "vitest";

import { decidirAcceso } from "@/lib/mando/guardian";

describe("PT1008D decidirAcceso", () => {
    it("hoy sin bandera → 200 (no hay restricción)", async () => {
        const r = await decidirAcceso({
            bandera: false,
            produccion: false,
            esLocal: false,
            hayUsuario: false,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });

    it("hoy local → 200 (la máquina ya es el perímetro de confianza)", async () => {
        const r = await decidirAcceso({
            bandera: false,
            produccion: true,
            esLocal: true,
            hayUsuario: false,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });

    it("hoy producción no local sin usuario → 200 (el guardián original solo verificaba auth.getUser cuando bandera=true)", async () => {
        const r = await decidirAcceso({
            bandera: false,
            produccion: true,
            esLocal: false,
            hayUsuario: false,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });

    it("hoy producción no local con usuario pero sin bandera → 200 (sin restricción)", async () => {
        const r = await decidirAcceso({
            bandera: false,
            produccion: true,
            esLocal: false,
            hayUsuario: true,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });

    it("con bandera, producción no local, sin usuario → 401", async () => {
        const r = await decidirAcceso({
            bandera: true,
            produccion: true,
            esLocal: false,
            hayUsuario: false,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(401);
    });

    it("con bandera, producción no local, con usuario, RPC falla → 503", async () => {
        const r = await decidirAcceso({
            bandera: true,
            produccion: true,
            esLocal: false,
            hayUsuario: true,
            tieneCapacidad: undefined,
            rpcFallo: true,
        });
        expect(r).toBe(503);
    });

    it("con bandera, producción no local, con usuario, sin capacidad → 403", async () => {
        const r = await decidirAcceso({
            bandera: true,
            produccion: true,
            esLocal: false,
            hayUsuario: true,
            tieneCapacidad: false,
            rpcFallo: false,
        });
        expect(r).toBe(403);
    });

    it("con bandera, producción no local, con usuario, con capacidad → 200", async () => {
        const r = await decidirAcceso({
            bandera: true,
            produccion: true,
            esLocal: false,
            hayUsuario: true,
            tieneCapacidad: true,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });

    it("con bandera, producción no local, local sin usuario → 200 (máquina como perímetro)", async () => {
        const r = await decidirAcceso({
            bandera: true,
            produccion: true,
            esLocal: true,
            hayUsuario: false,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });

    it("con bandera, no producción → 200 (sin restricción)", async () => {
        const r = await decidirAcceso({
            bandera: true,
            produccion: false,
            esLocal: false,
            hayUsuario: false,
            tieneCapacidad: undefined,
            rpcFallo: false,
        });
        expect(r).toBe(200);
    });
});
