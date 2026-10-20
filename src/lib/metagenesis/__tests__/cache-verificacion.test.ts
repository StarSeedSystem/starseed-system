/**
 * Memoria corta del guardián (2026-10-10): un token verificado no vuelve a costar dos llamadas a
 * Supabase en cada lectura remota, pero nunca se recuerda más de 60 s ni más allá de su caducidad.
 */
import { describe, expect, it } from "vitest";
import { crearCacheVerificaciones, defectoDelToken, expDelToken, huellaSesionPorCookie, huellaToken } from "../cache-verificacion";

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

    it("expDelToken y defectoDelToken leen el contenido por el mismo camino: sin exp numérico finito es null", () => {
        const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
        for (const contenido of [{ sub: "cuenta" }, { exp: "mañana" }, { exp: null }]) {
            expect(expDelToken([b64({ alg: "none" }), b64(contenido), "firma"].join("."))).toBeNull();
        }
        // Lo que defectoDelToken da por malformado (caracteres fuera de base64url) tampoco devuelve exp.
        expect(expDelToken("a+b.c/d.e=f")).toBeNull();
        expect(expDelToken("uno.dos")).toBeNull();
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

describe("defectoDelToken: lo que se ve sin llamar a nadie (2026-10-20)", () => {
    const AHORA = 1_800_000_000_000;

    it("un JWT vigente no tiene defecto aparente", () => {
        expect(defectoDelToken(jwtCon(AHORA / 1000 + 3600), AHORA)).toBeNull();
    });

    it("caducado: su exp ya pasó (o es justo ahora)", () => {
        expect(defectoDelToken(jwtCon(AHORA / 1000 - 1), AHORA)).toBe("caducado");
        expect(defectoDelToken(jwtCon(AHORA / 1000), AHORA)).toBe("caducado");
    });

    it("malformado: sin tres tramos, con tramos vacíos o caracteres que no son base64url", () => {
        for (const roto of ["a".repeat(30), "uno.dos", "uno.dos.tres.cuatro", "..", "a..b", "ab cd.ef.gh", "a+b.c/d.e=f"]) {
            expect(defectoDelToken(roto, AHORA)).toBe("malformado");
        }
    });

    it("malformado: el contenido no es un objeto JSON", () => {
        const b64 = (t: string) => Buffer.from(t).toString("base64url");
        for (const contenido of ["no es json", "[1,2]", "42", "null", '"texto"']) {
            expect(defectoDelToken([b64('{"alg":"none"}'), b64(contenido), "firma"].join("."), AHORA)).toBe("malformado");
        }
    });

    it("sin exp legible no se da por caducado: lo decide Supabase una vez", () => {
        const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
        expect(defectoDelToken([b64({ alg: "none" }), b64({ sub: "cuenta" }), "firma"].join("."), AHORA)).toBeNull();
        expect(defectoDelToken([b64({ alg: "none" }), b64({ sub: "cuenta", exp: "mañana" }), "firma"].join("."), AHORA)).toBeNull();
    });
});

describe("memoria de rechazos (10 s)", () => {
    it("recuerda un rechazo claro 10 s como mucho, con otro tipo de valor", () => {
        let t = 5_000_000;
        const c = crearCacheVerificaciones<{ motivo: string }>({ ttlMs: 10_000, ahora: () => t });
        c.guardar("h", { motivo: "rechazado" }, null);
        expect(c.leer("h")).toEqual({ motivo: "rechazado" });
        t += 9_999;
        expect(c.leer("h")).not.toBeNull();
        t += 1;
        expect(c.leer("h")).toBeNull();
    });
});

describe("huellaSesionPorCookie: la sesión del navegador (revisión de COL1012Md-d1)", () => {
    it("sin cabecera o sin cookie de sesión de Supabase no hay huella", async () => {
        expect(await huellaSesionPorCookie(null)).toBeNull();
        expect(await huellaSesionPorCookie("")).toBeNull();
        expect(await huellaSesionPorCookie("analitica=1; tema=oscuro")).toBeNull();
        // Parecidas pero no son de sesión: el verificador de PKCE y una cookie sin nombre.
        expect(await huellaSesionPorCookie("sb-proyecto-auth-token-code-verifier=abc; =x")).toBeNull();
    });

    it("la misma sesión da la misma huella aunque cambien las demás cookies o el orden de los trozos", async () => {
        const a = await huellaSesionPorCookie("sb-p-auth-token.0=aaa; sb-p-auth-token.1=bbb");
        const b = await huellaSesionPorCookie("x=1; sb-p-auth-token.1=bbb; y=2; sb-p-auth-token.0=aaa");
        expect(a).not.toBeNull();
        expect(a).toBe(b);
        expect(await huellaSesionPorCookie("sb-p-auth-token=valor")).toMatch(/^cookie:[0-9a-f]{64}$/);
    });

    it("otro valor, otro trozo u otro proyecto dan otra huella, y nunca contiene el valor", async () => {
        const base = await huellaSesionPorCookie("sb-p-auth-token=secreto-123");
        expect(await huellaSesionPorCookie("sb-p-auth-token=secreto-124")).not.toBe(base);
        expect(await huellaSesionPorCookie("sb-q-auth-token=secreto-123")).not.toBe(base);
        expect(base).not.toContain("secreto");
    });

    it("no choca con la huella de un Bearer", async () => {
        const bearer = await huellaToken("sb-p-auth-token=valor");
        expect(await huellaSesionPorCookie("sb-p-auth-token=valor")).not.toBe(bearer);
    });
});
