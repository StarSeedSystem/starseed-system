/**
 * Memoria corta del guardián (2026-10-10): un token verificado no vuelve a costar dos llamadas a
 * Supabase en cada lectura remota, pero nunca se recuerda más de 60 s ni más allá de su caducidad.
 */
import { describe, expect, it } from "vitest";
import { crearCacheVerificaciones, expDelToken, huellaToken } from "../cache-verificacion";

/** Un JWT de forma válida montado en tiempo de ejecución (sin firma real). */
function jwtCon(exp: number): string {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return [b64({ alg: "none" }), b64({ sub: "cuenta", exp }), "firma"].join(".");
}

describe("cache de verificaciones", () => {
    it("lee la caducidad del token sin verificarlo", () => {
        expect(expDelToken(jwtCon(1_900_000_000))).toBe(1_900_000_000);
        expect(expDelToken("no-es-un-jwt")).toBeNull();
    });

    it("la huella es sha256 en hex y no contiene el token", async () => {
        const token = jwtCon(1_900_000_000);
        const h = await huellaToken(token);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        expect(h).not.toContain(token.slice(0, 10));
    });

    it("recuerda 60 s como mucho", () => {
        let t = 1_000_000;
        const c = crearCacheVerificaciones({ ahora: () => t });
        c.guardar("h", { usuario: "u", miembro: true }, null);
        expect(c.leer("h")).toEqual({ usuario: "u", miembro: true });
        t += 59_999;
        expect(c.leer("h")).not.toBeNull();
        t += 1;
        expect(c.leer("h")).toBeNull();
    });

    it("nunca más allá de la caducidad del token; uno caducado no se guarda", () => {
        let t = 1_000_000_000_000;
        const c = crearCacheVerificaciones({ ahora: () => t });
        c.guardar("h", { usuario: "u", miembro: true }, t / 1000 + 10);
        t += 10_000;
        expect(c.leer("h")).toBeNull();
        c.guardar("viejo", { usuario: "u", miembro: true }, t / 1000 - 1);
        expect(c.leer("viejo")).toBeNull();
    });

    it("acotada: la más vieja sale", () => {
        const c = crearCacheVerificaciones({ max: 2 });
        c.guardar("a", { usuario: "a", miembro: true }, null);
        c.guardar("b", { usuario: "b", miembro: false }, null);
        c.guardar("c", { usuario: "c", miembro: true }, null);
        expect(c.tamano()).toBe(2);
        expect(c.leer("a")).toBeNull();
        expect(c.leer("b")).toEqual({ usuario: "b", miembro: false });
    });
});
