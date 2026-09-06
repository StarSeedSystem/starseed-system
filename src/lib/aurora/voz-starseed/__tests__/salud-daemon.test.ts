/**
 * Test de `interpretarStatus` (Ola 251, 2026-09-06): el cuerpo de `GET /status`
 * del demonio Astraura debe distinguir tres estados —activo, despertando
 * (modelo de ~900 MB aún cargando) y apagado— para que el OS no confunda
 * «tarda en despertar» con «no hay demonio».
 */

import { describe, expect, it } from "vitest";

import { interpretarStatus } from "../daemon";

describe("interpretarStatus", () => {
    it("servidor activo → vivo", () => {
        const lectura = interpretarStatus({
            ok: true,
            ready: true,
            warm: true,
            model: "omnivoice-base-Q8_0.gguf",
            serverPool: { active: ["Spanish"], launching: [] },
            memoriaLibreMb: 2400,
        });
        expect(lectura).toEqual({
            vivo: true,
            estado: "vivo",
            despertandoDesdeMs: null,
            memoriaLibreMb: 2400,
        });
    });

    it("launching sin activo → despertando (conserva la marca de tiempo y la memoria)", () => {
        const lectura = interpretarStatus({
            ok: true,
            ready: true,
            warm: false,
            serverPool: { active: [], launching: ["Spanish"] },
            despertandoDesdeMs: 1_700_000_000_000,
            memoriaLibreMb: 512,
        });
        expect(lectura.vivo).toBe(true);
        expect(lectura.estado).toBe("despertando");
        expect(lectura.despertandoDesdeMs).toBe(1_700_000_000_000);
        expect(lectura.memoriaLibreMb).toBe(512);
    });

    it("despertando declarado por el demonio → despertando", () => {
        const lectura = interpretarStatus({ ok: true, ready: true, despertando: true });
        expect(lectura.estado).toBe("despertando");
        expect(lectura.vivo).toBe(true);
    });

    it("ok:false → apagado", () => {
        const lectura = interpretarStatus({ ok: false });
        expect(lectura).toEqual({
            vivo: false,
            estado: "apagado",
            despertandoDesdeMs: null,
            memoriaLibreMb: null,
        });
    });

    it("cuerpos no válidos → apagado sin lanzar", () => {
        for (const cuerpo of [null, undefined, "cargando", 42]) {
            expect(interpretarStatus(cuerpo).estado).toBe("apagado");
        }
    });

    it("ready sin pool lanzando → vivo (motor listo aunque aún no suene)", () => {
        const lectura = interpretarStatus({
            ok: true,
            ready: true,
            warm: false,
            serverPool: { active: [], launching: [] },
        });
        expect(lectura.estado).toBe("vivo");
    });
});
