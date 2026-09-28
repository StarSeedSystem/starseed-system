/**
 * `?next=` tras iniciar sesión: solo rutas internas, nunca otra web, ni /api, ni /auth.
 */
import { describe, expect, it } from "vitest";
import { haySiguiente, LARGO_MAX_SIGUIENTE, siguienteDeBusqueda, siguienteSeguro } from "@/lib/auth/siguiente-seguro";

const ID = "3f1c2a9e-7b1d-4c3e-9f00-1234567890ab";

describe("siguienteSeguro", () => {
    it("deja pasar rutas internas normales (con query y hash)", () => {
        expect(siguienteSeguro(`/llamada/${ID}`)).toBe(`/llamada/${ID}`);
        expect(siguienteSeguro(`/vivo/${ID}?t=AbCd_-123`)).toBe(`/vivo/${ID}?t=AbCd_-123`);
        expect(siguienteSeguro("/messages#hilo")).toBe("/messages#hilo");
        expect(siguienteSeguro("/")).toBe("/");
        // Rutas que solo EMPIEZAN como las prohibidas no lo son.
        expect(siguienteSeguro("/apiario")).toBe("/apiario");
        expect(siguienteSeguro("/autores")).toBe("/autores");
    });

    it("decodifica UNA vez lo que viene codificado", () => {
        expect(siguienteSeguro(encodeURIComponent(`/vivo/${ID}?t=abc`))).toBe(`/vivo/${ID}?t=abc`);
        // Doble codificación: tras una vuelta sigue siendo una ruta interna rara, no otra web.
        expect(siguienteSeguro("/%252F%252Fotra.web")).toBe("/%2F%2Fotra.web");
    });

    it("rechaza otras webs en todas sus formas", () => {
        for (const malo of [
            "https://otra.web/x",
            "//otra.web",
            "/\\otra.web",
            "\\\\otra.web",
            "%2F%2Fotra.web",
            "@otra.web",
            "javascript:alert(1)",
            "otra.web/x",
            " /espacio-delante",
            "/\t/otra.web",
            "/%0a/otra.web",
            "/.//otra.web",
        ]) {
            expect(siguienteSeguro(malo, "/defecto"), malo).toBe("/defecto");
        }
    });

    it("rechaza /api, /auth y /login (también tras normalizar la ruta y sin importar mayúsculas)", () => {
        for (const malo of ["/api", "/api/auth/otp/verify", "/auth/callback?next=//x", "/API/x", "/a/../api/x", "/%2e%2e/auth/callback", "/login?next=/x"]) {
            expect(siguienteSeguro(malo, "/defecto"), malo).toBe("/defecto");
        }
    });

    it("rechaza lo que no es texto, lo vacío, lo mal codificado y lo demasiado largo", () => {
        expect(siguienteSeguro(null)).toBe("/");
        expect(siguienteSeguro(undefined, "/escritorios")).toBe("/escritorios");
        expect(siguienteSeguro(42)).toBe("/");
        expect(siguienteSeguro("")).toBe("/");
        expect(siguienteSeguro("/%E0%A4%A")).toBe("/");
        expect(siguienteSeguro(`/${"a".repeat(LARGO_MAX_SIGUIENTE)}`)).toBe("/");
        expect(siguienteSeguro(`/${"a".repeat(LARGO_MAX_SIGUIENTE - 1)}`)).toHaveLength(LARGO_MAX_SIGUIENTE);
    });
});

describe("siguienteDeBusqueda / haySiguiente", () => {
    it("lee `next` de `location.search` o de URLSearchParams", () => {
        expect(siguienteDeBusqueda(`?next=${encodeURIComponent(`/llamada/${ID}`)}`)).toBe(`/llamada/${ID}`);
        expect(siguienteDeBusqueda(new URLSearchParams({ next: "/contactos" }))).toBe("/contactos");
        expect(siguienteDeBusqueda("?next=//otra.web", "/")).toBe("/");
        expect(siguienteDeBusqueda("", "/x")).toBe("/x");
        expect(siguienteDeBusqueda(null, "/x")).toBe("/x");
    });

    it("solo hay siguiente si es válido", () => {
        expect(haySiguiente("?next=/contactos")).toBe(true);
        expect(haySiguiente("?next=https://otra.web")).toBe(false);
        expect(haySiguiente("?otra=1")).toBe(false);
    });
});
